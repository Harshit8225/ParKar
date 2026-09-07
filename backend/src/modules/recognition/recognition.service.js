'use strict';

const { ParkingLot, VehicleRecognitionEvent } = require('../../models');
const { RECOGNITION_EVENT, RECOGNITION_RESULT, LOT_STATUS } = require('../../models/constants');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');
const { comparePlates, normalizePlate } = require('../../utils/plate');
const { minutesBetween } = require('../../utils/time');
const { withLock, sessionLock } = require('../../services/lock.service');
const gemini = require('../../services/gemini.service');
const bookingService = require('../booking/booking.service');
const sessionService = require('../session/session.service');
const billingService = require('../billing/billing.service');

/**
 * Gate decision engine.
 *
 * Entry:  image -> Gemini -> plate -> find active booking -> verify -> open session
 * Exit:   image -> Gemini -> plate -> find active session  -> bill  -> close session
 *
 * Every capture is written to vehicleRecognitionEvents whether or not the gate
 * opened, so admins can audit refusals and fraud flags.
 */

/** A read below this confidence is treated as unreadable rather than acted on. */
const MIN_CONFIDENCE = 0.55;

/** How far outside the booked window a vehicle may still be admitted. */
const EARLY_ENTRY_GRACE_MINUTES = 30;
const LATE_ENTRY_GRACE_MINUTES = 60;

/** Fuzzy plate matches at or above this similarity open the gate but are flagged. */
const FUZZY_MATCH_MIN_SIMILARITY = 0.85;

/**
 * Below the fuzzy threshold but above this, the plate resembles a booking here
 * closely enough that "wrong vehicle" is more likely than "no booking" - so it
 * is refused AND flagged for review rather than waved off as an unbooked car.
 */
const MISMATCH_SUSPICION_THRESHOLD = 0.6;

const logEvent = async (data) => {
  try {
    return await VehicleRecognitionEvent.create(data);
  } catch (err) {
    // A gate must not stall because the audit write failed.
    logger.error('Failed to record recognition event:', err.message);
    return null;
  }
};

const loadOperationalLot = async (lotId) => {
  const lot = await ParkingLot.findById(lotId);
  if (!lot) throw ApiError.notFound('Parking facility not found');
  if (lot.status !== LOT_STATUS.APPROVED) {
    throw ApiError.badRequest('This parking facility is not active');
  }
  return lot;
};

/**
 * Resolve a plate from either an uploaded image (via Gemini) or a manually
 * typed plate. Manual entry is what a gate operator falls back to when the
 * camera cannot read a plate; it is recorded as such in the audit trail.
 */
const resolvePlate = async ({ imageBuffer, mimeType, manualPlate }) => {
  if (manualPlate) {
    const normalized = normalizePlate(manualPlate);
    return {
      plate: normalized,
      normalizedPlate: normalized,
      confidence: 1,
      vehicleTypeGuess: 'unknown',
      provider: 'manual',
      model: 'manual-entry',
      latencyMs: 0,
      raw: { manual: true, entered: manualPlate },
    };
  }

  const result = await gemini.recognizePlate({ imageBuffer, mimeType });
  return { ...result, provider: 'gemini' };
};

/**
 * Verify a vehicle at the entry gate and open a parking session.
 *
 * Checks, in order: the plate was readable; a confirmed booking exists for this
 * plate at this facility; the plate matches the booked plate; and the vehicle is
 * inside its allowed entry window.
 */
const processEntry = async ({ lotId, imageBuffer, mimeType, manualPlate, cameraId }) => {
  const lot = await loadOperationalLot(lotId);
  const recognition = await resolvePlate({ imageBuffer, mimeType, manualPlate });

  const baseEvent = {
    parkingLot: lot._id,
    eventType: RECOGNITION_EVENT.ENTRY,
    recognizedPlate: recognition.plate,
    recognizedPlateNormalized: recognition.normalizedPlate,
    confidence: recognition.confidence,
    vehicleTypeGuess: recognition.vehicleTypeGuess,
    provider: recognition.provider,
    model: recognition.model,
    latencyMs: recognition.latencyMs,
    cameraId,
    rawModelResponse: recognition.raw,
  };

  // --- 1. Was the plate readable at all? ---
  if (!recognition.normalizedPlate || recognition.confidence < MIN_CONFIDENCE) {
    const event = await logEvent({
      ...baseEvent,
      result: RECOGNITION_RESULT.UNREADABLE,
      allowed: false,
      message: recognition.notes || 'Number plate could not be read with sufficient confidence',
    });
    return {
      allowed: false,
      result: RECOGNITION_RESULT.UNREADABLE,
      message: 'Number plate could not be read. Please move forward and try again, or ask the attendant for help.',
      recognition: { plate: recognition.plate, confidence: recognition.confidence },
      eventId: event?._id,
    };
  }

  const plate = recognition.normalizedPlate;

  // --- 2. Is this vehicle already inside? ---
  // A gate camera routinely fires twice on one arrival. Answer from the open
  // session rather than looking for a second booking to admit it on.
  const openSession = await bookingService.findActiveSessionByPlate({ lotId: lot._id, normalizedPlate: plate });
  if (openSession) {
    const event = await logEvent({
      ...baseEvent,
      booking: openSession.booking,
      parkingSession: openSession._id,
      result: RECOGNITION_RESULT.DUPLICATE,
      allowed: true,
      message: `Vehicle is already inside on session ${openSession.sessionId}`,
    });
    return {
      allowed: true,
      result: RECOGNITION_RESULT.DUPLICATE,
      message: `This vehicle is already inside (session ${openSession.sessionId}).`,
      recognition: { plate, confidence: recognition.confidence },
      session: {
        sessionId: openSession.sessionId,
        actualEntryTime: openSession.actualEntryTime,
        expectedExitTime: openSession.expectedExitTime,
      },
      eventId: event?._id,
    };
  }

  // --- 3. Is there a booking to admit this vehicle on? ---
  let booking = await bookingService.findAdmissibleBooking({
    lotId: lot._id,
    normalizedPlate: plate,
    earlyGraceMinutes: EARLY_ENTRY_GRACE_MINUTES,
    lateGraceMinutes: LATE_ENTRY_GRACE_MINUTES,
  });

  // The exact lookup cannot match a booking whose plate the camera misread, so
  // score the bookings due right now and take the closest.
  let nearMiss = null;
  if (!booking) {
    const candidates = await bookingService.findCandidateBookings({
      lotId: lot._id,
      earlyGraceMinutes: EARLY_ENTRY_GRACE_MINUTES,
      lateGraceMinutes: LATE_ENTRY_GRACE_MINUTES,
    });

    for (const candidate of candidates) {
      const scored = comparePlates(plate, candidate.vehicleNumberNormalized);
      if (!nearMiss || scored.similarity > nearMiss.match.similarity) {
        nearMiss = { booking: candidate, match: scored };
      }
    }

    // Close enough to be the same vehicle read imperfectly - admit, but flag it.
    if (nearMiss && nearMiss.match.match && nearMiss.match.similarity >= FUZZY_MATCH_MIN_SIMILARITY) {
      booking = nearMiss.booking;
    }
  }

  if (!booking) {
    // A plate that resembles a booking here is a mismatch worth flagging;
    // one that resembles nothing is simply an unbooked vehicle.
    if (nearMiss && nearMiss.match.similarity >= MISMATCH_SUSPICION_THRESHOLD) {
      const suspect = nearMiss.booking;
      const event = await logEvent({
        ...baseEvent,
        booking: suspect._id,
        result: RECOGNITION_RESULT.PLATE_MISMATCH,
        allowed: false,
        flaggedAsFraud: true,
        message: `Recognized ${plate} but the closest booking ${suspect.bookingId} is for ${suspect.vehicleNumber}`,
        matchDetail: {
          bookedPlate: suspect.vehicleNumber,
          matchKind: nearMiss.match.kind,
          similarity: nearMiss.match.similarity,
        },
      });

      suspect.fraudFlags.push({
        type: 'vehicle_mismatch',
        detail: `Entry attempt with plate ${plate}, booking is for ${suspect.vehicleNumber}`,
        recognizedPlate: plate,
        similarity: nearMiss.match.similarity,
      });
      await suspect.save();

      logger.warn(`Vehicle mismatch at lot ${lot._id}: read ${plate}, closest booking ${suspect.vehicleNumber}`);

      return {
        allowed: false,
        result: RECOGNITION_RESULT.PLATE_MISMATCH,
        message: 'The vehicle number does not match any booking here. Please contact the parking attendant.',
        recognition: { plate, confidence: recognition.confidence },
        flaggedAsFraud: true,
        eventId: event?._id,
      };
    }

    // Distinguish "no booking here" from "booked, but at the wrong time".
    const anyBooking = await bookingService.findAnyOpenBooking({ lotId: lot._id, normalizedPlate: plate });

    if (anyBooking) {
      const minutesEarly = minutesBetween(new Date(), anyBooking.expectedEntryTime);
      const event = await logEvent({
        ...baseEvent,
        booking: anyBooking._id,
        result: RECOGNITION_RESULT.OUTSIDE_WINDOW,
        allowed: false,
        message: `Booking ${anyBooking.bookingId} is outside its entry window`,
        matchDetail: { bookedPlate: anyBooking.vehicleNumber, matchKind: 'exact', similarity: 1 },
      });
      return {
        allowed: false,
        result: RECOGNITION_RESULT.OUTSIDE_WINDOW,
        message: minutesEarly > 0
          ? `You are too early. Your booking starts in ${minutesEarly} minutes.`
          : 'Your booking window has passed. Please make a new booking.',
        recognition: { plate, confidence: recognition.confidence },
        booking: { bookingId: anyBooking.bookingId, expectedEntryTime: anyBooking.expectedEntryTime },
        eventId: event?._id,
      };
    }

    const event = await logEvent({
      ...baseEvent,
      result: RECOGNITION_RESULT.NO_BOOKING,
      allowed: false,
      message: `No confirmed booking for ${plate} at this facility`,
    });
    return {
      allowed: false,
      result: RECOGNITION_RESULT.NO_BOOKING,
      message: `No confirmed booking found for ${plate} at this facility.`,
      recognition: { plate, confidence: recognition.confidence },
      eventId: event?._id,
    };
  }

  // --- 4. Does the read plate really match the booked plate? ---
  const match = comparePlates(plate, booking.vehicleNumberNormalized);
  const isFlaggedFuzzy = match.kind === 'fuzzy' && match.similarity >= FUZZY_MATCH_MIN_SIMILARITY;

  if (!match.match || (match.kind === 'fuzzy' && !isFlaggedFuzzy)) {
    // The booking exists but the plate differs: record it as a fraud signal.
    const event = await logEvent({
      ...baseEvent,
      booking: booking._id,
      result: RECOGNITION_RESULT.PLATE_MISMATCH,
      allowed: false,
      flaggedAsFraud: true,
      message: `Recognized ${plate} but booking ${booking.bookingId} is for ${booking.vehicleNumber}`,
      matchDetail: {
        bookedPlate: booking.vehicleNumber,
        matchKind: match.kind,
        similarity: match.similarity,
      },
    });

    booking.fraudFlags.push({
      type: 'vehicle_mismatch',
      detail: `Entry attempt with plate ${plate}, booking is for ${booking.vehicleNumber}`,
      recognizedPlate: plate,
      similarity: match.similarity,
    });
    await booking.save();

    logger.warn(`Vehicle mismatch at lot ${lot._id}: read ${plate}, booked ${booking.vehicleNumber}`);

    return {
      allowed: false,
      result: RECOGNITION_RESULT.PLATE_MISMATCH,
      message: 'The vehicle number does not match the booking. Please contact the parking attendant.',
      recognition: { plate, confidence: recognition.confidence },
      flaggedAsFraud: true,
      eventId: event?._id,
    };
  }

  // --- 5. Admit the vehicle and open a session ---
  const { session, created } = await sessionService.openSession({
    booking,
    lot,
    entryTime: new Date(),
  });

  const event = await logEvent({
    ...baseEvent,
    booking: booking._id,
    parkingSession: session._id,
    result: created ? RECOGNITION_RESULT.VERIFIED : RECOGNITION_RESULT.DUPLICATE,
    allowed: true,
    // A near-miss that still opened the gate is worth reviewing later.
    flaggedAsFraud: isFlaggedFuzzy,
    message: created
      ? `Entry allowed for booking ${booking.bookingId}`
      : `Duplicate entry event - session ${session.sessionId} is already open`,
    matchDetail: { bookedPlate: booking.vehicleNumber, matchKind: match.kind, similarity: match.similarity },
  });

  if (event && created) {
    session.entryEvent = event._id;
    await session.save();
  }

  return {
    allowed: true,
    result: created ? RECOGNITION_RESULT.VERIFIED : RECOGNITION_RESULT.DUPLICATE,
    message: created
      ? `Welcome. Entry recorded for ${booking.vehicleNumber}.`
      : `This vehicle is already inside (session ${session.sessionId}).`,
    recognition: { plate, confidence: recognition.confidence, matchKind: match.kind },
    booking: {
      bookingId: booking.bookingId,
      vehicleNumber: booking.vehicleNumber,
      expectedExitTime: booking.expectedExitTime,
      durationHours: booking.durationHours,
    },
    session: {
      sessionId: session.sessionId,
      actualEntryTime: session.actualEntryTime,
      expectedExitTime: session.expectedExitTime,
    },
    reviewFlag: isFlaggedFuzzy ? 'Plate matched approximately and was logged for review' : undefined,
    eventId: event?._id,
  };
};

/**
 * Process a vehicle at the exit gate: find its open session, compute the final
 * bill including overstay, close the session and free the slot.
 *
 * Wrapped in a per-vehicle lock so a camera firing twice cannot close the same
 * session twice or double-charge the driver.
 */
const processExit = async ({ lotId, imageBuffer, mimeType, manualPlate, cameraId }) => {
  const lot = await loadOperationalLot(lotId);
  const recognition = await resolvePlate({ imageBuffer, mimeType, manualPlate });

  const baseEvent = {
    parkingLot: lot._id,
    eventType: RECOGNITION_EVENT.EXIT,
    recognizedPlate: recognition.plate,
    recognizedPlateNormalized: recognition.normalizedPlate,
    confidence: recognition.confidence,
    vehicleTypeGuess: recognition.vehicleTypeGuess,
    provider: recognition.provider,
    model: recognition.model,
    latencyMs: recognition.latencyMs,
    cameraId,
    rawModelResponse: recognition.raw,
  };

  if (!recognition.normalizedPlate || recognition.confidence < MIN_CONFIDENCE) {
    const event = await logEvent({
      ...baseEvent,
      result: RECOGNITION_RESULT.UNREADABLE,
      allowed: false,
      message: recognition.notes || 'Number plate could not be read with sufficient confidence',
    });
    return {
      allowed: false,
      result: RECOGNITION_RESULT.UNREADABLE,
      message: 'Number plate could not be read. Please ask the attendant for help.',
      recognition: { plate: recognition.plate, confidence: recognition.confidence },
      eventId: event?._id,
    };
  }

  const plate = recognition.normalizedPlate;

  return withLock(sessionLock(plate, lot._id.toString()), async () => {
    const session = await bookingService.findActiveSessionByPlate({ lotId: lot._id, normalizedPlate: plate });

    if (!session) {
      // Before treating this as a vehicle leaving that never arrived, check
      // whether it simply left a moment ago: an exit camera double-fires just
      // as readily as an entry one, and the attendant may re-scan too. Repeat
      // the original outcome rather than raising a fraud flag over it.
      const justLeft = await bookingService.findRecentlyClosedSessionByPlate({
        lotId: lot._id,
        normalizedPlate: plate,
      });

      if (justLeft) {
        const bill = justLeft.billing || {};
        const event = await logEvent({
          ...baseEvent,
          booking: justLeft.booking,
          parkingSession: justLeft._id,
          result: RECOGNITION_RESULT.DUPLICATE,
          allowed: true,
          message: `Duplicate exit event for session ${justLeft.sessionId}`,
        });

        return {
          allowed: true,
          result: RECOGNITION_RESULT.DUPLICATE,
          message:
            bill.amountDue > 0
              ? `This vehicle has already exited. ${bill.amountDue} ${bill.currency || 'INR'} remains due on session ${justLeft.sessionId}.`
              : `This vehicle has already exited. Session ${justLeft.sessionId} is complete with nothing further to pay.`,
          recognition: { plate, confidence: recognition.confidence },
          session: {
            sessionId: justLeft.sessionId,
            actualEntryTime: justLeft.actualEntryTime,
            actualExitTime: justLeft.actualExitTime,
            status: justLeft.status,
          },
          bill: justLeft.billing,
          eventId: event?._id,
        };
      }

      const event = await logEvent({
        ...baseEvent,
        result: RECOGNITION_RESULT.NO_SESSION,
        allowed: false,
        flaggedAsFraud: true,
        message: `No open parking session for ${plate} at this facility`,
      });
      logger.warn(`Exit attempt with no session at lot ${lot._id}: ${plate}`);
      return {
        allowed: false,
        result: RECOGNITION_RESULT.NO_SESSION,
        message: `No active parking session found for ${plate}. Please contact the parking attendant.`,
        recognition: { plate, confidence: recognition.confidence },
        flaggedAsFraud: true,
        eventId: event?._id,
      };
    }

    const { booking, bill, payment, alreadyClosed } = await sessionService.closeSession({
      session,
      lot,
      exitTime: new Date(),
    });

    const event = await logEvent({
      ...baseEvent,
      booking: session.booking,
      parkingSession: session._id,
      result: alreadyClosed ? RECOGNITION_RESULT.DUPLICATE : RECOGNITION_RESULT.VERIFIED,
      allowed: true,
      message: alreadyClosed
        ? `Duplicate exit event for session ${session.sessionId}`
        : `Exit recorded for session ${session.sessionId}`,
      matchDetail: { bookedPlate: session.vehicleNumber, matchKind: 'exact', similarity: 1 },
    });

    if (event && !alreadyClosed) {
      session.exitEvent = event._id;
      await session.save();
    }

    return {
      allowed: true,
      result: alreadyClosed ? RECOGNITION_RESULT.DUPLICATE : RECOGNITION_RESULT.VERIFIED,
      // The barrier opens either way: the vehicle is physically leaving. An
      // unpaid overstay is collected from the driver's dues list.
      message: bill.amountDue > 0
        ? `Overstay of ${billingService.formatDuration(bill.overstayMinutes)} detected. ${bill.amountDue} ${bill.currency} is due.`
        : 'Thank you. Your parking session is complete.',
      recognition: { plate, confidence: recognition.confidence },
      session: {
        sessionId: session.sessionId,
        actualEntryTime: session.actualEntryTime,
        actualExitTime: session.actualExitTime,
        status: session.status,
      },
      bill,
      receipt: billingService.buildReceipt({ lot, booking, session }),
      payment,
      eventId: event?._id,
    };
  });
};

/** Recognition audit trail for one facility. */
const listEvents = async (lotId, { page, limit, eventType, result, flaggedOnly }) => {
  const filter = { parkingLot: lotId };
  if (eventType) filter.eventType = eventType;
  if (result) filter.result = result;
  if (flaggedOnly) filter.flaggedAsFraud = true;

  const [items, total] = await Promise.all([
    VehicleRecognitionEvent.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-rawModelResponse')
      .populate('booking', 'bookingId vehicleNumber')
      .lean(),
    VehicleRecognitionEvent.countDocuments(filter),
  ]);

  return { items, total, page, limit };
};

module.exports = {
  processEntry,
  processExit,
  listEvents,
  resolvePlate,
  MIN_CONFIDENCE,
  EARLY_ENTRY_GRACE_MINUTES,
  LATE_ENTRY_GRACE_MINUTES,
};

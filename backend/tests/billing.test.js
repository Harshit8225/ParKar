'use strict';

const billing = require('../src/modules/billing/billing.service');

const HOUR = 60 * 60 * 1000;

const lot = {
  _id: { toString: () => 'lot1' },
  name: 'MG Road Parking',
  location: { address: '12 MG Road' },
  pricing: { overstayMultiplier: 1.5, graceMinutes: 10, minChargeHours: 1 },
};

const entryTime = new Date('2025-01-06T10:00:00.000Z');
const expectedExitTime = new Date(entryTime.getTime() + 2 * HOUR);

const booking = {
  bookingId: 'BK-TEST0001',
  durationHours: 2,
  expectedExitTime,
  pricing: { amount: 100, effectiveRatePerHour: 50, currency: 'INR' },
};

const session = {
  sessionId: 'PS-TEST0001',
  actualEntryTime: entryTime,
  expectedExitTime,
  vehicleNumber: 'KA01AB1234',
  vehicleType: 'car',
};

describe('computeFinalBill', () => {
  it('owes nothing when the vehicle leaves on time', () => {
    const bill = billing.computeFinalBill({ lot, booking, session, actualExitTime: expectedExitTime });

    expect(bill.parkedMinutes).toBe(120);
    expect(bill.overstayMinutes).toBe(0);
    expect(bill.overstayAmount).toBe(0);
    expect(bill.totalAmount).toBe(100);
    expect(bill.amountDue).toBe(0);
    expect(bill.hasOverstayed).toBe(false);
  });

  it('computes overstay as actualExit minus expectedExit', () => {
    const actualExitTime = new Date(expectedExitTime.getTime() + 45 * 60 * 1000);
    const bill = billing.computeFinalBill({ lot, booking, session, actualExitTime });

    expect(bill.overstayMinutes).toBe(45);
    expect(bill.parkedMinutes).toBe(165);
  });

  it('forgives an overstay inside the grace period', () => {
    const actualExitTime = new Date(expectedExitTime.getTime() + 7 * 60 * 1000);
    const bill = billing.computeFinalBill({ lot, booking, session, actualExitTime });

    expect(bill.overstayMinutes).toBe(7);
    expect(bill.chargeableOverstayMinutes).toBe(0);
    expect(bill.amountDue).toBe(0);
    expect(bill.breakdown.some((line) => /grace period/i.test(line.label))).toBe(true);
  });

  it('bills only the overstay, since the booking was pre-paid', () => {
    const actualExitTime = new Date(expectedExitTime.getTime() + 45 * 60 * 1000);
    const bill = billing.computeFinalBill({ lot, booking, session, actualExitTime });

    // 45 over - 10 grace = 35 chargeable -> 1 started hour at 50 * 1.5 = 75
    expect(bill.overstayAmount).toBe(75);
    expect(bill.prepaidAmount).toBe(100);
    expect(bill.totalAmount).toBe(175);
    expect(bill.amountDue).toBe(75); // not 175 - the booking was already paid
    expect(bill.hasOverstayed).toBe(true);
  });

  it('records an early exit without refunding it', () => {
    const actualExitTime = new Date(expectedExitTime.getTime() - 30 * 60 * 1000);
    const bill = billing.computeFinalBill({ lot, booking, session, actualExitTime });

    expect(bill.overstayMinutes).toBe(0);
    expect(bill.amountDue).toBe(0);
    expect(bill.totalAmount).toBe(100); // no refund
    expect(bill.breakdown.some((line) => /early/i.test(line.label))).toBe(true);
  });

  it('scales a long overstay across multiple hours', () => {
    const actualExitTime = new Date(expectedExitTime.getTime() + 3 * HOUR);
    const bill = billing.computeFinalBill({ lot, booking, session, actualExitTime });

    // 180 over - 10 grace = 170 -> 3 started hours at 75
    expect(bill.overstayHours).toBe(3);
    expect(bill.overstayAmount).toBe(225);
    expect(bill.amountDue).toBe(225);
  });
});

describe('formatDuration', () => {
  it('renders hours and minutes readably', () => {
    expect(billing.formatDuration(0)).toBe('0m');
    expect(billing.formatDuration(45)).toBe('45m');
    expect(billing.formatDuration(60)).toBe('1h');
    expect(billing.formatDuration(135)).toBe('2h 15m');
  });
});

describe('buildReceipt', () => {
  it('summarises a closed session', () => {
    const actualExitTime = new Date(expectedExitTime.getTime() + 45 * 60 * 1000);
    const bill = billing.computeFinalBill({ lot, booking, session, actualExitTime });
    const closed = { ...session, actualExitTime, billing: { ...bill, settled: true, settledAt: actualExitTime } };

    const receipt = billing.buildReceipt({ lot, booking, session: closed });

    expect(receipt.bookingId).toBe('BK-TEST0001');
    expect(receipt.vehicleNumber).toBe('KA01AB1234');
    expect(receipt.parkedDuration).toBe('2h 45m');
    expect(receipt.overstayDuration).toBe('45m');
    expect(receipt.charges.total).toBe(175);
    expect(receipt.charges.amountDue).toBe(75);
  });
});

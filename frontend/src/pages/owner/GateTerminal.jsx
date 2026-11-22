import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../api/client';
import { parkingApi, recognitionApi } from '../../api/endpoints';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  KeyValue,
  PageHeader,
  Select,
  Spinner,
} from '../../components/ui';
import { dateTime, duration, money, statusLabel } from '../../utils/format';

/**
 * Gate terminal.
 *
 * Captures a frame from the entrance camera (or an uploaded photo) and posts it
 * to the backend, which calls Gemini Vision and reads the plate. The image never
 * leaves our backend, and the Gemini key is never in this bundle.
 *
 * Reading and deciding are two separate steps on purpose. The read fills the
 * vehicle number field, the attendant confirms or corrects it, and only then
 * does the gate act - on the confirmed text, not on a second look at the image.
 * That way the barrier opens for exactly the plate the attendant approved, and
 * a misread costs a keystroke instead of a wrongly opened gate.
 */
const GateTerminal = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const plateInputRef = useRef(null);

  const [lots, setLots] = useState([]);
  const [lotId, setLotId] = useState('');
  const [mode, setMode] = useState('entry');
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [plate, setPlate] = useState('');
  const [detection, setDetection] = useState(null);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [submitted, setSubmitted] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [recognitionStatus, setRecognitionStatus] = useState(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    parkingApi
      .myLots({ status: 'approved', limit: 50 })
      .then(({ items }) => {
        setLots(items);
        if (items.length) setLotId(items[0].id);
      })
      .catch((err) => setError(errorMessage(err)));

    recognitionApi.status().then(setRecognitionStatus).catch(() => setRecognitionStatus(null));
  }, []);

  // Always release the camera when leaving the page.
  useEffect(
    () => () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const startCamera = async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch (err) {
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Camera access was denied. Upload a photo or type the plate instead.'
          : 'No camera is available. Upload a photo or type the plate instead.',
      );
    }
  };

  const stopCamera = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  /** Grab the current video frame as a JPEG data URL. */
  const captureFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  };

  const readFile = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read the selected file'));
      reader.readAsDataURL(file);
    });

  /** Read a plate out of an image and drop it into the vehicle number field. */
  const readPlate = async (imageBase64) => {
    setReading(true);
    setError('');
    setNotice('');
    setResult(null);
    setDetection(null);

    try {
      const recognition = await recognitionApi.preview({
        parkingLotId: lotId || undefined,
        imageBase64,
      });

      const read = (recognition?.plate || '').toUpperCase();
      if (!read) {
        setPlate('');
        setNotice('No plate could be read from that image. Type the vehicle number in below.');
        plateInputRef.current?.focus();
        return;
      }

      setDetection(recognition);
      setPlate(read);
      // Select the filled-in text so correcting a misread is one keystroke away.
      plateInputRef.current?.focus();
      plateInputRef.current?.select();
    } catch (err) {
      setError(errorMessage(err, 'The plate could not be read from that image.'));
    } finally {
      setReading(false);
    }
  };

  const handleCapture = async () => {
    const frame = captureFrame();
    if (!frame) {
      setError('Could not capture a frame from the camera.');
      return;
    }
    setPreview(frame);
    await readPlate(frame);
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFile(file);
      setPreview(dataUrl);
      await readPlate(dataUrl);
    } catch (err) {
      setError(err.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  /** Send the confirmed vehicle number to the gate. */
  const handleSubmit = async (event) => {
    event.preventDefault();

    const confirmed = plate.trim().toUpperCase();
    if (!confirmed) return;
    if (!lotId) {
      setError('Choose a facility first.');
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    setResult(null);
    setSubmitted(null);

    try {
      const payload = {
        parkingLotId: lotId,
        cameraId: `web-terminal-${mode}`,
        manualPlate: confirmed,
      };
      const response = mode === 'entry' ? await recognitionApi.entry(payload) : await recognitionApi.exit(payload);
      setResult(response.data);
      // The gate acts on the confirmed text, so the backend records it as a
      // manual entry at 100%. Remember what the camera actually read, so the
      // decision panel shows the real provenance rather than a hollow 100%.
      setSubmitted({ plate: confirmed, detection });
      setPlate('');
      setDetection(null);
    } catch (err) {
      setError(errorMessage(err, 'The gate could not process this vehicle.'));
    } finally {
      setBusy(false);
    }
  };

  const clearPlate = () => {
    setPlate('');
    setDetection(null);
    setNotice('');
    plateInputRef.current?.focus();
  };

  const geminiOff = recognitionStatus && !recognitionStatus.configured;
  const minConfidence = recognitionStatus?.minConfidence ?? 0.55;
  const detectedPlate = (detection?.plate || '').toUpperCase();
  const edited = Boolean(detectedPlate) && plate.trim().toUpperCase() !== detectedPlate;
  const lowConfidence =
    detection && typeof detection.confidence === 'number' && detection.confidence < minConfidence;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-title-2 text-label">Gate terminal</h1>
      </div>

      {error && <Alert kind="error" onDismiss={() => setError('')}>{error}</Alert>}
      {geminiOff && (
        <Alert kind="warning">
          Vehicle recognition is not configured on this server (no <code>GEMINI_API_KEY</code>). Camera capture will fail;
          type the vehicle number in by hand to test the gate flow.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Card title="Gate configuration">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Facility" required>
                <Select value={lotId} onChange={(event) => setLotId(event.target.value)}>
                  {lots.length === 0 && <option value="">No approved facilities</option>}
                  {lots.map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      {lot.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Gate">
                <Select value={mode} onChange={(event) => setMode(event.target.value)}>
                  <option value="entry">Entry gate</option>
                  <option value="exit">Exit gate</option>
                </Select>
              </Field>
            </div>
          </Card>

          <Card title="Camera">
            <div className="overflow-hidden panel-dark rounded-control">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={videoRef} className={`aspect-video w-full object-cover ${cameraOn ? '' : 'hidden'}`} playsInline muted />
              {!cameraOn && (
                <div className="flex aspect-video w-full items-center justify-center text-footnote text-white/45">
                  {preview ? (
                    <img src={preview} alt="Last captured frame" className="h-full w-full object-contain" />
                  ) : (
                    'Camera is off'
                  )}
                </div>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />

            {cameraError && (
              <div className="mt-3">
                <Alert kind="warning">{cameraError}</Alert>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {cameraOn ? (
                <>
                  <Button onClick={handleCapture} loading={reading} size="lg">
                    Capture and read plate
                  </Button>
                  <Button tone="secondary" onClick={stopCamera}>
                    Stop camera
                  </Button>
                </>
              ) : (
                <Button onClick={startCamera}>Start camera</Button>
              )}
              <Button tone="secondary" onClick={() => fileInputRef.current?.click()} loading={reading}>
                Upload a photo
              </Button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            </div>
          </Card>

          <Card title="Vehicle number">
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* The input and the button are the only two things on this row,
                  and `items-stretch` makes the shorter one grow to the taller,
                  so their tops and bottoms line up whatever the label or hint
                  below is doing. */}
              <div className="flex flex-wrap items-stretch gap-3">
                <Input
                  ref={plateInputRef}
                  aria-label="Vehicle number"
                  value={plate}
                  onChange={(event) => setPlate(event.target.value.toUpperCase())}
                  placeholder="KA01AB1234"
                  className="min-w-[12rem] flex-1 font-mono uppercase tracking-wider"
                  maxLength={15}
                  disabled={reading}
                />
                <Button
                  type="submit"
                  loading={busy}
                  disabled={reading || !plate.trim()}
                  size="lg"
                  className="shrink-0 whitespace-nowrap max-sm:w-full"
                >
                  {mode === 'entry' ? 'Admit at entry gate' : 'Release at exit gate'}
                </Button>
              </div>

              {reading && <p className="text-caption text-label-secondary">Reading the number plate...</p>}

              {notice && <Alert kind="warning">{notice}</Alert>}

              {detectedPlate && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-label-secondary">
                  <span>
                    Camera read <span className="font-mono tracking-wider text-label">{detectedPlate}</span>
                  </span>
                  {typeof detection.confidence === 'number' && (
                    <span className={lowConfidence ? 'text-amber-700' : undefined}>
                      {(detection.confidence * 100).toFixed(0)}% confidence
                    </span>
                  )}
                  {detection.plausibleFormat === false && <span className="text-amber-700">Unusual plate format</span>}
                  {edited && <span className="text-brand-700">Corrected before submitting</span>}
                  <button
                    type="button"
                    onClick={clearPlate}
                    className="tap rounded-capsule underline underline-offset-2 hover:text-label"
                  >
                    Clear
                  </button>
                </div>
              )}

              {lowConfidence && !edited && (
                <Alert kind="warning">
                  The camera was not confident about this read. Check the plate against the vehicle before opening the gate.
                </Alert>
              )}
            </form>
          </Card>
        </div>

        <div>
          <GateResult result={result} busy={busy} mode={mode} submitted={submitted} />
        </div>
      </div>
    </div>
  );
};

const GateResult = ({ result, busy, mode, submitted }) => {
  if (busy) {
    return (
      <Card title="Gate decision">
        <Spinner label="Checking the booking..." />
      </Card>
    );
  }

  if (!result) {
    return (
      <Card title="Gate decision">
        <div className="py-12 text-center text-footnote text-label-secondary">
          Waiting for a vehicle.
        </div>
      </Card>
    );
  }

  const allowed = result.allowed;
  const spot = result.spot || result.booking?.spot;

  // The plate the gate acted on is always the one the operator confirmed, so
  // the backend's confidence is a flat 1. Report where it actually came from.
  const cameraRead = (submitted?.detection?.plate || '').toUpperCase();
  const cameraConfidence = submitted?.detection?.confidence;
  const corrected = Boolean(cameraRead) && cameraRead !== submitted.plate;

  return (
    <Card title="Gate decision" className="lg:sticky lg:top-20">
      <div
        className={`rounded-control p-5 text-center ring-1 ring-inset ${
          allowed ? 'bg-emerald-50 ring-emerald-200' : 'bg-rose-50 ring-rose-200'
        }`}
      >
        <p className={`text-title-1 ${allowed ? 'text-emerald-700' : 'text-rose-700'}`}>
          {allowed ? 'BARRIER OPEN' : 'BARRIER CLOSED'}
        </p>
        <p className={`mt-2 text-footnote ${allowed ? 'text-emerald-800' : 'text-rose-800'}`}>{result.message}</p>

        {/* Where the attendant waves the vehicle to: the bay or flexible-zone
            markers the booking was assigned. */}
        {allowed && spot?.label && (
          <div className="mx-auto mt-4 w-fit rounded-control bg-surface px-5 py-3 ring-1 ring-inset ring-emerald-200">
            <p className="eyebrow text-label-tertiary">Direct to</p>
            <p className="mt-0.5 font-mono text-title-1 tracking-wider text-label">{spot.label}</p>
            {spot.instructions && <p className="mt-1 text-caption text-label-secondary">{spot.instructions}</p>}
          </div>
        )}
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <p className="eyebrow text-label-tertiary">Recognition</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <span className="rounded-control bg-slate-100 px-3.5 py-2 font-mono text-title-3 tracking-wider text-label">
              {result.recognition?.plate || 'UNREADABLE'}
            </span>
            <Badge status={allowed ? 'confirmed' : 'failed'}>{statusLabel(result.result)}</Badge>
          </div>
          {submitted && (
            <p className="mt-1.5 text-caption text-label-secondary">
              {cameraRead ? (
                <>
                  Camera read <span className="font-mono tracking-wider">{cameraRead}</span>
                  {typeof cameraConfidence === 'number' && ` at ${(cameraConfidence * 100).toFixed(0)}% confidence`}
                  {corrected ? ', corrected by the operator before opening.' : ', confirmed by the operator.'}
                </>
              ) : (
                'Typed in by the operator - no camera read.'
              )}
            </p>
          )}
          {result.recognition?.matchKind && result.recognition.matchKind !== 'exact' && (
            <p className="mt-1 text-caption text-amber-700">
              Matched approximately ({result.recognition.matchKind}). Logged for review.
            </p>
          )}
        </div>

        {result.flaggedAsFraud && (
          <Alert kind="error">
            This event was flagged as a possible vehicle mismatch and recorded in the fraud report.
          </Alert>
        )}
        {result.reviewFlag && <Alert kind="warning">{result.reviewFlag}</Alert>}

        {result.booking && (
          <div className="border-t border-separator pt-4">
            <p className="eyebrow text-label-tertiary">Booking</p>
            <div className="mt-2">
              <KeyValue
                rows={[
                  { label: 'Booking ID', value: result.booking.bookingId },
                  { label: 'Booked vehicle', value: result.booking.vehicleNumber },
                  { label: 'Assigned spot', value: spot?.label },
                  { label: 'Booked until', value: result.booking.expectedExitTime ? dateTime(result.booking.expectedExitTime) : undefined },
                  { label: 'Entry time', value: result.booking.expectedEntryTime ? dateTime(result.booking.expectedEntryTime) : undefined },
                  { label: 'Duration', value: result.booking.durationHours ? `${result.booking.durationHours}h` : undefined },
                ]}
              />
            </div>
          </div>
        )}

        {result.session && (
          <div className="border-t border-separator pt-4">
            <p className="eyebrow text-label-tertiary">Session</p>
            <div className="mt-2">
              <KeyValue
                rows={[
                  { label: 'Session ID', value: result.session.sessionId },
                  { label: 'Entered at', value: dateTime(result.session.actualEntryTime) },
                  { label: 'Exited at', value: result.session.actualExitTime ? dateTime(result.session.actualExitTime) : undefined },
                  { label: 'Status', value: result.session.status ? statusLabel(result.session.status) : undefined },
                ]}
              />
            </div>
          </div>
        )}

        {result.bill && mode === 'exit' && (
          <div className="border-t border-separator pt-4">
            <p className="eyebrow text-label-tertiary">Final bill</p>
            <dl className="mt-2 space-y-1.5 text-footnote tabular-nums">
              <div className="flex justify-between">
                <dt className="text-label-secondary">Parked for</dt>
                <dd className="text-label">{duration(result.bill.parkedMinutes)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-label-secondary">Overstay</dt>
                <dd className={result.bill.overstayMinutes > 0 ? 'text-amber-700' : 'text-label'}>
                  {result.bill.overstayMinutes > 0 ? duration(result.bill.overstayMinutes) : 'None'}
                </dd>
              </div>
              {(result.bill.breakdown || []).map((line, index) => (
                <div key={`${line.label}-${index}`} className="flex justify-between">
                  <dt className="text-label-secondary">{line.label}</dt>
                  <dd className="text-label">{money(line.amount)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-separator pt-2 font-semibold">
                <dt>Total</dt>
                <dd>{money(result.bill.totalAmount)}</dd>
              </div>
              {result.bill.amountDue > 0 && (
                <div className="flex justify-between text-rose-700">
                  <dt className="font-medium">Collect at the gate</dt>
                  <dd className="font-semibold">{money(result.bill.amountDue)}</dd>
                </div>
              )}
            </dl>
            {result.bill.amountDue > 0 ? (
              <Alert kind="warning">
                The driver owes {money(result.bill.amountDue)} for overstaying. It has been added to their account and can be
                paid from their dashboard.
              </Alert>
            ) : (
              // Say it outright. An attendant should not have to infer "nothing
              // to collect" from the absence of a red line.
              <Alert kind="success">
                Nothing further to collect - the booking covered the whole stay. Wave the vehicle through.
              </Alert>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

export default GateTerminal;

import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../api/client';
import { parkingApi, recognitionApi } from '../../api/endpoints';
import { Alert, Badge, Button, Card, Field, Input, KeyValue, Select, Spinner } from '../../components/ui';
import { dateTime, duration, money, statusLabel } from '../../utils/format';

/**
 * Gate terminal.
 *
 * Captures a frame from the entrance camera (or an uploaded photo) and posts it
 * to the backend, which calls Gemini Vision, matches the plate against a
 * booking, and answers with a gate decision. The image never leaves our
 * backend, and the Gemini key is never in this bundle.
 *
 * Manual plate entry is the fallback when a plate is genuinely unreadable -
 * recorded as manual in the audit trail.
 */
const GateTerminal = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  const [lots, setLots] = useState([]);
  const [lotId, setLotId] = useState('');
  const [mode, setMode] = useState('entry');
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [manualPlate, setManualPlate] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
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

  const submit = async ({ imageBase64, plate }) => {
    if (!lotId) {
      setError('Choose a facility first.');
      return;
    }
    setBusy(true);
    setError('');
    setResult(null);

    try {
      const payload = { parkingLotId: lotId, cameraId: `web-terminal-${mode}` };
      if (imageBase64) payload.imageBase64 = imageBase64;
      if (plate) payload.manualPlate = plate;

      const response = mode === 'entry' ? await recognitionApi.entry(payload) : await recognitionApi.exit(payload);
      setResult(response.data);
      if (plate) setManualPlate('');
    } catch (err) {
      setError(errorMessage(err, 'The gate could not process this vehicle.'));
    } finally {
      setBusy(false);
    }
  };

  const handleCapture = async () => {
    const frame = captureFrame();
    if (!frame) {
      setError('Could not capture a frame from the camera.');
      return;
    }
    setPreview(frame);
    await submit({ imageBase64: frame });
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFile(file);
      setPreview(dataUrl);
      await submit({ imageBase64: dataUrl });
    } catch (err) {
      setError(err.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleManual = async (event) => {
    event.preventDefault();
    if (!manualPlate.trim()) return;
    setPreview(null);
    await submit({ plate: manualPlate.trim().toUpperCase() });
  };

  const geminiOff = recognitionStatus && !recognitionStatus.configured;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Gate terminal</h1>
        <p className="text-sm text-ink-500">
          Capture a number plate at the entrance or exit. Recognition runs on the server via Gemini Vision.
        </p>
      </div>

      {error && <Alert kind="error" onDismiss={() => setError('')}>{error}</Alert>}
      {geminiOff && (
        <Alert kind="warning">
          Vehicle recognition is not configured on this server (no <code>GEMINI_API_KEY</code>). Camera capture will fail;
          use manual plate entry to test the gate flow.
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
            <div className="overflow-hidden rounded-lg bg-ink-900">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={videoRef} className={`aspect-video w-full object-cover ${cameraOn ? '' : 'hidden'}`} playsInline muted />
              {!cameraOn && (
                <div className="flex aspect-video w-full items-center justify-center text-sm text-slate-400">
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
                  <Button onClick={handleCapture} loading={busy} size="lg">
                    Capture and {mode === 'entry' ? 'admit' : 'release'}
                  </Button>
                  <Button tone="secondary" onClick={stopCamera}>
                    Stop camera
                  </Button>
                </>
              ) : (
                <Button onClick={startCamera}>Start camera</Button>
              )}
              <Button tone="secondary" onClick={() => fileInputRef.current?.click()} loading={busy}>
                Upload a photo
              </Button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            </div>
          </Card>

          <Card title="Manual plate entry" subtitle="Use this when the plate cannot be read by the camera.">
            <form onSubmit={handleManual} className="flex flex-wrap items-end gap-3">
              <Field label="Vehicle number" className="flex-1 min-w-[12rem]">
                <Input
                  value={manualPlate}
                  onChange={(event) => setManualPlate(event.target.value.toUpperCase())}
                  placeholder="KA01AB1234"
                  className="font-mono uppercase"
                  maxLength={15}
                />
              </Field>
              <Button type="submit" loading={busy} disabled={!manualPlate.trim()}>
                Submit at {mode} gate
              </Button>
            </form>
          </Card>
        </div>

        <div>
          <GateResult result={result} busy={busy} mode={mode} />
        </div>
      </div>
    </div>
  );
};

const GateResult = ({ result, busy, mode }) => {
  if (busy) {
    return (
      <Card title="Gate decision">
        <Spinner label="Reading the number plate..." />
      </Card>
    );
  }

  if (!result) {
    return (
      <Card title="Gate decision">
        <div className="py-12 text-center text-sm text-ink-500">
          Capture a vehicle to see the decision here.
        </div>
      </Card>
    );
  }

  const allowed = result.allowed;

  return (
    <Card title="Gate decision" className="lg:sticky lg:top-20">
      <div
        className={`rounded-lg p-5 text-center ring-1 ring-inset ${
          allowed ? 'bg-emerald-50 ring-emerald-200' : 'bg-rose-50 ring-rose-200'
        }`}
      >
        <p className={`text-3xl font-bold ${allowed ? 'text-emerald-700' : 'text-rose-700'}`}>
          {allowed ? 'BARRIER OPEN' : 'BARRIER CLOSED'}
        </p>
        <p className={`mt-2 text-sm ${allowed ? 'text-emerald-800' : 'text-rose-800'}`}>{result.message}</p>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Recognition</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <span className="rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-lg font-semibold text-ink-900">
              {result.recognition?.plate || 'UNREADABLE'}
            </span>
            {result.recognition?.confidence !== undefined && (
              <span className="text-sm text-ink-500">
                {(result.recognition.confidence * 100).toFixed(0)}% confidence
              </span>
            )}
            <Badge status={allowed ? 'confirmed' : 'failed'}>{statusLabel(result.result)}</Badge>
          </div>
          {result.recognition?.matchKind && result.recognition.matchKind !== 'exact' && (
            <p className="mt-1 text-xs text-amber-700">
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
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Booking</p>
            <div className="mt-2">
              <KeyValue
                rows={[
                  { label: 'Booking ID', value: result.booking.bookingId },
                  { label: 'Booked vehicle', value: result.booking.vehicleNumber },
                  { label: 'Booked until', value: result.booking.expectedExitTime ? dateTime(result.booking.expectedExitTime) : undefined },
                  { label: 'Entry time', value: result.booking.expectedEntryTime ? dateTime(result.booking.expectedEntryTime) : undefined },
                  { label: 'Duration', value: result.booking.durationHours ? `${result.booking.durationHours}h` : undefined },
                ]}
              />
            </div>
          </div>
        )}

        {result.session && (
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Session</p>
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
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Final bill</p>
            <dl className="mt-2 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-500">Parked for</dt>
                <dd className="text-ink-900">{duration(result.bill.parkedMinutes)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Overstay</dt>
                <dd className={result.bill.overstayMinutes > 0 ? 'text-amber-700' : 'text-ink-900'}>
                  {result.bill.overstayMinutes > 0 ? duration(result.bill.overstayMinutes) : 'None'}
                </dd>
              </div>
              {(result.bill.breakdown || []).map((line, index) => (
                <div key={`${line.label}-${index}`} className="flex justify-between">
                  <dt className="text-ink-500">{line.label}</dt>
                  <dd className="text-ink-900">{money(line.amount)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold">
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
            {result.bill.amountDue > 0 && (
              <Alert kind="warning">
                The driver owes {money(result.bill.amountDue)} for overstaying. It has been added to their account and can be
                paid from their dashboard.
              </Alert>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

export default GateTerminal;

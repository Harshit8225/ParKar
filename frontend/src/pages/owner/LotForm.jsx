import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { geoApi, parkingApi } from '../../api/endpoints';
import { Alert, Button, Field, Input, Spinner, Textarea } from '../../components/ui';

/**
 * Registration and editing share one form; `id` decides which.
 *
 * Deliberately just labels and inputs. Dynamic pricing is not configured here -
 * the backend applies its own defaults for the overstay multiplier, grace
 * period and minimum charge, and the demand multipliers live on the Dynamic
 * pricing page once a facility is approved.
 */

/** Leaflet only loads once this page is open, not with the app shell. */
const LocationPicker = lazy(() => import('../../components/LocationPicker'));

const EMPTY = {
  name: '',
  description: '',
  contactEmail: '',
  contactPhone: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  latitude: '',
  longitude: '',
  capacityTwo: 0,
  capacityFour: 0,
  rateTwo: 0,
  rateFour: 0,
  is24x7: false,
  openTime: '06:00',
  closeTime: '23:00',
  evCharging: false,
  covered: false,
  security: false,
  cctv: false,
};

const ICONS = {
  bike: 'M5.5 18.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm13 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-13-3h6l3.5-7.5H12m2 0h3l1.5 7.5',
  car: 'M5 17.5h14M6.5 17.5v-3.2a1.5 1.5 0 0 1 .44-1.06l2-2a1.5 1.5 0 0 1 1.06-.44h4a1.5 1.5 0 0 1 1.06.44l2 2a1.5 1.5 0 0 1 .44 1.06v3.2M4 13.5h16',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  crosshair: 'M12 3v3m0 12v3M3 12h3m12 0h3M12 7.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8Z',
  wand: 'M4 20 14 10m0 0 2.5-2.5M14 10l-2.5-2.5M18 3v3m0 12v3m3-9h-3M9 6H6m12 9h3M6 9H3',
};

const Icon = ({ name, className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
    <path d={ICONS[name]} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Section = ({ title, children }) => (
  <section className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm backdrop-blur-sm sm:p-7">
    <h2 className="text-base font-semibold text-ink-900">{title}</h2>
    <div className="mt-5">{children}</div>
  </section>
);

/** Amenities and the 24/7 flag read better as pressable chips than checkboxes. */
const Toggle = ({ label, checked, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    aria-pressed={checked}
    className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition ${
      checked
        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
        : 'border-slate-200 bg-white text-ink-500 hover:border-slate-300 hover:text-ink-700'
    }`}
  >
    <span
      aria-hidden="true"
      className={`grid h-4 w-4 place-items-center rounded-full border ${
        checked ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'
      }`}
    >
      {checked && <Icon name="check" className="h-3 w-3" />}
    </span>
    {label}
  </button>
);

/** Capacity and rate for one vehicle type, kept side by side deliberately. */
const VehicleBlock = ({ icon, title, capacity, rate, onCapacity, onRate }) => {
  const needsRate = Number(capacity) > 0 && !(Number(rate) > 0);

  return (
    <div
      className={`rounded-xl border p-4 transition ${
        needsRate ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-slate-50'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <Icon name={icon} className="h-5 w-5 text-ink-700" />
        <p className="text-sm font-semibold text-ink-900">{title}</p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Total slots">
          <Input type="number" min="0" value={capacity} onChange={onCapacity} required />
        </Field>
        <Field label="Base rate / hour">
          <Input type="number" min="0" step="0.5" value={rate} onChange={onRate} />
        </Field>
      </div>

      {needsRate && (
        <p className="mt-2 text-xs font-medium text-amber-800">
          Set a rate, or drop the slot count to zero.
        </p>
      )}
    </div>
  );
};

const LotForm = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [locating, setLocating] = useState(false);
  const [filling, setFilling] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    parkingApi
      .manage(id)
      .then((lot) =>
        setForm({
          name: lot.name || '',
          description: lot.description || '',
          contactEmail: lot.contact?.email || '',
          contactPhone: lot.contact?.phone || '',
          address: lot.location.address || '',
          city: lot.location.city || '',
          state: lot.location.state || '',
          pincode: lot.location.pincode || '',
          latitude: lot.location.latitude ?? '',
          longitude: lot.location.longitude ?? '',
          capacityTwo: lot.capacity.two_wheeler,
          capacityFour: lot.capacity.four_wheeler,
          rateTwo: lot.hourlyRate.two_wheeler,
          rateFour: lot.hourlyRate.four_wheeler,
          is24x7: lot.operatingHours.is24x7,
          openTime: lot.operatingHours.openTime || '06:00',
          closeTime: lot.operatingHours.closeTime || '23:00',
          evCharging: lot.amenities.evCharging,
          covered: lot.amenities.covered,
          security: lot.amenities.security,
          cctv: lot.amenities.cctv,
        }),
      )
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
  const set = (field) => (value) => setForm((prev) => ({ ...prev, [field]: value }));

  const pickOnMap = (latitude, longitude) =>
    setForm((prev) => ({ ...prev, latitude: latitude.toFixed(6), longitude: longitude.toFixed(6) }));

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError('This browser cannot share a location. Drop the pin on the map instead.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        pickOnMap(position.coords.latitude, position.coords.longitude);
        setLocating(false);
      },
      () => {
        setError('Could not read your location. Drop the pin on the map instead.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  /** Fill the written address from wherever the pin currently sits. */
  const fillAddressFromPin = async () => {
    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || form.latitude === '') {
      setError('Drop the pin on the map first.');
      return;
    }

    setFilling(true);
    setError('');
    try {
      const place = await geoApi.reverse(latitude, longitude);
      setForm((prev) => ({
        ...prev,
        // Only fill blanks - never overwrite something typed by hand.
        address: prev.address || place.address || '',
        city: prev.city || place.city || '',
        state: prev.state || place.state || '',
        pincode: prev.pincode || place.pincode || '',
      }));
    } catch (err) {
      setError(errorMessage(err, 'Could not read an address for that pin.'));
    } finally {
      setFilling(false);
    }
  };

  /**
   * `pricing` is deliberately absent: the backend owns those defaults, and
   * sending nothing on an edit leaves whatever the facility already has.
   */
  const buildPayload = () => ({
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    contact:
      form.contactEmail || form.contactPhone
        ? { email: form.contactEmail || undefined, phone: form.contactPhone || undefined }
        : undefined,
    location: {
      address: form.address.trim(),
      city: form.city.trim(),
      state: form.state.trim() || undefined,
      pincode: form.pincode.trim() || undefined,
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
    },
    capacity: { two_wheeler: Number(form.capacityTwo), four_wheeler: Number(form.capacityFour) },
    hourlyRate: { two_wheeler: Number(form.rateTwo), four_wheeler: Number(form.rateFour) },
    operatingHours: { is24x7: form.is24x7, openTime: form.openTime, closeTime: form.closeTime },
    amenities: {
      evCharging: form.evCharging,
      covered: form.covered,
      security: form.security,
      cctv: form.cctv,
    },
  });

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      if (isEdit) {
        await parkingApi.update(id, buildPayload());
        setNotice('Facility updated.');
      } else {
        const lot = await parkingApi.create(buildPayload());
        navigate(`/owner/lots/${lot.id}`, { replace: true });
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not save the facility.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Spinner label="Loading facility..." />;

  return (
    <form onSubmit={handleSubmit}>
      {/* ---- Header band over the deck photograph ---- */}
      <section className="relative isolate -mx-4 -mt-8 overflow-hidden sm:-mx-6">
        <img
          src="/hero-garage.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(160deg,rgba(3,20,26,0.94)_0%,rgba(6,38,48,0.86)_55%,rgba(5,26,34,0.8)_100%)]"
        />
        <div
          aria-hidden="true"
          className="parkar-pulse absolute -right-20 top-6 h-2 w-1/2 rotate-[8deg] rounded-full bg-[linear-gradient(270deg,transparent,#34d399,#a7f3d0)] blur-[3px]"
        />

        <div className="relative mx-auto max-w-3xl px-4 py-12 text-center sm:px-6 sm:py-16">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-4xl">
            {isEdit ? 'Edit facility' : 'Register a parking facility'}
          </h1>
        </div>
      </section>

      {/* ---- Centred form, with the photo washing out behind its top ---- */}
      <div className="relative">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-96 overflow-hidden">
          <img src="/hero-garage.jpg" alt="" className="h-full w-full object-cover opacity-[0.07]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(248,250,252,0.55)_0%,rgba(248,250,252,0.9)_60%,#f8fafc_100%)]" />
        </div>

        <div className="relative mx-auto mt-8 max-w-3xl space-y-5">
          {error && <Alert kind="error" onDismiss={() => setError('')}>{error}</Alert>}
          {notice && <Alert kind="success" onDismiss={() => setNotice('')}>{notice}</Alert>}

          <Section title="Facility">
            <div className="space-y-4">
              <Field label="Facility name" required>
                <Input
                  value={form.name}
                  onChange={update('name')}
                  required
                  minLength={3}
                  maxLength={160}
                  placeholder="MG Road Multilevel Parking"
                />
              </Field>
              <Field label="Description">
                <Textarea value={form.description} onChange={update('description')} maxLength={1000} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Contact email">
                  <Input type="email" value={form.contactEmail} onChange={update('contactEmail')} />
                </Field>
                <Field label="Contact phone">
                  <Input value={form.contactPhone} onChange={update('contactPhone')} placeholder="+91 98450 11111" />
                </Field>
              </div>
            </div>
          </Section>

          <Section title="Location">
            <Suspense
              fallback={
                <div className="grid h-64 place-items-center rounded-xl border border-slate-200 bg-slate-100 text-sm text-ink-500">
                  Loading map...
                </div>
              }
            >
              <LocationPicker
                latitude={Number(form.latitude)}
                longitude={Number(form.longitude)}
                onPick={pickOnMap}
              />
            </Suspense>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button tone="secondary" size="sm" onClick={useMyLocation} loading={locating}>
                <Icon name="crosshair" className="h-4 w-4" />
                I am at the facility
              </Button>
              <Button
                tone="secondary"
                size="sm"
                onClick={fillAddressFromPin}
                loading={filling}
                disabled={!form.latitude}
              >
                <Icon name="wand" className="h-4 w-4" />
                Fill address from pin
              </Button>
            </div>

            <div className="mt-5 space-y-4">
              <Field label="Street address" required>
                <Input value={form.address} onChange={update('address')} required minLength={5} maxLength={300} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="City" required>
                  <Input value={form.city} onChange={update('city')} required minLength={2} />
                </Field>
                <Field label="State">
                  <Input value={form.state} onChange={update('state')} />
                </Field>
                <Field label="Pincode">
                  <Input value={form.pincode} onChange={update('pincode')} inputMode="numeric" placeholder="273001" />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Latitude" required>
                  <Input
                    type="number"
                    step="any"
                    min="-90"
                    max="90"
                    value={form.latitude}
                    onChange={update('latitude')}
                    required
                    className="font-mono"
                  />
                </Field>
                <Field label="Longitude" required>
                  <Input
                    type="number"
                    step="any"
                    min="-180"
                    max="180"
                    value={form.longitude}
                    onChange={update('longitude')}
                    required
                    className="font-mono"
                  />
                </Field>
              </div>
            </div>
          </Section>

          <Section title="Capacity and rates">
            <div className="grid gap-4 sm:grid-cols-2">
              <VehicleBlock
                icon="bike"
                title="Two-wheelers"
                capacity={form.capacityTwo}
                rate={form.rateTwo}
                onCapacity={update('capacityTwo')}
                onRate={update('rateTwo')}
              />
              <VehicleBlock
                icon="car"
                title="Four-wheelers"
                capacity={form.capacityFour}
                rate={form.rateFour}
                onCapacity={update('capacityFour')}
                onRate={update('rateFour')}
              />
            </div>
          </Section>

          <Section title="Operating hours">
            <Toggle label="Open 24 hours, 7 days a week" checked={form.is24x7} onChange={set('is24x7')} />
            {!form.is24x7 && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Opening time" required>
                  <Input type="time" value={form.openTime} onChange={update('openTime')} required />
                </Field>
                <Field label="Closing time" required>
                  <Input type="time" value={form.closeTime} onChange={update('closeTime')} required />
                </Field>
              </div>
            )}
          </Section>

          <Section title="Amenities">
            <div className="flex flex-wrap gap-2.5">
              <Toggle label="EV charging" checked={form.evCharging} onChange={set('evCharging')} />
              <Toggle label="Covered parking" checked={form.covered} onChange={set('covered')} />
              <Toggle label="On-site security" checked={form.security} onChange={set('security')} />
              <Toggle label="CCTV" checked={form.cctv} onChange={set('cctv')} />
            </div>
          </Section>

          <div className="flex flex-wrap justify-center gap-3 pb-4 pt-2">
            <Button type="submit" size="lg" loading={submitting}>
              {isEdit ? 'Save changes' : 'Submit for approval'}
            </Button>
            <Button
              tone="secondary"
              size="lg"
              onClick={() => navigate(isEdit ? `/owner/lots/${id}` : '/owner/lots')}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
};

export default LotForm;

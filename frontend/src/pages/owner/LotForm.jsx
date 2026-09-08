import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { geoApi, parkingApi } from '../../api/endpoints';
import {
  Alert,
  Button,
  Chip,
  Field,
  Input,
  Spinner,
  Textarea,
} from '../../components/ui';
import Icon from '../../components/Icon';

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

const Section = ({ title, children }) => (
  <section className="rounded-card border border-separator bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-7">
    <h2 className="text-title-3 text-label">{title}</h2>
    <div className="mt-5">{children}</div>
  </section>
);

/** Capacity and rate for one vehicle type, kept side by side deliberately. */
const VehicleBlock = ({ icon, title, capacity, rate, onCapacity, onRate }) => {
  const needsRate = Number(capacity) > 0 && !(Number(rate) > 0);

  return (
    <div
      className={`rounded-control border p-4 transition ${
        needsRate ? 'border-amber-300 bg-amber-50/60' : 'border-separator bg-slate-50'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <Icon name={icon} size={5} className="text-label" />
        <p className="text-footnote font-semibold text-label">{title}</p>
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
        <p className="mt-2 text-caption font-medium text-amber-800">
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
      <section className="band-teal relative isolate -mx-4 -mt-8 overflow-hidden sm:-mx-6">
        <img
          src="/hero-garage.jpg"
          alt=""
          aria-hidden="true"
          width="1600"
          height="420"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div aria-hidden="true" className="band-wash absolute inset-0" />
        <div
          aria-hidden="true"
          className="parkar-pulse band-strip absolute -right-20 top-6 h-2 w-1/2 rotate-[8deg] rounded-capsule blur-[3px]"
        />

        <div className="relative mx-auto max-w-3xl px-4 py-12 text-center sm:px-6 sm:py-16">
          <h1 className="text-title-1 text-white">
            {isEdit ? 'Edit facility' : 'Register a parking facility'}
          </h1>
        </div>
      </section>

      {/* ---- Centred form, with the photo washing out behind its top ---- */}
      <div className="relative">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-96 overflow-hidden">
          <img src="/hero-garage.jpg" alt="" className="h-full w-full object-cover opacity-[0.07]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--canvas)_55%,transparent)_0%,color-mix(in_oklab,var(--canvas)_90%,transparent)_60%,var(--canvas)_100%)]" />
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
                <div className="grid h-64 place-items-center rounded-control border border-separator bg-slate-100 text-footnote text-label-secondary">
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
                <Icon name="crosshair" size={4} />
                I am at the facility
              </Button>
              <Button
                tone="secondary"
                size="sm"
                onClick={fillAddressFromPin}
                loading={filling}
                disabled={!form.latitude}
              >
                <Icon name="wand" size={4} />
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
            <Chip label="Open 24 hours, 7 days a week" checked={form.is24x7} onChange={set('is24x7')} />
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
              <Chip label="EV charging" checked={form.evCharging} onChange={set('evCharging')} />
              <Chip label="Covered parking" checked={form.covered} onChange={set('covered')} />
              <Chip label="On-site security" checked={form.security} onChange={set('security')} />
              <Chip label="CCTV" checked={form.cctv} onChange={set('cctv')} />
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

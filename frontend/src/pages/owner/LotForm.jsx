import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { parkingApi } from '../../api/endpoints';
import { Alert, Button, Card, Checkbox, Field, Input, Select, Spinner, Textarea } from '../../components/ui';

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
  dynamicPricingEnabled: true,
  overstayMultiplier: 1.5,
  graceMinutes: 10,
  minChargeHours: 1,
};

/** Registration and editing share one form; `id` decides which. */
const LotForm = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

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
          dynamicPricingEnabled: lot.pricing?.dynamicPricingEnabled ?? true,
          overstayMultiplier: lot.pricing?.overstayMultiplier ?? 1.5,
          graceMinutes: lot.pricing?.graceMinutes ?? 10,
          minChargeHours: lot.pricing?.minChargeHours ?? 1,
        }),
      )
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const update = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError('This browser cannot share a location. Enter the coordinates by hand.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setForm((prev) => ({
          ...prev,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        })),
      () => setError('Could not read your location. Enter the coordinates by hand.'),
    );
  };

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
    pricing: {
      dynamicPricingEnabled: form.dynamicPricingEnabled,
      overstayMultiplier: Number(form.overstayMultiplier),
      graceMinutes: Number(form.graceMinutes),
      minChargeHours: Number(form.minChargeHours),
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
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">{isEdit ? 'Edit facility' : 'Register a parking facility'}</h1>
        <p className="text-sm text-ink-500">
          {isEdit
            ? 'Changes take effect immediately. Capacity cannot be set below what is currently occupied or reserved.'
            : 'A platform administrator reviews new facilities before they appear in driver search.'}
        </p>
      </div>

      {error && <Alert kind="error" onDismiss={() => setError('')}>{error}</Alert>}
      {notice && <Alert kind="success" onDismiss={() => setNotice('')}>{notice}</Alert>}

      <Card title="Facility details">
        <div className="space-y-4">
          <Field label="Facility name" required>
            <Input value={form.name} onChange={update('name')} required minLength={3} maxLength={160} placeholder="MG Road Multilevel Parking" />
          </Field>
          <Field label="Description" hint="Shown to drivers on the facility page.">
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
      </Card>

      <Card title="Location" subtitle="Coordinates power the distance search, so make them accurate.">
        <div className="space-y-4">
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
              <Input value={form.pincode} onChange={update('pincode')} inputMode="numeric" placeholder="560001" />
            </Field>
          </div>
          <div className="grid items-end gap-4 sm:grid-cols-3">
            <Field label="Latitude" required>
              <Input type="number" step="any" min="-90" max="90" value={form.latitude} onChange={update('latitude')} required />
            </Field>
            <Field label="Longitude" required>
              <Input type="number" step="any" min="-180" max="180" value={form.longitude} onChange={update('longitude')} required />
            </Field>
            <Button tone="secondary" onClick={useMyLocation}>
              Use my current location
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Capacity and rates" subtitle="Set a rate for every vehicle type you have capacity for.">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-4 rounded-lg bg-slate-50 p-4">
            <p className="text-sm font-semibold text-ink-900">Two-wheelers</p>
            <Field label="Total slots" required>
              <Input type="number" min="0" value={form.capacityTwo} onChange={update('capacityTwo')} required />
            </Field>
            <Field label="Base rate per hour" required={Number(form.capacityTwo) > 0}>
              <Input type="number" min="0" step="0.5" value={form.rateTwo} onChange={update('rateTwo')} />
            </Field>
          </div>
          <div className="space-y-4 rounded-lg bg-slate-50 p-4">
            <p className="text-sm font-semibold text-ink-900">Four-wheelers</p>
            <Field label="Total slots" required>
              <Input type="number" min="0" value={form.capacityFour} onChange={update('capacityFour')} required />
            </Field>
            <Field label="Base rate per hour" required={Number(form.capacityFour) > 0}>
              <Input type="number" min="0" step="0.5" value={form.rateFour} onChange={update('rateFour')} />
            </Field>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-500">
          The base rate is the starting point. Dynamic pricing multiplies it by occupancy, peak hours, location and day of week.
        </p>
      </Card>

      <Card title="Operating hours">
        <Checkbox label="Open 24 hours, 7 days a week" checked={form.is24x7} onChange={update('is24x7')} />
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
        <p className="mt-3 text-xs text-ink-500">Bookings outside these hours are rejected automatically.</p>
      </Card>

      <Card title="Amenities">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Checkbox label="EV charging" checked={form.evCharging} onChange={update('evCharging')} />
          <Checkbox label="Covered parking" checked={form.covered} onChange={update('covered')} />
          <Checkbox label="On-site security" checked={form.security} onChange={update('security')} />
          <Checkbox label="CCTV" checked={form.cctv} onChange={update('cctv')} />
        </div>
      </Card>

      <Card title="Pricing behaviour" subtitle="Fine-tune the multipliers under Dynamic pricing after the facility is approved.">
        <Checkbox
          label="Enable dynamic pricing (occupancy, peak hours, location, day of week)"
          checked={form.dynamicPricingEnabled}
          onChange={update('dynamicPricingEnabled')}
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Overstay multiplier" hint="Applied to the hourly rate the driver paid.">
            <Select value={form.overstayMultiplier} onChange={update('overstayMultiplier')}>
              {[1, 1.25, 1.5, 2, 2.5, 3].map((value) => (
                <option key={value} value={value}>
                  {value}x
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Grace period (minutes)" hint="Overstay under this is not charged.">
            <Input type="number" min="0" max="120" value={form.graceMinutes} onChange={update('graceMinutes')} />
          </Field>
          <Field label="Minimum charge (hours)">
            <Input type="number" min="1" max="24" value={form.minChargeHours} onChange={update('minChargeHours')} />
          </Field>
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg" loading={submitting}>
          {isEdit ? 'Save changes' : 'Submit for approval'}
        </Button>
        <Button tone="secondary" size="lg" onClick={() => navigate(isEdit ? `/owner/lots/${id}` : '/owner/lots')}>
          Cancel
        </Button>
      </div>
    </form>
  );
};

export default LotForm;

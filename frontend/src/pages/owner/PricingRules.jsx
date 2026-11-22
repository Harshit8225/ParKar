import { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { errorMessage } from '../../api/client';
import { pricingApi } from '../../api/endpoints';
import { Alert, Button, Card, Checkbox, Field, Input, Select, Spinner } from '../../components/ui';
import { money, offeredVehicleTypes, VEHICLE_TYPES, vehicleLabel } from '../../utils/format';
import { axisTick, gridStroke, series, tooltipLabelStyle, tooltipStyle } from '../../utils/chartTheme';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const ZONES = [
  'standard',
  'residential',
  'commercial',
  'cbd',
  'airport',
  'railway',
  'mall',
  'stadium',
  'hospital',
];

/**
 * Owner-facing editor for the four dynamic-pricing factors, with a live
 * simulation so a change can be judged before it is saved.
 */
const PricingRules = ({ lotId, lot }) => {
  const [rule, setRule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Only types the facility prices can be simulated; cars first when offered.
  const simTypes = offeredVehicleTypes(lot).length ? offeredVehicleTypes(lot) : VEHICLE_TYPES;
  const [simVehicleType, setSimVehicleType] = useState(simTypes.includes('car') ? 'car' : simTypes[0]);
  const [simOccupancy, setSimOccupancy] = useState(0.5);
  const [curve, setCurve] = useState([]);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    pricingApi
      .getRule(lotId)
      .then((data) => setRule(data.rule))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [lotId]);

  const runSimulation = async () => {
    setSimulating(true);
    try {
      const result = await pricingApi.simulate(lotId, { vehicleType: simVehicleType, occupancyRate: Number(simOccupancy) });
      setCurve(result.curve);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSimulating(false);
    }
  };

  // Draw the curve on first load and after every save, so it always reflects
  // what is actually stored rather than the unsaved form state.
  useEffect(() => {
    if (rule) runSimulation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rule, simVehicleType, simOccupancy]);

  const save = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        isActive: rule.isActive !== false,
        occupancyTiers: rule.occupancyTiers.map((tier) => ({ upTo: Number(tier.upTo), multiplier: Number(tier.multiplier) })),
        peakHours: rule.peakHours.map((window) => ({
          label: window.label || undefined,
          startTime: window.startTime,
          endTime: window.endTime,
          multiplier: Number(window.multiplier),
          days: window.days || [],
        })),
        locationFactor: { zoneLabel: rule.locationFactor?.zoneLabel || 'standard' },
        dayOfWeekMultipliers: rule.dayOfWeekMultipliers.map(Number),
        limits: {
          minMultiplier: Number(rule.limits?.minMultiplier ?? 0.5),
          maxMultiplier: Number(rule.limits?.maxMultiplier ?? 2.5),
        },
      };
      const result = await pricingApi.updateRule(lotId, payload);
      setRule(result.rule);
      setNotice('Dynamic pricing rules saved.');
    } catch (err) {
      setError(errorMessage(err, 'Could not save the pricing rules.'));
    } finally {
      setSaving(false);
    }
  };

  const patch = (changes) => setRule((prev) => ({ ...prev, ...changes }));

  const updateTier = (index, field, value) =>
    patch({ occupancyTiers: rule.occupancyTiers.map((tier, i) => (i === index ? { ...tier, [field]: value } : tier)) });

  const updateWindow = (index, field, value) =>
    patch({ peakHours: rule.peakHours.map((window, i) => (i === index ? { ...window, [field]: value } : window)) });

  const toggleWindowDay = (index, day) => {
    const window = rule.peakHours[index];
    const days = window.days || [];
    updateWindow(index, 'days', days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort());
  };

  if (loading) return <Spinner label="Loading pricing rules..." />;
  if (!rule) return <Alert kind="error">{error || 'Pricing rules unavailable.'}</Alert>;

  return (
    <div className="space-y-4">
      {error && <Alert kind="error" onDismiss={() => setError('')}>{error}</Alert>}
      {notice && <Alert kind="success" onDismiss={() => setNotice('')}>{notice}</Alert>}

      {lot?.pricing?.dynamicPricingEnabled === false && (
        <Alert kind="warning">
          Dynamic pricing is switched off for this facility, so these rules have no effect. Turn it on under Edit facility.
        </Alert>
      )}

      <Card title="Price simulation">
        <div className="grid items-end gap-4 sm:grid-cols-3">
          <Field label="Vehicle type">
            <Select value={simVehicleType} onChange={(event) => setSimVehicleType(event.target.value)}>
              {simTypes.map((type) => (
                <option key={type} value={type}>
                  {vehicleLabel(type)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Assumed occupancy: ${Math.round(simOccupancy * 100)}%`}>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={simOccupancy}
              onChange={(event) => setSimOccupancy(event.target.value)}
              className="w-full accent-brand-600"
            />
          </Field>
          <Button tone="secondary" onClick={runSimulation} loading={simulating}>
            Refresh simulation
          </Button>
        </div>

        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={curve} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="label" tick={axisTick} interval={2} />
              <YAxis tick={axisTick} />
              <Tooltip
                formatter={(value, name) => (name === 'ratePerHour' ? [money(value), 'Rate/hour'] : [value, name])}
                contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle}
              />
              <Line type="stepAfter" dataKey="ratePerHour" stroke={series[0]} strokeWidth={2} dot={false} name="ratePerHour" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Occupancy tiers">
        <div className="space-y-3">
          {rule.occupancyTiers.map((tier, index) => (
            <div key={index} className="grid items-end gap-3 sm:grid-cols-3">
              <Field label={`Occupancy up to ${Math.round(tier.upTo * 100)}%`}>
                <Input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={tier.upTo}
                  onChange={(event) => updateTier(index, 'upTo', event.target.value)}
                />
              </Field>
              <Field label="Multiplier">
                <Input
                  type="number"
                  min="0.1"
                  max="5"
                  step="0.05"
                  value={tier.multiplier}
                  onChange={(event) => updateTier(index, 'multiplier', event.target.value)}
                />
              </Field>
              <div className="pb-2 text-footnote text-label-secondary">
                {lot?.hourlyRate?.[simVehicleType]
                  ? `${money(lot.hourlyRate[simVehicleType] * tier.multiplier)}/hr at this tier`
                  : null}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-caption text-label-secondary">
          The highest tier must reach 100%.
        </p>
      </Card>

      <Card
        title="Peak hour windows"
        actions={
          <Button
            tone="secondary"
            size="sm"
            onClick={() =>
              patch({
                peakHours: [...rule.peakHours, { label: 'New window', startTime: '09:00', endTime: '11:00', multiplier: 1.2, days: [] }],
              })
            }
          >
            Add window
          </Button>
        }
      >
        {rule.peakHours.length === 0 ? (
          <p className="text-footnote text-label-secondary">No peak windows configured.</p>
        ) : (
          <div className="space-y-4">
            {rule.peakHours.map((window, index) => (
              <div key={index} className="rounded-control border border-separator p-4">
                <div className="grid gap-3 sm:grid-cols-4">
                  <Field label="Label">
                    <Input value={window.label || ''} onChange={(event) => updateWindow(index, 'label', event.target.value)} />
                  </Field>
                  <Field label="From">
                    <Input type="time" value={window.startTime} onChange={(event) => updateWindow(index, 'startTime', event.target.value)} />
                  </Field>
                  <Field label="To">
                    <Input type="time" value={window.endTime} onChange={(event) => updateWindow(index, 'endTime', event.target.value)} />
                  </Field>
                  <Field label="Multiplier">
                    <Input
                      type="number"
                      min="0.1"
                      max="5"
                      step="0.05"
                      value={window.multiplier}
                      onChange={(event) => updateWindow(index, 'multiplier', event.target.value)}
                    />
                  </Field>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span className="eyebrow text-label-tertiary">Applies on</span>
                  {DAYS.map((day, dayIndex) => (
                    <Checkbox
                      key={day}
                      label={day.slice(0, 3)}
                      checked={(window.days || []).includes(dayIndex)}
                      onChange={() => toggleWindowDay(index, dayIndex)}
                    />
                  ))}
                  <span className="text-caption text-label-secondary">{(window.days || []).length === 0 ? '(every day)' : ''}</span>
                  <Button
                    tone="ghost"
                    size="sm"
                    className="ml-auto text-rose-600"
                    onClick={() => patch({ peakHours: rule.peakHours.filter((_, i) => i !== index) })}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Location zone">
          <Field label="Zone">
            <Select
              value={rule.locationFactor?.zoneLabel || 'standard'}
              onChange={(event) => patch({ locationFactor: { zoneLabel: event.target.value } })}
            >
              {ZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.charAt(0).toUpperCase() + zone.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
        </Card>

        <Card title="Multiplier limits">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Minimum">
              <Input
                type="number"
                min="0.1"
                max="5"
                step="0.05"
                value={rule.limits?.minMultiplier ?? 0.5}
                onChange={(event) => patch({ limits: { ...rule.limits, minMultiplier: event.target.value } })}
              />
            </Field>
            <Field label="Maximum">
              <Input
                type="number"
                min="0.1"
                max="5"
                step="0.05"
                value={rule.limits?.maxMultiplier ?? 2.5}
                onChange={(event) => patch({ limits: { ...rule.limits, maxMultiplier: event.target.value } })}
              />
            </Field>
          </div>
        </Card>
      </div>

      <Card title="Day of week">
        <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {DAYS.map((day, index) => (
            <Field key={day} label={day.slice(0, 3)}>
              <Input
                type="number"
                min="0.1"
                max="5"
                step="0.05"
                value={rule.dayOfWeekMultipliers[index]}
                onChange={(event) =>
                  patch({
                    dayOfWeekMultipliers: rule.dayOfWeekMultipliers.map((value, i) =>
                      i === index ? event.target.value : value,
                    ),
                  })
                }
              />
            </Field>
          ))}
        </div>
      </Card>

      <div className="flex gap-3">
        <Button size="lg" loading={saving} onClick={save}>
          Save pricing rules
        </Button>
      </div>
    </div>
  );
};

export default PricingRules;

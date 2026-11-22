import Icon from './Icon';
import { Button } from './ui';
import { VEHICLE_META } from '../utils/format';

/**
 * Where a booking parks. The server assigns every booking a spot - a dedicated
 * bay ("C-04") or a run of markers in the shared flexible zone ("A5–A8") - and
 * the driver needs to see it before they arrive, not only at the gate.
 *
 * `spot` is absent on bookings made before spot assignment existed, so every
 * component here renders nothing without one.
 */

/** The large "Your spot" panel for confirmation and detail screens. */
export const SpotCallout = ({ spot, title = 'Your spot', className = '' }) => {
  if (!spot?.label) return null;
  const icon = VEHICLE_META[spot.vehicleType]?.icon || 'pin';

  return (
    <div
      className={`flex items-start gap-4 rounded-control bg-brand-50 p-4 ring-1 ring-inset ring-brand-200 ${className}`}
    >
      <span
        aria-hidden="true"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-control bg-brand-100 text-brand-700"
      >
        <Icon name={icon} size={5} />
      </span>
      <div className="min-w-0">
        <p className="eyebrow text-brand-700">{title}</p>
        <p className="mt-0.5 font-mono text-title-2 tracking-wider text-brand-800">{spot.label}</p>
        {spot.instructions && <p className="mt-1 text-footnote text-brand-800">{spot.instructions}</p>}
      </div>
    </div>
  );
};

/** Compact form for table cells. */
export const SpotTag = ({ spot }) => {
  if (!spot?.label) return <span className="text-label-tertiary">-</span>;
  return (
    <span
      title={spot.instructions || undefined}
      className="inline-flex items-center rounded-capsule bg-brand-50 px-2.5 py-0.5 font-mono text-caption font-semibold text-brand-700 ring-1 ring-inset ring-brand-200"
    >
      {spot.label}
    </span>
  );
};

/**
 * Shown while POST /bookings is in flight. Near capacity the server holds
 * simultaneous requests for a few seconds and decides who gets the remaining
 * space, so the wait is real and needs explaining rather than a bare spinner.
 */
export const SpotConfirming = ({ className = '' }) => (
  <div
    role="status"
    className={`flex items-center gap-3 rounded-control bg-brand-50 px-4 py-3.5 ring-1 ring-inset ring-brand-200 ${className}`}
  >
    <span
      aria-hidden="true"
      className="h-4 w-4 shrink-0 animate-spin rounded-capsule border-2 border-brand-600 border-t-transparent"
    />
    <p className="text-footnote font-semibold text-brand-800">Confirming your parking spot&hellip;</p>
  </div>
);

/**
 * The server gave the last space to other bookings (HTTP 409). Nothing was
 * charged; the useful next step is another facility nearby.
 */
export const SpotUnavailable = ({ message, onFindOthers, actionLabel = 'Find nearby facilities', className = '' }) => (
  <div className={`rounded-control bg-amber-50 p-4 ring-1 ring-inset ring-amber-200 ${className}`}>
    <p className="text-footnote font-semibold text-amber-900">This facility could not fit your booking</p>
    <p className="mt-1 text-footnote text-amber-800">
      {message || 'The remaining space was allocated to other bookings made at the same moment.'} You have not been
      charged.
    </p>
    {onFindOthers && (
      <Button size="sm" tone="secondary" icon="search" className="mt-3" onClick={onFindOthers}>
        {actionLabel}
      </Button>
    )}
  </div>
);

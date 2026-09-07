import { useState } from 'react';
import { errorMessage } from '../api/client';
import { Button, Field, Input } from './ui';

/**
 * One read-only detail with its own edit affordance.
 *
 * Shared by the driver and owner profiles: each row saves independently, so
 * correcting a phone number is never a whole-form submit, and a field the API
 * will not change (an email, a verified flag) can be shown locked in the same
 * list rather than hidden away.
 */

const ICONS = {
  pencil: 'M4 20h4.5L19 9.5a2.1 2.1 0 0 0-3-3L5.5 17 4 20Z',
  lock: 'M7 10.5V8a5 5 0 0 1 10 0v2.5M6 10.5h12a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1Z',
  alert: 'M12 8.5v5m0 3h.01M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.4h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
};

const Icon = ({ name, className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
    <path d={ICONS[name]} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DetailRow = ({
  label,
  value,
  // Shown instead of `value` when the stored form is not what should be read
  // back - a masked account number, say. Editing still starts from `value`.
  displayValue,
  field,
  hint,
  placeholder,
  type = 'text',
  transform,
  locked = false,
  lockedReason,
  onSave,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const open = () => {
    setDraft(value || '');
    setError('');
    setEditing(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    const next = draft.trim();
    if (!next) {
      setError('This cannot be empty.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSave({ [field]: next });
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err, 'Could not save that.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-b border-slate-100 px-5 py-4 last:border-b-0 sm:px-6">
      {editing ? (
        <form onSubmit={submit}>
          <Field label={label} hint={hint} error={error}>
            <Input
              type={type}
              value={draft}
              onChange={(event) => setDraft(transform ? transform(event.target.value) : event.target.value)}
              placeholder={placeholder}
              autoFocus
            />
          </Field>
          <div className="mt-3 flex gap-2">
            <Button type="submit" size="sm" loading={saving}>
              Save
            </Button>
            <Button type="button" size="sm" tone="secondary" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-500">{label}</p>
            {value ? (
              <p className="mt-1 truncate text-sm font-medium text-ink-900">{displayValue || value}</p>
            ) : (
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-amber-700">
                <Icon name="alert" className="h-3.5 w-3.5" />
                Not added yet
              </p>
            )}
          </div>

          {locked ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-500">
              <Icon name="lock" className="h-3.5 w-3.5" />
              {lockedReason}
            </span>
          ) : (
            <button
              type="button"
              onClick={open}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-brand-700 ring-1 ring-brand-200 transition hover:bg-brand-50"
            >
              <Icon name="pencil" className="h-3.5 w-3.5" />
              {value ? 'Change' : 'Add'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default DetailRow;

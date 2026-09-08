import { useState } from 'react';
import { errorMessage } from '../api/client';
import { Button, Field, Input } from './ui';
import Icon from './Icon';

/**
 * One read-only detail with its own edit affordance.
 *
 * Shared by the driver and owner profiles: each row saves independently, so
 * correcting a phone number is never a whole-form submit, and a field the API
 * will not change (an email, a verified flag) can be shown locked in the same
 * list rather than hidden away.
 */

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
    <div className="border-b border-separator px-5 py-4 last:border-b-0 sm:px-6">
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
            <p className="eyebrow text-label-tertiary">{label}</p>
            {value ? (
              <p className="mt-1 truncate text-footnote font-medium text-label">{displayValue || value}</p>
            ) : (
              <p className="mt-1 inline-flex items-center gap-1.5 text-footnote font-medium text-amber-700">
                <Icon name="alert" size={3.5} />
                Not added yet
              </p>
            )}
          </div>

          {locked ? (
            <span className="inline-flex items-center gap-1.5 rounded-capsule px-2.5 py-1.5 text-caption font-medium text-label-tertiary">
              <Icon name="lock" size={3.5} />
              {lockedReason}
            </span>
          ) : (
            <button
              type="button"
              onClick={open}
              className="tap inline-flex items-center gap-1.5 rounded-capsule px-3.5 py-1.5 text-footnote font-medium text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50"
            >
              <Icon name="pencil" size={3.5} />
              {value ? 'Change' : 'Add'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default DetailRow;

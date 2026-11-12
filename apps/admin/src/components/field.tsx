import { useId } from 'react';
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

export const inputClass =
  'min-h-10 w-full rounded-admin border border-borderStrong bg-surface px-3 text-sm text-ink disabled:opacity-60';

export function Field({
  label,
  hint,
  error,
  children,
  id: idProp,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
  id?: string;
}) {
  const generated = useId();
  const id = idProp ?? generated;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-inkSecondary">
        {label}
      </label>
      {children(id, describedBy)}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-inkSecondary">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField(
  props: InputHTMLAttributes<HTMLInputElement> & {
    label: string;
    hint?: string;
    error?: string;
  },
) {
  const { label, hint, error, className = '', ...rest } = props;
  return (
    <Field label={label} hint={hint} error={error} id={rest.id}>
      {(id, describedBy) => (
        <input
          {...rest}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={`${inputClass} ${className}`}
        />
      )}
    </Field>
  );
}

export function SelectField(
  props: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; error?: string },
) {
  const { label, hint, error, className = '', children, ...rest } = props;
  return (
    <Field label={label} hint={hint} error={error} id={rest.id}>
      {(id, describedBy) => (
        <select
          {...rest}
          id={id}
          aria-describedby={describedBy}
          className={`${inputClass} ${className}`}
        >
          {children}
        </select>
      )}
    </Field>
  );
}

export function TextAreaField(
  props: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string },
) {
  const { label, hint, className = '', ...rest } = props;
  return (
    <Field label={label} hint={hint} id={rest.id}>
      {(id, describedBy) => (
        <textarea
          {...rest}
          id={id}
          aria-describedby={describedBy}
          className={`${inputClass} min-h-24 py-2 ${className}`}
        />
      )}
    </Field>
  );
}

export function CheckField({
  label,
  checked,
  onChange,
  id: idProp,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  id?: string;
  disabled?: boolean;
}) {
  const generated = useId();
  const id = idProp ?? generated;
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-ink"
      />
      <label htmlFor={id} className="text-sm text-ink">
        {label}
      </label>
    </div>
  );
}

export function Badge({ tone, children }: { tone: 'on' | 'off' | 'danger'; children: ReactNode }) {
  const cls =
    tone === 'on'
      ? 'border-border text-ink'
      : tone === 'danger'
        ? 'border-danger text-danger'
        : 'border-border text-inkSecondary';
  return (
    <span className={`inline-flex rounded-admin border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

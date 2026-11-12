import { useState } from 'react';
import { fr } from '../i18n/fr';

const FR_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function isoToFr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

export function frToIso(text: string): string | null {
  const m = FR_DATE.exec(text.trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(`${y}-${mo}-${d}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== `${y}-${mo}-${d}`)
    return null;
  return `${y}-${mo}-${d}`;
}

export type DateFieldProps = {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  className?: string;
};

/** Champ date au format JJ/MM/AAAA, indépendant de la langue du navigateur ; `value` est une date ISO (AAAA-MM-JJ) ou vide. */
export function DateField({ label, value, onChange, className = '' }: DateFieldProps) {
  const [text, setText] = useState(isoToFr(value));
  const [invalid, setInvalid] = useState(false);
  const change = (next: string) => {
    setText(next);
    if (next.trim() === '') {
      setInvalid(false);
      onChange('');
      return;
    }
    const iso = frToIso(next);
    setInvalid(!iso && next.length >= 10);
    if (iso) onChange(iso);
  };
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-inkSecondary">
      {label}
      <input
        type="text"
        inputMode="numeric"
        lang="fr"
        autoComplete="off"
        placeholder={fr['date.placeholder']}
        value={text}
        aria-invalid={invalid || undefined}
        onChange={(e) => change(e.target.value)}
        className={`min-h-10 w-36 rounded-admin border border-borderStrong bg-surface px-3 font-mono text-sm text-ink ${className}`}
      />
      {invalid && (
        <span role="alert" className="text-danger">
          {fr['date.invalid']}
        </span>
      )}
    </label>
  );
}

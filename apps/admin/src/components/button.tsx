import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger';

const styles: Record<Variant, string> = {
  primary: 'bg-ink text-surface hover:bg-ink/85 disabled:bg-inkSecondary',
  secondary: 'bg-surface text-ink border border-borderStrong hover:bg-surfaceMuted',
  danger: 'bg-danger text-surface hover:bg-danger/90 disabled:opacity-60',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }
>(function Button({ variant = 'primary', className = '', type = 'button', ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex min-h-10 items-center justify-center rounded-admin px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${styles[variant]} ${className}`}
      {...props}
    />
  );
});

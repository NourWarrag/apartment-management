import { ReactNode } from 'react';

type BadgeVariant = 'pill' | 'tag';
type BadgeTone = 'neutral' | 'primary' | 'secondary' | 'success' | 'warning' | 'error';

const TONE_STYLES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-container-highest text-on-surface-variant',
  primary: 'bg-primary-container text-on-primary-container',
  secondary: 'bg-secondary-container text-on-secondary-container',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  error: 'bg-error-container text-on-error-container',
};

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  pill: 'rounded-full text-xs px-2.5 py-1 font-semibold',
  tag: 'rounded text-[10px] px-1.5 py-0.5 font-bold uppercase tracking-wide',
};

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  tone?: BadgeTone;
  className?: string;
}

export default function Badge({ children, variant = 'pill', tone, className = '' }: BadgeProps) {
  const toneCls = tone ? TONE_STYLES[tone] : '';
  return (
    <span className={`inline-flex items-center ${VARIANT_STYLES[variant]} ${toneCls} ${className}`.trim().replace(/\s+/g, ' ')}>
      {children}
    </span>
  );
}

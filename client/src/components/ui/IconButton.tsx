type IconButtonTone = 'neutral' | 'primary' | 'error' | 'success' | 'warning';

const TONE_STYLES: Record<IconButtonTone, string> = {
  neutral: 'text-on-surface-variant',
  primary: 'text-primary',
  error: 'text-error',
  success: 'text-green-600',
  warning: 'text-amber-600',
};

interface IconButtonProps {
  icon: string;
  onClick?: () => void;
  title?: string;
  tone?: IconButtonTone;
  disabled?: boolean;
  type?: 'button' | 'submit';
  size?: number;
}

export default function IconButton({
  icon,
  onClick,
  title,
  tone = 'neutral',
  disabled = false,
  type = 'button',
  size = 20,
}: IconButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="p-1 hover:bg-surface-container rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      <span className={`material-symbols-outlined ${TONE_STYLES[tone]}`} style={{ fontSize: `${size}px` }}>
        {icon}
      </span>
    </button>
  );
}

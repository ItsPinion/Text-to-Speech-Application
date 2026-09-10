/**
 * Skewed neon button — the signature kinetic interaction: container starts
 * at -skew-x-12 and un-skews + inverts + glows on hover; inner content is
 * counter-skewed so text stays readable. Variants per design system §3.
 * Pass `as="a"` + `href` to render a link (used by DownloadButton).
 */
const VARIANTS = {
  primary: {
    base: 'border-2 border-neon-cyan bg-transparent text-neon-cyan',
    hover:
      'hover:skew-x-0 hover:bg-neon-cyan hover:text-black hover:shadow-[0_0_20px_#00FFFF]',
  },
  secondary: {
    base: 'border-2 border-neon-magenta bg-neon-magenta text-white',
    hover: 'hover:skew-x-0 hover:scale-105 hover:opacity-80',
  },
};

const SIZES = {
  sm: 'h-9 px-4 text-xs',
  default: 'h-12 px-6 text-sm',
  lg: 'h-14 px-8 text-base',
};

export default function Button({
  variant = 'primary',
  size = 'default',
  className = '',
  as,
  children,
  ...props
}) {
  const Comp = as ?? 'button';
  const v = VARIANTS[variant] ?? VARIANTS.primary;
  return (
    <Comp
      className={`-skew-x-12 transform rounded-none font-mono uppercase tracking-wider transition-all duration-200 ease-linear disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:skew-x-12 ${v.base} ${v.hover} ${SIZES[size]} ${className}`}
      {...props}
    >
      {/* counter-skew keeps the label rectangular while the frame is skewed */}
      <span className="inline-block skew-x-12 transform">{children}</span>
    </Comp>
  );
}

import { cn } from '@/lib/cn'

type Tone = 'cyan' | 'magenta' | 'sunset'

const toneClasses: Record<Tone, string> = {
  cyan: 'bg-cyan text-cyan',
  magenta: 'bg-magenta text-magenta',
  sunset: 'bg-sunset text-sunset',
}

/**
 * Pulsing neon status dot. `text-*` matches `bg-*` so the pulse keyframes
 * can glow with `currentColor`.
 */
export function StatusDot({
  tone = 'cyan',
  pulse = true,
  className,
}: {
  tone?: Tone
  pulse?: boolean
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block h-2.5 w-2.5 rounded-full',
        toneClasses[tone],
        pulse && 'animate-pulse-dot',
        className,
      )}
    />
  )
}

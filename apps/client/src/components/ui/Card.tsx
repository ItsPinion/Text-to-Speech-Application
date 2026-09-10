import type { ComponentProps } from 'react'

import { cn } from '@/lib/cn'

/**
 * Standard vaporwave card: subtle magenta side borders + a hard cyan laser
 * accent across the top, glass panel behind backdrop blur. Lifts off the
 * page and doubles its glow on hover — cards never sit still.
 */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'border border-magenta/30 border-t-2 border-t-cyan bg-panel/80 p-6 shadow-panel backdrop-blur-md transition-all duration-200 ease-linear hover:-translate-y-2 hover:shadow-panel-hover',
        className,
      )}
      {...props}
    />
  )
}

/** Cyan title with the design system's mandatory cyan glow. */
export function CardTitle({ className, ...props }: ComponentProps<'h3'>) {
  return (
    <h3
      className={cn(
        'font-heading text-xl font-bold uppercase tracking-wide text-cyan text-glow-cyan md:text-2xl',
        className,
      )}
      {...props}
    />
  )
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      className={cn('mt-2 font-mono text-sm leading-relaxed text-chrome/70', className)}
      {...props}
    />
  )
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mt-4', className)} {...props} />
}

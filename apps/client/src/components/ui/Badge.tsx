import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/cn'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-none border-2 px-2.5 py-0.5 font-mono text-xs uppercase tracking-widest',
  {
    variants: {
      variant: {
        cyan: 'border-cyan text-cyan',
        magenta: 'border-magenta text-magenta',
        sunset: 'border-sunset text-sunset',
        muted: 'border-line text-chrome/60',
      },
    },
    defaultVariants: {
      variant: 'cyan',
    },
  },
)

export type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeVariants>

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

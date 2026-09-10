import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentPropsWithRef } from 'react'

import { cn } from '@/lib/cn'

/**
 * Vaporwave buttons — every variant from the design system.
 * `primary`/`secondary` are skewed -12°; the container un-skews on hover
 * while the inner span counter-skews, so *both* land flat together
 * (the classic spec snippet leaves the content skewed — this fixes that).
 */
const buttonVariants = cva(
  // Base: sharp corners, mono caps, linear/ease, theatrical transitions.
  'inline-flex cursor-pointer select-none items-center justify-center gap-2 rounded-none font-mono uppercase tracking-wider transition-all duration-200 ease-linear focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // Cyan outline → fills cyan, inverts text, explodes glow.
        primary:
          'group -skew-x-12 border-2 border-cyan bg-transparent text-cyan hover:skew-x-0 hover:bg-cyan hover:text-black hover:shadow-glow-cyan',
        // Solid magenta → un-skews, scales, dims, glows.
        secondary:
          'group -skew-x-12 border-2 border-magenta bg-magenta text-white hover:skew-x-0 hover:scale-105 hover:opacity-80 hover:shadow-glow-magenta',
        // Magenta outline → fills on hover.
        outline:
          'border-2 border-magenta bg-transparent text-magenta hover:bg-magenta hover:text-white hover:shadow-glow-magenta-sm',
        ghost: 'text-chrome hover:bg-cyan/10 hover:text-cyan',
      },
      size: {
        sm: 'h-9 px-4 text-xs',
        default: 'h-12 px-6 text-sm',
        lg: 'h-14 px-8 text-base',
        icon: 'h-10 w-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
)

export type ButtonProps = ComponentPropsWithRef<'button'> &
  VariantProps<typeof buttonVariants>

export function Button({
  className,
  variant,
  size,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  const isSkewed = variant === 'primary' || variant === 'secondary'

  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {isSkewed ? (
        <span className="inline-block skew-x-12 transition-transform duration-200 ease-linear group-hover:skew-x-0">
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  )
}

export { buttonVariants }

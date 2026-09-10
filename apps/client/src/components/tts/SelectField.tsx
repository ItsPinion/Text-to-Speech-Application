import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/cn'

interface SelectFieldProps extends ComponentProps<'select'> {
  /** Accessible label text (wired via htmlFor). */
  label: string
  id: string
  children: ReactNode
}

/**
 * Terminal-style native select: keeps full keyboard/AT behavior of <select>
 * (plan 4.12 tab order, 9.5 labels) while wearing the neon skin.
 */
export function SelectField({ label, id, children, className, ...props }: SelectFieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block font-mono text-xs uppercase tracking-widest text-chrome/60"
      >
        {label}
      </label>
      <select
        id={id}
        className={cn(
          'h-12 w-full cursor-pointer border-2 border-line bg-black px-3 font-mono text-sm uppercase tracking-wider text-cyan transition-all duration-200 ease-linear hover:border-cyan/60 focus-visible:border-cyan focus-visible:shadow-glow-cyan focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  )
}

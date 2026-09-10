import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/cn'

interface TerminalWindowProps extends ComponentProps<'section'> {
  /** Title shown in the chrome bar after the window dots. */
  title: string
  /** Right-aligned slot in the chrome bar (badge, button…). */
  actions?: ReactNode
  /** Optional footer status bar. */
  footer?: ReactNode
  bodyClassName?: string
}

/**
 * Terminal/window chrome straight out of a vintage OS: neon-bordered shell,
 * title bar with the magenta/cyan/orange control dots, optional status bar.
 */
export function TerminalWindow({
  title,
  actions,
  footer,
  bodyClassName,
  className,
  children,
  ...props
}: TerminalWindowProps) {
  return (
    <section
      className={cn(
        'border-2 border-cyan bg-black/80 shadow-glow-cyan-soft backdrop-blur-sm',
        className,
      )}
      {...props}
    >
      <header className="flex items-center justify-between gap-4 border-b border-cyan bg-cyan/10 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full bg-magenta" />
          <span className="h-3 w-3 shrink-0 rounded-full bg-cyan" />
          <span className="h-3 w-3 shrink-0 rounded-full bg-sunset" />
          <h2 className="ml-2 truncate font-mono text-xs uppercase tracking-widest text-cyan text-glow-cyan">
            {title}
          </h2>
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </header>

      <div className={cn('p-5', bodyClassName)}>{children}</div>

      {footer && (
        <footer className="border-t border-cyan/40 bg-void px-4 py-2 font-mono text-xs text-chrome/50">
          {footer}
        </footer>
      )}
    </section>
  )
}

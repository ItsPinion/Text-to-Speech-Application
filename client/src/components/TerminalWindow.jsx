/**
 * Terminal window chrome — magenta/cyan/orange control dots, title bar,
 * black glass body with a cyan neon frame. The reusable "vintage OS"
 * container pattern from the design system (§3).
 */
export default function TerminalWindow({ title = 'TERMINAL', children, className = '' }) {
  return (
    <div
      className={`border-2 border-neon-cyan bg-black/80 shadow-neon-cyan backdrop-blur-md ${className}`}
    >
      {/* Title bar */}
      <div className="flex items-center gap-3 border-b border-neon-cyan bg-neon-cyan/10 px-4 py-2">
        <div className="flex gap-2" aria-hidden="true">
          <span className="h-3 w-3 rounded-full bg-neon-magenta" />
          <span className="h-3 w-3 rounded-full bg-neon-cyan" />
          <span className="h-3 w-3 rounded-full bg-neon-orange" />
        </div>
        <span className="font-mono text-xs uppercase tracking-widest text-neon-cyan/80">
          {title}
        </span>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </div>
  );
}

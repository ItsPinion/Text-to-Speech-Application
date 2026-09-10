/**
 * The void is never empty — fixed backdrop (z-0) with the three signature
 * layers: the massive blurred gradient sun, a horizon glow line, and the
 * perspective grid floor receding toward it. Plus a faint dot grid for grain.
 */
export function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Floating sun — 600px gradient orb blurred into atmosphere. */}
      <div className="absolute left-1/2 top-[14%] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-gradient-to-b from-sunset to-magenta opacity-20 blur-[100px] md:h-[600px] md:w-[600px]" />

      {/* Faint magenta grain across the void. */}
      <div className="dot-grid absolute inset-0 opacity-10" />

      {/* Horizon glow where the grid meets the sky. */}
      <div className="absolute inset-x-0 top-[52%] h-[2px] bg-gradient-to-r from-transparent via-magenta/80 to-transparent blur-[1px]" />

      {/* Infinite grid floor — top edge pinned to the horizon line. */}
      <div className="grid-floor absolute inset-x-[-25%] bottom-[-18%] top-[52%]" />
    </div>
  )
}

/**
 * Ambient background layers: the massive blurred gradient sun and the
 * perspective-transformed grid floor receding to the horizon.
 * Purely decorative — hidden from assistive tech, never intercepts input.
 */
export default function Atmosphere() {
  return (
    <>
      {/* Floating sun — 600px blurred orange→magenta orb */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-1/2 top-[6%] z-0 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-gradient-to-b from-neon-orange to-neon-magenta opacity-20 blur-[100px] sm:h-[600px] sm:w-[600px]"
      />
      {/* Infinite grid floor — perspective(500px) rotateX(60deg) */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-0 h-[45vh] overflow-hidden [perspective:500px]"
      >
        <div className="bg-perspective-grid mask-fade-up absolute inset-0 origin-bottom [transform:rotateX(60deg)_scale(2.4)]" />
      </div>
    </>
  );
}

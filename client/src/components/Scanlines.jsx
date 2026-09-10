/**
 * Global CRT overlay — scanlines + subtle RGB chromatic aberration.
 * Fixed, pointer-events-none, sits above everything (z-50) per the
 * design-system z-index layering. Render once, at the app root.
 */
export default function Scanlines() {
  return (
    <>
      <div
        aria-hidden="true"
        className="bg-scanlines pointer-events-none fixed inset-0 z-50"
      />
      <div
        aria-hidden="true"
        className="bg-chromatic pointer-events-none fixed inset-0 z-50 opacity-60"
      />
    </>
  );
}

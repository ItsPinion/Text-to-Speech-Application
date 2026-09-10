/**
 * Fixed CRT atmosphere, above everything (z-50): scanlines, RGB chromatic
 * aberration, vignette. Purely decorative and pointer-transparent so it can
 * never intercept clicks or read by screen readers.
 */
export function CrtOverlay() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50">
      <div className="crt-scanlines absolute inset-0" />
      <div className="crt-chromatic absolute inset-0" />
      <div className="crt-vignette absolute inset-0" />
    </div>
  )
}

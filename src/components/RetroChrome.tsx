"use client";

/**
 * CRT / retro frame: scanlines + vignette. Sits above background, below content (z-10).
 */
export function RetroChrome() {
  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 z-[5] opacity-[0.045]"
        style={{
          backgroundImage: `repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0,0,0,0.45) 2px,
            rgba(0,0,0,0.45) 4px
          )`,
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 z-[6] opacity-[0.35]"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 55%, rgba(0,40,20,0.12) 100%)",
        }}
        aria-hidden
      />
    </>
  );
}

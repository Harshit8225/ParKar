/**
 * Landing hero backdrop: a photograph of a lit parking deck, graded towards the
 * brand's blues and given cyan light streaks so it reads as one piece with the
 * rest of the UI.
 *
 * The photo lives at /hero-garage.jpg (Unsplash, free licence). A navy gradient
 * sits underneath it, so a missing or slow image degrades to a designed dark
 * scene rather than a white flash.
 *
 * The scene is dark in both themes - it is photographic, and the headline over
 * it is white either way. Only the hand-off at the bottom is theme-aware, via
 * `.band-fade`, so the hero dissolves into whatever the page canvas is.
 */
const HeroScene = () => (
  <div aria-hidden="true" className="band-brand pointer-events-none absolute inset-0 overflow-hidden">
    {/* Fallback ground, visible until (or unless) the photo paints */}
    <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_15%,#16306e_0%,#0a1533_50%,#050a1c_100%)]" />

    {/* The photograph */}
    <img
      src="/hero-garage.jpg"
      alt=""
      loading="eager"
      decoding="async"
      fetchPriority="high"
      width="1600"
      height="1000"
      className="absolute inset-0 h-full w-full object-cover object-center opacity-80"
    />

    {/* Colour grade: push the concrete towards navy and cool the highlights */}
    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,10,28,0.92)_0%,rgba(8,20,52,0.62)_38%,rgba(6,14,38,0.78)_100%)]" />
    <div className="absolute inset-0 bg-brand-900/25 mix-blend-color" />

    {/* Cyan light streaks along the ceiling line, echoing the deck lighting */}
    <div className="parkar-sweep absolute inset-x-0 top-0 h-[34%]">
      {[6, 28, 50, 72].map((left, index) => (
        <span
          key={left}
          className="absolute top-[18%] h-1 w-[16%] rounded-capsule bg-cyan-200 blur-[2px]"
          style={{ left: `${left}%`, opacity: 0.35 + (index % 2) * 0.2 }}
        />
      ))}
    </div>

    {/* Angled neon strips down both flanks - the signature of the design */}
    <div className="parkar-pulse band-strip absolute -left-24 top-[26%] h-2.5 w-[42%] -rotate-[13deg] rounded-capsule blur-[3px] [background-image:linear-gradient(90deg,transparent,var(--band-strip),rgb(255_255_255/0.65))]" />
    <div className="parkar-pulse band-strip absolute -right-24 top-[26%] h-2.5 w-[42%] rotate-[13deg] rounded-capsule blur-[3px]" />

    {/* Vignette so the headline and the booking card always have contrast */}
    <div className="absolute inset-0 bg-[radial-gradient(75%_65%_at_50%_42%,transparent_0%,rgba(3,7,22,0.55)_70%,rgba(3,7,22,0.85)_100%)]" />

    {/* Hand off to the page background below the fold, in either theme */}
    <div className="band-fade absolute inset-x-0 bottom-0 h-32" />
  </div>
);

export default HeroScene;

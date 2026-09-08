/**
 * Full-bleed dark header band over the deck photograph, used at the top of the
 * owner and admin home pages.
 *
 * It breaks out of the page container with negative margins, so it must be the
 * first child of a Layout page. Content sits below it in normal flow - the band
 * is a backdrop, not a layer for the page to overlap.
 *
 * The wash and the neon strip colour both come from one `.band-*` class in
 * index.css, so a role's colour is defined in exactly one place.
 */
const HeroBand = ({ eyebrow, title, children, actions, tint = 'brand' }) => {
  // Each role gets its own wash so the panels are distinguishable at a glance.
  const bands = { brand: 'band-brand', teal: 'band-teal', violet: 'band-violet' };

  return (
    <section className={`relative isolate -mx-4 -mt-8 overflow-hidden sm:-mx-6 ${bands[tint]}`}>
      <img
        src="/hero-garage.jpg"
        alt=""
        aria-hidden="true"
        // Explicit dimensions and an aspect ratio, so the band reserves its
        // height before the photograph decodes and nothing below it shifts.
        width="1600"
        height="600"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      <div aria-hidden="true" className="band-wash absolute inset-0" />
      <div
        aria-hidden="true"
        className="parkar-pulse band-strip absolute -right-20 top-6 h-2 w-1/2 rotate-[8deg] rounded-capsule blur-[3px]"
      />

      <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        {eyebrow && <p className="eyebrow text-white/70">{eyebrow}</p>}
        <h1 className="mt-2.5 text-title-1 text-white">{title}</h1>
        {children && <div className="mt-4 max-w-2xl text-callout leading-relaxed text-white/75">{children}</div>}
        {actions && <div className="mt-8 flex flex-wrap items-center gap-3">{actions}</div>}
      </div>

      {/* Hands the band back to the page canvas, in either theme. */}
      <div aria-hidden="true" className="band-fade absolute inset-x-0 bottom-0 h-16" />
    </section>
  );
};

export default HeroBand;

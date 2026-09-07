/**
 * Full-bleed dark header band over the deck photograph, used at the top of the
 * owner and admin home pages.
 *
 * It breaks out of the page container with negative margins, so it must be the
 * first child of a Layout page. Content sits below it in normal flow - the band
 * is a backdrop, not a layer for the page to overlap.
 */
const HeroBand = ({ eyebrow, title, children, actions, tint = 'brand' }) => {
  // Each role gets its own wash so the panels are distinguishable at a glance.
  const tints = {
    brand: 'bg-[linear-gradient(110deg,rgba(4,9,26,0.95)_0%,rgba(8,20,52,0.84)_55%,rgba(6,14,38,0.74)_100%)]',
    teal: 'bg-[linear-gradient(110deg,rgba(3,20,26,0.95)_0%,rgba(6,38,48,0.84)_55%,rgba(5,26,34,0.74)_100%)]',
    violet: 'bg-[linear-gradient(110deg,rgba(14,7,32,0.95)_0%,rgba(28,15,60,0.84)_55%,rgba(18,10,42,0.74)_100%)]',
  };
  const strips = {
    brand: '#22d3ee',
    teal: '#34d399',
    violet: '#c084fc',
  };

  return (
    <section className="relative isolate -mx-4 -mt-8 overflow-hidden sm:-mx-6">
      <img
        src="/hero-garage.jpg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      <div aria-hidden="true" className={`absolute inset-0 ${tints[tint]}`} />
      <div
        aria-hidden="true"
        className="parkar-pulse absolute -right-20 top-6 h-2 w-1/2 rotate-[8deg] rounded-full blur-[3px]"
        style={{ background: `linear-gradient(270deg,transparent,${strips[tint]},#ffffff88)` }}
      />

      <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">{eyebrow}</p>
        )}
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-4xl">{title}</h1>
        {children && (
          <div className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-200/85 sm:text-base">{children}</div>
        )}
        {actions && <div className="mt-7 flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </section>
  );
};

export default HeroBand;

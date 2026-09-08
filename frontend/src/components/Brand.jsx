/**
 * The ParKar wordmark and logo tile. Kept here so the landing page, the app
 * header and the auth screens can never drift apart.
 */

/** Rounded tile with a "P" and a small car glyph, as on the marketing hero. */
export const BrandMark = ({ size = 'md', className = '' }) => {
  const box = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-14 w-14' }[size];

  return (
    <span
      aria-hidden="true"
      /**
       * The radius is a percentage, not a token: an app-icon corner is a fixed
       * proportion of the tile (Apple's is a touch over 22%), so a single value
       * stays correct at all three sizes instead of needing one radius each.
       */
      className={`grid shrink-0 place-items-center rounded-[26%] bg-brand-600 text-white shadow-sm shadow-brand-600/25 ${box} ${className}`}
    >
      <svg viewBox="0 0 32 32" className="h-[70%] w-[70%]" fill="none">
        {/* The P */}
        <path
          d="M9 6h7.2a5.4 5.4 0 0 1 0 10.8H13V22"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Car silhouette tucked under the P */}
        <path
          d="M8 26.5h16M10.5 26.5v-2.2a1.2 1.2 0 0 1 .35-.85l1.4-1.4a1.2 1.2 0 0 1 .85-.35h5.8a1.2 1.2 0 0 1 .85.35l1.4 1.4a1.2 1.2 0 0 1 .35.85v2.2"
          stroke="var(--color-accent-400)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
};

/** "ParKar" - "Par" in the label colour of the surface, "Kar" in the accent. */
export const BrandWord = ({ tone = 'dark', className = '' }) => (
  <span className={`font-bold tracking-tight ${className}`}>
    <span className={tone === 'light' ? 'text-white' : 'text-label'}>Par</span>
    <span className="text-accent-500">Kar</span>
  </span>
);

const Brand = ({ size = 'md', tone = 'dark', className = '' }) => (
  <span className={`flex items-center gap-2 ${className}`}>
    <BrandMark size={size} />
    <BrandWord tone={tone} className={size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-lg' : 'text-xl'} />
  </span>
);

export default Brand;

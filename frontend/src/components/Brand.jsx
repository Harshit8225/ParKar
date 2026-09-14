/**
 * The ParKar wordmark and logo tile. Kept here so the landing page, the app
 * header and the auth screens can never drift apart.
 */

/** Logo mark rendering /logo.png */
export const BrandMark = ({ size = 'md', className = '' }) => {
  const box = {
    sm: 'h-10 w-10',
    md: 'h-14 w-14',
    lg: 'h-20 w-20',
    xl: 'h-28 w-28',
  }[size] || 'h-14 w-14';

  return (
    <img
      src="/logo.png"
      alt="ParKar Logo"
      className={`shrink-0 object-contain scale-110 ${box} ${className}`}
    />
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
  <span className={`flex items-center gap-2.5 ${className}`}>
    <BrandMark size={size} />
    <BrandWord
      tone={tone}
      className={
        size === 'xl'
          ? 'text-4xl'
          : size === 'lg'
          ? 'text-3xl'
          : size === 'sm'
          ? 'text-xl'
          : 'text-2xl'
      }
    />
  </span>
);

export default Brand;

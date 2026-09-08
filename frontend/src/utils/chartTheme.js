/**
 * One chart palette for both dashboards.
 *
 * The owner and admin dashboards each had these values written as raw hex
 * (`#94a3b8`, `#e2e8f0`, `#1f43ec`, `#598bff`) which happened to shadow the
 * theme tokens - so a token change silently left the charts behind, and in dark
 * mode they stayed light-mode coloured.
 *
 * These are `var()` strings on purpose. Recharts renders SVG, and SVG `stroke`
 * and `fill` resolve custom properties like any other CSS value, so the charts
 * re-colour themselves on a theme switch with no JavaScript and no re-render.
 */

export const axisTick = { stroke: 'var(--label-tertiary)', fill: 'var(--label-secondary)', fontSize: 11 };

export const gridStroke = 'var(--separator)';

/** Series colours, in the order a multi-series chart should consume them. */
export const series = ['var(--tint)', 'var(--available)', 'var(--warn)', 'var(--brand-400)', 'var(--danger)'];

export const tooltipStyle = {
  fontSize: 12,
  borderRadius: 14,
  border: '1px solid var(--separator)',
  background: 'var(--surface)',
  color: 'var(--label)',
  boxShadow: '0 8px 32px -8px rgb(0 0 0 / 0.18)',
};

/** Recharts sets its own inline colour on the label; override it explicitly. */
export const tooltipLabelStyle = { color: 'var(--label-secondary)', fontWeight: 600 };

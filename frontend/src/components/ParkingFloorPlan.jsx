import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { errorMessage } from '../api/client';
import { bookingApi } from '../api/endpoints';
import Icon from './Icon';
import { VEHICLE_META } from '../utils/format';

/**
 * A compact, scrollable map of the parking area with the driver's spot
 * highlighted. It sits inside the booking card, so it stays small: a fixed-
 * height box that scrolls both ways and opens already scrolled to the spot.
 *
 * Each line is one row of markers as painted on the ground (A1, A2, ...),
 * starting from the entrance. Lots that still have type-reserved bays show
 * them as extra lines in aisles. Other drivers' bookings are not exposed - a
 * cell is only "taken" or "free".
 */

const CELL_TONE = {
  mine: 'bg-brand-600 text-white ring-brand-700',
  taken: 'bg-label-quaternary text-label-tertiary ring-transparent',
  free: 'bg-surface text-label-tertiary ring-separator-strong',
};

const toneOf = (cell) => (cell.mine ? CELL_TONE.mine : cell.taken ? CELL_TONE.taken : CELL_TONE.free);
const cellTitle = (cell) => `${cell.label} - ${cell.mine ? 'your spot' : cell.taken ? 'taken' : 'free'}`;

/** Flatten the server's sections into drawable lines of cells. */
const toLines = (sections) =>
  sections.flatMap((section) => {
    if (section.kind === 'flexible') {
      return [{ key: section.id, label: section.row, cells: section.cells, joined: true }];
    }
    const prefix = VEHICLE_META[section.vehicleType]?.label || section.title;
    const lines = [];
    for (let i = 0; i < section.cells.length; i += section.columns) {
      lines.push({
        key: `${section.id}-${i}`,
        label: `${prefix} ${i / section.columns + 1}`,
        cells: section.cells.slice(i, i + section.columns),
        joined: false,
      });
    }
    return lines;
  });

const ParkingFloorPlan = ({ bookingId }) => {
  const [map, setMap] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const boxRef = useRef(null);
  const mineRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMap(await bookingApi.spotMap(bookingId));
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    load();
  }, [load]);

  // Centre the driver's spot inside the box without scrolling the page.
  useLayoutEffect(() => {
    const box = boxRef.current;
    const mine = mineRef.current;
    if (!box || !mine) return;
    const boxRect = box.getBoundingClientRect();
    const mineRect = mine.getBoundingClientRect();
    box.scrollTop += mineRect.top - boxRect.top - box.clientHeight / 2 + mineRect.height / 2;
    box.scrollLeft += mineRect.left - boxRect.left - box.clientWidth / 2 + mineRect.width * 1.5;
  }, [map]);

  if (error && !map) return <p className="text-caption text-label-secondary">Map unavailable: {error}</p>;
  if (!map) return <div className="h-56 animate-pulse rounded-control bg-label-quaternary/40" />;
  if (!map.sections?.length) return null;

  const lines = toLines(map.sections);
  let mineMarked = false;

  return (
    <div>
      <div
        ref={boxRef}
        className="h-56 overflow-auto rounded-control bg-label-quaternary/20 ring-1 ring-inset ring-separator"
        aria-label={`Map of ${map.lot?.name || 'the parking area'}`}
      >
        <div className="w-max min-w-full p-2">
          <p className="sticky left-0 mb-1.5 flex w-fit items-center gap-1 rounded-capsule bg-surface px-2 py-0.5 text-caption font-medium text-label-secondary ring-1 ring-inset ring-separator">
            <Icon name="route" size={3.5} /> Entrance
          </p>
          <div className="space-y-1">
            {lines.map((line) => (
              <div key={line.key} className="flex items-center">
                <span className="sticky left-0 z-10 mr-1 w-12 shrink-0 rounded bg-surface pr-1 text-right font-mono text-caption font-semibold text-label-secondary">
                  {line.label}
                </span>
                {line.cells.map((cell, index) => {
                  const isFirstMine = cell.mine && !mineMarked;
                  if (isFirstMine) mineMarked = true;
                  const joinPrev = line.joined && cell.joinPrev;
                  const joinNext = line.joined && cell.joinNext;
                  return (
                    <span
                      key={cell.label}
                      ref={isFirstMine ? mineRef : undefined}
                      title={cellTitle(cell)}
                      aria-label={cellTitle(cell)}
                      className={`grid h-7 w-6 shrink-0 place-items-center font-mono text-[9px] ring-1 ring-inset ${toneOf(cell)} ${
                        joinPrev ? '' : 'ml-0.5 rounded-l'
                      } ${joinNext ? '' : 'rounded-r'}`}
                    >
                      {line.joined ? index + 1 : cell.label.split('-').pop()}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3 text-caption text-label-secondary">
        <span className="flex items-center gap-1">
          <span className={`h-2.5 w-2.5 rounded-sm ring-1 ring-inset ${CELL_TONE.mine}`} /> Your spot
        </span>
        <span className="flex items-center gap-1">
          <span className={`h-2.5 w-2.5 rounded-sm ring-1 ring-inset ${CELL_TONE.taken}`} /> Taken
        </span>
        <span className="flex items-center gap-1">
          <span className={`h-2.5 w-2.5 rounded-sm ring-1 ring-inset ${CELL_TONE.free}`} /> Free
        </span>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="tap ml-auto inline-flex items-center gap-1 rounded-capsule px-2 py-0.5 font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
        >
          <Icon name="refresh" size={3.5} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>
    </div>
  );
};

export default ParkingFloorPlan;

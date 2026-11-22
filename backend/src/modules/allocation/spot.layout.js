'use strict';

/**
 * Parking-space model, the revenue optimiser and spot placement.
 *
 * Pure functions only - no database, no Redis - so every rule here is unit
 * tested directly (tests/allocation.test.js).
 *
 * A lot has two kinds of space:
 *
 *  - Fixed bays: dedicated to one vehicle type and numbered per type
 *    (BK-01.., C-01.., BUS-01..). `lot.capacity[type]` is how many there are.
 *
 *  - The flexible area: one or more rows, each a strip of bike-sized markers
 *    (A1, A2, ...). A bike takes 1 marker, a car 2, a bus 4. Any type can park
 *    here.
 *
 * Fragmentation: four free markers scattered along a row cannot hold a bus.
 * To rule that out, vehicles are only placed on aligned blocks - a bus starts
 * on a multiple of 4, a car on a multiple of 2 - in the style of a buddy
 * allocator. Because 1 | 2 | 4, the space left is then described exactly by
 * three counts:
 *
 *    f4 = free aligned 4-blocks
 *    f2 = free aligned 2-blocks whose 4-block is partly used
 *    f1 = free single markers whose 2-block is partly used
 *
 * and a set of B buses, C cars, K bikes fits if and only if
 *
 *    B <= f4,   C <= f2 + 2(f4 - B),   4B + 2C + K <= f1 + 2·f2 + 4·f4.
 *
 * Placement (placeSpots) always takes the smallest free block that fits, so it
 * succeeds whenever those conditions hold. The optimiser and the placement
 * therefore always agree.
 */

const { SPACE_UNITS, SPOT_ZONE, VEHICLE_TYPE_LIST } = require('../../models/constants');

const FIXED_PREFIX = { bike: 'BK', car: 'C', bus: 'BUS' };
const TYPE_LABEL = { bike: 'bike', car: 'car', bus: 'bus' };

const pad2 = (n) => String(n).padStart(2, '0');

const fixedLabel = (vehicleType, bay) => `${FIXED_PREFIX[vehicleType]}-${pad2(bay)}`;

const flexibleLabel = (row, start, size) =>
  size === 1 ? `${row}${start + 1}` : `${row}${start + 1}–${row}${start + size}`;

const spotInstructions = (spot) =>
  spot.zone === SPOT_ZONE.FIXED
    ? `Dedicated ${TYPE_LABEL[spot.vehicleType]} bay ${spot.label}`
    : spot.size === 1
      ? `Row ${spot.row}: park at marker ${spot.label}`
      : `Row ${spot.row}: park across markers ${spot.label}`;

const plain = (value) => (value && typeof value.toObject === 'function' ? value.toObject() : value);

const capacityOf = (lot) => {
  const capacity = plain(lot.capacity) || {};
  return VEHICLE_TYPE_LIST.reduce((acc, type) => ({ ...acc, [type]: Math.max(0, Number(capacity[type]) || 0) }), {});
};

const flexibleRowsOf = (lot) =>
  ((lot.layout && lot.layout.flexibleRows) || []).map((row) => ({ label: row.label, units: Number(row.units) || 0 }));

/**
 * Mutable working copy of a lot's space: which fixed bays are taken and which
 * markers of each flexible row are covered. Built from `lot.spotHolds`.
 */
const buildState = (lot, holds = lot.spotHolds || []) => {
  const capacity = capacityOf(lot);
  const fixedTaken = VEHICLE_TYPE_LIST.reduce((acc, type) => ({ ...acc, [type]: new Set() }), {});
  const rows = flexibleRowsOf(lot).map((row) => ({ ...row, grid: new Array(row.units).fill(null) }));
  const rowByLabel = new Map(rows.map((row) => [row.label, row]));

  for (const raw of holds) {
    const hold = plain(raw);
    if (hold.zone === SPOT_ZONE.FIXED) {
      if (fixedTaken[hold.vehicleType]) fixedTaken[hold.vehicleType].add(hold.bay);
      continue;
    }
    const row = rowByLabel.get(hold.row);
    if (!row) continue;
    for (let i = hold.start; i < hold.start + hold.size && i < row.units; i += 1) {
      row.grid[i] = String(hold.booking);
    }
  }

  return { capacity, fixedTaken, rows };
};

/** Free aligned blocks in one row, as start indexes. */
const rowBlocks = (grid) => {
  const free = (i) => i < grid.length && grid[i] === null;
  const blocks = { four: [], two: [], one: [] };

  for (let start = 0; start < grid.length; start += 4) {
    if (start + 4 <= grid.length && free(start) && free(start + 1) && free(start + 2) && free(start + 3)) {
      blocks.four.push(start);
      continue;
    }
    for (const half of [start, start + 2]) {
      if (half >= grid.length) break;
      if (half + 2 <= grid.length && free(half) && free(half + 1)) {
        blocks.two.push(half);
      } else {
        if (free(half)) blocks.one.push(half);
        if (half + 1 < grid.length && free(half + 1)) blocks.one.push(half + 1);
      }
    }
  }

  return blocks;
};

/** The space left, reduced to the counts the optimiser needs. */
const summarize = (state) => {
  const freeFixed = {};
  for (const type of VEHICLE_TYPE_LIST) {
    let free = 0;
    for (let bay = 1; bay <= state.capacity[type]; bay += 1) if (!state.fixedTaken[type].has(bay)) free += 1;
    freeFixed[type] = free;
  }

  const flex = { f4: 0, f2: 0, f1: 0 };
  for (const row of state.rows) {
    const blocks = rowBlocks(row.grid);
    flex.f4 += blocks.four.length;
    flex.f2 += blocks.two.length;
    flex.f1 += blocks.one.length;
  }

  return { freeFixed, flex };
};

const flexFreeUnits = ({ f4, f2, f1 }) => 4 * f4 + 2 * f2 + f1;

/**
 * Most bikes that still fit in the flexible area after placing `buses` and
 * `cars` there, or -1 when those buses and cars do not fit at all.
 */
const flexBikeRoom = (flex, buses, cars) => {
  if (buses > flex.f4) return -1;
  if (cars > flex.f2 + 2 * (flex.f4 - buses)) return -1;
  return flexFreeUnits(flex) - 4 * buses - 2 * cars;
};

/** How many of each type could be booked right now, each type considered alone. */
const availabilityFromSummary = ({ freeFixed, flex }) => ({
  bike: freeFixed.bike + flexFreeUnits(flex),
  car: freeFixed.car + flex.f2 + 2 * flex.f4,
  bus: freeFixed.bus + flex.f4,
});

const computeAvailability = (lot, holds) => availabilityFromSummary(summarize(buildState(lot, holds)));

/** Availability of the empty lot - its maximum capacity per type. */
const computeMaxCapacity = (lot) => computeAvailability(lot, []);

const totalUnits = (lot) => {
  const capacity = capacityOf(lot);
  const fixed = VEHICLE_TYPE_LIST.reduce((sum, type) => sum + capacity[type] * SPACE_UNITS[type], 0);
  return fixed + flexibleRowsOf(lot).reduce((sum, row) => sum + row.units, 0);
};

/** Share of the lot's space that is held, measured in bike units. */
const computeOccupancyRate = (lot, holds = lot.spotHolds || []) => {
  const total = totalUnits(lot);
  if (!total) return 0;
  const used = holds.reduce((sum, raw) => {
    const hold = plain(raw);
    return sum + (hold.zone === SPOT_ZONE.FIXED ? SPACE_UNITS[hold.vehicleType] || 0 : hold.size || 0);
  }, 0);
  return Math.min(1, Number((used / total).toFixed(4)));
};

const flexibleAreaSummary = (lot) => {
  const rows = flexibleRowsOf(lot);
  const units = rows.reduce((sum, row) => sum + row.units, 0);
  return { rows, totalUnits: units, carEquivalent: Math.floor(units / SPACE_UNITS.car) };
};

/**
 * Revenue optimiser for one batch of simultaneous requests.
 *
 *   max  Σ revenue_i · z_i
 *   s.t. the accepted buses, cars and bikes fit in the free fixed bays plus the
 *        flexible area (conditions in the header), z_i ∈ {0, 1}.
 *
 * Within one type every request takes the same space, so if k of that type are
 * accepted they are the k best-paying ones (earlier arrival breaks ties). That
 * leaves only the counts to choose: try every number of buses and cars, and
 * fill what is left with the best-paying bikes. Each type uses its own fixed
 * bays first and overflows into the flexible area. The search is exact and
 * takes microseconds for realistic batch sizes.
 *
 * @param requests [{ id, vehicleType, revenue, arrivedAt }]
 * @param summary  output of summarize()
 * @returns {{ accepted, rejected, revenue }}
 */
const solveBatch = (requests, { freeFixed, flex }) => {
  const sorted = (type) =>
    requests
      .filter((r) => r.vehicleType === type)
      .sort((a, b) => b.revenue - a.revenue || (a.arrivedAt || 0) - (b.arrivedAt || 0));
  const prefix = (list) => list.reduce((acc, r) => [...acc, acc[acc.length - 1] + (Number(r.revenue) || 0)], [0]);

  const bikes = sorted('bike');
  const cars = sorted('car');
  const buses = sorted('bus');
  const [pBike, pCar, pBus] = [bikes, cars, buses].map(prefix);

  let best = { revenue: -1, count: -1, b: 0, c: 0, k: 0 };

  for (let b = 0; b <= buses.length; b += 1) {
    const busFlex = Math.max(0, b - freeFixed.bus);
    if (busFlex > flex.f4) break;

    for (let c = 0; c <= cars.length; c += 1) {
      const carFlex = Math.max(0, c - freeFixed.car);
      const room = flexBikeRoom(flex, busFlex, carFlex);
      if (room < 0) break;

      const k = Math.min(bikes.length, freeFixed.bike + room);
      const revenue = pBus[b] + pCar[c] + pBike[k];
      const count = b + c + k;
      // Equal revenue: prefer serving more drivers.
      if (revenue > best.revenue || (revenue === best.revenue && count > best.count)) {
        best = { revenue, count, b, c, k };
      }
    }
  }

  const accepted = [...buses.slice(0, best.b), ...cars.slice(0, best.c), ...bikes.slice(0, best.k)];
  const acceptedIds = new Set(accepted.map((r) => r.id));
  return {
    accepted,
    rejected: requests.filter((r) => !acceptedIds.has(r.id)),
    revenue: Math.max(0, best.revenue),
  };
};

/** True when this single request would fit on its own. */
const fitsAlone = (vehicleType, summary) => availabilityFromSummary(summary)[vehicleType] > 0;

const takeFixedBay = (state, vehicleType) => {
  for (let bay = 1; bay <= state.capacity[vehicleType]; bay += 1) {
    if (!state.fixedTaken[vehicleType].has(bay)) {
      state.fixedTaken[vehicleType].add(bay);
      return bay;
    }
  }
  return null;
};

/**
 * Smallest free block that holds `size` markers: an exact-size block first,
 * then a split of the next size up. Keeping big blocks whole is what keeps
 * room for buses.
 */
const takeFlexibleBlock = (state, size, holder) => {
  const preference = { 1: ['one', 'two', 'four'], 2: ['two', 'four'], 4: ['four'] }[size];

  for (const kind of preference) {
    for (const row of state.rows) {
      const starts = rowBlocks(row.grid)[kind];
      if (!starts.length) continue;
      const start = starts[0];
      for (let i = start; i < start + size; i += 1) row.grid[i] = holder;
      return { row: row.label, start };
    }
  }
  return null;
};

/**
 * Give each accepted request a concrete spot. Mutates `state`. Larger vehicles
 * go first so they get whole blocks; each type prefers its own fixed bays.
 * Returns Map(requestId -> spot); a request that cannot be placed is missing.
 */
const placeSpots = (state, accepted) => {
  const order = { bus: 0, car: 1, bike: 2 };
  const queue = [...accepted].sort((a, b) => order[a.vehicleType] - order[b.vehicleType]);
  const spots = new Map();

  for (const request of queue) {
    const { vehicleType } = request;
    const size = SPACE_UNITS[vehicleType];

    const bay = takeFixedBay(state, vehicleType);
    let spot;
    if (bay !== null) {
      spot = { zone: SPOT_ZONE.FIXED, vehicleType, bay, size, label: fixedLabel(vehicleType, bay) };
    } else {
      const block = takeFlexibleBlock(state, size, String(request.id));
      if (!block) continue;
      spot = {
        zone: SPOT_ZONE.FLEXIBLE,
        vehicleType,
        row: block.row,
        start: block.start,
        size,
        label: flexibleLabel(block.row, block.start, size),
      };
    }
    spots.set(request.id, { ...spot, instructions: spotInstructions(spot) });
  }

  return spots;
};

/**
 * Owner-facing map of the lot: each fixed bay and each flexible marker, with
 * the booking holding it.
 */
const buildSpotMap = (lot, bookingCodes = new Map()) => {
  const holds = (lot.spotHolds || []).map(plain);
  const state = buildState(lot, holds);
  const byBooking = new Map(holds.map((h) => [String(h.booking), h]));

  const fixed = {};
  for (const type of VEHICLE_TYPE_LIST) {
    fixed[type] = [];
    for (let bay = 1; bay <= state.capacity[type]; bay += 1) {
      const hold = holds.find((h) => h.zone === SPOT_ZONE.FIXED && h.vehicleType === type && h.bay === bay);
      fixed[type].push({
        bay,
        label: fixedLabel(type, bay),
        taken: Boolean(hold),
        bookingId: hold ? bookingCodes.get(String(hold.booking)) || null : null,
      });
    }
  }

  const rows = state.rows.map((row) => ({
    label: row.label,
    units: row.units,
    cells: row.grid.map((holder, index) => {
      const hold = holder ? byBooking.get(holder) : null;
      return {
        index,
        label: `${row.label}${index + 1}`,
        vehicleType: hold ? hold.vehicleType : null,
        bookingId: hold ? bookingCodes.get(holder) || null : null,
        spotLabel: hold ? hold.label : null,
      };
    }),
  }));

  return { fixed, rows };
};

/** Default flexible row length: 40 markers = 20 cars, 10 buses or 40 bikes. */
const DEFAULT_ROW_UNITS = 40;

/** Row labels A..Z, then AA, AB, ... */
const rowLabel = (index) => {
  let n = index;
  let label = '';
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
};

/**
 * Turn type-reserved bays into shared flexible rows holding the same space
 * (bike 1 unit, car 2, bus 4), appended after any rows the lot already has.
 * Rows are `rowUnits` long; the last takes the remainder.
 */
const fixedToFlexibleRows = (capacity, existingRows = [], rowUnits = DEFAULT_ROW_UNITS) => {
  const units = VEHICLE_TYPE_LIST.reduce((sum, type) => sum + (Number(capacity?.[type]) || 0) * SPACE_UNITS[type], 0);
  const used = new Set(existingRows.map((row) => row.label));
  const rows = existingRows.map((row) => ({ label: row.label, units: row.units }));

  let index = 0;
  for (let left = units; left > 0; left -= rowUnits) {
    while (used.has(rowLabel(index))) index += 1;
    const label = rowLabel(index);
    used.add(label);
    rows.push({ label, units: Math.min(rowUnits, left) });
  }
  return rows;
};

/** Bays per aisle in the driver's floor plan, per type. */
const AISLE_WIDTH = { bike: 10, car: 8, bus: 4 };
const TYPE_TITLE = { bike: 'Bike bays', car: 'Car bays', bus: 'Bus bays' };

const ordinal = (n) => {
  const tail = n % 100;
  if (tail >= 11 && tail <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
};

/**
 * Driver-facing floor plan: the lot as numbered sections in the order a driver
 * meets them from the gate (dedicated bike, car and bus bays, then each
 * flexible row), with the driver's own spot marked and step-by-step directions.
 *
 * Other drivers' bookings are never exposed - a cell only says whether it is
 * taken, plus whether it joins its neighbour (one vehicle across markers).
 *
 * Dedicated bays are drawn in aisles of AISLE_WIDTH[type]; the directions use
 * the same numbering, so "aisle 2, 3rd bay" matches what the driver sees.
 */
const buildNavigationMap = (lot, bookingId) => {
  const holds = (lot.spotHolds || []).map(plain);
  const mineId = bookingId ? String(bookingId) : null;
  const mine = mineId ? holds.find((h) => String(h.booking) === mineId) : null;
  const state = buildState(lot, holds);
  const sections = [];

  for (const type of VEHICLE_TYPE_LIST) {
    const count = state.capacity[type];
    if (!count) continue;
    const cells = [];
    for (let bay = 1; bay <= count; bay += 1) {
      const isMine = Boolean(mine && mine.zone === SPOT_ZONE.FIXED && mine.vehicleType === type && mine.bay === bay);
      cells.push({ label: fixedLabel(type, bay), taken: state.fixedTaken[type].has(bay), mine: isMine });
    }
    sections.push({
      id: `fixed-${type}`,
      kind: SPOT_ZONE.FIXED,
      vehicleType: type,
      title: TYPE_TITLE[type],
      columns: AISLE_WIDTH[type],
      free: cells.filter((c) => !c.taken).length,
      cells,
    });
  }

  for (const row of state.rows) {
    const cells = row.grid.map((holder, index) => ({
      label: `${row.label}${index + 1}`,
      taken: holder !== null,
      mine: Boolean(mineId && holder === mineId),
      joinPrev: holder !== null && row.grid[index - 1] === holder,
      joinNext: holder !== null && row.grid[index + 1] === holder,
    }));
    sections.push({
      id: `row-${row.label}`,
      kind: SPOT_ZONE.FLEXIBLE,
      row: row.label,
      title: `Row ${row.label}`,
      columns: row.units,
      free: cells.filter((c) => !c.taken).length,
      cells,
    });
  }

  sections.forEach((section, index) => {
    section.number = index + 1;
  });

  let mySpot = null;
  const directions = [];
  if (mine) {
    const section = sections.find((s) =>
      mine.zone === SPOT_ZONE.FIXED ? s.id === `fixed-${mine.vehicleType}` : s.id === `row-${mine.row}`,
    );
    mySpot = { label: mine.label, zone: mine.zone, vehicleType: mine.vehicleType, sectionId: section ? section.id : null };

    directions.push('Enter through the main gate. The camera reads your number plate and the barrier opens.');
    if (section) {
      directions.push(`Head to section ${section.number} of ${sections.length}: ${section.title}.`);
      if (mine.zone === SPOT_ZONE.FIXED) {
        const aisle = Math.ceil(mine.bay / section.columns);
        const position = ((mine.bay - 1) % section.columns) + 1;
        mySpot.aisle = aisle;
        mySpot.position = position;
        directions.push(`Go to aisle ${aisle} and park in bay ${mine.label}, the ${ordinal(position)} bay from the left.`);
      } else if (mine.size === 1) {
        directions.push(`Park at marker ${mine.label}, the ${ordinal(mine.start + 1)} marker from the left end of row ${mine.row}.`);
      } else {
        directions.push(
          `Park across markers ${mine.label}, the ${ordinal(mine.start + 1)} to ${ordinal(mine.start + mine.size)} markers from the left end of row ${mine.row}.`,
        );
      }
    }
  }

  return { sections, mySpot, directions };
};

module.exports = {
  FIXED_PREFIX,
  DEFAULT_ROW_UNITS,
  rowLabel,
  fixedToFlexibleRows,
  AISLE_WIDTH,
  buildNavigationMap,
  buildState,
  rowBlocks,
  summarize,
  flexBikeRoom,
  availabilityFromSummary,
  computeAvailability,
  computeMaxCapacity,
  computeOccupancyRate,
  flexibleAreaSummary,
  totalUnits,
  solveBatch,
  fitsAlone,
  placeSpots,
  buildSpotMap,
  fixedLabel,
  flexibleLabel,
  spotInstructions,
};

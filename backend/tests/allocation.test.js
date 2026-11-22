'use strict';

const layout = require('../src/modules/allocation/spot.layout');

/** A lot with fixed bays and flexible rows; holds default to none. */
const makeLot = ({ capacity = {}, rows = [], holds = [] } = {}) => ({
  capacity: { bike: 0, car: 0, bus: 0, ...capacity },
  layout: { flexibleRows: rows.map(([label, units]) => ({ label, units })) },
  spotHolds: holds,
});

const flexHold = (booking, vehicleType, row, start) => ({
  booking,
  vehicleType,
  zone: 'flexible',
  row,
  start,
  size: { bike: 1, car: 2, bus: 4 }[vehicleType],
  label: 'x',
});

const fixedHold = (booking, vehicleType, bay) => ({ booking, vehicleType, zone: 'fixed', bay, size: 1, label: 'x' });

const req = (id, vehicleType, revenue, arrivedAt = 0) => ({ id, vehicleType, revenue, arrivedAt });

const summaryOf = (lot) => layout.summarize(layout.buildState(lot));

describe('space accounting', () => {
  it('counts aligned free blocks in a row', () => {
    // 6 markers: one whole 4-block plus a 2-block tail.
    expect(summaryOf(makeLot({ rows: [['A', 6]] })).flex).toEqual({ f4: 1, f2: 1, f1: 0 });
  });

  it('does not offer a bus space when the free markers are scattered', () => {
    // 8 markers, bikes at A2 and A6: 6 markers free but no aligned run of 4.
    const lot = makeLot({ rows: [['A', 8]], holds: [flexHold('b1', 'bike', 'A', 1), flexHold('b2', 'bike', 'A', 5)] });
    expect(layout.computeAvailability(lot)).toEqual({ bike: 6, car: 2, bus: 0 });
  });

  it('adds free fixed bays to what the flexible area holds', () => {
    const lot = makeLot({ capacity: { car: 3, bus: 1 }, rows: [['A', 8]], holds: [fixedHold('c1', 'car', 2)] });
    expect(layout.computeAvailability(lot)).toEqual({ bike: 8, car: 2 + 4, bus: 1 + 2 });
    expect(layout.computeMaxCapacity(lot)).toEqual({ bike: 8, car: 3 + 4, bus: 1 + 2 });
  });

  it('measures occupancy in space units', () => {
    // 1 bus bay (4 units) + 8 flexible units = 12; a parked bus takes 4.
    const lot = makeLot({ capacity: { bus: 1 }, rows: [['A', 8]], holds: [fixedHold('x', 'bus', 1)] });
    expect(layout.computeOccupancyRate(lot)).toBeCloseTo(4 / 12, 4);
  });
});

describe('solveBatch - revenue optimiser', () => {
  it('accepts everything when it all fits', () => {
    const lot = makeLot({ rows: [['A', 16]] });
    const batch = [req('1', 'bus', 400), req('2', 'car', 160), req('3', 'bike', 60)];
    const { accepted, rejected, revenue } = layout.solveBatch(batch, summaryOf(lot));
    expect(accepted).toHaveLength(3);
    expect(rejected).toHaveLength(0);
    expect(revenue).toBe(620);
  });

  it('picks the most valuable mix when not everything fits (worked example)', () => {
    // 6 units free (3 car spaces). Requests need 4 + 4 + 3 = 11 units.
    const lot = makeLot({ rows: [['A', 6]] });
    const batch = [
      req('bus', 'bus', 400),
      req('car1', 'car', 160),
      req('car2', 'car', 160),
      req('bk1', 'bike', 60),
      req('bk2', 'bike', 60),
      req('bk3', 'bike', 60),
    ];
    const { accepted, revenue } = layout.solveBatch(batch, summaryOf(lot));
    expect(revenue).toBe(560);
    expect(accepted.map((r) => r.id).sort()).toEqual(['bus', 'car1']);
  });

  it('mixes types when that beats filling the space with one type', () => {
    const lot = makeLot({ rows: [['A', 4]] });
    const batch = [req('car', 'car', 100), req('b1', 'bike', 30), req('b2', 'bike', 30), req('b3', 'bike', 30), req('b4', 'bike', 30)];
    const { accepted, revenue } = layout.solveBatch(batch, summaryOf(lot));
    // 4 bikes = 120, 2 cars impossible (one car request), car + 2 bikes = 160.
    expect(revenue).toBe(160);
    expect(accepted.map((r) => r.id).sort()).toEqual(['b1', 'b2', 'car']);
  });

  it('takes the best-paying request within a type', () => {
    const lot = makeLot({ capacity: { car: 1 } });
    const { accepted } = layout.solveBatch([req('cheap', 'car', 50), req('dear', 'car', 90)], summaryOf(lot));
    expect(accepted.map((r) => r.id)).toEqual(['dear']);
  });

  it('breaks revenue ties by arrival order', () => {
    const lot = makeLot({ capacity: { car: 1 } });
    const { accepted } = layout.solveBatch([req('late', 'car', 50, 20), req('early', 'car', 50, 10)], summaryOf(lot));
    expect(accepted.map((r) => r.id)).toEqual(['early']);
  });

  it('uses each type\'s fixed bays before the flexible area', () => {
    const lot = makeLot({ capacity: { bus: 1 }, rows: [['A', 4]] });
    // Bus goes to its fixed bay, leaving the 4-unit row for the car and two bikes.
    const batch = [req('bus', 'bus', 300), req('car', 'car', 100), req('b1', 'bike', 40), req('b2', 'bike', 40)];
    const { accepted } = layout.solveBatch(batch, summaryOf(lot));
    expect(accepted).toHaveLength(4);
  });

  it('rejects a lone request when there is no room for it', () => {
    const lot = makeLot({ capacity: { car: 1 }, holds: [fixedHold('x', 'car', 1)] });
    const summary = summaryOf(lot);
    expect(layout.solveBatch([req('1', 'car', 80)], summary).accepted).toHaveLength(0);
    expect(layout.fitsAlone('car', summary)).toBe(false);
  });
});

describe('placeSpots - assigning a concrete spot', () => {
  it('labels fixed bays per type and flexible spots by marker range', () => {
    const lot = makeLot({ capacity: { car: 2 }, rows: [['A', 8]] });
    const state = layout.buildState(lot);
    const spots = layout.placeSpots(state, [req('c', 'car', 1), req('bus', 'bus', 1), req('bk', 'bike', 1)]);

    expect(spots.get('c')).toMatchObject({ zone: 'fixed', label: 'C-01', bay: 1 });
    expect(spots.get('bus')).toMatchObject({ zone: 'flexible', row: 'A', start: 0, size: 4, label: 'A1–A4' });
    expect(spots.get('bk')).toMatchObject({ zone: 'flexible', row: 'A', start: 4, size: 1, label: 'A5' });
    expect(spots.get('bk').instructions).toBe('Row A: park at marker A5');
  });

  it('fills a partly used block before breaking a whole one, keeping room for a bus', () => {
    // A bike already at A1; a new bike should take A2, not break A5-A8.
    const lot = makeLot({ rows: [['A', 8]], holds: [flexHold('old', 'bike', 'A', 0)] });
    const state = layout.buildState(lot);
    const spots = layout.placeSpots(state, [req('new', 'bike', 1)]);
    expect(spots.get('new').start).toBe(1);
    expect(layout.summarize(state).flex.f4).toBe(1);
  });

  it('never overlaps an existing hold', () => {
    const lot = makeLot({ rows: [['A', 4]], holds: [flexHold('old', 'car', 'A', 0)] });
    const state = layout.buildState(lot);
    const spots = layout.placeSpots(state, [req('new', 'car', 1)]);
    expect(spots.get('new')).toMatchObject({ start: 2, label: 'A3–A4' });
  });
});

describe('optimiser and placement agree', () => {
  // Deterministic pseudo-random generator so failures are reproducible.
  const rng = (seed) => () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  it('places every request the optimiser accepts, across 500 random lots and batches', () => {
    const rand = rng(42);
    const pick = (list) => list[Math.floor(rand() * list.length)];
    const types = ['bike', 'car', 'bus'];

    for (let trial = 0; trial < 500; trial += 1) {
      const lot = makeLot({
        capacity: { bike: Math.floor(rand() * 3), car: Math.floor(rand() * 3), bus: Math.floor(rand() * 2) },
        rows: [['A', 1 + Math.floor(rand() * 14)], ['B', 1 + Math.floor(rand() * 10)]],
      });

      // Pre-fill some space through the real placement so holds are valid.
      const warm = Array.from({ length: Math.floor(rand() * 6) }, (_, i) => req(`w${i}`, pick(types), 1));
      const warmState = layout.buildState(lot);
      const warmSolved = layout.solveBatch(warm, layout.summarize(warmState));
      const warmSpots = layout.placeSpots(warmState, warmSolved.accepted);
      lot.spotHolds = [...warmSpots.entries()].map(([id, spot]) => ({ booking: id, ...spot }));

      const batch = Array.from({ length: 1 + Math.floor(rand() * 8) }, (_, i) =>
        req(`r${i}`, pick(types), Math.round(rand() * 300), i),
      );
      const state = layout.buildState(lot);
      const { accepted } = layout.solveBatch(batch, layout.summarize(state));
      const spots = layout.placeSpots(state, accepted);

      expect(spots.size).toBe(accepted.length);
    }
  });
});

describe('buildNavigationMap - driver floor plan', () => {
  it('numbers sections from the gate and gives aisle directions for a fixed bay', () => {
    // 20 car bays in aisles of 8: bay 11 is aisle 2, 3rd from the left.
    const lot = makeLot({ capacity: { bike: 5, car: 20 }, rows: [['A', 8]], holds: [fixedHold('me', 'car', 11)] });
    const map = layout.buildNavigationMap(lot, 'me');

    expect(map.sections.map((s) => [s.number, s.id])).toEqual([[1, 'fixed-bike'], [2, 'fixed-car'], [3, 'row-A']]);
    expect(map.mySpot).toMatchObject({ label: 'x', sectionId: 'fixed-car', aisle: 2, position: 3 });
    expect(map.directions[1]).toBe('Head to section 2 of 3: Car bays.');
    expect(map.directions[2]).toMatch(/aisle 2.*3rd bay from the left/);

    const car = map.sections[1];
    expect(car.columns).toBe(8);
    expect(car.cells[10]).toMatchObject({ label: 'C-11', taken: true, mine: true });
    expect(car.free).toBe(19);
  });

  it('marks a flexible spot, joins multi-marker vehicles and hides other bookings', () => {
    const lot = makeLot({
      rows: [['A', 8]],
      holds: [flexHold('other', 'car', 'A', 0), { ...flexHold('me', 'bus', 'A', 4), label: 'A5–A8' }],
    });
    const map = layout.buildNavigationMap(lot, 'me');
    const cells = map.sections[0].cells;

    expect(cells.slice(4).every((c) => c.mine)).toBe(true);
    expect(cells[0]).toMatchObject({ taken: true, mine: false, joinPrev: false, joinNext: true });
    expect(cells[1]).toMatchObject({ joinPrev: true, joinNext: false });
    expect(cells[3]).toMatchObject({ taken: false });
    expect(JSON.stringify(map)).not.toContain('other');
    expect(map.directions[2]).toMatch(/markers A5–A8, the 5th to 8th markers from the left end of row A/);
  });

  it('returns the plan without directions when the booking holds no spot', () => {
    const map = layout.buildNavigationMap(makeLot({ capacity: { car: 2 } }), 'nobody');
    expect(map.mySpot).toBeNull();
    expect(map.directions).toEqual([]);
    expect(map.sections).toHaveLength(1);
  });
});

describe('fixedToFlexibleRows - converting reserved bays to shared space', () => {
  it('keeps the same space, in rows of 40 markers', () => {
    // Gorakhnath Airport: 40 bikes + 130 cars = 40 + 260 = 300 units -> 7 full rows + 20.
    const rows = layout.fixedToFlexibleRows({ bike: 40, car: 130, bus: 0 });
    expect(rows.map((r) => r.label).join('')).toBe('ABCDEFGH');
    expect(rows.slice(0, 7).every((r) => r.units === 40)).toBe(true);
    expect(rows[7].units).toBe(20);
    expect(rows.reduce((s, r) => s + r.units, 0)).toBe(300);
  });

  it('appends after existing rows without reusing their labels', () => {
    const rows = layout.fixedToFlexibleRows({ bus: 2 }, [{ label: 'A', units: 16 }]);
    expect(rows).toEqual([{ label: 'A', units: 16 }, { label: 'B', units: 8 }]);
  });

  it('labels past Z as AA, AB', () => {
    expect([0, 25, 26, 27].map(layout.rowLabel)).toEqual(['A', 'Z', 'AA', 'AB']);
  });
});

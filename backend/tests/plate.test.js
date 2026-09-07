'use strict';

const { normalizePlate, canonicalPlate, comparePlates, isPlausiblePlate } = require('../src/utils/plate');

describe('plate normalisation', () => {
  it('strips separators and uppercases', () => {
    expect(normalizePlate('ka-01 ab 1234')).toBe('KA01AB1234');
    expect(normalizePlate('KA 01 AB 1234')).toBe('KA01AB1234');
  });

  it('tolerates empty input', () => {
    expect(normalizePlate(null)).toBe('');
    expect(normalizePlate(undefined)).toBe('');
  });

  it('collapses characters OCR commonly confuses', () => {
    expect(canonicalPlate('KAO1AB1234')).toBe(canonicalPlate('KA01AB1234'));
    expect(canonicalPlate('KA01ABI234')).toBe(canonicalPlate('KA01AB1234'));
  });
});

describe('comparePlates', () => {
  it('matches identical plates exactly', () => {
    const result = comparePlates('KA01AB1234', 'KA01AB1234');
    expect(result).toMatchObject({ match: true, kind: 'exact', similarity: 1 });
  });

  it('matches across formatting differences', () => {
    expect(comparePlates('ka-01-ab-1234', 'KA 01 AB 1234').match).toBe(true);
  });

  it('accepts an O-for-0 misread as equivalent', () => {
    const result = comparePlates('KAO1AB1234', 'KA01AB1234');
    expect(result.match).toBe(true);
    expect(result.kind).toBe('ocr-equivalent');
  });

  it('accepts a single-character misread as a fuzzy match', () => {
    const result = comparePlates('KA01AB1235', 'KA01AB1234');
    expect(result.match).toBe(true);
    expect(result.kind).toBe('fuzzy');
    expect(result.distance).toBe(1);
  });

  it('rejects a genuinely different vehicle', () => {
    const result = comparePlates('MH12CD5678', 'KA01AB1234');
    expect(result.match).toBe(false);
    expect(result.kind).toBe('mismatch');
  });

  it('rejects when either plate is missing', () => {
    expect(comparePlates('', 'KA01AB1234').match).toBe(false);
    expect(comparePlates('KA01AB1234', null).kind).toBe('invalid');
  });
});

describe('isPlausiblePlate', () => {
  it('accepts standard Indian formats', () => {
    expect(isPlausiblePlate('KA01AB1234')).toBe(true);
    expect(isPlausiblePlate('DL8CAF5031')).toBe(true);
    expect(isPlausiblePlate('22BH1234AA')).toBe(true);
  });

  it('rejects strings that could never be a registration number', () => {
    expect(isPlausiblePlate('HELLO')).toBe(false);
    expect(isPlausiblePlate('123')).toBe(false);
    expect(isPlausiblePlate('NOTAPLATEATALL')).toBe(false);
  });
});

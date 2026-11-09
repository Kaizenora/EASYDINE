import { tableLabel } from '@easydine/types';

describe('tableLabel helper', () => {
  it('returns custom table name unchanged when present', () => {
    expect(tableLabel('1', 'VIP Booth')).toBe('VIP Booth');
    expect(tableLabel('5', 'Patio Corner')).toBe('Patio Corner');
  });

  it('prefixes plain numbers with T', () => {
    expect(tableLabel(1)).toBe('T1');
    expect(tableLabel('2')).toBe('T2');
    expect(tableLabel(12)).toBe('T12');
  });

  it('never creates TT1 or double-prefixed labels', () => {
    expect(tableLabel('T1')).toBe('T1');
    expect(tableLabel('t1')).toBe('T1');
    expect(tableLabel('TT1')).toBe('T1');
    expect(tableLabel('Tt12')).toBe('T12');
  });

  it('handles empty or null gracefully', () => {
    expect(tableLabel(null, null)).toBe('T-');
    expect(tableLabel(undefined, undefined)).toBe('T-');
    expect(tableLabel('', '')).toBe('T-');
  });
});

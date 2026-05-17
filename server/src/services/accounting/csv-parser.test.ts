import { describe, it, expect } from 'vitest';
import { parseCsv, parseDate } from './csv-parser';

describe('parseCsv', () => {
  it('parses simple comma-separated rows', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([['a','b','c'], ['1','2','3']]);
  });

  it('handles quoted fields with embedded commas', () => {
    expect(parseCsv('a,"b,c",d\n')).toEqual([['a','b,c','d']]);
  });

  it('handles escaped double-quotes inside quoted fields', () => {
    expect(parseCsv('a,"b""c",d\n')).toEqual([['a','b"c','d']]);
  });

  it('strips BOM from file start', () => {
    expect(parseCsv('﻿a,b\n1,2\n')).toEqual([['a','b'], ['1','2']]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a','b'], ['1','2']]);
  });

  it('handles trailing line without newline', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a','b'], ['1','2']]);
  });

  it('filters out fully-empty rows', () => {
    expect(parseCsv('a,b\n\n1,2\n')).toEqual([['a','b'], ['1','2']]);
  });

  it('parses a realistic UAE bank export', () => {
    const csv =
      'Date,Description,Amount,Reference\n' +
      '01/05/2026,"Rent payment, Apt 1",1050.00,REF-001\n' +
      '03/05/2026,Bank fee,-25.00,\n';
    expect(parseCsv(csv)).toEqual([
      ['Date','Description','Amount','Reference'],
      ['01/05/2026','Rent payment, Apt 1','1050.00','REF-001'],
      ['03/05/2026','Bank fee','-25.00',''],
    ]);
  });
});

describe('parseDate', () => {
  it('parses DD/MM/YYYY', () => {
    const d = parseDate('15/05/2026', 'DD/MM/YYYY');
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(4); // May = index 4
    expect(d.getUTCDate()).toBe(15);
  });

  it('parses MM/DD/YYYY', () => {
    const d = parseDate('05/15/2026', 'MM/DD/YYYY');
    expect(d.getUTCMonth()).toBe(4);
    expect(d.getUTCDate()).toBe(15);
  });

  it('parses YYYY-MM-DD', () => {
    const d = parseDate('2026-05-15', 'YYYY-MM-DD');
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(4);
    expect(d.getUTCDate()).toBe(15);
  });

  it('parses YY with 20xx prefix', () => {
    const d = parseDate('15/05/26', 'DD/MM/YY');
    expect(d.getUTCFullYear()).toBe(2026);
  });

  it('throws on unparseable string', () => {
    expect(() => parseDate('not a date', 'YYYY-MM-DD')).toThrow();
  });

  it('throws on mismatched format', () => {
    expect(() => parseDate('15/05/2026', 'YYYY-MM-DD')).toThrow();
  });
});

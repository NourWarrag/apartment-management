import { describe, it, expect } from 'vitest';
import { parseCsv } from './csv-parser';

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

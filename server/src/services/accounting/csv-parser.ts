export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  const t = text.replace(/^﻿/, '');

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQuotes) {
      if (c === '"' && t[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { cur.push(field); field = ''; }
      else if (c === '\n') { cur.push(field); field = ''; rows.push(cur); cur = []; }
      else if (c === '\r') { /* skip */ }
      else { field += c; }
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.length > 0 && r.some((f) => f.length > 0));
}

export function parseDate(value: string, format: string): Date {
  const tokens = /YYYY|YY|MM|DD/g;
  const literals = format.split(tokens).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const ts = format.match(tokens) ?? [];

  const patternParts: string[] = [];
  for (let i = 0; i < ts.length; i++) {
    patternParts.push(literals[i] ?? '');
    if (ts[i] === 'YYYY') patternParts.push('(\\d{4})');
    else if (ts[i] === 'YY') patternParts.push('(\\d{2})');
    else if (ts[i] === 'MM') patternParts.push('(\\d{1,2})');
    else if (ts[i] === 'DD') patternParts.push('(\\d{1,2})');
  }
  patternParts.push(literals[ts.length] ?? '');
  const re = new RegExp('^' + patternParts.join('') + '$');
  const m = value.trim().match(re);
  if (!m) throw new Error(`Date "${value}" does not match format "${format}"`);

  let year = 0, month = 0, day = 0;
  for (let i = 0; i < ts.length; i++) {
    const v = Number(m[i + 1]);
    if (ts[i] === 'YYYY') year = v;
    else if (ts[i] === 'YY') year = 2000 + v;
    else if (ts[i] === 'MM') month = v;
    else if (ts[i] === 'DD') day = v;
  }
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Date "${value}" out of range`);
  }
  return new Date(Date.UTC(year, month - 1, day));
}

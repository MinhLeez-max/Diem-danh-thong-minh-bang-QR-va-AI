import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCsv } from '../src/lib/csv.ts';

test('CSV preserves Vietnamese, quotes, commas, newlines and Excel UTF-8 BOM', () => {
  assert.equal(toCsv([['Lớp', 'Tên'], ['10A1', 'Nguyễn "An", Bình\nMai']]), '\uFEFF"Lớp","Tên"\r\n"10A1","Nguyễn ""An"", Bình\nMai"');
});
test('CSV treats formula prefixes and leading whitespace as literal text', () => {
  for (const value of ['=1+1', '+SUM(A1)', '-1+1', '@SUM(A1)', '\t=1+1', '\r=1+1']) {
    assert.equal(toCsv([[value]]), '\uFEFF"\'' + value + '"');
  }
  assert.equal(toCsv([['10A1', '50.0%']]), '\uFEFF"10A1","50.0%"');
});

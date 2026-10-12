import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateFromDay, dayFromDate, auc, formatDate, isFirstOfMonth, isNewYear, END_DAY } from '../public/js/sim/calendar.js';

test('giorno 0 è il 21 aprile 753 a.C., AUC 1', () => {
  assert.deepEqual(dateFromDay(0), { year: 753, month: 4, day: 21 });
  assert.equal(formatDate(0), '21 aprile 753 a.C. (AUC 1)');
});

test('fine anno e capodanno', () => {
  assert.deepEqual(dateFromDay(254), { year: 753, month: 12, day: 31 });
  assert.deepEqual(dateFromDay(255), { year: 752, month: 1, day: 1 });
  assert.equal(isNewYear(255), true);
  assert.equal(isNewYear(254), false);
});

test('primo del mese', () => {
  assert.equal(isFirstOfMonth(10), true); // 1 maggio 753
  assert.equal(isFirstOfMonth(11), false);
});

test('andata e ritorno', () => {
  for (const n of [0, 1, 10, 254, 255, 1000, 50000, 178739]) assert.equal(dayFromDate(dateFromDay(n)), n);
});

test('fine partita col 264 a.C.', () => {
  assert.equal(END_DAY, 178740);
  assert.deepEqual(dateFromDay(END_DAY - 1), { year: 264, month: 12, day: 31 });
  assert.equal(auc(264), 490);
});

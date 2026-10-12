// Calendario di gioco. Giorno 0 = 21 aprile 753 a.C.
// Anni di 365 giorni senza bisestili; gli anni a.C. scendono.
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const MONTH_NAMES = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const START_YEAR = 753;
const START_OFFSET = 31 + 28 + 31 + 20; // giorni dal 1 gennaio al 21 aprile

export function dateFromDay(n) {
  const total = n + START_OFFSET;
  const year = START_YEAR - Math.floor(total / 365);
  let rest = total % 365;
  let month = 0;
  while (rest >= MONTH_DAYS[month]) { rest -= MONTH_DAYS[month]; month++; }
  return { year, month: month + 1, day: rest + 1 };
}

export function dayFromDate({ year, month, day }) {
  let doy = day - 1;
  for (let m = 0; m < month - 1; m++) doy += MONTH_DAYS[m];
  return (START_YEAR - year) * 365 + doy - START_OFFSET;
}

// Anno ab urbe condita, approssimato all'anno solare: 753 a.C. = AUC 1.
export function auc(year) {
  return START_YEAR + 1 - year;
}

// La partita finisce con il 264 a.C.
export const END_DAY = dayFromDate({ year: 263, month: 1, day: 1 });

export function isFirstOfMonth(n) {
  return dateFromDay(n).day === 1;
}

export function isNewYear(n) {
  const d = dateFromDay(n);
  return d.day === 1 && d.month === 1;
}

export function formatDate(n) {
  const d = dateFromDay(n);
  return `${d.day} ${MONTH_NAMES[d.month - 1]} ${d.year} a.C. (AUC ${auc(d.year)})`;
}

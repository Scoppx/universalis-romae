// Ambizioni storiche: i popoli piccoli devono sopravvivere fino a un anno, i grandi conquistare una regione.
// Raggiunta una volta, l'ambizione dà un bonus di punteggio che resta anche se poi si perdono le terre.
import { log } from './state.js';
import { dateFromDay } from './calendar.js';

export function initAmbitions(game) {
  for (const id of game.ordine) game.nazioni[id].ambizioneRaggiunta ??= null;
}

export function ambitionOf(game, id) {
  const a = game.ambizioni?.popoli?.[id];
  if (!a) return null;
  if (a.tipo === 'sopravvivere') return { tipo: a.tipo, anno: a.anno };
  const r = game.ambizioni.regioni[a.regione];
  return r ? { tipo: 'regione', regione: a.regione, nome: r.nome, province: r.province } : null;
}

const tasse = ids => ids.reduce((s, p) => s + p.tasse, 0);

export function ambitionStatus(game, id) {
  const a = ambitionOf(game, id), n = game.nazioni[id];
  if (!a || !n) return null;
  const giaRaggiunta = n.ambizioneRaggiunta != null;
  if (a.tipo === 'sopravvivere') {
    const anniMancanti = Math.max(0, dateFromDay(game.day).year - a.anno);
    return { tipo: a.tipo, raggiunta: n.vivo && anniMancanti === 0, giaRaggiunta, anniMancanti };
  }
  const regione = a.province.map(p => game.province[p]).filter(Boolean);
  const mie = regione.filter(p => p.owner === id);
  const quota = tasse(mie) / Math.max(1, tasse(regione));
  const capitale = game.province[n.capitale]?.owner === id;
  return {
    tipo: a.tipo, raggiunta: n.vivo && capitale && quota >= game.balance.ambizioni.quotaRegione - 1e-9,
    giaRaggiunta, quota, possedute: mie.length, totale: regione.length
  };
}

export function monthlyAmbitions(game) {
  if (!game.ambizioni) return;
  for (const id of game.ordine) {
    const n = game.nazioni[id];
    if (!n.vivo || n.ambizioneRaggiunta != null) continue;
    if (!ambitionStatus(game, id)?.raggiunta) continue;
    n.ambizioneRaggiunta = game.day;
    log(game, { tipo: 'ambizione', nazione: id });
  }
}

// Bonus di punteggio dell'ambizione raggiunta (0 se non raggiunta o senza ambizione).
export function ambitionBonus(game, id) {
  const a = ambitionOf(game, id);
  if (!a || game.nazioni[id]?.ambizioneRaggiunta == null) return 0;
  const b = game.balance.ambizioni;
  return a.tipo === 'sopravvivere' ? b.bonusSopravvivenza : b.bonusRegione;
}

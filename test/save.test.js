import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../tools/load-data.js';
import { createSession, runDays } from '../public/js/ui/session.js';
import { serialize, deserialize, writeStorage, readStorage, AUTOSAVE_KEY } from '../public/js/ui/save.js';
import { RIBELLI, createArmy, provincesOf } from '../public/js/sim/state.js';
import { ensureRebels, independence } from '../public/js/sim/culture.js';

const data = loadData();

test('andata e ritorno: stessa partita, bilanciamento non salvato', () => {
  const s = createSession(data, 'volsci', 4);
  runDays(s, 200);
  const text = serialize(s);
  assert.equal(text.includes('"economia"'), false);
  const r = deserialize(text, data);
  assert.equal(r.ok, true);
  assert.equal(r.session.giocatore, 'volsci');
  assert.equal(r.session.seme, 4);
  assert.deepEqual(r.session.game, s.game);
  assert.equal(r.session.controllers.volsci, undefined);
  runDays(s, 100);
  runDays(r.session, 100);
  assert.deepEqual(r.session.game, s.game);
});

test('file non validi: rifiutati con un motivo', () => {
  const s = createSession(data, 'roma', 1);
  const good = JSON.parse(serialize(s));
  const bad = [
    'boh',
    JSON.stringify({ ...good, versione: 99 }),
    JSON.stringify({ ...good, giocatore: 'atlantide' }),
    JSON.stringify({ ...good, game: { ...good.game, day: -3 } }),
    JSON.stringify({ ...good, game: { ...good.game, province: { roma: good.game.province.roma } } }),
    JSON.stringify({ ...good, game: { ...good.game, eserciti: null } })
  ];
  for (const text of bad) {
    const r = deserialize(text, data);
    assert.equal(r.ok, false, text.slice(0, 40));
    assert.match(r.motivo, /non valido/);
  }
});

test('storage: funziona, e se manca o esplode non rompe nulla', () => {
  const mem = new Map();
  const ok = { setItem: (k, v) => mem.set(k, v), getItem: k => mem.get(k) ?? null };
  assert.equal(writeStorage(ok, AUTOSAVE_KEY, 'x'), true);
  assert.equal(readStorage(ok, AUTOSAVE_KEY), 'x');
  const broken = { setItem() { throw new Error('quota'); }, getItem() { throw new Error('vietato'); } };
  assert.equal(writeStorage(broken, AUTOSAVE_KEY, 'x'), false);
  assert.equal(readStorage(broken, AUTOSAVE_KEY), null);
  assert.equal(writeStorage(null, AUTOSAVE_KEY, 'x'), false);
  assert.equal(readStorage(null, AUTOSAVE_KEY), null);
});

test('salvataggio con guerre e proposte valide: accettato', async () => {
  const { declareWar, proposePeace } = await import('../public/js/sim/war.js');
  const s = createSession(data, 'roma', 1);
  const { guerra } = declareWar(s.game, 'veio', 'roma');
  proposePeace(s.game, 'veio', guerra, { ricevente: 'veio', province: [] });
  const r = deserialize(serialize(s), data);
  assert.equal(r.ok, true, r.motivo);
});

test('salvataggi manipolati: rifiutati prima di toccare la partita', () => {
  const s = createSession(data, 'roma', 1);
  const good = () => JSON.parse(serialize(s));
  const army = g => Object.values(g.game.eserciti)[0];
  const casi = {
    'owner sconosciuto': g => { g.game.province.roma.owner = 'atlantide'; },
    'controller sconosciuto': g => { g.game.province.roma.controller = 'atlantide'; },
    'tasse non numeriche': g => { g.game.province.roma.tasse = '5'; },
    'vicino sconosciuto': g => { g.game.province.roma.vicini.push('atlantide'); },
    'esercito in provincia sconosciuta': g => { army(g).prov = 'atlantide'; },
    'percorso verso provincia sconosciuta': g => { army(g).percorso = ['atlantide']; },
    'fanti non numerici': g => { army(g).fanteria = '<img src=x onerror=alert(1)>'; },
    'esercito con chiave diversa dall\'id': g => { const a = army(g); delete g.game.eserciti[a.id]; g.game.eserciti.zz = a; },
    'nazione senza capitale': g => { delete g.game.nazioni.veio.capitale; },
    'tesoro non numerico': g => { g.game.nazioni.veio.tesoro = 'molto'; },
    'giocatore dal prototipo': g => { g.giocatore = 'constructor'; },
    'ordine con nazione sconosciuta': g => { g.game.ordine.push('atlantide'); },
    'nazione fuori da ordine': g => { g.game.ordine = g.game.ordine.filter(id => id !== 'veio'); },
    'log mancante': g => { delete g.game.log; },
    'guerra con nazione sconosciuta': g => { g.game.guerre = { g1: { id: 'g1', attaccanti: ['atlantide'], difensori: ['roma'], inizio: 0, battaglie: 0 } }; },
    'proposta con chiave diversa dall\'id': g => {
      g.game.guerre = { g1: { id: 'g1', attaccanti: ['veio'], difensori: ['roma'], inizio: 0, battaglie: 0 } };
      g.game.proposte = { k1: { id: 'p9', tipo: 'pace', guerra: 'g1', da: 'veio', a: 'roma', termini: { ricevente: 'veio', province: [] }, giorno: 0 } };
    },
    'obiettivo sconosciuto': g => { g.game.nazioni.veio.obiettivo = 'atlantide'; },
    'alleato sconosciuto': g => { g.game.nazioni.veio.alleati = ['atlantide']; },
    'relazione non numerica': g => { g.game.nazioni.veio.relazioni.roma = 'cattiva'; },
    'protettore sconosciuto': g => { g.game.nazioni.veio.protettore = 'atlantide'; },
    'tributo malformato': g => { g.game.nazioni.veio.tributo = { a: 'roma' }; },
    'proposta di tipo sconosciuto': g => {
      g.game.proposte = { p9: { id: 'p9', tipo: 'matrimonio', da: 'veio', a: 'roma', giorno: 0 } };
    },
    'id con caratteri strani': g => { g.game.guerre = { 'g"1': { id: 'g"1', attaccanti: ['veio'], difensori: ['roma'], inizio: 0, battaglie: 0 } }; }
  };
  for (const [nome, rompi] of Object.entries(casi)) {
    const g = good();
    rompi(g);
    const r = deserialize(JSON.stringify(g), data);
    assert.equal(r.ok, false, nome);
    assert.match(r.motivo, /non valido/, nome);
  }
});

test('salvataggi della tappa 2 senza obiettivo: accettati', () => {
  const s = createSession(data, 'roma', 1);
  const g = JSON.parse(serialize(s));
  for (const n of Object.values(g.game.nazioni)) delete n.obiettivo;
  assert.equal(deserialize(JSON.stringify(g), data).ok, true);
});

test('la modalità IA si salva e si ricarica', () => {
  const s = createSession(data, 'roma', 1, 'misto', { controller: () => [] });
  const fatta = { controller: () => [] };
  const r = deserialize(serialize(s), data, { creaAi: () => fatta });
  assert.equal(r.session.ia, 'misto');
  assert.equal(r.session.ai, fatta);
  const vecchio = JSON.parse(serialize(s));
  delete vecchio.ia;
  assert.equal(deserialize(JSON.stringify(vecchio), data).session.ia, 'regole');
  vecchio.ia = 'oracolo';
  assert.equal(deserialize(JSON.stringify(vecchio), data).ok, false);
});

test('salvataggi senza diplomazia (tappa 3): ricevono i valori iniziali', () => {
  const s = createSession(data, 'roma', 1);
  const g = JSON.parse(serialize(s));
  for (const n of Object.values(g.game.nazioni)) { delete n.relazioni; delete n.alleati; delete n.protettore; delete n.tributo; delete n.pretesti; delete n.ambascerie; }
  const r = deserialize(JSON.stringify(g), data);
  assert.equal(r.ok, true, r.motivo);
  assert.equal(r.session.game.nazioni.roma.relazioni.lega_latina, 30);
  assert.deepEqual(r.session.game.nazioni.roma.alleati, []);
  runDays(r.session, 60);
});

test('proposte diplomatiche valide: accettate', () => {
  const s = createSession(data, 'roma', 1);
  s.game.proposte = { p9: { id: 'p9', tipo: 'alleanza', da: 'veio', a: 'roma', giorno: 0 } };
  assert.equal(deserialize(serialize(s), data).ok, true);
});

test('ribelli e popoli nuovi: andata e ritorno identici', () => {
  const s = createSession(data, 'roma', 2);
  runDays(s, 40);
  const g = s.game;
  ensureRebels(g);
  const p = Object.values(g.province).find(x => x.owner !== 'roma' && provincesOf(g, x.owner).length > 1);
  p.cultura = 'nessuna_cultura';
  p.controller = RIBELLI;
  independence(g, p.id);
  const q = Object.values(g.province).find(x => x.owner === 'veio');
  createArmy(g, RIBELLI, q.id, 800, 0);
  g.nazioni.roma.slider.guerra = 2;
  const r = deserialize(serialize(s), data);
  assert.equal(r.ok, true, r.motivo);
  assert.deepEqual(r.session.game, g);
  runDays(s, 60);
  runDays(r.session, 60);
  assert.deepEqual(r.session.game, s.game);
});

test('salvataggio vecchio senza slider, cultura e ribelli: valori iniziali', () => {
  const s = createSession(data, 'roma', 1);
  const old = JSON.parse(serialize(s));
  for (const n of Object.values(old.game.nazioni)) { delete n.slider; delete n.ultimoSlider; }
  for (const p of Object.values(old.game.province)) { delete p.assimilazione; delete p.assimilazioneDi; delete p.colonia; delete p.ribelliDal; }
  const r = deserialize(JSON.stringify(old), data);
  assert.equal(r.ok, true, r.motivo);
  assert.deepEqual(r.session.game.nazioni.roma.slider, { societa: 0, guerra: 0, governo: 0 });
  assert.equal(r.session.game.province.roma.colonia, null);
});

test('campi nuovi non validi: rifiutati', () => {
  const s = createSession(data, 'roma', 1);
  const good = JSON.parse(serialize(s));
  const guasta = f => { const x = structuredClone(good); f(x.game); return JSON.stringify(x); };
  const bad = [
    guasta(g => { g.nazioni.roma.slider = { societa: 9, guerra: 0, governo: 0 }; }),
    guasta(g => { g.nazioni.roma.ultimoSlider = 'ieri'; }),
    guasta(g => { g.province.roma.assimilazione = 400; }),
    guasta(g => { g.province.roma.colonia = 'atlantide'; }),
    guasta(g => { g.province.roma.ribelliDal = -1.5; }),
    guasta(g => { g.nazioni.ribelli = { id: 'ribelli' }; g.province.roma.owner = 'ribelli'; }),
    guasta(g => { g.province.roma.controller = 'ribelli'; }), // ribelli senza record
    guasta(g => { g.nazioni.ribelli = 'boh'; })
  ];
  for (const text of bad) assert.equal(deserialize(text, data).ok, false, text.slice(0, 80));
});

test('il record dei ribelli si ricrea al caricamento', () => {
  const s = createSession(data, 'roma', 1);
  const x = JSON.parse(serialize(s));
  x.game.nazioni.ribelli = { id: 'ribelli', nome: 'Ribelli', colore: '#000000' };
  const r = deserialize(JSON.stringify(x), data);
  assert.equal(r.ok, true, r.motivo);
  assert.deepEqual(r.session.game.nazioni.ribelli.alleati, []);
});

test('eventi in attesa, eventi fatti e dormienti: andata e ritorno; catalogo non salvato', () => {
  const s = createSession(data, 'volsci', 3);
  runDays(s, 400);
  const g = s.game;
  g.eventi.v999 = { id: 'v999', evento: 'carestia', nazione: 'roma', altro: null, giorno: g.day };
  const text = serialize(s);
  assert.equal(text.includes('"catalogo"'), false);
  const r = deserialize(text, data);
  assert.equal(r.ok, true, r.motivo);
  assert.deepEqual(r.session.game, g);
});

test('salvataggio vecchio senza eventi né dormienti: valori iniziali dai dati', () => {
  const s = createSession(data, 'roma', 1);
  const old = JSON.parse(serialize(s));
  delete old.game.eventi; delete old.game.eventiFatti; delete old.game.dormienti;
  const r = deserialize(JSON.stringify(old), data);
  assert.equal(r.ok, true, r.motivo);
  assert.deepEqual(r.session.game.eventi, {});
  assert.equal(Object.keys(r.session.game.dormienti).length, 13);
});

test('evento orfano (tolto dal catalogo) si carica e poi si scarta', () => {
  const s = createSession(data, 'roma', 1);
  const x = JSON.parse(serialize(s));
  x.game.eventi.v998 = { id: 'v998', evento: 'evento_sparito', nazione: 'veio', altro: null, giorno: 0 };
  const r = deserialize(JSON.stringify(x), data);
  assert.equal(r.ok, true, r.motivo);
  runDays(r.session, 1);
  assert.equal(r.session.game.eventi.v998, undefined);
});

test('eventi e dormienti non validi: rifiutati', () => {
  const s = createSession(data, 'roma', 1);
  const good = JSON.parse(serialize(s));
  const guasta = f => { const x = structuredClone(good); f(x.game); return JSON.stringify(x); };
  const bad = [
    guasta(g => { g.eventi = { v1: { id: 'v1', evento: 'carestia', nazione: 'atlantide', altro: null, giorno: 0 } }; }),
    guasta(g => { g.eventi = { v1: { id: 'v2', evento: 'carestia', nazione: 'roma', altro: null, giorno: 0 } }; }),
    guasta(g => { g.eventi = { v1: { id: 'v1', evento: 3, nazione: 'roma', altro: null, giorno: 0 } }; }),
    guasta(g => { g.eventiFatti = { carestia: ['atlantide'] }; }),
    guasta(g => { g.dormienti.taranto.capitale = 'atlantide'; }),
    guasta(g => { g.dormienti.roma = { ...g.dormienti.taranto, id: 'roma' }; }) // già attivo
  ];
  for (const text of bad) assert.equal(deserialize(text, data).ok, false, text.slice(0, 80));
});

test('evento orfano del giocatore: scartato al caricamento, la partita riparte', () => {
  const s = createSession(data, 'roma', 1);
  const x = JSON.parse(serialize(s));
  x.game.eventi.v997 = { id: 'v997', evento: 'evento_sparito', nazione: 'roma', altro: null, giorno: 0 };
  const r = deserialize(JSON.stringify(x), data);
  assert.equal(r.ok, true, r.motivo);
  assert.equal(r.session.game.eventi.v997, undefined);
  assert.equal(runDays(r.session, 3).giorni, 3);
});

test('salvataggio vecchio senza difficoltà: la riceve dai dati, normale per i popoli nati in partita', () => {
  const s = createSession(data, 'roma', 1);
  const old = JSON.parse(serialize(s));
  for (const n of Object.values(old.game.nazioni)) delete n.difficolta;
  for (const d of Object.values(old.game.dormienti)) delete d.difficolta;
  const r = deserialize(JSON.stringify(old), data);
  assert.equal(r.ok, true, r.motivo);
  assert.equal(r.session.game.nazioni.roma.difficolta, 'facile');
  assert.equal(r.session.game.dormienti.taranto.difficolta, data.popoli.popoli.find(p => p.id === 'taranto').difficolta);
});

test('proposta di annessione: salvata e controllata', () => {
  const s = createSession(data, 'roma', 1);
  const x = JSON.parse(serialize(s));
  x.game.guerre.g1 = { id: 'g1', attaccanti: ['roma'], difensori: ['veio'], inizio: 0, battaglie: 0 };
  x.game.proposte.p1 = { id: 'p1', tipo: 'pace', guerra: 'g1', da: 'roma', a: 'veio', giorno: 0, termini: { ricevente: 'roma', province: ['veio'], annessione: 'veio' } };
  assert.equal(deserialize(JSON.stringify(x), data).ok, true);
  x.game.proposte.p1.termini.annessione = 'atlantide';
  assert.equal(deserialize(JSON.stringify(x), data).ok, false);
});

test('assedio in corso: salvato, e controllato', () => {
  const s = createSession(data, 'roma', 1);
  const x = JSON.parse(serialize(s));
  x.game.province.veio.assedio = { nazione: 'roma', punti: 42 };
  assert.equal(deserialize(JSON.stringify(x), data).ok, true);
  x.game.province.veio.assedio = { nazione: 'roma', punti: 400 };
  assert.equal(deserialize(JSON.stringify(x), data).ok, false);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../tools/load-data.js';
import { createSession, runDays } from '../public/js/ui/session.js';
import { serialize, deserialize, writeStorage, readStorage, AUTOSAVE_KEY } from '../public/js/ui/save.js';

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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../tools/load-data.js';
import { applyCommand } from '../public/js/sim/commands.js';
import { createClock, setSpeed, setPaused, tick } from '../public/js/ui/clock.js';
import { createSession, runDays, pausaNecessaria } from '../public/js/ui/session.js';
import { declareWar, proposePeace } from '../public/js/sim/war.js';
import { END_DAY } from '../public/js/sim/calendar.js';

test('orologio: pausa, accumulo, velocità, tetto per fotogramma', () => {
  const c = createClock();
  assert.equal(tick(c, 0), 0); // in pausa
  setPaused(c, false);
  assert.equal(tick(c, 1000), 0); // primo fotogramma: solo riferimento
  assert.equal(tick(c, 1450), 2); // velocità 3 = 200 ms/giorno
  assert.equal(tick(c, 1600), 1); // 50 avanzati + 150
  assert.equal(tick(c, 61600), 10); // scheda rimasta inattiva: tetto
  assert.equal(c.accumulo, 0);
  setSpeed(c, 9);
  assert.equal(c.velocita, 5);
  setSpeed(c, 0);
  assert.equal(c.velocita, 1);
});

const data = loadData();

test('sessione: il giocatore non ha controller, gli altri sì', () => {
  const s = createSession(data, 'roma', 1);
  assert.equal(Object.keys(s.controllers).length, 37);
  assert.equal(s.controllers.roma, undefined);
  const r = runDays(s, 30);
  assert.equal(r.giorni, 30);
  assert.equal(s.game.day, 30);
});

test('sessione: si ferma per una proposta al giocatore, la fine, la sconfitta', () => {
  const s = createSession(data, 'roma', 1);
  const { guerra } = declareWar(s.game, 'veio', 'roma');
  proposePeace(s.game, 'veio', guerra, { ricevente: 'veio', province: [] });
  assert.deepEqual(runDays(s, 10), { giorni: 0, motivo: 'proposta', notizie: [], importanti: [] });
  s.game.proposte = {};
  s.game.day = END_DAY;
  assert.equal(pausaNecessaria(s), 'fine');
  s.game.day = 0;
  s.game.nazioni.roma.vivo = false;
  assert.equal(pausaNecessaria(s), 'sconfitta');
});

test('sessione: richiamo a ogni capodanno e notizie', () => {
  const s = createSession(data, 'roma', 1);
  let anni = 0;
  // una proposta dell'IA al giocatore ferma il tempo: la si scarta e si riparte
  while (s.game.day < 300) {
    s.game.proposte = {};
    const r = runDays(s, 300 - s.game.day, { onYear: () => anni++ });
    assert.ok(Array.isArray(r.notizie));
  }
  assert.equal(anni, 1); // il 1 gennaio 752 a.C. è il giorno 255
});

test('sessione con modalità IA: il giocatore escluso, metà a Jev in misto', async () => {
  const { createSession: cs } = await import('../public/js/ui/session.js');
  const ai = { controller: () => [] };
  const s = cs(data, 'roma', 1, 'misto', ai);
  assert.equal(s.ia, 'misto');
  assert.equal(s.controllers.roma, undefined);
  assert.equal(Object.values(s.controllers).filter(c => c === ai.controller).length, 18); // roma è in posizione pari
});

test('sessione: si ferma per un evento del giocatore e riparte dopo la scelta', () => {
  const s = createSession(data, 'roma', 1);
  s.game.eventi.v1 = { id: 'v1', evento: 'carestia', nazione: 'roma', altro: null, giorno: s.game.day };
  assert.equal(runDays(s, 10).motivo, 'evento');
  assert.equal(applyCommand(s.game, { tipo: 'scegli', nazione: 'roma', evento: 'v1', opzione: 'compra_grano' }).ok, true);
  assert.equal(runDays(s, 1).giorni, 1);
});

test('sessione: un evento del giocatore senza definizione non ferma il gioco', () => {
  const s = createSession(data, 'roma', 1);
  s.game.eventi.v1 = { id: 'v1', evento: 'evento_sparito', nazione: 'roma', altro: null, giorno: s.game.day };
  assert.equal(runDays(s, 2).giorni, 2);
});

test('sessione: una notizia che ti riguarda ferma il tempo a fine giornata', () => {
  const s = createSession(data, 'roma', 1);
  s.game.proposte = {};
  s.controllers.veio = game => (game.day === 3 ? [{ tipo: 'dichiara_guerra', nazione: 'veio', contro: 'roma' }] : []);
  const r = runDays(s, 30);
  assert.equal(r.motivo, 'notizie');
  assert.equal(s.game.day, 4);
  assert.ok(r.importanti.some(t => t.includes('dichiara guerra')));
  // ripartendo non si ferma di nuovo per la stessa notizia
  s.game.proposte = {};
  assert.notEqual(runDays(s, 1).motivo, 'notizie');
});

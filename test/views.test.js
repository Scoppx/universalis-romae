import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { loadData } from '../tools/load-data.js';
import { declareWar, proposePeace, makePeace } from '../public/js/sim/war.js';
import { createArmy } from '../public/js/sim/state.js';
import * as V from '../public/js/ui/views.js';
import { ensureRebels } from '../public/js/sim/culture.js';
import { monthlyEvents } from '../public/js/sim/events.js';
import { provinceFill, cultureColor, RELAZIONE, TERRENO } from '../public/js/ui/colors.js';

test('barra in alto', () => {
  const g = makeGame();
  assert.deepEqual(V.topBar(g, 'roma'), {
    data: '21 aprile 753 a.C. (AUC 1)', tesoro: '3.6', entrate: '+0.04/mese',
    uomini: '1950/3900', stabilita: '0', infamia: '0.0/20'
  });
  g.nazioni.roma.stabilita = 2;
  assert.equal(V.topBar(g, 'roma').stabilita, '+2');
});

test('schede dei popoli: 38, prima i facili, tratti leggibili', () => {
  const cards = V.peopleCards(loadData().popoli);
  assert.equal(cards.length, 38);
  assert.equal(cards[0].id, 'roma');
  assert.equal(cards[0].tratti, 'reclute +50%, stabilità +50%, battaglia +1');
  assert.equal(cards.at(-1).difficolta, 'molto difficile');
  assert.equal(V.formatTratti({ assedio: -0.5, montagna: 2 }), 'assedio -50%, montagna +2');
});

test('provincia: occupazione, eserciti, reclutamento', () => {
  const g = makeGame();
  declareWar(g, 'roma', 'volsci');
  g.province.c.controller = 'roma';
  const v = V.provinceInfo(g, 'c', 'roma');
  assert.deepEqual(v.proprietario, { id: 'volsci', nome: 'volsci' });
  assert.deepEqual(v.occupante, { id: 'roma', nome: 'roma' });
  assert.equal(v.puoReclutare, false);
  const a = V.provinceInfo(g, 'a', 'roma');
  assert.equal(a.occupante, null);
  assert.equal(a.puoReclutare, true);
  assert.deepEqual(a.eserciti.map(e => [e.nazione, e.mio, e.uomini]), [['roma', true, 2574]]);
});

test('governo', () => {
  const g = makeGame();
  const v = V.governmentView(g, 'roma');
  assert.equal(v.governo, 'neutro');
  assert.equal(v.effettiGoverno, '');
  assert.equal(v.tratti, 'reclute +30%');
  assert.equal(v.costoStabilita, '22.0');
  assert.deepEqual(v.slider.map(l => [l.quale, l.valore, l.meno, l.piu]),
    [['societa', '0', null, null], ['guerra', '0', null, null], ['governo', '0', null, null]]);
  g.nazioni.roma.governo = 'tribù';
  assert.equal(V.governmentView(g, 'roma').effettiGoverno, 'tasse -20%, reclute +20%');
  g.nazioni.roma.governo = 'monarchia';
  assert.equal(V.governmentView(g, 'roma').effettiGoverno, 'la stabilità tende a +1');
  g.nazioni.roma.slider.guerra = 5;
  g.nazioni.roma.ultimoSlider = 0;
  const w = V.governmentView(g, 'roma').slider[1];
  assert.equal(w.valore, '+5');
  assert.equal(w.piu, 'già al limite');
  assert.equal(w.meno, 'prossima riforma tra 10 anni');
});

test('provincia: malcontento, assimilazione, colonia, azioni', () => {
  const g = makeGame();
  g.province.b.cultura = 'volsca';
  g.province.b.assimilazione = 42.7;
  const v = V.provinceInfo(g, 'b', 'roma');
  assert.equal(v.malcontento, 3);
  assert.equal(v.assimilazione, 42);
  assert.equal(v.colonia, false);
  assert.equal(v.azioni.colonia.motivo, 'denaro insufficiente');
  assert.equal(v.azioni.fortifica.costo, 15);
  assert.equal(V.provinceInfo(g, 'a', 'roma').assimilazione, null);
  assert.equal(V.provinceInfo(g, 'c', 'roma').azioni, null);
});

test('notizie di rivolte e indipendenze', () => {
  const g = makeGame();
  ensureRebels(g);
  assert.equal(V.formatLogEntry({ tipo: 'rivolta', prov: 'b', nazione: 'roma' }, g, 'roma'), 'Rivolta a B contro roma!');
  assert.equal(V.formatLogEntry({ tipo: 'rivolta', prov: 'c', nazione: 'volsci' }, g, 'roma'), null);
  assert.equal(V.formatLogEntry({ tipo: 'indipendenza', prov: 'c', da: 'volsci', a: 'latini' }, g, 'roma'), 'C si stacca da volsci e passa a latini.');
  assert.equal(V.formatLogEntry({ tipo: 'assimilata', prov: 'b', nazione: 'roma' }, g, 'roma'), 'B ha preso la tua cultura.');
});

test('mappa del malcontento', () => {
  const g = makeGame();
  assert.equal(provinceFill(g, g.province.b, 'malcontento', 'roma'), 'hsl(120, 55%, 50%)');
  g.province.b.cultura = 'volsca';
  assert.equal(provinceFill(g, g.province.b, 'malcontento', 'roma'), 'hsl(84, 55%, 50%)');
});

test('diplomazia: tutti i popoli, confinanti prima, stato, relazione, motivi', () => {
  const g = makeGame();
  let d = V.diplomacyView(g, 'roma');
  assert.deepEqual(d.map(x => [x.id, x.confina, x.stato, x.relazione]),
    [['latini', true, 'pace', 30], ['volsci', true, 'pace', 0], ['siculi', false, 'pace', 0]]);
  assert.equal(d[0].azioni.guerra, null);
  assert.equal(d[0].costoGuerra, 2);
  assert.equal(d[2].azioni.guerra, 'nessun confine');
  assert.equal(d[0].azioni.foedus, 'non abbastanza più forte');
  assert.deepEqual(d[0].azioni.ultimatum.province.map(p => p.id), ['d', 'e']);
  const { guerra } = declareWar(g, 'roma', 'volsci');
  assert.equal(V.diplomacyView(g, 'roma')[1].stato, 'guerra');
  makePeace(g, guerra, 'roma', { province: [] });
  d = V.diplomacyView(g, 'roma');
  assert.equal(d[1].stato, 'tregua');
  assert.match(d[1].azioni.guerra, /^tregua in corso fino al \d+ \w+ \d+ a\.C\.$/);
  g.nazioni.roma.protettore = 'latini';
  d = V.diplomacyView(g, 'roma');
  assert.equal(d[0].stato, 'protettore');
  assert.equal(d[1].azioni.guerra, 'un federato non dichiara guerre');
  assert.equal(d[0].azioni.esci, null);
  assert.equal(d[1].azioni.esci, 'non è il tuo protettore');
});

test('proposte ricevute: titolo e testo per tipo', async () => {
  const { propose } = await import('../public/js/sim/diplomacy.js');
  const g = makeGame();
  propose(g, 'roma', 'ultimatum', 'latini', { provincia: 'e' });
  propose(g, 'siculi', 'alleanza', 'latini');
  assert.deepEqual(V.pendingProposals(g, 'latini').map(p => [p.titolo, p.testo]), [
    ['Ultimatum', 'roma chiede la provincia di E. Se rifiuti avrà un pretesto per attaccarti.'],
    ['Alleanza', 'siculi propone un\'alleanza.']
  ]);
});

test('relazioni sulla mappa: alleati, federati, coalizione', async () => {
  const { changeRelation } = await import('../public/js/sim/diplomacy.js');
  const g = makeGame();
  g.nazioni.roma.alleati = ['latini']; g.nazioni.latini.alleati = ['roma'];
  g.nazioni.siculi.protettore = 'roma';
  assert.equal(provinceFill(g, g.province.d, 'relazioni', 'roma'), RELAZIONE.alleato);
  assert.equal(provinceFill(g, g.province.g, 'relazioni', 'roma'), RELAZIONE.federato);
  g.nazioni.roma.infamia = 25;
  changeRelation(g, 'roma', 'volsci', -20);
  assert.equal(provinceFill(g, g.province.c, 'relazioni', 'roma'), RELAZIONE.coalizione);
});

test('guerre: punteggio, province da chiedere e da cedere', () => {
  const g = makeGame();
  const { guerra } = declareWar(g, 'roma', 'volsci');
  g.province.c.controller = 'roma';
  const [w] = V.warsView(g, 'roma');
  assert.deepEqual([w.id, w.nemico.id, w.ruolo, w.punteggio], [guerra, 'volsci', 'attaccante', 50]);
  assert.deepEqual(w.daChiedere, [{ id: 'c', nome: 'C', costo: 50, a: 'roma', verso: null, owner: 'volsci' }]);
  assert.deepEqual(V.warsView(g, 'volsci')[0].daCedere, [{ id: 'c', nome: 'C', costo: 50, a: 'roma', verso: 'roma', owner: 'volsci' }]);
  proposePeace(g, 'roma', guerra, { ricevente: 'roma', province: ['c'] });
  assert.equal(V.warsView(g, 'roma')[0].propostaInAttesa, true);
  assert.deepEqual(V.pendingProposals(g, 'volsci').map(p => p.testo), ['roma chiede la pace e vuole: C.']);
});

test('eserciti del giocatore', () => {
  const g = makeGame();
  createArmy(g, 'roma', 'b', 500, 50);
  g.eserciti.e5.percorso = ['a'];
  assert.deepEqual(V.armiesView(g, 'roma').map(a => [a.provincia, a.fanteria, a.destinazione]),
    [['A', 2340, null], ['B', 500, 'A']]);
});

test('notizie: guerre e paci per tutti, battaglie solo se ti riguardano', () => {
  const g = makeGame();
  assert.equal(V.formatLogEntry({ tipo: 'guerra', attaccante: 'roma', difensore: 'volsci' }, g, 'siculi'), 'roma dichiara guerra a volsci.');
  assert.equal(V.formatLogEntry({ tipo: 'battaglia', prov: 'c', vincitore: 'roma', sconfitto: 'volsci' }, g, 'siculi'), null);
  assert.equal(V.formatLogEntry({ tipo: 'battaglia', prov: 'c', vincitore: 'roma', sconfitto: 'volsci' }, g, 'volsci'), 'Battaglia a C: vince roma.');
  const { guerra } = declareWar(g, 'roma', 'volsci');
  g.province.c.controller = 'roma';
  makePeace(g, guerra, 'roma', { province: ['c'] });
  const pace = g.log.find(e => e.tipo === 'pace');
  assert.deepEqual(pace.parti, ['roma', 'volsci']);
  assert.equal(V.formatLogEntry(pace, g, 'siculi'), 'Pace tra roma e volsci: roma ottiene C.');
  assert.equal(V.formatLogEntry({ tipo: 'proposta' }, g, 'roma'), null);
});

test('classifica', () => {
  const g = makeGame();
  assert.deepEqual(V.rankingView(g, 'latini').slice(0, 2), [
    { pos: 1, nome: 'roma', punteggio: 8, vivo: true, tu: false },
    { pos: 2, nome: 'latini', punteggio: 7, vivo: true, tu: true }
  ]);
});

test('colori per modalità', () => {
  const g = makeGame();
  const c = g.province.c;
  assert.equal(provinceFill(g, c, 'politica', 'roma'), '#888888');
  assert.equal(provinceFill(g, c, 'terreno', 'roma'), TERRENO.montagna);
  assert.equal(provinceFill(g, c, 'cultura', 'roma'), cultureColor('volsca'));
  assert.notEqual(cultureColor('latina'), cultureColor('volsca'));
  assert.equal(provinceFill(g, g.province.a, 'relazioni', 'roma'), RELAZIONE.tu);
  assert.equal(provinceFill(g, c, 'relazioni', 'roma'), RELAZIONE.neutrale);
  declareWar(g, 'roma', 'volsci');
  assert.equal(provinceFill(g, c, 'relazioni', 'roma'), RELAZIONE.guerra);
  assert.equal(provinceFill(g, c, 'relazioni', null), RELAZIONE.neutrale);
});

test('consiglio: decisioni recenti con probabilità ordinate, filtro per popolo', () => {
  const g = makeGame();
  const records = [
    { seq: 0, giorno: 0, applicato: 1, nazione: 'roma', domande: [{ domanda: 'guerra', scelta: 'volsci', fonte: 'jev', probabilita: { 'nessuna guerra': 0.2, volsci: 0.7, latini: 0.1 } }] },
    { seq: 1, giorno: 2, applicato: 3, nazione: 'volsci', domande: [{ domanda: 'pace', scelta: 'rifiuta', fonte: 'jev', probabilita: 0.3 }] }
  ];
  const v = V.councilView(records, g, null);
  assert.deepEqual(v.map(x => x.nazione), ['volsci', 'roma']);
  assert.deepEqual(v[1].opzioni, [{ nome: 'volsci', p: 70 }, { nome: 'nessuna guerra', p: 20 }, { nome: 'latini', p: 10 }]);
  assert.deepEqual(v[0].opzioni, [{ nome: 'sì', p: 30 }, { nome: 'no', p: 70 }]);
  assert.equal(v[0].domanda, 'Accettare la pace?');
  assert.deepEqual(V.councilView(records, g, 'roma').map(x => x.nazione), ['roma']);
});

test('azioni sulla selezione: unire e dividere', () => {
  const g = makeGame();
  const [r] = Object.values(g.eserciti).filter(a => a.owner === 'roma');
  const b = createArmy(g, 'roma', 'a', 500, 0);
  assert.deepEqual(V.selectionActions(g, 'roma', [r.id, b.id]), { ...V.selectionActions(g, 'roma', [r.id, b.id]), puoUnire: true, puoDividere: false, puoRiunire: false, motivoUnire: null, motivoDividere: 'seleziona un solo tuo esercito', motivoRiunire: 'sono già nella stessa provincia: usa Unisci' });
  assert.deepEqual(V.selectionActions(g, 'roma', [r.id]), { ...V.selectionActions(g, 'roma', [r.id]), puoUnire: false, puoDividere: true, puoRiunire: false, motivoUnire: 'seleziona almeno due tuoi eserciti (Shift + clic)', motivoDividere: null, motivoRiunire: 'seleziona almeno due tuoi eserciti (Shift + clic)' });
  b.prov = 'b';
  assert.equal(V.selectionActions(g, 'roma', [r.id, b.id]).motivoUnire, 'gli eserciti devono stare nella stessa provincia');
  assert.equal(V.selectionActions(g, 'roma', []).puoDividere, false);
  assert.deepEqual(V.armiesView(g, 'roma', [b.id]).map(a => a.scelto), [false, true]);
});

test('firma dei colori: in modalità relazioni cambia con guerre e tregue', async () => {
  const { fillSignature } = await import('../public/js/ui/colors.js');
  const g = makeGame();
  const pol = fillSignature(g, 'politica', 'roma'), rel = fillSignature(g, 'relazioni', 'roma');
  const { guerra } = declareWar(g, 'roma', 'volsci');
  assert.equal(fillSignature(g, 'politica', 'roma'), pol); // la politica non dipende dalle guerre
  const inGuerra = fillSignature(g, 'relazioni', 'roma');
  assert.notEqual(inGuerra, rel);
  makePeace(g, guerra, 'roma', { province: [] });
  const inTregua = fillSignature(g, 'relazioni', 'roma');
  assert.notEqual(inTregua, inGuerra);
  g.day += g.balance.guerra.tregua + 1; // la tregua scade
  assert.notEqual(fillSignature(g, 'relazioni', 'roma'), inTregua);
  g.province.c.controller = 'roma';
  assert.notEqual(fillSignature(g, 'politica', 'roma'), pol); // le occupazioni contano sempre
  const prima = fillSignature(g, 'relazioni', 'roma');
  g.nazioni.roma.alleati = ['latini'];
  assert.notEqual(fillSignature(g, 'relazioni', 'roma'), prima);
});

test('la proposta di foedus avverte che non si torna indietro', async () => {
  const { propose, changeRelation } = await import('../public/js/sim/diplomacy.js');
  const g = makeGame();
  createArmy(g, 'roma', 'a', 20000, 0);
  changeRelation(g, 'roma', 'volsci', 60);
  propose(g, 'roma', 'foedus', 'volsci');
  assert.match(V.pendingProposals(g, 'volsci')[0].testo, /uscirne costerà/);
});

test('revisione: alleato in tregua resta "alleato" (si può rompere), e la mappa delle relazioni calcola la coalizione una volta', async () => {
  const { relazioneStato } = await import('../public/js/ui/colors.js');
  const { coalition } = await import('../public/js/sim/diplomacy.js');
  const g = makeGame();
  g.nazioni.roma.alleati = ['latini']; g.nazioni.latini.alleati = ['roma'];
  g.nazioni.roma.tregue.latini = 9999; g.nazioni.latini.tregue.roma = 9999;
  const d = V.diplomacyView(g, 'roma');
  assert.equal(d[0].stato, 'alleato');
  assert.equal(d[0].azioni.rompi, null);
  g.nazioni.roma.infamia = 30;
  const coal = coalition(g, 'roma');
  for (const id of g.ordine) assert.equal(relazioneStato(g, 'roma', id, coal), relazioneStato(g, 'roma', id));
});

test('revisione: il modulo di pace è solo per il capofila', () => {
  const g = makeGame();
  g.nazioni.volsci.alleati = ['siculi']; g.nazioni.siculi.alleati = ['volsci'];
  declareWar(g, 'roma', 'volsci');
  assert.equal(V.warsView(g, 'volsci')[0].capofila, true);
  assert.equal(V.warsView(g, 'siculi')[0].capofila, false);
});

test('eventi del giocatore e notizie di nascite, governi, eventi storici', () => {
  const g = makeGame(1, [{ id: 'e', titolo: 'Carestia', testo: 'Il raccolto è perduto.', condizioni: { probabilita: 1, popoli: ['roma'] },
    opzioni: [{ id: 'a', testo: 'Comprare grano', effetti: [{ tesoroMesi: -3 }] }], regola: 'a', storico: true }]);
  monthlyEvents(g);
  const [v] = V.pendingEvents(g, 'roma');
  assert.equal(v.titolo, 'Carestia');
  assert.deepEqual(v.opzioni, [{ id: 'a', testo: 'Comprare grano', effetti: 'tesoro −3 mesi di entrate' }]);
  assert.deepEqual(V.pendingEvents(g, 'latini'), []);
  assert.equal(V.formatLogEntry({ tipo: 'nascita', nazione: 'latini', prov: 'd', da: 'roma' }, g, 'roma'), 'Nasce latini a D.');
  assert.equal(V.formatLogEntry({ tipo: 'governo', nazione: 'latini', governo: 'repubblica' }, g, 'roma'), 'latini diventa una repubblica.');
  assert.equal(V.formatLogEntry({ tipo: 'evento', evento: 'e', nazione: 'latini', opzione: 'a', storico: true }, g, 'roma'), 'latini: Carestia.');
  assert.equal(V.formatLogEntry({ tipo: 'evento', evento: 'e', nazione: 'roma', opzione: 'a', storico: true }, g, 'roma'), null);
  assert.equal(V.formatLogEntry({ tipo: 'evento', evento: 'e', nazione: 'latini', opzione: 'a', storico: false }, g, 'roma'), null);
});

test('schede dei popoli: bonus della difficoltà', () => {
  const d = loadData();
  const cards = V.peopleCards(d.popoli, d.balance);
  assert.match(cards.find(c => c.id === 'roma').bonus, /esercito \+50%/);
  assert.match(cards.find(c => c.id === 'roma').bonus, /\+1 al dado/);
  assert.equal(cards.find(c => c.difficolta === 'normale').bonus, '');
});

test('guerre: quante province si possono chiedere in una pace', () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance);
  g.balance.guerra.quotaPace = 0.5;
  declareWar(g, 'roma', 'latini');
  g.province.d.controller = 'roma';
  g.province.e.controller = 'roma';
  assert.equal(V.warsView(g, 'roma')[0].maxChiedibili, 1);
});

test('schede dei popoli: bonus di reclute e tasse', () => {
  const d = loadData();
  const [roma] = V.peopleCards(d.popoli, { difficolta: { facile: { reclute: 1, tasse: 0.5 } } }).filter(c => c.id === 'roma');
  assert.equal(roma.bonus, 'reclute +100%, tasse +50%');
});

test('notizia di pace: ogni provincia al suo nuovo padrone', () => {
  const g = makeGame();
  const e = { tipo: 'pace', guerra: 'g1', ricevente: 'roma', parti: ['roma', 'latini', 'volsci'], province: ['c', 'f'], padroni: ['latini', 'roma'] };
  assert.equal(V.formatLogEntry(e, g, 'siculi'), 'Pace tra roma, latini e volsci: latini ottiene C; roma ottiene F.');
});

test('schede dei popoli: capitale salva', () => {
  const d = loadData();
  const [roma] = V.peopleCards(d.popoli, { difficolta: { facile: { capitaleSalva: true } } }).filter(c => c.id === 'roma');
  assert.equal(roma.bonus, 'capitale mai ceduta');
});

test('guerre: per ogni provincia chi la riceve; la capitale salva non si offre', () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance);
  g.balance.guerra.quotaPace = 1;
  const { guerra } = declareWar(g, 'roma', 'volsci');
  g.guerre[guerra].attaccanti.push('latini');
  g.province.c.controller = 'latini';
  g.province.f.controller = 'roma';
  const w = V.warsView(g, 'roma')[0];
  assert.deepEqual(w.daChiedere.map(p => [p.id, p.a]), [['c', 'latini'], ['f', 'roma']]);
  const h = makeGame();
  h.balance = structuredClone(h.balance);
  h.balance.difficolta.facile = { capitaleSalva: true };
  h.nazioni.roma.difficolta = 'facile';
  declareWar(h, 'volsci', 'roma');
  h.province.a.controller = 'volsci';
  h.province.b.controller = 'volsci';
  assert.deepEqual(V.warsView(h, 'volsci')[0].daChiedere.map(p => p.id), ['b']);
  assert.deepEqual(V.warsView(h, 'roma')[0].daCedere.map(p => p.id), ['b']);
});

test('proposta di pace: dice a chi vanno le province che non vanno al giocatore', () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance);
  g.balance.guerra.quotaPace = 1;
  const { guerra } = declareWar(g, 'roma', 'volsci');
  g.guerre[guerra].attaccanti.push('latini');
  g.province.c.controller = 'latini';
  g.province.f.controller = 'roma';
  proposePeace(g, 'volsci', guerra, { ricevente: 'roma', province: ['c', 'f'] });
  assert.equal(V.pendingProposals(g, 'roma')[0].testo, 'volsci offre la pace e cede: C (a latini), F.');
});

test('provincia di un vicino: riquadro con il popolo e il motivo se la guerra non si può', () => {
  const g = makeGame();
  assert.deepEqual(V.provinceInfo(g, 'c', 'roma').popolo, { id: 'volsci', nome: 'volsci', motivo: null });
  assert.equal(V.provinceInfo(g, 'g', 'roma').popolo, null); // i siculi non confinano
  assert.equal(V.provinceInfo(g, 'a', 'roma').popolo, null); // provincia propria
  g.nazioni.roma.tregue.volsci = 999;
  assert.match(V.provinceInfo(g, 'c', 'roma').popolo.motivo, /^tregua in corso fino al /);
});

test('conferma di guerra: contro di te, con te, forze e costo', () => {
  const g = makeGame();
  const v = V.warConfirmView(g, 'roma', 'volsci');
  assert.equal(v.bersaglio.nome, 'volsci');
  assert.deepEqual(v.nemici.map(x => [x.nome, x.ruolo]), [['volsci', 'il popolo che attacchi']]);
  assert.deepEqual(v.miei.map(x => [x.nome, x.stato]), [['roma', 'tu']]);
  assert.ok(v.forzaMiei > v.forzaNemici);
  assert.equal(v.costo, 'Senza pretesto: la stabilità scende da 0 a -2.');
  assert.equal(v.errore, null);
});

test('riepilogo dopo la dichiarazione: schieramenti e alleati chiamati', () => {
  const g = makeGame();
  const { guerra } = declareWar(g, 'roma', 'volsci');
  const r = V.warSummaryView(g, 'roma', guerra);
  assert.deepEqual(r.nemici, ['volsci']);
  assert.deepEqual(r.miei, ['roma']);
  assert.deepEqual(r.chiamati, []);
});

test('guerre: annessione quando il tuo schieramento occupa tutto il popolo, limiti per popolo', () => {
  const g = makeGame();
  const { guerra } = declareWar(g, 'roma', 'volsci');
  g.province.c.controller = 'roma';
  let w = V.warsView(g, 'roma')[0];
  assert.deepEqual(w.limiti, [{ id: 'volsci', nome: 'volsci', max: 1 }]);
  assert.deepEqual(w.annessioni.map(a => [a.id, a.motivo]), [['volsci', 'non tutte le province di volsci sono occupate']]);
  g.province.f.controller = 'roma';
  w = V.warsView(g, 'roma')[0];
  assert.equal(w.annessioni[0].motivo, null);
  assert.equal(w.annessioni[0].infamia, 2 * (g.balance.infamia.perProvincia + g.balance.infamia.culturaDiversa) * g.balance.annessione.infamia);
  assert.deepEqual(w.annessioni[0].province.sort(), ['c', 'f']);
  proposePeace(g, 'roma', guerra, { ricevente: 'roma', province: ['c'] });
  assert.equal(V.warsView(g, 'roma')[0].annessioni[0].motivo, 'hai già una proposta in attesa');
});

test('richiesta di province: motivo per cui il bottone è spento', () => {
  const limiti = { volsci: { max: 1, nome: 'Volsci' } };
  assert.equal(V.motivoRichiesta([], limiti), 'Spunta almeno una provincia.');
  assert.equal(V.motivoRichiesta(['volsci'], limiti), null);
  assert.equal(V.motivoRichiesta(['volsci', 'volsci'], limiti), 'Al più 1 provincia di Volsci per pace: togline qualcuna, oppure annetti tutto il popolo.');
});

test('pace con denari: testo della proposta, notizia, massimo chiedibile', () => {
  const g = makeGame();
  const { guerra } = declareWar(g, 'roma', 'volsci');
  g.nazioni.volsci.tesoro = 42.7;
  g.province.c.controller = 'roma';
  assert.equal(V.warsView(g, 'roma')[0].denariMax, 42);
  proposePeace(g, 'roma', guerra, { ricevente: 'roma', province: ['c'], denari: 30 });
  assert.equal(V.pendingProposals(g, 'volsci')[0].testo, 'roma chiede la pace e vuole: C e 30 denari.');
  const e = { tipo: 'pace', guerra: 'g1', ricevente: 'roma', parti: ['roma', 'volsci'], province: ['c'], padroni: ['roma'], denari: 30, pagatore: 'volsci' };
  assert.equal(V.formatLogEntry(e, g, 'siculi'), 'Pace tra roma e volsci: roma ottiene C; volsci paga 30 denari.');
  assert.equal(V.motivoRichiesta([], {}, 0, 42), 'Spunta almeno una provincia o chiedi dei denari.');
  assert.equal(V.motivoRichiesta([], {}, 10, 42), null);
  assert.equal(V.motivoRichiesta([], {}, 50, 42), 'Al più 42 denari: è quanto ha nel tesoro.');
});

test('eserciti: unisci tutti qui nella provincia, riunisci da province diverse', () => {
  const g = makeGame();
  const [r] = Object.values(g.eserciti).filter(a => a.owner === 'roma');
  assert.equal(V.provinceInfo(g, 'a', 'roma').unibili, null);
  const b = createArmy(g, 'roma', 'a', 500, 0);
  assert.deepEqual(V.provinceInfo(g, 'a', 'roma').unibili, [r.id, b.id]);
  assert.equal(V.selectionActions(g, 'roma', [r.id, b.id]).motivoRiunire, 'sono già nella stessa provincia: usa Unisci');
  b.prov = 'b';
  const s = V.selectionActions(g, 'roma', [r.id, b.id]);
  assert.equal(s.puoRiunire, true);
  assert.equal(V.selectionActions(g, 'roma', [r.id]).motivoRiunire, 'seleziona almeno due tuoi eserciti (Shift + clic)');
});

test('sciogliere: risparmio al mese e motivo se non si può', () => {
  const g = makeGame();
  const [r] = Object.values(g.eserciti).filter(a => a.owner === 'roma');
  const s = V.selectionActions(g, 'roma', [r.id]);
  assert.equal(s.puoSciogliere, true);
  assert.equal(s.risparmio, ((r.fanteria + 2 * r.cavalleria) / 1000 * g.balance.economia.mantenimento1000).toFixed(2));
  assert.equal(V.selectionActions(g, 'roma', []).motivoSciogliere, 'seleziona uno o più tuoi eserciti');
  r.inBattaglia = true;
  assert.equal(V.selectionActions(g, 'roma', [r.id]).motivoSciogliere, 'un esercito in battaglia non si scioglie');
});

test('tregua: la data di fine nella diplomazia e nel motivo della guerra', () => {
  const g = makeGame();
  g.nazioni.roma.tregue.volsci = 400; g.nazioni.volsci.tregue.roma = 400;
  const d = V.diplomacyView(g, 'roma').find(x => x.id === 'volsci');
  assert.equal(d.stato, 'tregua');
  assert.equal(d.tregua, 'fino al 26 maggio 752 a.C.');
  assert.equal(d.azioni.guerra, 'tregua in corso fino al 26 maggio 752 a.C.');
  assert.equal(V.provinceInfo(g, 'c', 'roma').popolo.motivo, 'tregua in corso fino al 26 maggio 752 a.C.');
  assert.equal(V.diplomacyView(g, 'roma').find(x => x.id === 'latini').tregua, null);
});

test('battaglie del giocatore: schieramenti, morale, ritirata spiegata', async () => {
  const { resolveBattles } = await import('../public/js/sim/combat.js');
  const g = makeGame();
  for (const a of Object.values(g.eserciti)) delete g.eserciti[a.id];
  declareWar(g, 'roma', 'volsci');
  createArmy(g, 'roma', 'b', 4000, 0);
  createArmy(g, 'volsci', 'b', 3000, 0);
  assert.deepEqual(V.battlesView(g, 'roma'), []);
  resolveBattles(g);
  const [b] = V.battlesView(g, 'roma');
  assert.equal(b.prov, 'b');
  assert.equal(b.nome, 'B');
  assert.ok(b.miei.uomini < 4000 && b.nemici.uomini < 3000);
  assert.deepEqual(b.nemici.popoli, ['volsci']);
  assert.equal(b.motivoRitirata, null);
  assert.equal(b.spiegaRitirata, 'I tuoi eserciti qui perdono il 10% degli uomini e scappano ad A; la battaglia conta come persa');
});

test('finestra dell\'assedio: uomini, presidio, giorni, probabilità, motivi', () => {
  const g = makeGame();
  for (const a of Object.values(g.eserciti)) delete g.eserciti[a.id];
  declareWar(g, 'roma', 'volsci');
  g.province.c.uomini = 2; g.province.c.fort = 1;
  assert.equal(V.siegeView(g, 'roma', 'c'), null);
  createArmy(g, 'roma', 'c', 6000, 0);
  const v = V.siegeView(g, 'roma', 'c');
  assert.equal(v.nome, 'C');
  assert.equal(v.uomini, 6000);
  assert.equal(v.presidio, 1000);
  assert.equal(v.fort, 1);
  assert.ok(v.giorni > 0);
  assert.equal(v.probabilita, 67);
  assert.equal(v.motivoAttacco, null);
  assert.equal(v.destinazione, 'B');
  assert.equal(V.siegeView(g, 'roma', 'b'), null); // provincia propria
});

test('coalizione: notizie e avviso nella diplomazia del bersaglio', () => {
  const g = makeGame();
  g.coalizioni = { roma: { membri: ['latini', 'volsci'], dal: 0 } };
  assert.deepEqual(V.coalitionWarning(g, 'roma'), { membri: ['latini', 'volsci'], entro: '21 aprile 752 a.C.', soglia: 20 });
  assert.equal(V.coalitionWarning(g, 'latini'), null);
  assert.equal(V.formatLogEntry({ tipo: 'coalizione_formata', contro: 'roma', membri: ['latini', 'volsci'] }, g, 'siculi'),
    'Si forma una coalizione contro roma: latini, volsci. Attaccherà entro un anno se la sua infamia resta alta.');
  assert.equal(V.formatLogEntry({ tipo: 'coalizione_guerra', contro: 'roma', membri: ['latini'] }, g, 'siculi'), 'La coalizione (latini) dichiara guerra a roma.');
  assert.equal(V.formatLogEntry({ tipo: 'coalizione_sciolta', contro: 'roma' }, g, 'siculi'), 'La coalizione contro roma si scioglie.');
});

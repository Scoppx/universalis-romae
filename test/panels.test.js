import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esercitiHtml, provinceHtml, rankingHtml, governoHtml, eventoHtml, guerraConfermaHtml, guerraRiepilogoHtml, guerreHtml, battaglieHtml } from '../public/js/ui/panels.js';

const evil = '<img src=x onerror=alert(1)>';

test('ogni valore inserito nell\'HTML è protetto, anche i "numeri"', () => {
  const a = esercitiHtml([{ id: 'e1', provincia: 'Roma', fanteria: evil, cavalleria: evil, morale: '3.0', destinazione: null, inBattaglia: false }], { puoUnire: false, puoDividere: false });
  assert.equal(a.includes('<img'), false);
  const p = provinceHtml({
    id: 'roma', nome: 'Roma', proprietario: { id: 'roma', nome: 'Roma' }, occupante: null, cultura: 'latina',
    terreno: 'collina', tasse: 5, uomini: 5, fort: 2, puoReclutare: false,
    malcontento: evil, assimilazione: evil, colonia: true,
    azioni: { colonia: { costo: evil, uomini: evil, motivo: evil }, fortifica: { costo: evil, motivo: null } },
    eserciti: [{ id: 'e1', nazione: 'Roma', mio: false, uomini: evil, morale: '3.0' }]
  });
  assert.equal(p.includes('<img'), false);
  const gov = governoHtml({
    nome: evil, governo: evil, effettiGoverno: evil, stabilita: evil, tratti: evil, costoStabilita: evil, puoAlzare: false,
    slider: [{ quale: evil, nome: evil, sinistra: evil, destra: evil, valore: evil, meno: evil, piu: null }]
  });
  assert.equal(gov.includes('<img'), false);
  assert.equal(eventoHtml({ id: evil, titolo: evil, testo: evil, opzioni: [{ id: evil, testo: evil, effetti: evil }] }).includes('<img'), false);
  assert.equal(rankingHtml('Fine', [{ pos: 1, nome: 'Roma', punteggio: evil, vivo: true, tu: true }]).includes('<img'), false);
});

test('menu e finestre di guerra: tutto protetto', () => {
  const p = provinceHtml({
    id: 'c', nome: 'C', proprietario: { id: 'volsci', nome: 'Volsci' }, occupante: null, cultura: 'volsca',
    terreno: 'monte', tasse: 1, uomini: 1, fort: 0, puoReclutare: false, malcontento: 0, assimilazione: null, colonia: false, azioni: null,
    eserciti: [], popolo: { id: evil, nome: evil, motivo: evil }
  });
  assert.equal(p.includes('<img'), false);
  assert.match(p, /data-azione="prepara-guerra"/);
  const c = guerraConfermaHtml({ bersaglio: { id: evil, nome: evil }, errore: null, costo: evil, forzaMiei: evil, forzaNemici: evil,
    nemici: [{ nome: evil, ruolo: evil, forza: evil }], miei: [{ nome: evil, stato: evil, forza: evil }] });
  assert.equal(c.includes('<img'), false);
  assert.match(c, /data-azione="conferma-guerra"/);
  assert.equal(guerraRiepilogoHtml({ miei: [evil], nemici: [evil], chiamati: [evil] }).includes('<img'), false);
});

test('scheda Guerre: limiti, annessione e bottoni spenti con il motivo, tutto protetto', () => {
  const w = {
    id: 'g1', nemico: { id: 'volsci', nome: evil }, ruolo: 'attaccante', capofila: true, punteggio: 50, propostaInAttesa: false,
    daChiedere: [{ id: 'c', nome: evil, costo: 50, a: 'roma', verso: null, owner: 'volsci' }], daCedere: [],
    limiti: [{ id: 'volsci', nome: evil, max: 1 }], limiteMio: 1, denariMax: evil, puntiPer10Denari: evil,
    annessioni: [{ id: 'volsci', nome: evil, province: ['c', 'f'], infamia: 14, motivo: evil }]
  };
  const h = guerreHtml([w]);
  assert.equal(h.includes('<img'), false);
  assert.match(h, /data-azione="chiedi"[^>]*disabled title="Spunta almeno una provincia o chiedi dei denari\."/);
  assert.match(h, /data-azione="annetti"[^>]*disabled title=/);
  assert.match(h, /data-owner="volsci"/);
  const ok = guerreHtml([{ ...w, annessioni: [{ ...w.annessioni[0], nome: 'Volsci', motivo: null }] }]);
  assert.match(ok, /<button[^>]*data-azione="annetti" data-id="g1" data-popolo="volsci" title="Proponi l'annessione[^"]*">Annetti Volsci \(\+14 infamia\)<\/button>/);
});

// ogni elemento spento dice perché: un tag con disabled deve avere anche title
function spentiSenzaMotivo(html) {
  return (html.match(/<(button|option|input|select)\b[^>]*>/g) ?? []).filter(t => /\bdisabled\b/.test(t) && !/\btitle="[^"]+"/.test(t));
}

test('nessun bottone spento senza spiegazione', () => {
  const gov = governoHtml({ nome: 'Roma', governo: 'monarchia', effettiGoverno: '', stabilita: '0', tratti: '', costoStabilita: '20.0', puoAlzare: false,
    motivoAlzare: 'servono 20.0 denari, ne hai 3.6', slider: [{ quale: 'guerra', nome: 'Dottrina', sinistra: 'difesa', destra: 'attacco', valore: '0', meno: 'x', piu: null }] });
  assert.deepEqual(spentiSenzaMotivo(gov), []);
  const es = esercitiHtml([], { puoUnire: false, puoDividere: false, motivoUnire: 'seleziona almeno due eserciti', motivoDividere: 'seleziona un esercito solo' });
  assert.deepEqual(spentiSenzaMotivo(es), []);
});

test('scelta di chi riceve una provincia occupata da un alleato, e nuovi bottoni degli eserciti', () => {
  const w = {
    id: 'g1', nemico: { id: 'volsci', nome: 'Volsci' }, ruolo: 'attaccante', capofila: true, punteggio: 50, propostaInAttesa: false,
    daChiedere: [{ id: 'c', nome: 'C', costo: 50, a: 'latini', verso: evil, owner: 'volsci' }, { id: 'f', nome: 'F', costo: 50, a: 'roma', verso: null, owner: 'volsci' }],
    daCedere: [], limiti: [{ id: 'volsci', nome: 'Volsci', max: 2 }], limiteMio: 1, denariMax: 0, puntiPer10Denari: 1, annessioni: []
  };
  const h = guerreHtml([w]);
  assert.equal(h.includes('<img'), false);
  assert.equal((h.match(/<select class="assegna"/g) ?? []).length, 1);
  assert.match(h, /data-prov="c"/);
  const es = esercitiHtml([{ id: 'e1', provincia: 'Roma', fanteria: 1, cavalleria: 0, morale: '3.0', destinazione: null, inBattaglia: false }], { puoUnire: false, puoDividere: false, puoRiunire: false, motivoUnire: 'x', motivoDividere: 'y', motivoRiunire: evil });
  assert.match(es, /data-azione="riunisci"[^>]*disabled title=/);
  assert.equal(es.includes('<img'), false);
});

// ogni bottone, attivo o spento, dice cosa fa o perché non si può
function bottoniSenzaSpiegazione(html) {
  return (html.match(/<button\b[^>]*>/g) ?? []).filter(t => !/\btitle="[^"]+"/.test(t));
}

test('ogni bottone ha una spiegazione, anche quando si può cliccare', async () => {
  const { makeGame } = await import('./fixtures.js');
  const V = await import('../public/js/ui/views.js');
  const H = await import('../public/js/ui/panels.js');
  const { declareWar, proposePeace } = await import('../public/js/sim/war.js');
  const { createArmy } = await import('../public/js/sim/state.js');
  const g = makeGame();
  g.nazioni.roma.tesoro = 500; g.nazioni.roma.uomini = 3000;
  g.province.b.cultura = 'volsca';
  createArmy(g, 'roma', 'a', 500, 0);
  const ids = Object.values(g.eserciti).filter(a => a.owner === 'roma').map(a => a.id);
  const { guerra } = declareWar(g, 'roma', 'volsci');
  g.province.c.controller = 'roma'; g.province.f.controller = 'roma';
  proposePeace(g, 'volsci', guerra, { ricevente: 'volsci', province: [] });
  const html = [
    H.provinceHtml(V.provinceInfo(g, 'a', 'roma')), H.provinceHtml(V.provinceInfo(g, 'b', 'roma')), H.provinceHtml(V.provinceInfo(g, 'd', 'roma')),
    H.governoHtml(V.governmentView(g, 'roma')), H.diplomaziaHtml(V.diplomacyView(g, 'roma')),
    H.esercitiHtml(V.armiesView(g, 'roma', ids), V.selectionActions(g, 'roma', ids)), H.guerreHtml(V.warsView(g, 'roma')),
    H.proposalHtml(V.pendingProposals(g, 'roma')[0]), H.rankingHtml('Fine', V.rankingView(g, 'roma')),
    H.guerraConfermaHtml(V.warConfirmView(g, 'roma', 'latini')), H.guerraRiepilogoHtml(V.warSummaryView(g, 'roma', guerra)),
    H.eventoHtml({ id: 'v1', titolo: 'T', testo: 'X', opzioni: [{ id: 'a', testo: 'A', effetti: 'stabilità +1' }] })
  ].join('');
  assert.deepEqual(bottoniSenzaSpiegazione(html), []);
});

test('riquadri delle battaglie: protetti, con la ritirata spiegata', () => {
  const h = battaglieHtml([{ prov: evil, nome: evil, giorni: 3, miei: { uomini: evil, morale: evil, caduti: evil }, nemici: { uomini: evil, morale: evil, caduti: evil, popoli: [evil] }, motivoRitirata: null, spiegaRitirata: evil }],
    [{ prov: 'x', nome: evil, testo: evil, vinto: true }]);
  assert.equal(h.includes('<img'), false);
  assert.match(h, /data-azione="ritirata"[^>]*title=/);
});

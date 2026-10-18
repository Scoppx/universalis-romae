import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { applyCommand } from '../public/js/sim/commands.js';
import { advanceDay } from '../public/js/sim/loop.js';
import { declareWar, hasPretext } from '../public/js/sim/war.js';
import { relation, changeRelation, checkEmbassy, checkProposal, allied, monthlyDiplomacy, coalition, warPreview, forzaDifesa, monthlyCoalitions, coalitionCandidates, checkIntegrate, integrationCost } from '../public/js/sim/diplomacy.js';
import { createArmy } from '../public/js/sim/state.js';

test('relazioni iniziali: 30 tra popoli della stessa cultura, 0 altrimenti; simmetriche', () => {
  const g = makeGame();
  assert.equal(relation(g, 'roma', 'latini'), 30);
  assert.equal(relation(g, 'roma', 'volsci'), 0);
  changeRelation(g, 'roma', 'volsci', -250);
  assert.equal(relation(g, 'volsci', 'roma'), -200);
  assert.deepEqual(g.nazioni.roma.alleati, []);
  assert.equal(g.nazioni.roma.protettore, null);
});

test('ambasceria: costa, alza la relazione, una volta l\'anno', () => {
  const g = makeGame();
  g.nazioni.roma.tesoro = 10;
  assert.equal(applyCommand(g, { tipo: 'ambasceria', nazione: 'roma', verso: 'volsci' }).ok, true);
  assert.equal(relation(g, 'roma', 'volsci'), 25);
  assert.equal(g.nazioni.roma.tesoro, 7);
  assert.equal(checkEmbassy(g, 'roma', 'volsci'), 'ambasceria già inviata quest\'anno');
  g.nazioni.roma.tesoro = 1;
  assert.equal(applyCommand(g, { tipo: 'ambasceria', nazione: 'roma', verso: 'latini' }).motivo, 'denaro insufficiente');
});

test('le relazioni tornano verso la base, ma non durante una guerra', () => {
  const g = makeGame();
  changeRelation(g, 'roma', 'siculi', 10);
  for (let i = 0; i < 70; i++) advanceDay(g); // due inizi di mese
  assert.equal(relation(g, 'roma', 'siculi'), 8);
  changeRelation(g, 'roma', 'volsci', 10);
  declareWar(g, 'roma', 'volsci');
  const v = relation(g, 'roma', 'volsci');
  for (let i = 0; i < 70; i++) advanceDay(g);
  assert.equal(relation(g, 'roma', 'volsci'), v);
});

test('pretesto da un rifiuto: vale fino alla scadenza', () => {
  const g = makeGame();
  assert.equal(hasPretext(g, 'roma', 'volsci'), false);
  g.nazioni.roma.pretesti.volsci = g.day + 10;
  assert.equal(hasPretext(g, 'roma', 'volsci'), true);
  g.day += 11;
  assert.equal(hasPretext(g, 'roma', 'volsci'), false);
});

const proponi = (g, da, genere, verso, extra = {}) => applyCommand(g, { tipo: 'proponi', nazione: da, genere, verso, ...extra });
const rispondi = (g, chi, proposta, accetta) => applyCommand(g, { tipo: 'rispondi', nazione: chi, proposta, accetta });

test('alleanza: proposta, accettazione, rottura', () => {
  const g = makeGame();
  const { proposta } = proponi(g, 'roma', 'alleanza', 'latini');
  assert.equal(proponi(g, 'roma', 'alleanza', 'latini').motivo, 'proposta già in attesa');
  assert.deepEqual(rispondi(g, 'latini', proposta, true), { ok: true, accettata: true });
  assert.equal(allied(g, 'roma', 'latini'), true);
  assert.equal(checkProposal(g, 'roma', 'alleanza', 'latini'), 'siete già alleati');
  assert.equal(applyCommand(g, { tipo: 'dichiara_guerra', nazione: 'roma', contro: 'latini' }).motivo, 'siete alleati');
  const prima = relation(g, 'roma', 'latini');
  assert.equal(applyCommand(g, { tipo: 'rompi_alleanza', nazione: 'roma', con: 'latini' }).ok, true);
  assert.equal(allied(g, 'latini', 'roma'), false);
  assert.equal(relation(g, 'roma', 'latini'), prima - 25);
});

test('foedus: solo a un vicino molto più debole e amico; il federato non dichiara guerre', () => {
  const g = makeGame();
  assert.equal(checkProposal(g, 'roma', 'foedus', 'volsci'), 'non abbastanza più forte');
  createArmy(g, 'roma', 'a', 20000, 0);
  assert.equal(checkProposal(g, 'roma', 'foedus', 'volsci'), 'relazioni troppo basse');
  changeRelation(g, 'roma', 'volsci', 60);
  const { proposta } = proponi(g, 'roma', 'foedus', 'volsci');
  rispondi(g, 'volsci', proposta, true);
  assert.equal(g.nazioni.volsci.protettore, 'roma');
  assert.equal(applyCommand(g, { tipo: 'dichiara_guerra', nazione: 'volsci', contro: 'siculi' }).motivo, 'un federato non dichiara guerre');
  assert.equal(checkProposal(g, 'volsci', 'alleanza', 'siculi'), 'un federato non stringe alleanze');
  g.nazioni.volsci.uomini = 1000;
  while (g.day !== 10) advanceDay(g); // 1 maggio: reclute del mese (75), il 20% (15) va a Roma
  assert.equal(g.nazioni.volsci.uomini, 1000 + 75 - 15);
});

test('tributo: rifiutato dà un pretesto, accettato si paga ogni mese', () => {
  const g = makeGame();
  const p1 = proponi(g, 'roma', 'tributo', 'volsci').proposta;
  rispondi(g, 'volsci', p1, false);
  assert.equal(g.nazioni.roma.pretesti.volsci, g.day + 5 * 365);
  const p2 = proponi(g, 'roma', 'tributo', 'latini').proposta;
  rispondi(g, 'latini', p2, true);
  assert.deepEqual(g.nazioni.latini.tributo, { a: 'roma', fine: g.day + 10 * 365 });
  const tr = g.nazioni.roma.tesoro, tl = g.nazioni.latini.tesoro;
  monthlyDiplomacy(g); // il 20% delle entrate latine (5 × 0,1 = 0,5) passa a Roma
  assert.ok(Math.abs(g.nazioni.roma.tesoro - tr - 0.1) < 1e-9);
  assert.ok(Math.abs(tl - g.nazioni.latini.tesoro - 0.1) < 1e-9);
});

test('ultimatum: provincia ceduta con infamia; non vale più se la provincia cambia padrone', () => {
  const g = makeGame();
  assert.equal(checkProposal(g, 'roma', 'ultimatum', 'latini', { provincia: 'a' }), 'provincia non valida');
  const p = proponi(g, 'roma', 'ultimatum', 'latini', { provincia: 'e' }).proposta;
  rispondi(g, 'latini', p, true);
  assert.equal(g.province.e.owner, 'roma');
  assert.ok(g.nazioni.roma.infamia >= 2);
  g.day += 10 * 365 + 1; // dopo un ultimatum accettato, 10 anni d'attesa
  assert.equal(checkProposal(g, 'roma', 'ultimatum', 'latini', { provincia: 'd' }), 'è la sua ultima provincia');
  const q = proponi(g, 'roma', 'ultimatum', 'volsci', { provincia: 'c' }).proposta;
  g.province.c.owner = 'latini';
  assert.equal(rispondi(g, 'volsci', q, true).ok, false);
  assert.equal(g.province.c.owner, 'latini');
});

const allea = (g, a, b) => rispondi(g, b, proponi(g, a, 'alleanza', b).proposta, true);

test('difesa: gli alleati del difensore entrano da soli, quelli amici dell\'attaccante no', () => {
  const g = makeGame();
  allea(g, 'volsci', 'siculi');
  allea(g, 'volsci', 'latini');
  allea(g, 'roma', 'latini'); // latini alleati di entrambi: restano fuori
  const { guerra } = declareWar(g, 'roma', 'volsci');
  assert.deepEqual(g.guerre[guerra].difensori, ['volsci', 'siculi']);
  assert.ok(relation(g, 'roma', 'siculi') <= -100);
});

test('attacco: gli alleati dell\'attaccante sono chiamati; chi rifiuta rompe l\'alleanza', () => {
  const g = makeGame();
  allea(g, 'roma', 'siculi');
  allea(g, 'roma', 'latini');
  const { guerra } = declareWar(g, 'roma', 'volsci');
  const chiamate = Object.values(g.proposte).filter(p => p.tipo === 'chiamata' && p.guerra === guerra);
  assert.deepEqual(chiamate.map(p => p.a).sort(), ['latini', 'siculi']);
  rispondi(g, 'siculi', chiamate.find(p => p.a === 'siculi').id, true);
  assert.deepEqual(g.guerre[guerra].attaccanti, ['roma', 'siculi']);
  rispondi(g, 'latini', chiamate.find(p => p.a === 'latini').id, false);
  assert.equal(allied(g, 'roma', 'latini'), false);
});

test('chiamata per una guerra già finita: non vale', () => {
  const g = makeGame();
  allea(g, 'roma', 'siculi');
  const { guerra } = declareWar(g, 'roma', 'volsci');
  const ch = Object.values(g.proposte).find(p => p.tipo === 'chiamata');
  delete g.guerre[guerra];
  assert.equal(rispondi(g, 'siculi', ch.id, true).ok, false);
});

test('coalizione: chi ha troppa infamia trova i vicini ostili uniti', () => {
  const g = makeGame();
  g.nazioni.roma.infamia = 25;
  changeRelation(g, 'roma', 'latini', -80);
  changeRelation(g, 'roma', 'volsci', -10);
  assert.deepEqual(coalition(g, 'roma'), ['latini', 'volsci']);
  const { guerra } = declareWar(g, 'roma', 'volsci');
  assert.deepEqual(g.guerre[guerra].difensori, ['volsci', 'latini']);
});

test('alleati: passano nelle terre amiche e combattono dalla stessa parte', async () => {
  const { findPath } = await import('../public/js/sim/armies.js');
  const { resolveBattles } = await import('../public/js/sim/combat.js');
  const g = makeGame();
  allea(g, 'roma', 'latini');
  assert.equal(findPath(g, 'roma', 'a', 'e').at(-1), 'e');
  assert.deepEqual(findPath(g, 'roma', 'a', 'd'), ['d']);
  for (const a of Object.values(g.eserciti)) delete g.eserciti[a.id];
  const { guerra } = declareWar(g, 'volsci', 'roma');
  assert.deepEqual(g.guerre[guerra].difensori, ['roma', 'latini']);
  const r = createArmy(g, 'roma', 'b', 1000, 0), l = createArmy(g, 'latini', 'b', 1000, 0), v = createArmy(g, 'volsci', 'b', 1000, 0);
  resolveBattles(g);
  assert.deepEqual([r.inBattaglia, l.inBattaglia, v.inBattaglia], [true, true, true]);
});

test('popolo eliminato: alleanze, foedus e tributi ripuliti', async () => {
  const { makePeace } = await import('../public/js/sim/war.js');
  const g = makeGame();
  g.balance = structuredClone(g.balance); g.balance.guerra.quotaPace = 1; // misura la pulizia dopo l'eliminazione
  allea(g, 'volsci', 'siculi');
  g.nazioni.latini.tributo = { a: 'volsci', fine: 9999 };
  const { guerra } = declareWar(g, 'roma', 'volsci');
  g.guerre[guerra].difensori = ['volsci']; // i siculi restano fuori per questo test
  g.province.c.controller = 'roma';
  g.province.f.controller = 'roma';
  makePeace(g, guerra, 'roma', { province: ['c', 'f'] });
  assert.equal(g.nazioni.volsci.vivo, false);
  assert.deepEqual(g.nazioni.siculi.alleati, []);
  assert.equal(g.nazioni.latini.tributo, null);
});

test('uscita dal foedus: costa stabilità e relazione, il protettore ha un pretesto', async () => {
  const { checkLeaveFoedus } = await import('../public/js/sim/diplomacy.js');
  const g = makeGame();
  assert.equal(checkLeaveFoedus(g, 'volsci'), 'non sei in un foedus');
  g.nazioni.volsci.protettore = 'roma';
  changeRelation(g, 'roma', 'volsci', 60);
  assert.equal(applyCommand(g, { tipo: 'esci_foedus', nazione: 'volsci' }).ok, true);
  assert.equal(g.nazioni.volsci.protettore, null);
  assert.equal(g.nazioni.volsci.stabilita, -2);
  assert.equal(relation(g, 'roma', 'volsci'), -40);
  assert.equal(hasPretext(g, 'roma', 'volsci'), true);
  g.nazioni.volsci.protettore = 'roma';
  declareWar(g, 'siculi', 'volsci');
  assert.equal(checkLeaveFoedus(g, 'volsci'), 'non durante una guerra');
});

test('revisione: nessuna chiamata né ingresso contro un amico dell\'intero lato nemico', () => {
  const g = makeGame();
  allea(g, 'volsci', 'latini');
  allea(g, 'roma', 'siculi');
  allea(g, 'siculi', 'latini');
  const { guerra } = declareWar(g, 'roma', 'volsci');
  assert.deepEqual(g.guerre[guerra].difensori, ['volsci', 'latini']);
  assert.equal(Object.values(g.proposte).filter(p => p.tipo === 'chiamata').length, 0);
  // una chiamata vecchia, arrivata quando i siculi non erano ancora amici dei latini: non vale
  const pid = 'p99';
  g.proposte[pid] = { id: pid, tipo: 'chiamata', guerra, da: 'roma', a: 'siculi', giorno: g.day };
  assert.equal(rispondi(g, 'siculi', pid, true).ok, false);
  assert.deepEqual(g.guerre[guerra].attaccanti, ['roma']);
});

test('revisione: una chiamata da chi non è più alleato non vale', () => {
  const g = makeGame();
  allea(g, 'roma', 'siculi');
  const { guerra } = declareWar(g, 'roma', 'volsci');
  const ch = Object.values(g.proposte).find(p => p.tipo === 'chiamata');
  g.nazioni.roma.alleati = []; g.nazioni.siculi.alleati = [];
  assert.equal(rispondi(g, 'siculi', ch.id, true).ok, false);
});

test('revisione: un\'eliminazione non cancella le proposte che non la riguardano', async () => {
  const { makePeace } = await import('../public/js/sim/war.js');
  const g = makeGame();
  const { proposta } = proponi(g, 'roma', 'alleanza', 'latini');
  const { guerra } = declareWar(g, 'volsci', 'siculi');
  g.province.g.controller = 'volsci';
  makePeace(g, guerra, 'volsci', { province: ['g'] });
  assert.equal(g.nazioni.siculi.vivo, false);
  assert.ok(g.proposte[proposta]);
});

test('revisione: solo il capofila firma la pace', async () => {
  const { proposePeace } = await import('../public/js/sim/war.js');
  const g = makeGame();
  allea(g, 'volsci', 'siculi');
  const { guerra } = declareWar(g, 'roma', 'volsci');
  assert.equal(proposePeace(g, 'siculi', guerra, { ricevente: 'siculi', province: [] }).motivo, 'solo il capofila firma la pace');
  assert.equal(proposePeace(g, 'volsci', guerra, { ricevente: 'volsci', province: [] }).ok, true);
});

test('revisione: una pace non rimanda a casa gli eserciti alleati in terra amica', async () => {
  const { makePeace } = await import('../public/js/sim/war.js');
  const g = makeGame();
  allea(g, 'roma', 'latini');
  const l = createArmy(g, 'latini', 'b', 1000, 0);
  const { guerra } = declareWar(g, 'volsci', 'siculi');
  makePeace(g, guerra, 'volsci', { province: [] });
  assert.equal(l.prov, 'b');
});

test('revisione: ultimatum al massimo uno l\'anno per vicino; chi cede ritira l\'esercito', () => {
  const g = makeGame();
  const [lat] = Object.values(g.eserciti).filter(a => a.owner === 'latini');
  lat.prov = 'e';
  const p = proponi(g, 'roma', 'ultimatum', 'latini', { provincia: 'e' }).proposta;
  rispondi(g, 'latini', p, true);
  assert.equal(lat.prov, 'd'); // torna nella capitale
  g.province.e.owner = 'latini'; g.province.e.controller = 'latini';
  assert.equal(checkProposal(g, 'roma', 'ultimatum', 'latini', { provincia: 'e' }), 'ultimatum già inviato quest\'anno');
  g.day += 366;
  assert.match(checkProposal(g, 'roma', 'ultimatum', 'latini', { provincia: 'e' }), /^hai già avuto una provincia da lui/); // ha ceduto: 10 anni d'attesa
  g.day += 10 * 365;
  assert.equal(checkProposal(g, 'roma', 'ultimatum', 'latini', { provincia: 'e' }), null);
});

test('ultimatum: la capitale di un popolo facile non si può chiedere', () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance);
  g.balance.difficolta.facile = { capitaleSalva: true };
  g.nazioni.roma.difficolta = 'facile';
  assert.equal(checkProposal(g, 'latini', 'ultimatum', 'roma', { provincia: 'a' }), 'la capitale non si può chiedere');
});

test('anteprima di guerra: chi entra contro di te e cosa fanno i tuoi alleati, come la dichiarazione vera', () => {
  const g = makeGame();
  allea(g, 'volsci', 'siculi');          // alleato del bersaglio: entra
  allea(g, 'roma', 'latini');            // tuo alleato: chiamato
  changeRelation(g, 'roma', 'latini', 30); // 30 + 30 = 60 ≥ 50: probabilmente accetta
  const v = warPreview(g, 'roma', 'volsci');
  assert.equal(v.errore, null);
  assert.deepEqual(v.nemici, [{ id: 'volsci', ruolo: 'bersaglio' }, { id: 'siculi', ruolo: 'alleato' }]);
  assert.deepEqual(v.chiamati, [{ id: 'latini', probabile: true }]);
  assert.deepEqual(v.esclusi, []);
  assert.equal(v.pretesto, false);
  assert.deepEqual(v.stabilita, { prima: 0, dopo: -2 });
  const { guerra } = declareWar(g, 'roma', 'volsci');
  assert.deepEqual(g.guerre[guerra].difensori, ['volsci', 'siculi']);
  assert.ok(Object.values(g.proposte).some(p => p.tipo === 'chiamata' && p.a === 'latini'));
});

test('anteprima di guerra: alleato che non può entrare, motivo di una guerra impossibile', () => {
  const g = makeGame();
  allea(g, 'roma', 'latini');
  allea(g, 'latini', 'volsci');          // i latini sono amici del bersaglio
  const v = warPreview(g, 'roma', 'volsci');
  assert.deepEqual(v.esclusi, [{ id: 'latini', motivo: 'è amico di chi attacchi' }]);
  assert.equal(warPreview(g, 'roma', 'siculi').errore, 'nessun confine');
});

test('ultimatum: contano gli alleati del bersaglio; chi cede se la lega al dito; 10 anni di attesa; infamia più alta', async () => {
  const { answerProposals } = await import('../public/js/ai/rules.js');
  const { power } = await import('../public/js/sim/state.js');
  const g = makeGame();
  g.balance = structuredClone(g.balance);
  g.balance.diplomazia.ultimatumRapporto = 3; // il test misura chi conta nella difesa, non la soglia tarata
  const [r] = Object.values(g.eserciti).filter(a => a.owner === 'roma');
  r.fanteria += Math.ceil(3 * power(g, 'latini') - power(g, 'roma')) + 10; r.cavalleria = r.cavalleria; // roma appena 3 volte più forte dei latini
  assert.equal(forzaDifesa(g, 'latini'), power(g, 'latini'));
  let pid = proponi(g, 'roma', 'ultimatum', 'latini', { provincia: 'd' }).proposta;
  assert.equal(answerProposals(g, 'latini').find(c => c.proposta === pid).accetta, true);
  allea(g, 'latini', 'volsci');
  assert.equal(forzaDifesa(g, 'latini'), power(g, 'latini') + power(g, 'volsci'));
  assert.equal(answerProposals(g, 'latini').find(c => c.proposta === pid).accetta, false);
  const relRL = relation(g, 'roma', 'latini'), relRV = relation(g, 'roma', 'volsci');
  assert.deepEqual(rispondi(g, 'latini', pid, true), { ok: true, accettata: true });
  assert.equal(g.province.d.owner, 'roma');
  assert.equal(g.nazioni.roma.infamia, g.balance.infamia.perProvincia * g.balance.ultimatum.infamia);
  assert.equal(relation(g, 'roma', 'latini'), relRL + g.balance.ultimatum.relazioneBersaglio);
  assert.equal(relation(g, 'roma', 'volsci'), relRV + g.balance.ultimatum.relazioneVicini);
  g.day += 400;
  assert.equal(checkProposal(g, 'roma', 'ultimatum', 'latini', { provincia: 'e' }), 'hai già avuto una provincia da lui: riprova tra 9 anni');
});

const ostili = (g, x, ...ids) => { for (const o of ids) changeRelation(g, o, x, -100 - relation(g, o, x)); };
// nella mappa di prova roma è più forte di latini e volsci insieme: la si indebolisce perché la coalizione basti
const indebolisci = g => { for (const e of Object.values(g.eserciti)) if (e.owner === 'roma') { e.fanteria = 1000; e.cavalleria = 0; } };

test('coalizione: si forma contro chi ha troppa infamia, attacca dopo un anno se l\'infamia resta alta', () => {
  const g = makeGame();
  indebolisci(g);
  g.nazioni.roma.infamia = 30;
  ostili(g, 'roma', 'latini', 'volsci');
  monthlyCoalitions(g);
  assert.deepEqual(g.coalizioni.roma.membri.sort(), ['latini', 'volsci']);
  assert.ok(g.log.some(e => e.tipo === 'coalizione_formata' && e.contro === 'roma'));
  g.day += 200;
  monthlyCoalitions(g);
  assert.equal(Object.values(g.guerre).length, 0); // ancora preavviso
  g.day += 200;
  g.log = [];
  monthlyCoalitions(g);
  const [w] = Object.values(g.guerre);
  assert.deepEqual(w.difensori, ['roma']);
  assert.deepEqual([...w.attaccanti].sort(), ['latini', 'volsci']);
  assert.equal(g.nazioni.latini.stabilita, 0); // l'infamia di roma è un pretesto
  assert.equal(g.coalizioni.roma, undefined);
  assert.ok(g.log.some(e => e.tipo === 'coalizione_guerra'));
});

test('coalizione: si scioglie se l\'infamia scende; chi ha troppa infamia non ne fa parte; serve abbastanza forza', () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance);
  g.balance.coalizione.rapporto = 1.2; // misura chi resta fuori, non la soglia tarata
  indebolisci(g);
  g.nazioni.roma.infamia = 30;
  ostili(g, 'roma', 'latini', 'volsci');
  g.nazioni.volsci.infamia = 25; // conquistatore anche lui: fuori
  monthlyCoalitions(g);
  assert.equal(g.coalizioni.roma, undefined); // i volsci sono esclusi e i latini da soli non bastano
  g.nazioni.volsci.infamia = 0;
  monthlyCoalitions(g);
  assert.ok(g.coalizioni.roma);
  g.nazioni.roma.infamia = 10;
  g.day += 366;
  monthlyCoalitions(g);
  assert.equal(Object.values(g.guerre).length, 0);
  assert.ok(g.log.some(e => e.tipo === 'coalizione_sciolta'));
  const h = makeGame();
  h.nazioni.roma.infamia = 30;
  for (const a of Object.values(h.eserciti)) if (a.owner === 'roma') a.fanteria = 100000; // troppo forte
  ostili(h, 'roma', 'latini', 'volsci');
  monthlyCoalitions(h);
  assert.equal(h.coalizioni?.roma, undefined);
});

test('foedus: integrare il federato dopo 10 anni con buone relazioni e denari, oppure liberarlo', () => {
  const g = makeGame();
  g.nazioni.volsci.protettore = 'roma';
  g.nazioni.volsci.foedusDal = 0;
  assert.equal(checkIntegrate(g, 'latini', 'volsci'), 'non è tuo federato');
  assert.equal(checkIntegrate(g, 'roma', 'volsci'), 'foedus da troppo poco: ancora 10 anni');
  g.day = 10 * 365;
  assert.match(checkIntegrate(g, 'roma', 'volsci'), /^relazione troppo bassa/);
  changeRelation(g, 'roma', 'volsci', 150);
  const costo = integrationCost(g, 'volsci');
  assert.equal(costo, 10 * 2); // tasse dei volsci: 1 + 1
  g.nazioni.roma.tesoro = 0;
  assert.equal(checkIntegrate(g, 'roma', 'volsci'), `denari insufficienti: servono ${costo}`);
  g.nazioni.roma.tesoro = 100;
  const eserciti = Object.values(g.eserciti).filter(a => a.owner === 'volsci').map(a => a.id);
  assert.deepEqual(applyCommand(g, { tipo: 'integra', nazione: 'roma', verso: 'volsci' }), { ok: true });
  assert.equal(g.nazioni.volsci.vivo, false);
  assert.equal(g.province.c.owner, 'roma');
  assert.equal(g.province.f.owner, 'roma');
  assert.equal(g.nazioni.roma.tesoro, 100 - costo);
  assert.equal(g.nazioni.roma.infamia, 2 * (g.balance.infamia.perProvincia + g.balance.infamia.culturaDiversa) * g.balance.foedus.infamia);
  assert.ok(eserciti.every(id => g.eserciti[id]?.owner === 'roma'));
  const h = makeGame();
  h.nazioni.volsci.protettore = 'roma';
  const rel = relation(h, 'roma', 'volsci');
  assert.deepEqual(applyCommand(h, { tipo: 'libera', nazione: 'roma', verso: 'volsci' }), { ok: true });
  assert.equal(h.nazioni.volsci.protettore, null);
  assert.equal(relation(h, 'roma', 'volsci'), rel + h.balance.foedus.relazioneLiberazione);
  assert.equal(applyCommand(h, { tipo: 'libera', nazione: 'roma', verso: 'volsci' }).motivo, 'non è tuo federato');
});

test('sfida storico: la coalizione contro il giocatore scatta già da infamia 15', () => {
  const g = makeGame();
  indebolisci(g);
  g.nazioni.roma.infamia = 17;
  ostili(g, 'roma', 'latini', 'volsci');
  monthlyCoalitions(g);
  assert.equal(g.coalizioni.roma, undefined);
  g.giocatore = 'roma'; g.sfida = 'storico';
  monthlyCoalitions(g);
  assert.ok(g.coalizioni.roma);
});

test('coalizione: entrano anche i popoli ostili non confinanti; guida chi confina', () => {
  const g = makeGame();
  indebolisci(g);
  g.nazioni.roma.infamia = 30;
  ostili(g, 'roma', 'latini', 'volsci', 'siculi');
  for (const e of Object.values(g.eserciti)) if (e.owner === 'siculi') e.fanteria = 50000; // il più forte, ma non confina con roma
  monthlyCoalitions(g);
  assert.deepEqual(g.coalizioni.roma.membri.sort(), ['latini', 'siculi', 'volsci']);
  g.day += 400;
  monthlyCoalitions(g);
  const [w] = Object.values(g.guerre);
  assert.notEqual(w.attaccanti[0], 'siculi');
  assert.ok(w.attaccanti.includes('siculi'));
});

test('coalizione: attacca anche se un po\' più debole del bersaglio (soglia in balance)', async () => {
  const { power } = await import('../public/js/sim/state.js');
  const g = makeGame();
  g.nazioni.roma.infamia = 30;
  ostili(g, 'roma', 'latini', 'volsci');
  const membri = power(g, 'latini') + power(g, 'volsci');
  const [r] = Object.values(g.eserciti).filter(a => a.owner === 'roma');
  r.cavalleria = 0;
  r.fanteria += Math.round(membri / 0.8 - power(g, 'roma')); // la coalizione ha 0,8 volte la forza di roma
  assert.ok(Math.abs((power(g, 'latini') + power(g, 'volsci')) / power(g, 'roma') - 0.8) < 0.02);
  monthlyCoalitions(g);
  assert.ok(g.coalizioni.roma);
});

test('coalizione: il giocatore non viene messo dentro senza volerlo', () => {
  const g = makeGame();
  g.nazioni.volsci.infamia = 30;
  ostili(g, 'volsci', 'roma', 'latini');
  g.giocatore = 'roma';
  assert.ok(!coalitionCandidates(g, 'volsci').includes('roma'));
  g.giocatore = null;
  assert.ok(coalitionCandidates(g, 'volsci').includes('roma'));
});

# Universalis Romae — design

Data: 2026-10-12
Stato: approvato a voce sezione per sezione, in attesa di revisione scritta.

## 1. Obiettivo

Clone di Europa Universalis II ambientato nell'Italia antica, dalla fondazione di Roma
(21 aprile 753 a.C.) all'inizio della prima guerra punica (264 a.C.). Due scopi alla pari:

- un gioco vero, rigiocabile, con qualsiasi popolo;
- una vetrina di Jev (TypeSafe System One): i popoli non giocati prendono le decisioni
  strategiche chiedendole a Jev, e un pannello mostra scelte e probabilità.

Criteri di successo:

- una partita completa si gioca dall'inizio alla fine con qualsiasi popolo;
- la difficoltà cambia con il popolo, verificata dal bench (Roma più facile dei Volsci);
- i popoli guidati da Jev si comportano in modo diverso secondo il loro carattere, e il
  pannello rende leggibile perché;
- il gioco funziona anche senza Jev (IA a regole).

### Fuori dalla prima versione

Flotte e sbarchi, commercio, religione, generali (salvo quelli creati da eventi),
multigiocatore, versione mobile, pubblicazione online, audio.

## 2. Architettura

JavaScript semplice (moduli ES), Canvas 2D, nessuna build. Gira in locale.

```
server.js                 server Node senza dipendenze: file statici + POST /api/jev (proxy TypeSafe)
public/index.html
public/css/
public/js/sim/            simulazione pura, senza DOM; importata da browser, test e bench
public/js/ai/rules.js     IA a regole (micro + riserva)
public/js/ai/questions.js costruisce le domande a Jev dallo stato (pura, testabile)
public/js/ai/jev.js       coda, invio, interpretazione risposte
public/js/ui/             mappa, pannelli, finestre
public/data/              map.json, popoli.json, eventi/*.json, balance.json
data/centri.json          sorgente della mappa
tools/build-map.js        genera public/data/map.json
tools/validate-events.js  valida gli eventi
bench.js                  partite headless
test/*.test.js            node --test
```

Regole di confine:

- `sim/` non conosce né UI né Jev. Riceve stato e comandi, restituisce il nuovo stato.
- Le decisioni dell'IA entrano nella simulazione come comandi, uguali a quelli del giocatore.
- La chiave TypeSafe resta nel server (`TYPESAFE_API_KEY` da ambiente). Il bench in Node
  usa lo stesso modulo del proxy.
- `d3-delaunay` e `d3-geo` sono dipendenze di sviluppo, usate solo da `tools/build-map.js`.
  Il gioco non ha dipendenze a runtime.

## 3. Modello di gioco

### Tempo

- Inizio 21 aprile 753 a.C. (AUC 1), fine 264 a.C. Il calendario mostra a.C. e AUC.
- Passo della simulazione: un giorno.
  - Ogni giorno: movimenti, battaglie, assedi.
  - Ogni mese: entrate, reclute, malcontento e rivolte, eventi, assimilazione.
  - Ogni anno: la stabilità tende al valore di equilibrio, l'infamia cala.
- Velocità 1–5: 1000, 500, 200, 100, 50 ms per giorno. Pausa con la barra spaziatrice.
- RNG con seme: la stessa partita con lo stesso seme e la stessa IA a regole è identica.

### Provincia

Proprietario, occupante, cultura, terreno (pianura, collina, montagna, palude), tasse,
uomini, fortificazione (0–3), malcontento, assimilazione (0–100), colonia sì/no.

### Popolo

- Governo: tribù, monarchia, repubblica, lega, città-stato.
- Tesoro, riserva di uomini.
- Stabilità da -3 a +3. Alzarla costa denaro; influisce su entrate e rivolte.
- Infamia. Sopra la soglia (`balance.json`, iniziale 20) i vicini ottengono un pretesto
  di guerra contro di lui e le relazioni peggiorano: si formano coalizioni.
- Tre slider da -5 a +5: patrizi↔plebe, offensiva↔difensiva, accentramento↔autonomia
  degli alleati. Uno spostamento ogni 10 anni, come in EU2.
- Relazioni da -200 a +200, alleanze, foedus, tributi, tregue, pretesti di guerra.
- Tratti nazionali: pochi bonus numerici (es. Roma: +reclute, assimilazione più rapida,
  recupero della stabilità; Sanniti: bonus in montagna, malus negli assedi).
- Carattere: un testo breve per Jev (es. "montanari bellicosi, diffidenti verso le città").
- Etichetta di difficoltà: Facile, Normale, Difficile, Molto difficile. È un dato in
  `popoli.json`, verificato e corretto con il bench.

### Eserciti e guerra

- Esercito: proprietario, posizione, fanteria, cavalleria, morale, percorso.
- Battaglia su più giorni. Ogni giorno ogni parte tira 0–9 e somma i modificatori
  (terreno, slider, stabilità, tratti). Il tiro decide le perdite inflitte e il calo di
  morale. Chi arriva a morale 0 si ritira in una provincia amica vicina.
- Assedio: ogni giorno una probabilità di resa che dipende dalla fortificazione e dal
  rapporto di forze.
- Punteggio di guerra da -100 a +100: province occupate (in proporzione al loro valore)
  più battaglie vinte.
- Pace: chi propone sceglie le richieste (province, tributo, foedus). Ogni provincia
  costa punteggio in proporzione alle tasse, e infamia (di più se di cultura diversa).
- Dopo la pace, tregua di 5 anni tra le parti.
- Dichiarare guerra senza pretesto costa stabilità.

### Diplomazia

Azioni con costo in denaro e tempo di attesa: dichiarare guerra, proporre alleanza,
proporre foedus (solo verso popoli molto più deboli con buone relazioni; il popolo
federato dà una quota di uomini e segue in guerra), chiedere tributo, ultimatum (richiesta
di una provincia; il rifiuto dà un pretesto), ambasceria (migliora le relazioni).

### Governo

- Il governo cambia solo per evento (es. cacciata del re per una monarchia con stabilità
  bassa; la condizione storica per Roma è attorno al 509 a.C.).
- Il governo modifica entrate, stabilità di equilibrio e azioni disponibili (una lega
  può federare più facilmente, una repubblica ha malus al cambio di slider).

### Cultura e assimilazione

- Malcontento di base più alto se la cultura della provincia è diversa da quella del
  proprietario. Lo modificano stabilità, slider e occupazione.
- Ogni mese c'è una probabilità di rivolta legata al malcontento: nasce un esercito
  ribelle. Se i ribelli tengono la provincia per un anno, la provincia torna indipendente
  (al popolo originario, se esiste ancora; altrimenti ne nasce uno).
- L'assimilazione sale ogni mese. A 100 la provincia prende la cultura del proprietario.
- Colonia: costa denaro e uomini, accelera l'assimilazione. Per Roma e i Latini si chiama
  "colonia latina".

### Eventi

- File `public/data/eventi/*.json`. Ogni evento ha:
  - condizioni: intervallo di anni, popolo/cultura/governo, possesso di province,
    stabilità, in guerra sì/no, probabilità mensile, una volta sola o ripetibile;
  - opzioni con effetti in un mini-linguaggio (`stabilita`, `tesoro`, `infamia`,
    `cede_provincia`, `crea_popolo`, `cambia_governo`, `relazione`…);
  - un suggerimento per l'IA.
- Eventi generici (carestia, rivolta, alleanza matrimoniale) per tutti.
- Eventi storici con condizioni larghe, così funzionano anche per chi non è Roma: ratto
  delle Sabine, cacciata dei Tarquini, sacco gallico, guerre sannitiche.
- Popoli dormienti, attivati da `crea_popolo`: colonie greche (Siracusa 734, Reggio, Sibari,
  Crotone, Taranto 706, Locri, Gela), Lucani, Bruzi, Galli nel IV secolo. Una colonia
  greca prende una provincia costiera dal popolo che la possiede.
- Evento del giocatore: finestra che mette in pausa finché non sceglie.
- Evento di un popolo IA: scelta di Jev (o della regola).

### Fine partita

Al 264 a.C. il gioco si ferma e mostra la classifica per punteggio: somma delle tasse
delle province possedute più un bonus per le province di cultura propria.

## 4. Mappa e dati

### Generazione (`tools/build-map.js`, eseguito una volta)

1. Costa d'Italia e Sicilia da Natural Earth 10m (dominio pubblico).
2. Sardegna e Corsica disegnate in grigio come "terra incognita", non raggiungibili.
3. `data/centri.json`: circa 120 centri con nome, coordinate, terreno, tasse, uomini,
   fortificazione, cultura, proprietario nel 753.
4. Voronoi sui centri, tagliato sulla costa.
5. Confinanze dai lati condivisi. Collegamenti aggiunti a mano (stretto di Messina) e
   tagli a mano (cresta alpina) dichiarati in `centri.json`.
6. Uscita `public/data/map.json`: poligoni semplificati, centro, vicini.

Spostare un centro e rigenerare corregge i confini.

### Popoli nel 753 (circa 30)

Roma, Lega latina (Alba Longa), Sabini, Falisci, città etrusche separate (Veio, Caere,
Tarquinia, Vulci, Volsinii, Chiusi, Volterra…), Umbri, Piceni, Volsci, Equi, Ernici,
Aurunci, Sanniti, Opici/Campani, Enotri, Iapigi/Messapi, Dauni, Veneti, Liguri, Siculi,
Sicani, Elimi, Fenici (Mozia), Cuma. Tutta la terraferma ha un proprietario.

### Fonti

Natural Earth per la geografia. Date e fondazioni scritte a mano e controllate sulle
principali (Siracusa 734, Taranto 706, cacciata dei Tarquini 509, sacco gallico 390).

## 5. IA e Jev

### Due livelli

- **Codice (IA a regole):** percorsi, scelta della fortezza da assediare dato l'obiettivo,
  reclutamento, bilancio. Le stesse regole prendono anche le decisioni strategiche quando
  Jev non c'è.
- **Jev:** decisioni strategiche. Il codice prepara le opzioni con i fatti già calcolati
  (rapporto di forze, alleati, pretesti, infamia, carattere del popolo).

### Domande a Jev

| Decisione | Tipo | Opzioni |
|---|---|---|
| Guerra | `choice` | vicini attaccabili + "nessuna guerra" |
| Pace ricevuta | `noul` | accetta / rifiuta |
| Alleanza o foedus ricevuti | `noul` | accetta / rifiuta |
| Obiettivo dell'esercito | `choice` | opzioni con significato diverso: "difendi la capitale", "assedia Veio", "attacca l'esercito sannita" |
| Slider (una volta l'anno, se consentito) | `choice` | slider e verso, oppure nessuno |
| Evento | `choice` | opzioni dell'evento |

Il percorso, i numeri e le soglie li calcola il codice. Jev sceglie tra opzioni di
significato diverso (regola dai progetti Jev precedenti: le scelte fini collassano su
un'opzione sola).

### Interpretazione

- Guerra, pace, alleanze, obiettivi: si prende l'opzione più probabile.
- Incertezza: se l'opzione migliore è sotto 0,5 e il distacco dalla seconda è sotto 0,15,
  si sceglie l'opzione prudente (nessuna guerra, rifiuta, difendi la capitale).
- Scelte di evento e di slider: si estrae dalle probabilità con temperatura 0,8.

### Quando si chiede

- Revisione strategica una volta a stagione per popolo, a giorni sfalsati, **solo se il
  popolo ha qualcosa da decidere**: un vicino attaccabile (confinante, non alleato, non in
  tregua), una guerra in corso o una proposta in attesa.
- In più: proposte ricevute ed eventi, quando capitano.
- Le domande di una revisione partono in una sola richiesta.
- Coda con al massimo 4 richieste in parallelo. Una risposta che arriva dopo più di 60
  giorni di gioco viene scartata, perché lo stato è cambiato: decide la regola.
- Finché la risposta non arriva, il popolo continua il piano attuale. Il gioco non
  aspetta mai.
- Stima per una partita completa: circa 30.000 chiamate, circa 2–3 $.

### Registro e pannello

- Ogni chiamata viene registrata: popolo, data, domanda, opzioni, probabilità, scelta, e
  se ha deciso Jev o la regola.
- Il pannello "Consiglio di Jev" mostra il flusso con le barre delle probabilità,
  filtrabile per popolo.
- Il registro permette di rivedere una partita: il bench può rigiocarla usando le
  risposte registrate invece di richiamare Jev.

### Modalità IA (scelta all'inizio)

Jev, regole, oppure misto (metà dei popoli con Jev, metà con le regole).

## 6. Interfaccia

- **Schermata iniziale:** mappa dei popoli; clic su un popolo per la scheda (difficoltà,
  tratti, carattere). Seme e modalità IA.
- **Barra in alto:** data in a.C. e AUC, tesoro, uomini, stabilità, infamia, velocità.
- **Mappa:** zoom e trascinamento. Modalità politica, cultura, terreno, relazioni.
- **Provincia:** scheda con tasse, fortificazione, cultura, malcontento, assimilazione;
  azioni colonia e fortificazione.
- **Eserciti:** clic sinistro seleziona, clic destro muove, percorso disegnato.
- **Pannello del popolo** a schede: governo e slider, diplomazia, eserciti e
  reclutamento, guerre e proposta di pace.
- **Eventi del giocatore:** finestra con pausa.
- **Consiglio di Jev:** pannello a destra, richiudibile.
- **Salvataggi:** automatico in localStorage ogni anno di gioco, più esportazione e
  importazione JSON. Ogni accesso a localStorage è protetto da try/catch.
- **Stile:** mappa antica color pergamena, testi in italiano. Solo desktop.

## 7. Errori

- Jev in timeout o in errore: decide la regola, e il pannello mostra "regola (Jev non
  disponibile)".
- Manca `TYPESAFE_API_KEY`: il gioco parte in modalità regole con un avviso visibile.
- Salvataggio non valido all'importazione: messaggio chiaro, la partita in corso resta.
- Evento con riferimenti sbagliati: lo blocca il validatore prima che il gioco parta.

## 8. Test e bench

`node --test`:

- Simulazione: battaglia, assedio, punteggio di guerra, pace, infamia, stabilità,
  assimilazione, rivolta.
- Mappa: ogni provincia ha almeno un vicino, la terraferma (Sicilia compresa via stretto)
  è un solo grafo connesso.
- Eventi: ogni riferimento esiste, ogni effetto è noto.
- Domande a Jev: dato uno stato, `questions.js` produce le opzioni attese; interpretazione
  delle probabilità (regola di incertezza, estrazione).
- Determinismo: stesso seme con IA a regole uguale stesso stato dopo 100 anni.

`bench.js` (headless):

- **Regole:** N partite con semi diversi, costo zero. Per ogni popolo: sopravvivenza e
  crescita. Serve a tarare la difficoltà; il controllo minimo è che Roma risulti più
  facile dei Volsci.
- **Jev contro regole:** modalità mista su 100 anni, per contenere i costi.

## 9. Tappe

1. Mappa, simulazione base e IA a regole, senza UI. Il bench a regole funziona.
2. UI giocabile.
2b. Mappa realistica e truppe animate (sezione 10).
3. Jev e pannello Consiglio.
4a. Diplomazia (sezione 11).
4b. Governo, slider, cultura, rivolte, colonie, fortificazioni.
5. Eventi e popoli dormienti.
6. Taratura della difficoltà.

I valori numerici iniziali (perdite, soglie, costi) stanno in `public/data/balance.json`
e si correggono con il bench, non nel codice.

## 10. Tappa 2b: mappa realistica e truppe animate (aggiunta del 2026-10-12)

Chiesta dall'utente dopo aver provato la tappa 2; inserita prima della diplomazia.

### Mappa: rilievo vero con tratto da carta antica

- Rilievo da dati di elevazione reali (terrain tiles AWS, SRTM, zoom 8, circa 600 m per pixel),
  ombreggiato con luce da nord-ovest, proiettato come la mappa e colorato in seppia (pianure chiare,
  rilievi caldi, vette quasi bianche). Generato una volta (`tools/build-relief.js`) in
  `public/img/rilievo.jpg` (circa 3000×3600 px).
- Fiumi e laghi veri da Natural Earth 10m (più il supplemento europeo), in `map.json`.
- Confini tra province irregolari: ogni lato condiviso viene spostato poco (al massimo il 12% della
  lunghezza) in modo deterministico, uguale per le due province.
- Disegno a strati: mare color carta con linee di costa ripetute; rilievo; velatura trasparente del
  colore del popolo (o della cultura, o delle relazioni); tratteggio sottile tra province; linea
  spessa tra popoli diversi; fiumi e laghi a inchiostro; nomi in corsivo allo zoom alto.
  La modalità "terreno" sparisce: il rilievo la rende superflua.
- La mappa di base si ridisegna solo quando cambiano vista o confini; gli eserciti hanno uno strato
  a parte, ridisegnato a ogni fotogramma.

### Truppe: soldatini animati e comandi come in EU

- Soldatino vettoriale (fante con elmo, scudo nel colore del popolo, lancia), numero di uomini e
  barretta del morale sotto; alone quando è selezionato; a ventaglio se più eserciti stanno in una
  provincia.
- La posizione si interpola tra le province durante la marcia (giorni mancanti più la frazione di
  giorno dell'orologio); il soldatino guarda dove va e fa il passo. In battaglia le due figure si
  fronteggiano e colpiscono; in assedio compare una tenda.
- Percorso a frecce con i giorni di marcia di ogni tappa.
- Comandi: clic seleziona; Maiuscolo+clic aggiunge o toglie; Maiuscolo+trascinamento seleziona col
  rettangolo; clic destro manda tutti i selezionati; Esc deseleziona.
- Nuovi comandi della simulazione: `unisci` (eserciti propri, fermi, nella stessa provincia; morale
  medio pesato sugli uomini) e `dividi` (a metà, ogni metà con almeno 100 uomini). L'IA non li usa.

## 11. Tappa 4a: diplomazia (aggiunta del 2026-10-13)

La tappa 4 è divisa in 4a (diplomazia, questa sezione) e 4b (governo, slider, cultura, rivolte, colonie,
fortificazioni: sezione 3).

- **Relazioni** simmetriche da −200 a +200 per ogni coppia di popoli; base 0, +30 se stessa cultura;
  −100 quando scoppia una guerra fra due; ogni mese, fuori dalle guerre, tornano di 1 verso la base.
- **Ambasceria**: costa denaro, +25 alla relazione, una volta l'anno per popolo.
- **Alleanze** (al massimo 3): si propongono e l'altro accetta o rifiuta. Gli alleati attraversano le terre
  l'uno dell'altro e combattono insieme. Rompere un'alleanza costa relazione.
- **Guerre a più popoli**: quando A dichiara guerra a B entrano subito, dalla parte di B, i suoi alleati, i suoi
  federati, il suo protettore e la coalizione contro A (se A è sopra la soglia d'infamia). Dalla parte di A entrano
  i suoi federati; i suoi alleati ricevono una **chiamata alle armi**: chi rifiuta rompe l'alleanza e perde relazione.
  La pace la firma il capofila di ogni lato e chiude la guerra per tutti.
- **Foedus**: proposto da un popolo almeno 3 volte più forte, confinante, con relazioni ≥ 50. Il federato non
  dichiara guerre e non stringe alleanze, segue il protettore in guerra e gli manda ogni mese il 20% degli uomini
  che recluta.
- **Tributo**: chiesto a un vicino; se accetta paga per 10 anni il 20% delle entrate mensili; se rifiuta, chi lo
  chiede ottiene un pretesto di guerra per 5 anni.
- **Ultimatum**: richiesta di una provincia confinante (non l'ultima). Se accettato la provincia passa (con infamia);
  se rifiutato, pretesto per 5 anni.
- **Pretesto**: oltre all'infamia sopra soglia, anche un tributo o un ultimatum rifiutati danno un pretesto.
- **Coalizione**: chi supera la soglia d'infamia ha contro i vicini con relazioni negative, che entrano insieme in
  difesa se attacca uno di loro.
- **IA a regole**: accetta o rifiuta per tipo (relazioni e rapporti di forze); iniziative una alla volta nei giorni
  di revisione: foedus a un vicino debole, alleanza contro una minaccia, ultimatum al posto della guerra contro un
  vicino molto più debole, ambasceria al vicino più forte.
- **Jev**: per i popoli che guida decide se accettare alleanze, foedus, tributi, ultimatum e chiamate alle armi
  (scelta tra "accetta" e "rifiuta" con la situazione nello stato).
- **Interfaccia**: scheda Diplomazia con tutti i popoli (confinanti prima), barra della relazione, stato e bottoni
  con il motivo quando un'azione non si può fare; finestra per ogni proposta ricevuta; modalità "relazioni" con
  alleati, federati e coalizione.

# Prompt di implementazione — nuove feature calcetto-squadre

**Data:** 2026-07-02 · **File coinvolti:** `calcetto-squadre.jsx` e `calcetto-squadre.html` (logica identica in entrambi, `.html` mantiene la skin "Stadio di Notte") · **Riferimento:** `CLAUDE.md`

Usa questo prompt così com'è per far implementare le feature qui sotto in una sessione di coding.

---

## Contesto per l'agente

Single-file React team-splitter per il calcetto del giovedì, UI in italiano. `calcetto-squadre.jsx` è il sorgente "nudo"; `calcetto-squadre.html` è la stessa app (React+Babel inline via CDN, no build) con lo skin "Stadio di Notte" sopra. Le due copie devono restare comportamentalmente identiche: stessa logica, stessi dati, stesso `STORAGE_KEY`/nuove chiavi di storage — cambia solo il CSS/markup di presentazione.

Non toccare `allSplits` se non per il punto 1 qui sotto (unica modifica ammessa all'algoritmo). Non introdurre build tooling, dipendenze npm, o backend: resta tutto client-side con `window.storage`.

---

## 1. Bilanciamento portiere

Non esistono ruoli fissi in rosa. Aggiungi solo l'attitudine in porta, con 3 livelli.

**Dati:** nuovo campo su ogni player, `gkLevel: "good" | "average" | "poor"`, default `"average"`. Migra i giocatori già salvati che non hanno il campo trattandoli come `"average"` (fallback in lettura, non serve una migrazione distruttiva dello storage).

**UI — RosterView:** accanto allo slider del livello, aggiungi la domanda "È bravo in porta?" con 3 opzioni selezionabili (bottoni o segmented control): **Sì / Normale / No**, mappate su `good` / `average` / `poor`. Stesso trattamento sia nel form "Aggiungi giocatore" sia nella riga di modifica di ogni giocatore esistente.

**Algoritmo — `bestBalancedSplits`:** il bilanciamento per rating resta il criterio primario, invariato. Il portiere è un criterio secondario applicato *dentro* il pool già selezionato per rating:

1. Calcola il pool come oggi (per differenza di rating, con l'allargamento di tolleranza esistente).
2. Assegna un peso numerico a `gkLevel`: `good = 2, average = 1, poor = 0`. Per ogni split del pool calcola `gkDiff = |gkSumA - gkSumB|`.
3. Restringi il pool ai candidati con `gkDiff` minimo. Se il sotto-pool risultante ha meno di 4 candidati, allarga includendo il livello di `gkDiff` successivo (stesso pattern di allargamento già usato per il rating), fino a coprire tutto il pool originale se necessario — non deve mai azzerare la varietà del sorteggio.
4. Il pool finale (bilanciato per rating, poi per portiere) è quello da cui `runDraw` pesca casualmente, esattamente come oggi.

Se tutti i presenti hanno `gkLevel = "average"` il comportamento deve essere identico a oggi (gkDiff sempre 0, nessun restringimento effettivo) — verifica questo caso come test di non-regressione.

---

## 2. Condividi su WhatsApp

Dopo un sorteggio, bottone "Condividi" nella MatchView che genera un testo tipo:

```
Calcetto del Giovedì
Rossa: Nome1, Nome2, Nome3
Blu: Nome1, Nome2, Nome3
```

Usa `navigator.share` se disponibile (share sheet nativa su mobile); fallback a link `https://wa.me/?text=<encoded>` se `navigator.share` non c'è; in ogni caso offri anche un tasto "Copia testo" via clipboard come ulteriore fallback silenzioso (niente permessi bloccanti). Il testo non deve includere dati sensibili, solo nomi e squadre.

---

## 3. Scambio manuale post-sorteggio

Dopo che `result` è popolato, permetti di correggere il sorteggio a mano senza rifare tutto da capo.

**Interazione:** click/tap su un chip giocatore lo seleziona (stato visivo evidenziato); click su un chip nella squadra *opposta* scambia i due giocatori tra le squadre (swap, non move) e ricalcola live media e punteggio di entrambe le TeamCard. Click sullo stesso chip selezionato lo deseleziona. Click su un chip nella stessa squadra del selezionato non fa nulla (o sposta la selezione su quel chip).

Lo swap modifica solo lo stato locale `result` corrente — non tocca il pool, non viene ripescato dal draw, e non è persistito nello storico finché non viene esplicitamente salvato (vedi punto 5).

---

## 4. Giocatore ospite one-shot

Nella sezione "Chi c'è oggi" della MatchView, aggiungi un piccolo form inline per aggiungere un giocatore *solo per questa serata*: nome, livello (stesso slider), "è bravo in porta?" (stesse 3 opzioni del punto 1).

L'ospite entra normalmente in `players`/`presentIds` per poter essere sorteggiato, ma va marcato con `isGuest: true`. Nell'effetto di persistenza che scrive su `window.storage`, filtra fuori i giocatori con `isGuest: true` prima di salvare — così la rosa permanente non si sporca e l'ospite sparisce da solo al prossimo reload, senza bisogno di rimuoverlo a mano.

---

## 5. Storico partite + contatore presenze

**Salvataggio:** aggiungi un bottone esplicito "Salva formazione" (visibile solo quando `result` esiste, dopo eventuali swap manuali) che scrive un record in una nuova chiave di storage, es. `calcetto-history`: `{ date, groupA: [{id, name}], groupB: [{id, name}], sumA, sumB }`. Non salvare automaticamente a ogni reshuffle/flicker — solo su azione esplicita dell'utente, così lo storico riflette le squadre realmente giocate.

Mantieni al massimo le ultime ~30 partite (tronca le più vecchie) per non far crescere lo storage all'infinito.

**Vista storico:** nuova tab "Storico" (terza, accanto a "Oggi"/"Rosa") con elenco delle partite salvate, più recenti in cima: data, squadra rossa vs blu con nomi.

**Contatore presenze:** in RosterView, accanto a ogni giocatore, mostra un badge col numero di partite salvate in cui compare (derivato al volo dallo storico, nessuno stato duplicato da mantenere sincronizzato).

---

## Fuori scope (non implementare in questo giro)

Split in 3+ squadre, nomi/colori squadra personalizzabili, PWA/installabilità. Sono idee valutate ma rimandate — non aggiungerle nemmeno come toggle nascosti.

## Criteri di accettazione (verifica manuale)

- Con tutti i presenti a `gkLevel = "average"`, il sorteggio produce lo stesso identico comportamento di prima (nessuna regressione).
- Con presenti che hanno mix di `good`/`average`/`poor`, il sorteggio preferisce split che bilanciano sia il rating sia il livello portiere, senza mai violare il bilanciamento del rating.
- Aggiungere un ospite, sorteggiare, ricaricare la pagina: l'ospite non è più in rosa, il resto della rosa è intatto.
- Scambiare due giocatori dopo il sorteggio aggiorna correttamente medie e punteggi di entrambe le squadre.
- Condividi genera un testo leggibile e corretto per entrambe le squadre.
- Salvare una formazione la fa comparire nella tab Storico e incrementa il contatore presenze dei giocatori coinvolti.
- `calcetto-squadre.jsx` e `calcetto-squadre.html` restano allineati: stessa logica, stessi dati, stessa UX — cambia solo il CSS.

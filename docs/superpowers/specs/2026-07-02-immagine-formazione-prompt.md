# Prompt di implementazione — immagine formazione su campo

**Data:** 2026-07-02 · **File coinvolti:** `calcetto-squadre.jsx` e `calcetto-squadre.html` · **Dipende da:** `docs/superpowers/specs/2026-07-02-nuove-feature-prompt.md` (punto 2, "Condividi su WhatsApp") — questa feature **sostituisce** quella condivisione testuale con un'immagine, mantenendo il testo solo come fallback secondario.

Usa questo prompt così com'è in una sessione di coding.

---

## Obiettivo

Quando una formazione è pronta (dopo il sorteggio, eventuali scambi manuali), generare un'immagine con i giocatori disposti su un campo da calcio stilizzato — coerente con la palette "Stadio di Notte" — pronta da condividere su WhatsApp/social invece del solo testo.

## Vincoli

- Niente librerie esterne per il rendering: usa `<canvas>` e Canvas 2D API native, nessun asset immagine da caricare (tutto disegnato via codice — rettangoli, archi, linee, testo). Niente build tooling, resta tutto nel file singolo.
- Stessa logica di disegno duplicata in `.jsx` e `.html`; la palette colori del canvas va hardcodata come costanti JS (il canvas non legge le custom property CSS), mantenendo gli stessi hex già in uso: pitch `#1B4332`/`#0A1F12`, oro `#F2B705`, rosso squadra `#E4485A`, blu squadra `#3D8BD4`, crema `#F5F1E8`.
- Il posizionamento dei giocatori sul campo è **puramente estetico**: nessun giocatore va assegnato a una zona di campo in base a rating o `gkLevel`. Non esistono ruoli/posizioni in questa app (vedi CLAUDE.md e prompt precedente) — l'algoritmo di layout deve essere agnostico, basato solo sul numero di giocatori per squadra, non su chi sono.
- **L'immagine condivisa non deve mostrare nessun dato numerico**: niente rating dei singoli giocatori, niente media/punteggio di squadra, da nessuna parte nel canvas (né sui pallini, né come footer/scoreboard). Solo nomi giocatori, etichette squadra (Rossa/Blu), titolo e data. Questo vincolo vale solo per l'immagine generata da "Condividi" — la vista a schermo con TeamCard/rating/media resta invariata, non toccarla.

---

## 1. Disegno del campo

Canvas verticale, es. 1080×1350 (buon formato per condivisione mobile/status). Campo a tutta altezza, linea di metà campo orizzontale al centro, Squadra Rossa nella metà superiore, Squadra Blu nella metà inferiore (specchiata). Disegna: perimetro campo, area di rigore/porta stilizzata a ciascuna estremità, cerchio di centrocampo sulla linea mediana, eventuale texture a strisce del prato (bande verdi alternate leggermente più chiare/scure) per dare profondità. Linee bianche translucide (`rgba(255,255,255,0.5)` circa), stesso mood "riflettori" del resto dell'app (va bene una leggera vignette radiale anche qui).

Header sopra il campo: titolo "Calcetto del Giovedì" + data formattata in italiano (es. "Giovedì 2 Luglio 2026", calcolata da `Date`). Niente footer con punteggio o medie: l'immagine si chiude col campo, al massimo un piccolo claim/logo testuale se serve riempire lo spazio, ma nessun numero legato ai giocatori o alle squadre.

## 2. Posizionamento giocatori

Funzione di layout deterministica basata solo su `n` = numero di giocatori nella squadra, che restituisce righe con distribuzione bilanciata (solo per evitare sovrapposizioni e avere un aspetto ordinato tipo "foto squadra dall'alto"), es. `n=5 → [2,2,1]`, `n=6 → [3,2,1]` o `[2,2,2]`, `n=7 → [3,2,2]`, generalizzabile con una formula semplice (righe = `ceil(sqrt(n))`, distribuisci `n` il più uniformemente possibile tra le righe) invece di una lookup table fissa se preferisci — l'importante è che sia indipendente dai dati del giocatore. Specchia verticalmente la disposizione della squadra Blu rispetto alla Rossa.

Ogni giocatore: pallino colore squadra + nome sotto (Barlow Condensed, testo crema con leggero contorno/ombra scura per leggibilità sopra il prato). Niente rating, niente numeri sul pallino o accanto al nome. Tronca con ellissi i nomi troppo lunghi per evitare overlap. Facoltativo: piccola icona guanto/indicatore discreto solo sui giocatori con `gkLevel: "good"` — nice-to-have, non bloccante se aumenta troppo la complessità (non è un numero, quindi non rientra nel vincolo sopra).

## 3. Generazione e font

Prima di disegnare, assicurati che i font siano caricati (`document.fonts.ready`) — altrimenti il canvas disegna il testo col font di default al primo render, dato che Barlow Condensed è caricato via Google Fonts link e il canvas non aspetta automaticamente il caricamento webfont.

## 4. Condivisione

Sostituisci/aggiorna il bottone "Condividi" esistente (punto 2 del prompt precedente):

1. Genera il canvas, mostra un'anteprima (piccolo overlay/modal con l'immagine) prima di condividere, con possibilità di chiudere.
2. Se `navigator.canShare({ files: [...] })` è supportato: converti il canvas in Blob → `File` → `navigator.share({ files: [file], title, text })`, così l'immagine va dritta nella share sheet nativa (WhatsApp, Instagram, ecc.).
3. Fallback se il file-share non è supportato: scarica il PNG (`<a download>` con `canvas.toDataURL("image/png")`), più un tasto secondario "Copia testo" che genera il vecchio riepilogo testuale come ulteriore fallback (anche il testo di fallback non deve includere rating/media, solo nomi e squadre — coerenza col vincolo dell'immagine).
4. Nel file `.jsx`, verifica che l'ambiente host supporti `navigator.share`/`URL.createObjectURL`/download via anchor — se l'host è sandboxato e queste API non sono disponibili, il fallback minimo è mostrare comunque il canvas a schermo (anteprima visibile) così l'utente può fare uno screenshot manuale.

---

## Criteri di accettazione (verifica manuale)

- Con squadre di dimensioni diverse (es. 5 vs 4), il layout non genera overlap tra pallini/etichette in nessuna delle due metà campo.
- Nomi lunghi non escono dai bordi del canvas.
- L'immagine generata rispecchia la palette Stadio di Notte (stessi colori/font del resto dell'app).
- **Nessun numero visibile sull'immagine condivisa**: né rating dei giocatori, né media/punteggio di squadra — solo nomi, etichette Rossa/Blu, titolo e data. Il testo di fallback (copia testo) segue la stessa regola.
- La vista a schermo (TeamCard con rating e media) resta identica a prima: il vincolo "niente numeri" vale solo per l'immagine/testo condivisi, non per l'app.
- Su un browser mobile con Web Share API supportata, tap su "Condividi" apre la share sheet nativa con l'immagine allegata; su desktop (senza file-share) parte il download del PNG.
- Il posizionamento dei giocatori non dipende mai da rating o `gkLevel` — solo dal conteggio per squadra.
- `.jsx` e `.html` producono la stessa immagine (stessa logica di disegno, stessa palette), a meno delle differenze di ambiente host già note.

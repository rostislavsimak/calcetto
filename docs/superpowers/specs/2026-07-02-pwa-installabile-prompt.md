# Prompt di implementazione — rendere installabile calcetto-squadre.html (PWA)

**Data:** 2026-07-02 · **File coinvolti:** solo `calcetto-squadre.html` + nuovi file accanto (`manifest.json`, icone, `sw.js`). **`calcetto-squadre.jsx` non va toccato**: gira in un host che fornisce già React/storage, non è una pagina standalone da installare — questo prompt è scope solo per la versione HTML pensata per essere ospitata e aperta da browser mobile.

Usa questo prompt così com'è in una sessione di coding.

---

## Obiettivo

Uso singolo utente (solo l'organizzatore). Rendere `calcetto-squadre.html` installabile come app su iOS/Android via "Aggiungi a Home Screen": icona propria, apertura a schermo intero senza barra del browser, funzionamento anche offline dopo il primo caricamento. Nessun cambiamento alla logica React esistente (roster, sorteggio, storage) — solo plumbing PWA attorno al file già esistente.

## Vincoli

- Nessuna build tooling, nessuna dipendenza npm: `manifest.json`, le icone e `sw.js` sono file statici semplici accanto a `calcetto-squadre.html`, tutto servibile da un host statico qualsiasi (Netlify Drop, GitHub Pages, ecc.).
- Palette da rispettare per icone/colori del manifest, stessa già in uso nel file (vedi `:root` in cima al `<style>`): `--pitch-deep: #05130B`, `--pitch: #0A1F12`, `--pitch-surface: #1B4332`, `--gold: #F2B705`, `--team-red: #E4485A`, `--team-blue: #3D8BD4`, `--cream: #F5F1E8`.
- Non modificare la logica dell'app dentro `<script type="text/plain" id="app-src">` (il codice React/JSX compilato via Babel a runtime) — solo l'`<head>`, i tag prima di `</body>`, e i nuovi file.

---

## 1. `manifest.json`

Crea un file `manifest.json` accanto a `calcetto-squadre.html` con almeno:

- `name`: "Calcetto del Giovedì — Squadre", `short_name`: "Squadre" (per lo spazio limitato sotto l'icona in home screen).
- `start_url`: `"."` (o il nome del file se non si chiama `index.html` — vedi nota sotto).
- `display`: `"standalone"`.
- `orientation`: `"portrait"`.
- `background_color`: `"#05130B"` (pitch-deep, coerente con lo sfondo dell'app al primo caricamento/splash).
- `theme_color`: `"#0A1F12"` (colore barra di stato su Android).
- `icons`: due voci PNG, 192×192 e 512×512, `"purpose": "any maskable"`.

## 2. Icone

Genera due PNG (192×192 e 512×512) coerenti con l'estetica "Stadio di Notte": sfondo verde campo (`--pitch-surface` o `--pitch-deep`), un elemento centrale semplice in oro (`--gold`) — va bene un pallone stilizzato, una "S" condensata (stesso font Barlow Condensed già in uso), o il cerchio di centrocampo minimal. Nessun testo piccolo/illeggibile alla dimensione icona. Devono avere margine sufficiente per il crop "maskable" (Android ritaglia le icone in forme diverse — contenuto importante entro l'80% centrale).

Salva come `icon-192.png` e `icon-512.png`.

## 3. Meta tag nell'`<head>` di `calcetto-squadre.html`

Aggiungi, dopo il `<title>` esistente e prima/dopo i tag Google Fonts già presenti:

- `<link rel="manifest" href="manifest.json" />`
- `<meta name="theme-color" content="#0A1F12" />`
- `<link rel="apple-touch-icon" href="icon-192.png" />` (iOS non legge bene il manifest da solo per l'icona home screen, serve questo tag esplicito)
- `<meta name="apple-mobile-web-app-capable" content="yes" />`
- `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />`
- `<meta name="apple-mobile-web-app-title" content="Squadre" />`

## 4. Service worker per funzionamento offline

Crea `sw.js` accanto al file HTML con una cache-strategy minimale "cache-first, network fallback" per l'app shell: al primo `install` mette in cache `calcetto-squadre.html`, `manifest.json`, le icone, e (se possibile farlo senza rompere l'integrità della richiesta cross-origin) gli script CDN già in uso (React, ReactDOM, Babel standalone, Tailwind, i font Google). Se il caching delle risorse CDN esterne risulta complesso per via di CORS/opacità della risposta, va bene anche mettere in cache solo l'app shell locale (HTML + manifest + icone) e lasciare che gli script esterni passino sempre dalla rete — l'importante è che l'interfaccia si apra comunque (anche se degradata, es. senza Tailwind) in assenza di connessione, invece di una pagina bianca di errore.

Registra il service worker con uno snippet minimale prima della chiusura di `</body>`, dopo lo script di mount esistente:

```html
<script>
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
</script>
```

Il `.catch(() => {})` è voluto: se la registrazione fallisce (es. pagina aperta da `file://` invece che da un host reale) l'app deve continuare a funzionare normalmente senza service worker, solo senza il beneficio offline.

## 5. Nota sul nome file per il deploy

Molti host statici (Netlify Drop incluso) servono automaticamente `index.html` come pagina di radice. Non serve rinominare `calcetto-squadre.html` nel repo/cartella di sviluppo — al momento del deploy basta includere anche una copia chiamata `index.html` (stesso contenuto) nella cartella caricata, oppure rinominare solo la copia di deploy. Questo prompt non include il deploy stesso, solo la preparazione dei file: menzionalo come nota per non bloccare chi pubblica dopo.

---

## Criteri di accettazione (verifica manuale)

- Aprendo `calcetto-squadre.html` da un host reale (non `file://`) su Chrome Android o Safari iOS, il browser offre "Aggiungi a Home Screen" / mostra il prompt di installazione.
- Dopo l'installazione, l'icona in home screen usa `icon-192.png`, non l'icona di default del browser.
- Aprendo l'app installata, parte a schermo intero (`standalone`), senza barra indirizzi del browser.
- Con connessione disattivata dopo aver aperto l'app almeno una volta online, riaprendola mostra comunque l'interfaccia (anche se con eventuali risorse esterne mancanti), non una pagina di errore del browser.
- Nessuna regressione alla logica esistente: rosa, presenze, sorteggio, storico, condivisione funzionano esattamente come prima.
- `calcetto-squadre.jsx` è invariato.

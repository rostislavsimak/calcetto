# Redesign "Stadio di Notte" — calcetto-squadre.html

**Data:** 2026-07-02 · **Stato:** approvato dall'utente · **Target:** solo `calcetto-squadre.html`

## Obiettivo

Redesign puramente grafico dell'app team-splitter. Zero cambi ad algoritmo di bilanciamento, stato React, localStorage, struttura dei componenti.

## Direzione estetica

"Stadio di Notte" — campo da calcetto illuminato dai riflettori di sera.

### Fondamenta visive

- **Sfondo:** gradiente verde notte `#0A1F12` → `#05130B`, vignetta radiale chiara dall'alto (effetto riflettori), noise texture sottile (SVG feTurbulence inline, opacity ~0.03), cerchio di centrocampo + linea mediana come watermark decorativo (`rgba(255,255,255,0.04)`).
- **Palette:** verde campo `#1B4332` (superfici attive), oro `#F2B705` (CTA/accenti), rosso squadra `#E4485A`, blu squadra `#3D8BD4`, testo crema `#F5F1E8`.
- **Font:** Barlow Condensed 700/900 per titoli/nomi squadre (uppercase), Barlow 400/600 per corpo. Google Fonts. Cifre `tabular-nums` per punteggi e rating.

### Componenti

- **Header:** kicker oro con pallino pulse animato, titolo "SQUADRE" Barlow Condensed 900 ~48px.
- **Tab:** pill, glow oro sotto tab attiva, transizione 200ms.
- **Chip presenze:** bordo oro + glow quando attivo, scale 0.97 al tap, badge rating tabular.
- **Bottone sorteggio:** oro pieno, glow shadow, press scale, testo condensato grande.
- **TeamCard:** glassmorphism (backdrop-blur, bordo `rgba(255,255,255,0.08)`), barra laterale colore squadra con glow, media in cifre grandi condensate.
- **Divisore VS:** lettering condensato con linee laterali sfumate.
- **Icone:** SVG inline (✕ rimozione, reshuffle) — niente emoji come icone.

### Motion

- Entrata risultato: cards slide-up + fade staggered (rossa poi blu, delay 60ms), trigger al termine dello spin (remount via key).
- Flicker sorteggio esistente mantenuto + blur/opacity pulse durante spin.
- Micro-interazioni 150–250ms ease-out. `prefers-reduced-motion` disattiva animazioni.

### Vincoli

- Contrasto testo ≥ 4.5:1, touch target ≥ 44px.
- Nessuna modifica a: `allSplits`, `bestBalancedSplits`, `runDraw`, persistenza, testi UI italiani.
- `calcetto-squadre.jsx` resta invariato.

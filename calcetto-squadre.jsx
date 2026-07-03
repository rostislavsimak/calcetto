import { useState, useEffect, useRef } from "react";

// ---------- helpers ----------

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// Goalkeeper aptitude: secondary balancing criterion. Players saved
// before this field existed are treated as "average" on read.
const GK_WEIGHT = { good: 2, average: 1, poor: 0 };

function gkWeight(p) {
  return GK_WEIGHT[p.gkLevel] !== undefined ? GK_WEIGHT[p.gkLevel] : 1;
}

// Generate every distinct way to split `players` into two groups,
// always keeping players[0] in group A (this removes the A/B mirror
// duplicates without any extra bookkeeping).
function allSplits(players) {
  const n = players.length;
  const sizeA = Math.ceil(n / 2);
  const rest = players.slice(1); // everyone except the fixed anchor
  const results = [];

  function recurse(start, chosen) {
    if (chosen.length === sizeA - 1) {
      const groupA = [players[0], ...chosen.map((i) => rest[i])];
      const groupAIds = new Set(groupA.map((p) => p.id));
      const groupB = players.filter((p) => !groupAIds.has(p.id));
      const sumA = groupA.reduce((s, p) => s + p.rating, 0);
      const sumB = groupB.reduce((s, p) => s + p.rating, 0);
      results.push({ groupA, groupB, diff: Math.abs(sumA - sumB), sumA, sumB });
      return;
    }
    for (let i = start; i < rest.length; i++) {
      recurse(i + 1, [...chosen, i]);
    }
  }

  recurse(0, []);
  return results;
}

function bestBalancedSplits(players) {
  const splits = allSplits(players);
  const minDiff = Math.min(...splits.map((s) => s.diff));
  // small tolerance band so there's an actual pool to randomize over,
  // not just one frozen "optimal" answer every time
  let pool = splits.filter((s) => s.diff <= minDiff);
  if (pool.length < 4) {
    pool = splits.filter((s) => s.diff <= minDiff + 1);
  }

  // Secondary criterion: goalkeeper aptitude. Applied only inside the
  // rating-balanced pool, with the same widening pattern, so it never
  // overrides rating balance nor kills draw variety.
  const withGk = pool.map((s) => ({
    ...s,
    gkDiff: Math.abs(
      s.groupA.reduce((t, p) => t + gkWeight(p), 0) -
        s.groupB.reduce((t, p) => t + gkWeight(p), 0)
    ),
  }));
  const gkLevels = [...new Set(withGk.map((s) => s.gkDiff))].sort(
    (a, b) => a - b
  );
  let gkPool = withGk;
  for (const lvl of gkLevels) {
    const candidate = withGk.filter((s) => s.gkDiff <= lvl);
    if (candidate.length >= 4 || lvl === gkLevels[gkLevels.length - 1]) {
      gkPool = candidate;
      break;
    }
  }

  return { pool: gkPool, minDiff };
}

const STORAGE_KEY = "calcetto-roster";
const HISTORY_KEY = "calcetto-history";
const HISTORY_MAX = 30;

const GK_OPTIONS = [
  { value: "good", label: "Sì" },
  { value: "average", label: "Normale" },
  { value: "poor", label: "No" },
];

// Parse a typed rating ("7,5" or "7.5"), clamp to 1–10, snap to half points.
// Falls back to `fallback` when the input isn't a number.
function clampRating(raw, fallback) {
  const v = parseFloat(String(raw).replace(",", "."));
  if (isNaN(v)) return fallback;
  return Math.min(10, Math.max(1, Math.round(v * 2) / 2));
}

function buildShareText(result) {
  return (
    "Calcetto del Giovedì\n" +
    "Rossa: " +
    result.groupA.map((p) => p.name).join(", ") +
    "\n" +
    "Blu: " +
    result.groupB.map((p) => p.name).join(", ")
  );
}

// ---------- formation share card (canvas) ----------

// Canvas can't read CSS custom properties: palette hardcoded, same hex
// values as the app skin.
const CARD_W = 1080;
const CARD_H = 1350;
const CARD_C = {
  bgTop: "#0A1F12",
  bgBottom: "#05130B",
  grassA: "#1B4332",
  grassB: "#16382A",
  line: "rgba(255,255,255,0.5)",
  gold: "#F2B705",
  red: "#E4485A",
  blue: "#3D8BD4",
  cream: "#F5F1E8",
};

// Rows for one team, based only on head count — never on who the players are.
function layoutRows(n) {
  if (n <= 0) return [];
  const rows = Math.ceil(Math.sqrt(n));
  const base = Math.floor(n / rows);
  const extra = n % rows;
  return Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0));
}

function formatCardDate(d) {
  const s = d.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return s.replace(/(^|\s)(\S)/g, (m, sp, ch) => sp + ch.toUpperCase());
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + "…";
}

function drawTeamOnCard(ctx, group, color, area, mirrored) {
  const rows = layoutRows(group.length);
  const dotR = 34;
  let idx = 0;
  rows.forEach((count, r) => {
    const frac = (r + 1) / (rows.length + 1);
    const y = mirrored
      ? area.y + area.h - area.h * frac
      : area.y + area.h * frac;
    for (let i = 0; i < count; i++) {
      const p = group[idx++];
      const x = area.x + (area.w * (i + 1)) / (count + 1);
      // subtle goalkeeper hint (aesthetics only, not a field position)
      if (p.gkLevel === "good") {
        ctx.beginPath();
        ctx.arc(x, y, dotR + 7, 0, Math.PI * 2);
        ctx.strokeStyle = CARD_C.gold;
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(x, y, dotR, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 3;
      ctx.stroke();
      // no numbers on the shared image: names only
      const maxW = Math.min(area.w / (count + 1) - 16, 240);
      ctx.textAlign = "center";
      ctx.font = "700 32px 'Barlow Condensed', sans-serif";
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.85)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = CARD_C.cream;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(fitText(ctx, p.name, maxW), x, y + dotR + 38);
      ctx.restore();
    }
  });
}

function drawFormationCard(canvas, result) {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  const W = CARD_W;
  const H = CARD_H;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, CARD_C.bgTop);
  bg.addColorStop(1, CARD_C.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const headerH = 150;
  const footerH = 70;
  const margin = 60;
  const px = margin;
  const py = headerH;
  const pw = W - margin * 2;
  const ph = H - headerH - footerH;
  const midY = py + ph / 2;

  // striped grass
  const stripes = 10;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? CARD_C.grassA : CARD_C.grassB;
    ctx.fillRect(px, py + (ph / stripes) * i, pw, ph / stripes + 1);
  }

  // floodlight vignette
  const vg = ctx.createRadialGradient(
    W / 2,
    midY,
    ph * 0.2,
    W / 2,
    midY,
    ph * 0.8
  );
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = vg;
  ctx.fillRect(px, py, pw, ph);

  // pitch lines
  ctx.strokeStyle = CARD_C.line;
  ctx.lineWidth = 4;
  ctx.strokeRect(px, py, pw, ph);
  ctx.beginPath();
  ctx.moveTo(px, midY);
  ctx.lineTo(px + pw, midY);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W / 2, midY, 110, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W / 2, midY, 6, 0, Math.PI * 2);
  ctx.fillStyle = CARD_C.line;
  ctx.fill();

  // penalty + goal boxes at both ends
  const boxW = pw * 0.44;
  const boxH = 120;
  const goalW = pw * 0.2;
  const goalH = 46;
  ctx.strokeRect(W / 2 - boxW / 2, py, boxW, boxH);
  ctx.strokeRect(W / 2 - goalW / 2, py, goalW, goalH);
  ctx.strokeRect(W / 2 - boxW / 2, py + ph - boxH, boxW, boxH);
  ctx.strokeRect(W / 2 - goalW / 2, py + ph - goalH, goalW, goalH);

  // header
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = CARD_C.gold;
  ctx.font = "900 58px 'Barlow Condensed', sans-serif";
  ctx.fillText("CALCETTO DEL GIOVEDÌ", W / 2, 72);
  ctx.fillStyle = "rgba(245,241,232,0.85)";
  ctx.font = "600 34px Barlow, sans-serif";
  ctx.fillText(formatCardDate(new Date()), W / 2, 120);

  // teams: red top half, blue bottom half mirrored
  drawTeamOnCard(
    ctx,
    result.groupA,
    CARD_C.red,
    { x: px, y: py, w: pw, h: ph / 2 },
    false
  );
  drawTeamOnCard(
    ctx,
    result.groupB,
    CARD_C.blue,
    { x: px, y: midY, w: pw, h: ph / 2 },
    true
  );

  // team labels — no numbers anywhere on the shared image
  ctx.font = "700 36px 'Barlow Condensed', sans-serif";
  ctx.textAlign = "left";
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = 6;
  ctx.fillStyle = CARD_C.red;
  ctx.fillText("SQUADRA ROSSA", px + 24, py + 52);
  ctx.fillStyle = CARD_C.blue;
  ctx.fillText("SQUADRA BLU", px + 24, py + ph - 28);
  ctx.restore();
}

// ---------- main component ----------

export default function App() {
  const [players, setPlayers] = useState([]);
  const [history, setHistory] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRating, setNewRating] = useState(3);
  const [newGk, setNewGk] = useState("average");
  const [presentIds, setPresentIds] = useState(new Set());
  const [result, setResult] = useState(null); // { groupA, groupB, diff }
  const [pool, setPool] = useState([]);
  const [spinning, setSpinning] = useState(false);
  const [view, setView] = useState("match"); // "match" | "roster" | "history"
  const spinRef = useRef(null);

  // load
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(STORAGE_KEY);
        if (r && r.value) {
          setPlayers(
            JSON.parse(r.value).map((p) => ({
              ...p,
              gkLevel: p.gkLevel || "average",
            }))
          );
        }
      } catch (e) {
        // no saved roster yet
      }
      try {
        const h = await window.storage.get(HISTORY_KEY);
        if (h && h.value) setHistory(JSON.parse(h.value));
      } catch (e) {
        // no saved history yet
      }
      setLoaded(true);
    })();
  }, []);

  // persist (guests are one-night only: never written to storage)
  useEffect(() => {
    if (!loaded) return;
    window.storage
      .set(STORAGE_KEY, JSON.stringify(players.filter((p) => !p.isGuest)))
      .catch(() => {});
  }, [players, loaded]);

  function addPlayer() {
    const name = newName.trim();
    if (!name) return;
    setPlayers((p) => [
      ...p,
      { id: uid(), name, rating: Number(newRating), gkLevel: newGk },
    ]);
    setNewName("");
    setNewRating(3);
    setNewGk("average");
  }

  function addGuest(name, rating, gkLevel) {
    const id = uid();
    setPlayers((p) => [
      ...p,
      { id, name, rating, gkLevel, isGuest: true },
    ]);
    setPresentIds((s) => new Set(s).add(id));
    setResult(null);
  }

  function removePlayer(id) {
    setPlayers((p) => p.filter((pl) => pl.id !== id));
    setPresentIds((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
  }

  function updateRating(id, rating) {
    setPlayers((p) => p.map((pl) => (pl.id === id ? { ...pl, rating } : pl)));
  }

  function updateGk(id, gkLevel) {
    setPlayers((p) => p.map((pl) => (pl.id === id ? { ...pl, gkLevel } : pl)));
  }

  function togglePresent(id) {
    setPresentIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setResult(null);
  }

  function presentPlayers() {
    return players.filter((p) => presentIds.has(p.id));
  }

  function runDraw(excludeLast) {
    const present = presentPlayers();
    if (present.length < 2) return;
    const { pool: candidates } = bestBalancedSplits(present);
    setPool(candidates);

    let choices = candidates;
    if (excludeLast && result && candidates.length > 1) {
      const lastIds = result.groupA.map((p) => p.id).sort().join(",");
      const filtered = candidates.filter(
        (c) => c.groupA.map((p) => p.id).sort().join(",") !== lastIds
      );
      if (filtered.length > 0) choices = filtered;
    }

    const final = choices[Math.floor(Math.random() * choices.length)];

    // scoreboard-flicker animation: cycle through random candidates
    // a few times before landing on the real pick
    setSpinning(true);
    let ticks = 0;
    const maxTicks = 10;
    clearInterval(spinRef.current);
    spinRef.current = setInterval(() => {
      ticks++;
      if (ticks >= maxTicks) {
        clearInterval(spinRef.current);
        setResult(final);
        setSpinning(false);
        return;
      }
      const flicker = candidates[Math.floor(Math.random() * candidates.length)];
      setResult(flicker);
    }, 90);
  }

  // Manual correction: swap one player from group A with one from group B.
  // Touches only the local result — pool and history stay as they are.
  function swapInResult(idA, idB) {
    if (!result) return;
    const pA = result.groupA.find((p) => p.id === idA);
    const pB = result.groupB.find((p) => p.id === idB);
    if (!pA || !pB) return;
    const groupA = result.groupA.map((p) => (p.id === idA ? pB : p));
    const groupB = result.groupB.map((p) => (p.id === idB ? pA : p));
    const sumA = groupA.reduce((s, p) => s + p.rating, 0);
    const sumB = groupB.reduce((s, p) => s + p.rating, 0);
    setResult({ groupA, groupB, sumA, sumB, diff: Math.abs(sumA - sumB) });
  }

  function saveFormation() {
    if (!result) return;
    const record = {
      date: new Date().toISOString(),
      groupA: result.groupA.map((p) => ({ id: p.id, name: p.name })),
      groupB: result.groupB.map((p) => ({ id: p.id, name: p.name })),
      sumA: result.sumA,
      sumB: result.sumB,
    };
    const next = [record, ...history].slice(0, HISTORY_MAX);
    setHistory(next);
    window.storage.set(HISTORY_KEY, JSON.stringify(next)).catch(() => {});
  }

  function deleteHistoryRecord(index) {
    const next = history.filter((_, i) => i !== index);
    setHistory(next);
    window.storage.set(HISTORY_KEY, JSON.stringify(next)).catch(() => {});
  }

  const present = presentPlayers();
  const canDraw = present.length >= 2;

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: "linear-gradient(180deg, #0F2818 0%, #0B1F12 100%)",
        color: "#F5F1E8",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div className="max-w-md mx-auto px-4 pb-16 pt-6">
        {/* header */}
        <header className="mb-5">
          <div
            className="text-xs font-bold tracking-[0.25em] mb-1"
            style={{ color: "#F2B705" }}
          >
            CALCETTO DEL GIOVEDÌ
          </div>
          <h1 className="text-3xl font-black uppercase tracking-tight leading-none">
            Squadre
          </h1>
        </header>

        {/* tabs */}
        <div
          className="flex gap-1 p-1 rounded-xl mb-5"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          {[
            { id: "match", label: "Oggi" },
            { id: "roster", label: "Rosa" },
            { id: "history", label: "Storico" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              className="flex-1 py-2 rounded-lg text-sm font-bold uppercase tracking-wide transition-colors"
              style={{
                background: view === t.id ? "#1B4332" : "transparent",
                color: view === t.id ? "#F5F1E8" : "rgba(245,241,232,0.5)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {view === "roster" && (
          <RosterView
            players={players}
            history={history}
            newName={newName}
            setNewName={setNewName}
            newRating={newRating}
            setNewRating={setNewRating}
            newGk={newGk}
            setNewGk={setNewGk}
            addPlayer={addPlayer}
            removePlayer={removePlayer}
            updateRating={updateRating}
            updateGk={updateGk}
          />
        )}

        {view === "match" && (
          <MatchView
            players={players}
            presentIds={presentIds}
            togglePresent={togglePresent}
            present={present}
            canDraw={canDraw}
            runDraw={runDraw}
            spinning={spinning}
            result={result}
            poolSize={pool.length}
            goToRoster={() => setView("roster")}
            onSwap={swapInResult}
            saveFormation={saveFormation}
            addGuest={addGuest}
          />
        )}

        {view === "history" && (
          <HistoryView history={history} onDelete={deleteHistoryRecord} />
        )}
      </div>
    </div>
  );
}

// ---------- shared bits ----------

function GkPicker({ value, onChange }) {
  return (
    <div className="flex gap-1 flex-1">
      {GK_OPTIONS.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="flex-1 py-1.5 px-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors"
            style={{
              background: active ? "#1B4332" : "rgba(255,255,255,0.05)",
              border: active
                ? "1px solid #F2B705"
                : "1px solid rgba(255,255,255,0.1)",
              color: active ? "#F5F1E8" : "rgba(245,241,232,0.55)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- roster tab ----------

function RosterView({
  players,
  history,
  newName,
  setNewName,
  newRating,
  setNewRating,
  newGk,
  setNewGk,
  addPlayer,
  removePlayer,
  updateRating,
  updateGk,
}) {
  function presenceCount(id) {
    return history.filter(
      (h) =>
        h.groupA.some((x) => x.id === id) || h.groupB.some((x) => x.id === id)
    ).length;
  }

  return (
    <div>
      <div
        className="rounded-2xl p-4 mb-4"
        style={{ background: "rgba(255,255,255,0.06)" }}
      >
        <div className="text-xs font-bold uppercase tracking-wide mb-3 opacity-70">
          Aggiungi giocatore
        </div>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nome"
          className="w-full mb-3 px-3 py-2 rounded-lg text-sm"
          style={{
            background: "#0F2818",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "#F5F1E8",
          }}
        />
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xs opacity-70 font-bold uppercase">Livello</span>
          <input
            type="range"
            min="1"
            max="10"
            step="0.5"
            value={newRating}
            onChange={(e) => setNewRating(e.target.value)}
            className="flex-1"
          />
          <input
            type="number"
            inputMode="decimal"
            min="1"
            max="10"
            step="0.5"
            key={"new-" + newRating}
            defaultValue={newRating}
            aria-label="Livello (scrivi il punteggio)"
            onBlur={(e) =>
              setNewRating(clampRating(e.target.value, Number(newRating)))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") e.target.blur();
            }}
            className="w-12 h-7 rounded-full text-sm font-black text-center"
            style={{ background: "#F2B705", color: "#0F2818", border: "none" }}
          />
        </div>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xs opacity-70 font-bold uppercase">
            È bravo in porta?
          </span>
          <GkPicker value={newGk} onChange={setNewGk} />
        </div>
        <button
          onClick={addPlayer}
          className="w-full py-2.5 rounded-lg font-bold uppercase text-sm tracking-wide"
          style={{ background: "#1B4332", color: "#F5F1E8" }}
        >
          + Aggiungi alla rosa
        </button>
      </div>

      <div className="text-xs font-bold uppercase tracking-wide mb-2 opacity-70">
        Rosa ({players.filter((p) => !p.isGuest).length})
      </div>

      {players.filter((p) => !p.isGuest).length === 0 && (
        <div className="text-sm opacity-50 py-6 text-center">
          Nessun giocatore ancora. Aggiungine qualcuno qui sopra.
        </div>
      )}

      <div className="space-y-2">
        {players
          .filter((p) => !p.isGuest)
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((p) => {
            const presences = presenceCount(p.id);
            return (
              <div
                key={p.id}
                className="px-3 py-2.5 rounded-xl"
                style={{ background: "rgba(255,255,255,0.05)" }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="flex-1 text-sm font-medium">
                    {p.name}
                    {presences > 0 && (
                      <span className="ml-2 text-[10px] opacity-50">
                        {presences} presenz{presences === 1 ? "a" : "e"}
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => removePlayer(p.id)}
                    aria-label={"Rimuovi " + p.name}
                    className="text-xs font-bold px-2 py-1 rounded-md opacity-60"
                    style={{
                      background: "rgba(214,69,80,0.25)",
                      color: "#F5F1E8",
                    }}
                  >
                    ✕
                  </button>
                </div>
                <div className="flex items-center gap-3 mb-2">
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="0.5"
                    value={p.rating}
                    onChange={(e) =>
                      updateRating(p.id, Number(e.target.value))
                    }
                    className="flex-1"
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    min="1"
                    max="10"
                    step="0.5"
                    key={p.id + "-" + p.rating}
                    defaultValue={p.rating}
                    aria-label={"Livello di " + p.name + " (scrivi il punteggio)"}
                    onBlur={(e) =>
                      updateRating(p.id, clampRating(e.target.value, p.rating))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.target.blur();
                    }}
                    className="w-11 h-6 rounded-full text-xs font-black text-center"
                    style={{
                      background: "#F2B705",
                      color: "#0F2818",
                      border: "none",
                    }}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] opacity-60 font-bold uppercase">
                    Porta
                  </span>
                  <GkPicker
                    value={p.gkLevel || "average"}
                    onChange={(v) => updateGk(p.id, v)}
                  />
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ---------- match day tab ----------

function MatchView({
  players,
  presentIds,
  togglePresent,
  present,
  canDraw,
  runDraw,
  spinning,
  result,
  poolSize,
  goToRoster,
  onSwap,
  saveFormation,
  addGuest,
}) {
  const [query, setQuery] = useState("");
  const [selectedChip, setSelectedChip] = useState(null); // { id, team }
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestRating, setGuestRating] = useState(3);
  const [guestGk, setGuestGk] = useState("average");
  const [copied, setCopied] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [shareCard, setShareCard] = useState(null); // dataURL of the preview
  const shareCanvasRef = useRef(null);

  const resultKey = result
    ? result.groupA.map((p) => p.id).sort().join(",")
    : "none";

  useEffect(() => {
    setSelectedChip(null);
  }, [resultKey]);

  if (players.length === 0) {
    return (
      <div className="text-sm opacity-60 py-10 text-center">
        Prima crea la rosa.
        <br />
        <button
          onClick={goToRoster}
          className="mt-3 underline font-bold"
          style={{ color: "#F2B705" }}
        >
          Vai alla Rosa →
        </button>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const sorted = players.slice().sort((a, b) => a.name.localeCompare(b.name));
  const filtered = q
    ? sorted.filter((p) => p.name.toLowerCase().includes(q))
    : sorted;

  function onChipClick(playerId, team) {
    if (spinning) return;
    if (!selectedChip) {
      setSelectedChip({ id: playerId, team });
      return;
    }
    if (selectedChip.id === playerId) {
      setSelectedChip(null);
      return;
    }
    if (selectedChip.team === team) {
      setSelectedChip({ id: playerId, team });
      return;
    }
    const aId = team === "B" ? selectedChip.id : playerId;
    const bId = team === "B" ? playerId : selectedChip.id;
    onSwap(aId, bId);
    setSelectedChip(null);
  }

  function submitGuest() {
    const name = guestName.trim();
    if (!name) return;
    addGuest(name, clampRating(guestRating, 3), guestGk);
    setGuestName("");
    setGuestRating(3);
    setGuestGk("average");
    setShowGuestForm(false);
  }

  async function openShareCard() {
    if (!result) return;
    // the canvas won't wait for webfonts on its own
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    } catch (e) {}
    const canvas = document.createElement("canvas");
    drawFormationCard(canvas, result);
    shareCanvasRef.current = canvas;
    try {
      setShareCard(canvas.toDataURL("image/png"));
    } catch (e) {
      setShareCard(null);
    }
  }

  async function shareCardImage() {
    const canvas = shareCanvasRef.current;
    if (!canvas) return;
    const text = buildShareText(result);
    let blob = null;
    try {
      blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
    } catch (e) {}
    if (blob && typeof File !== "undefined" && navigator.canShare) {
      const file = new File([blob], "calcetto-squadre.png", {
        type: "image/png",
      });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: "Calcetto del Giovedì",
            text,
          });
          return;
        } catch (e) {
          if (e.name === "AbortError") return;
        }
      }
    }
    // fallback: download the PNG; if even that fails (sandboxed host),
    // the preview stays on screen for a manual screenshot
    try {
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = "calcetto-squadre.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {}
  }

  async function copyShareText() {
    try {
      await navigator.clipboard.writeText(buildShareText(result));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      // clipboard unavailable: fail silently
    }
  }

  function handleSave() {
    saveFormation();
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  }

  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wide mb-2 opacity-70">
        Chi c'è oggi ({present.length})
      </div>

      <div className="relative mb-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && filtered.length > 0) {
              togglePresent(filtered[0].id);
              setQuery("");
            }
            if (e.key === "Escape") setQuery("");
          }}
          placeholder="Cerca giocatore… (Invio aggiunge il primo)"
          className="w-full px-3 py-2 rounded-lg text-sm"
          style={{
            background: "#0F2818",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "#F5F1E8",
          }}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Cancella ricerca"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold px-2 py-1 rounded-md opacity-60"
            style={{ background: "rgba(255,255,255,0.1)", color: "#F5F1E8" }}
          >
            ✕
          </button>
        )}
      </div>

      {filtered.length === 0 && (
        <div className="text-sm opacity-50 py-4 text-center mb-3">
          Nessun giocatore corrisponde a "{query}".
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-3">
        {filtered.map((p) => {
          const active = presentIds.has(p.id);
          return (
            <button
              key={p.id}
              onClick={() => togglePresent(p.id)}
              className="flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-colors"
              style={{
                background: active ? "#1B4332" : "rgba(255,255,255,0.05)",
                border: active
                  ? "1px solid #F2B705"
                  : "1px solid transparent",
              }}
            >
              <span>{p.name}</span>
              <span
                className="min-w-5 h-5 px-1 flex items-center justify-center rounded-full text-[10px] font-black"
                style={{
                  background: active ? "#F2B705" : "rgba(255,255,255,0.15)",
                  color: active ? "#0F2818" : "rgba(245,241,232,0.6)",
                }}
              >
                {p.rating}
              </span>
            </button>
          );
        })}
      </div>

      {/* one-night guest */}
      <div className="mb-5">
        {!showGuestForm && (
          <button
            onClick={() => setShowGuestForm(true)}
            className="w-full py-2 rounded-lg font-bold uppercase tracking-wide text-xs opacity-80"
            style={{
              background: "rgba(255,255,255,0.08)",
              color: "#F5F1E8",
              border: "1px dashed rgba(255,255,255,0.25)",
            }}
          >
            + Ospite di stasera
          </button>
        )}
        {showGuestForm && (
          <div
            className="rounded-2xl p-4"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px dashed rgba(255,255,255,0.25)",
            }}
          >
            <div className="text-xs font-bold uppercase tracking-wide mb-3 opacity-70">
              Ospite di stasera (non resta in rosa)
            </div>
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Nome ospite"
              className="w-full mb-3 px-3 py-2 rounded-lg text-sm"
              style={{
                background: "#0F2818",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "#F5F1E8",
              }}
            />
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs opacity-70 font-bold uppercase">
                Livello
              </span>
              <input
                type="range"
                min="1"
                max="10"
                step="0.5"
                value={guestRating}
                onChange={(e) => setGuestRating(e.target.value)}
                className="flex-1"
              />
              <input
                type="number"
                inputMode="decimal"
                min="1"
                max="10"
                step="0.5"
                key={"guest-" + guestRating}
                defaultValue={guestRating}
                aria-label="Livello ospite (scrivi il punteggio)"
                onBlur={(e) =>
                  setGuestRating(clampRating(e.target.value, Number(guestRating)))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.target.blur();
                }}
                className="w-12 h-7 rounded-full text-sm font-black text-center"
                style={{
                  background: "#F2B705",
                  color: "#0F2818",
                  border: "none",
                }}
              />
            </div>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs opacity-70 font-bold uppercase">
                È bravo in porta?
              </span>
              <GkPicker value={guestGk} onChange={setGuestGk} />
            </div>
            <div className="flex gap-2">
              <button
                onClick={submitGuest}
                className="flex-1 py-2 rounded-lg font-bold uppercase text-xs tracking-wide"
                style={{ background: "#1B4332", color: "#F5F1E8" }}
              >
                Aggiungi ospite
              </button>
              <button
                onClick={() => setShowGuestForm(false)}
                className="px-4 py-2 rounded-lg font-bold uppercase text-xs tracking-wide opacity-60"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  color: "#F5F1E8",
                }}
              >
                Annulla
              </button>
            </div>
          </div>
        )}
      </div>

      <button
        disabled={!canDraw}
        onClick={() => runDraw(false)}
        className="w-full py-3.5 rounded-xl font-black uppercase tracking-wide text-sm mb-2"
        style={{
          background: canDraw ? "#F2B705" : "rgba(255,255,255,0.1)",
          color: canDraw ? "#0F2818" : "rgba(245,241,232,0.4)",
        }}
      >
        {result ? "Gira di nuovo da zero" : "Forma le squadre"}
      </button>

      {!canDraw && (
        <div className="text-xs opacity-50 text-center mb-4">
          Seleziona almeno 2 giocatori presenti.
        </div>
      )}

      {result && (
        <>
          <button
            onClick={() => runDraw(true)}
            disabled={spinning || poolSize <= 1}
            className="w-full py-2 rounded-lg font-bold uppercase tracking-wide text-xs mb-5 opacity-80"
            style={{
              background: "rgba(255,255,255,0.08)",
              color: "#F5F1E8",
            }}
          >
            🔄 Rimescola (altra combinazione bilanciata)
          </button>

          <TeamCard
            label="Squadra Rossa"
            color="#D64550"
            group={result.groupA}
            spinning={spinning}
            teamKey="A"
            onChipClick={onChipClick}
            selectedId={selectedChip ? selectedChip.id : null}
          />
          <div className="text-center text-xs font-black uppercase tracking-widest opacity-40 my-2">
            vs
          </div>
          <TeamCard
            label="Squadra Blu"
            color="#2D6CA8"
            group={result.groupB}
            spinning={spinning}
            teamKey="B"
            onChipClick={onChipClick}
            selectedId={selectedChip ? selectedChip.id : null}
          />

          {!spinning && (
            <>
              <div className="text-center text-[11px] opacity-40 mt-2">
                Tocca un giocatore e poi uno dell'altra squadra per scambiarli.
              </div>

              <div className="grid grid-cols-2 gap-2 mt-4">
                <button
                  onClick={openShareCard}
                  className="py-2.5 rounded-lg font-bold uppercase tracking-wide text-xs"
                  style={{ background: "#1B4332", color: "#F5F1E8" }}
                >
                  Condividi
                </button>
                <button
                  onClick={copyShareText}
                  className="py-2.5 rounded-lg font-bold uppercase tracking-wide text-xs"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    color: "#F5F1E8",
                  }}
                >
                  {copied ? "Copiato ✓" : "Copia testo"}
                </button>
              </div>

              <button
                onClick={handleSave}
                className="w-full mt-2 py-2.5 rounded-lg font-bold uppercase tracking-wide text-xs"
                style={{
                  background: "transparent",
                  border: "1px solid #F2B705",
                  color: "#F2B705",
                }}
              >
                {savedFlash ? "Salvata ✓" : "Salva formazione"}
              </button>

              <div className="text-center text-xs opacity-50 mt-3">
                Punteggio {result.sumA} – {result.sumB} · {poolSize}{" "}
                combinazion{poolSize === 1 ? "e" : "i"} ugualmente bilanciat
                {poolSize === 1 ? "a" : "e"} disponibil
                {poolSize === 1 ? "e" : "i"}
              </div>
            </>
          )}
        </>
      )}

      {shareCard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.72)" }}
          onClick={() => setShareCard(null)}
        >
          <div
            className="rounded-2xl p-4 w-full max-w-sm"
            style={{
              background: "#0F2818",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={shareCard}
              alt="Formazione sul campo"
              className="w-full rounded-lg mb-3"
              style={{ maxHeight: "65vh", objectFit: "contain" }}
            />
            <div className="flex gap-2">
              <button
                onClick={shareCardImage}
                className="flex-1 py-2.5 rounded-lg font-bold uppercase tracking-wide text-xs"
                style={{ background: "#F2B705", color: "#0F2818" }}
              >
                Condividi
              </button>
              <button
                onClick={copyShareText}
                className="flex-1 py-2.5 rounded-lg font-bold uppercase tracking-wide text-xs"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  color: "#F5F1E8",
                }}
              >
                {copied ? "Copiato ✓" : "Copia testo"}
              </button>
              <button
                onClick={() => setShareCard(null)}
                aria-label="Chiudi anteprima"
                className="px-3 py-2.5 rounded-lg font-bold text-xs"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  color: "#F5F1E8",
                }}
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TeamCard({
  label,
  color,
  group,
  spinning,
  teamKey,
  onChipClick,
  selectedId,
}) {
  const sum = group.reduce((s, p) => s + p.rating, 0);
  const avg = (sum / group.length).toFixed(1);
  return (
    <div
      className="rounded-2xl p-4 mb-1"
      style={{
        background: "rgba(255,255,255,0.05)",
        borderLeft: `4px solid ${color}`,
        opacity: spinning ? 0.7 : 1,
        transition: "opacity 0.06s linear",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-xs font-black uppercase tracking-wide"
          style={{ color }}
        >
          {label}
        </span>
        <span className="text-xs opacity-50 font-bold">media {avg}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {group.map((p) => {
          const selected = selectedId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onChipClick(p.id, teamKey)}
              className="px-2.5 py-1 rounded-full text-xs font-medium"
              style={{
                background: selected ? "#F2B705" : "rgba(255,255,255,0.08)",
                color: selected ? "#0F2818" : "#F5F1E8",
                border: selected
                  ? "1px solid #F2B705"
                  : "1px solid transparent",
              }}
            >
              {p.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- history tab ----------

function HistoryView({ history, onDelete }) {
  const [confirmIdx, setConfirmIdx] = useState(null);

  if (history.length === 0) {
    return (
      <div className="text-sm opacity-60 py-10 text-center">
        Nessuna partita salvata.
        <br />
        Sorteggia e premi "Salva formazione".
      </div>
    );
  }

  // two-tap delete: first tap arms the confirmation, second deletes;
  // auto-disarms after 3s
  function handleDelete(i) {
    if (confirmIdx === i) {
      onDelete(i);
      setConfirmIdx(null);
    } else {
      setConfirmIdx(i);
      setTimeout(() => {
        setConfirmIdx((c) => (c === i ? null : c));
      }, 3000);
    }
  }

  return (
    <div className="space-y-2">
      {history.map((h, i) => (
        <div
          key={h.date + "-" + i}
          className="rounded-2xl p-4"
          style={{ background: "rgba(255,255,255,0.05)" }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wide opacity-70">
              {new Date(h.date).toLocaleDateString("it-IT", {
                weekday: "short",
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs opacity-50 font-bold">
                {h.sumA} – {h.sumB}
              </span>
              <button
                onClick={() => handleDelete(i)}
                aria-label={
                  confirmIdx === i
                    ? "Conferma eliminazione partita"
                    : "Elimina partita"
                }
                className="text-[11px] font-bold px-2 py-1 rounded-md"
                style={{
                  background:
                    confirmIdx === i ? "#D64550" : "rgba(214,69,80,0.25)",
                  color: "#F5F1E8",
                  opacity: confirmIdx === i ? 1 : 0.6,
                }}
              >
                {confirmIdx === i ? "Elimina?" : "✕"}
              </button>
            </div>
          </div>
          <div className="text-xs">
            <span style={{ color: "#D64550", fontWeight: 700 }}>Rossa:</span>{" "}
            {h.groupA.map((p) => p.name).join(", ")}
          </div>
          <div className="text-xs mt-1">
            <span style={{ color: "#2D6CA8", fontWeight: 700 }}>Blu:</span>{" "}
            {h.groupB.map((p) => p.name).join(", ")}
          </div>
        </div>
      ))}
    </div>
  );
}

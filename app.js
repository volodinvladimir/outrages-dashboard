(() => {
  "use strict";

  const DATA_URL = "https://svitlo-proxy.svitlo-proxy.workers.dev/";
  const AUTO_REFRESH_MIN = 60;

  const KYIV = {
    title: "ЯвКурсі · Київ — світло (черга 6.1)",
    subtitle: "Сьогодні та завтра (півгодинні слоти)",
    cpuCandidates: ["kyiv"],
    hints: ["м.Київ", "Київ", "Kyiv", "Kyiv City"],
    queue: "6.1",
  };

  const HOME = {
    cityLabel: "Бровари",
    cpuCandidates: ["kyivska-oblast", "kiivska-oblast"],
    hints: ["Бровари", "Brovary", "Київська область", "Kyiv region", "Kyiv Oblast"],
    light: { queue: "3.1", label: "Світло (черга 3.1)" },
    water: { queue: "1.2", label: "Вода (черга 1.2)" },
  };

  let autoTimer = null;

  // ---------- CSS (інжектимо) ----------
  function injectCss() {
    if (document.getElementById("yk-css")) return;

    const css = `
:root{
  --bg:#0b0e12;
  --text:#e6edf3;
  --muted:#9aa4b2;
  --green:#4ade80;
  --red:#fb4b4b;
  --gray:#4b5563;
  --shadow: 0 10px 30px rgba(0,0,0,.35);
  --radius: 18px;
}
html,body{height:100%}
body{
  margin:0;
  background:
    radial-gradient(900px 500px at 10% 0%, rgba(74,222,128,.10), transparent 60%),
    radial-gradient(900px 500px at 90% 10%, rgba(251,75,75,.10), transparent 60%),
    var(--bg);
  color:var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
}
.wrap{max-width:1280px;margin:0 auto;padding:18px 18px 30px}
.topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}
.brand{display:flex;flex-direction:column;gap:4px}
.brand h1{font-size:22px;line-height:1.1;margin:0}
.brand p{margin:0;color:var(--muted);font-size:13px}
.actions{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap}
.btn{
  background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03));
  border:1px solid rgba(255,255,255,.10);
  color:var(--text);
  border-radius:14px;
  padding:9px 14px;
  cursor:pointer;
  box-shadow: 0 6px 20px rgba(0,0,0,.25);
  font-weight:600;
}
.btn:hover{filter:brightness(1.08)}
.btn:disabled{opacity:.6; cursor:not-allowed}
.meta{
  color:var(--muted);
  font-size:12px;
  background: rgba(255,255,255,.03);
  border:1px solid rgba(255,255,255,.08);
  border-radius:14px;
  padding:10px 12px;
  min-width: 240px;
}
.grid{display:grid;grid-template-columns:1fr;gap:14px}
.grid2{display:grid;grid-template-columns: 1fr 1fr;gap:14px}
@media (max-width: 980px){ .grid2{grid-template-columns:1fr} }

.card{
  background: linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,.015));
  border:1px solid rgba(255,255,255,.08);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding:14px 14px 12px;
}
.cardhead{display:flex;flex-direction:column;gap:3px;margin-bottom:10px}
.cardhead .title{font-size:16px;font-weight:800;margin:0}
.cardhead .subtitle{font-size:12px;color:var(--muted);margin:0}
.dayLabel{
  display:flex;align-items:center;justify-content:space-between;
  margin:10px 0 6px;color:var(--muted);font-size:12px;font-weight:700
}

/* ✅ підписи тільки в моменти зміни */
.changes{
  position:relative;
  height:34px;
  margin: 0 0 6px;
}
.chg{
  position:absolute;
  top:0;
  transform: translateX(-50%);
  font-size:11px;
  color: var(--text);
  padding:2px 6px;
  border-radius:999px;
  background: rgba(0,0,0,.35);
  border:1px solid rgba(255,255,255,.14);
  white-space:nowrap;
}
.chg.alt{ top:18px; }
.chg.on{ border-color: rgba(74,222,128,.55); }
.chg.off{ border-color: rgba(251,75,75,.55); }

.timelineWrap{ position:relative; min-width:0; }
.timeline{
  display:grid;
  grid-template-columns: repeat(48, 1fr);
  gap:2px;
  min-width: 0;
}
.slot{
  height:14px;
  border-radius:4px;
  background: var(--gray);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.08);
}
.slot.on{background: var(--green)}
.slot.off{background: var(--red)}
.slot.unknown{background: var(--gray)}

/* ✅ завтра приглушено */
.timeline.dim .slot{ opacity:.68; }

/* ✅ “ЗАРАЗ” — дуже помітно */
.slot.now{
  outline:none;
  box-shadow:
    0 0 0 3px rgba(255,255,255,.95),
    0 0 18px rgba(255,255,255,.65);
  position:relative;
  z-index: 3;
}
.nowLine{
  position:absolute;
  top:-10px;
  bottom:-10px;
  width:5px;
  transform: translateX(-50%);
  background: rgba(255,255,255,.95);
  border-radius: 999px;
  box-shadow:
    0 0 0 2px rgba(0,0,0,.55),
    0 0 18px rgba(255,255,255,.75);
  pointer-events:none;
  z-index: 4;
  animation: nowPulse 1.15s ease-in-out infinite;
}
@keyframes nowPulse{
  0%,100%{ opacity:.55; }
  50%{ opacity:1; }
}

/* тонкі “ризики” у місцях перемикання (підсилює читабельність) */
.changeTick{
  position:absolute;
  top:-2px;
  bottom:-2px;
  width:2px;
  transform: translateX(-50%);
  border-radius:999px;
  opacity:.55;
  z-index: 2;
  pointer-events:none;
}
.changeTick.on{ background: rgba(74,222,128,.55); }
.changeTick.off{ background: rgba(251,75,75,.55); }

@media (max-width: 520px){
  .wrap{padding:14px 14px 22px}
  .timeline{ gap:1px; }
  .slot{ height:12px; border-radius:3px; }
  .nowLine{ width:4px; }
  .changes{ height:38px; }
  .chg{ font-size:10px; padding:2px 5px; }
}

.legend{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-top:10px;color:var(--muted);font-size:12px}
.dot{width:10px;height:10px;border-radius:999px;display:inline-block;margin-right:8px}
.dot.on{background:var(--green)}
.dot.off{background:var(--red)}
.dot.unknown{background:var(--gray)}
.source{margin-top:10px;color:var(--muted);font-size:12px;display:flex;justify-content:flex-end}
.diag{
  margin-top:14px;
  color:#cbd5e1;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size:12px;
  white-space:pre-wrap;
  background: rgba(0,0,0,.28);
  border: 1px solid rgba(255,255,255,.08);
  border-radius: var(--radius);
  padding:12px 12px;
}`;

    const style = document.createElement("style");
    style.id = "yk-css";
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---------- DOM ----------
  const el = (id) => document.getElementById(id);

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function buildLayout() {
    const app = el("app") || document.body;
    app.innerHTML = `
      <div class="wrap" id="yk-root">
        <div class="topbar">
          <div class="brand">
            <h1>ЯвКурсі</h1>
            <p>Графіки відключень • дані зі svitlo.live через публічний проксі</p>
          </div>
          <div class="actions">
            <button class="btn" id="btnRefresh">Оновити</button>
            <div class="meta">
              <div>Останнє оновлення даних: <b id="lastUpdate">—</b></div>
              <div>Наступне автооновлення: <b id="nextUpdate">—</b></div>
            </div>
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <div class="cardhead">
              <p class="title">${esc(KYIV.title)}</p>
              <p class="subtitle">${esc(KYIV.subtitle)}</p>
            </div>
            <div id="kyivContent"></div>
            <div class="legend">
              <span><span class="dot on"></span>Є світло</span>
              <span><span class="dot off"></span>Немає світла</span>
              <span><span class="dot unknown"></span>Невідомо</span>
            </div>
            <div class="source">Джерело: ${esc(DATA_URL)}</div>
          </div>

          <div class="grid2">
            <div class="card">
              <div class="cardhead">
                <p class="title">Дім — сьогодні</p>
                <p class="subtitle" id="homeTodaySub">—</p>
              </div>
              <div id="homeTodayContent"></div>
            </div>

            <div class="card">
              <div class="cardhead">
                <p class="title">Дім — завтра</p>
                <p class="subtitle" id="homeTomorrowSub">—</p>
              </div>
              <div id="homeTomorrowContent"></div>
            </div>
          </div>

          <div class="card">
            <div class="cardhead">
              <p class="title">Діагностика</p>
              <p class="subtitle">Якщо графіки не відображаються — дивіться помилки тут</p>
            </div>
            <div class="diag" id="diagBox">—</div>
          </div>
        </div>
      </div>
    `;
    el("btnRefresh").addEventListener("click", refresh);
  }

  // ---------- Time ----------
  function formatTime(d) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  function nowIndexForToday() {
    const d = new Date();
    const mins = d.getHours() * 60 + d.getMinutes();
    return Math.min(47, Math.max(0, Math.floor(mins / 30)));
  }

  function slotKey(i) {
    const minutes = i * 30;
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  // ---------- Fetch ----------
  async function fetchJson(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.json();
  }

  function setDiag(lines) {
    el("diagBox").textContent = lines.join("\n");
  }

  function setMetaNow() {
    el("lastUpdate").textContent = formatTime(new Date());
    const next = new Date(Date.now() + AUTO_REFRESH_MIN * 60 * 1000);
    el("nextUpdate").textContent = `${formatTime(next)} (через ~${AUTO_REFRESH_MIN} хв)`;
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = setTimeout(refresh, AUTO_REFRESH_MIN * 60 * 1000);
  }

  // ---------- Parsing ----------
  function normalizeText(s) {
    return String(s || "").trim().toLowerCase();
  }

  function regionsArray(regions) {
    if (!regions) return [];
    if (Array.isArray(regions)) return regions;
    if (typeof regions === "object") return Object

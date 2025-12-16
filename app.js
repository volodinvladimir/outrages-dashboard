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

  // ---------- CSS (інжектимо, щоб НЕ залежати від style.css) ----------
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
.axis{
  display:flex;justify-content:space-between;
  color:var(--muted);font-size:11px;margin:0 0 6px;padding:0 1px;
}

/* ✅ мобільний фікс: всі 48 слотів завжди вміщаються, без обрізання */
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

/* ✅ “ЗАРАЗ” — дуже помітно */
.slot.now{
  outline:none;
  box-shadow:
    0 0 0 3px rgba(255,255,255,.95),
    0 0 18px rgba(255,255,255,.65);
  position:relative;
  z-index:2;
}
.nowLine{
  position:absolute;
  top:-8px;
  bottom:-8px;
  width:4px;
  transform: translateX(-50%);
  background: rgba(255,255,255,.95);
  border-radius: 999px;
  box-shadow:
    0 0 0 2px rgba(0,0,0,.55),
    0 0 18px rgba(255,255,255,.65);
  pointer-events:none;
  animation: nowPulse 1.15s ease-in-out infinite;
}
@keyframes nowPulse{
  0%,100%{ opacity:.55; }
  50%{ opacity:1; }
}

@media (max-width: 520px){
  .wrap{padding:14px 14px 22px}
  .timeline{ gap:1px; }
  .slot{ height:12px; border-radius:3px; }
  .nowLine{ width:3px; }
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
    if (typeof regions === "object") return Object.values(regions);
    return [];
  }

  function pickRegion(regions, cpuCandidates, hints) {
    const cpuList = (cpuCandidates || []).map(normalizeText).filter(Boolean);
    if (cpuList.length) {
      const hit = regions.find(r => cpuList.includes(normalizeText(r.cpu)));
      if (hit) return hit;
    }

    const hs = (hints || []).map(normalizeText).filter(Boolean);
    if (hs.length) {
      const hit = regions.find(r => {
        const text = [
          r.cpu, r.name_ua, r.name_en, r.name_ru, r.name, r.title, r.city, r.region
        ].map(normalizeText).join(" ");
        return hs.some(h => text.includes(h));
      });
      if (hit) return hit;
    }
    return null;
  }

  function getScheduleContainer(region) {
    return region?.schedule || region?.queues || region?.schedules || null;
  }

  function getQueueObj(container, queue) {
    if (!container || typeof container !== "object") return null;
    return container[queue] || null;
  }

  // scheme:
  // - if any '2' => 1=ON, 2=OFF, 0=UNKNOWN
  // - else => 0=ON, 1=OFF
  function detectScheme(dayMap) {
    const vals = Object.values(dayMap || {})
      .map(v => (typeof v === "string" ? Number(v) : v))
      .filter(v => Number.isFinite(v));
    return vals.includes(2) ? "012" : "01";
  }

  function decode(v, scheme) {
    const n = (typeof v === "string") ? Number(v) : v;
    if (!Number.isFinite(n)) return "unknown";
    if (scheme === "012") {
      if (n === 1) return "on";
      if (n === 2) return "off";
      return "unknown";
    }
    if (n === 0) return "on";
    if (n === 1) return "off";
    return "unknown";
  }

  function normalizeTo48(dayMap) {
    const out = new Array(48).fill("unknown");
    if (!dayMap || typeof dayMap !== "object") return out;
    const scheme = detectScheme(dayMap);
    for (let i = 0; i < 48; i++) out[i] = decode(dayMap[slotKey(i)], scheme);
    return out;
  }

  function resolve(data, spec, queue, diag, tag) {
    const regs = regionsArray(data.regions);
    const region = pickRegion(regs, spec.cpuCandidates, spec.hints);

    if (!region) {
      diag.push(`[${tag}] region => NOT FOUND`);
      diag.push(`  cpu sample: ${regs.map(r => r.cpu).filter(Boolean).slice(0, 25).join(", ")}`);
      return null;
    }

    const container = getScheduleContainer(region);
    if (!container) {
      diag.push(`[${tag}] cpu=${region.cpu} schedule => MISSING`);
      return null;
    }

    const qObj = getQueueObj(container, queue);
    if (!qObj) {
      diag.push(`[${tag}] cpu=${region.cpu} queue=${queue} => NOT FOUND`);
      diag.push(`  queues sample: ${Object.keys(container).slice(0, 30).join(", ")}`);
      return null;
    }

    const dt = data.date_today;
    const d2 = data.date_tomorrow;
    const todayMap = (dt && qObj[dt]) ? qObj[dt] : null;
    const tomorrowMap = (d2 && qObj[d2]) ? qObj[d2] : null;

    diag.push(`[${tag}] cpu=${region.cpu} queue=${queue} => OK`);

    return {
      dt: String(dt || "today"),
      d2: String(d2 || "tomorrow"),
      todaySlots: normalizeTo48(todayMap || {}),
      tomorrowSlots: normalizeTo48(tomorrowMap || {}),
    };
  }

  // ---------- Render ----------
  function axisEl() {
    const axis = document.createElement("div");
    axis.className = "axis";
    axis.innerHTML = `<span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>`;
    return axis;
  }

  function renderTimeline(slots48, { highlightNow = false } = {}) {
    const block = document.createElement("div");
    block.appendChild(axisEl());

    const tl = document.createElement("div");
    tl.className = "timeline";

    const nowIdx = highlightNow ? nowIndexForToday() : -1;

    for (let i = 0; i < 48; i++) {
      const st = slots48[i] || "unknown";
      const cell = document.createElement("div");
      cell.className = `slot ${st}${i === nowIdx ? " now" : ""}`;
      tl.appendChild(cell);
    }

    const tlWrap = document.createElement("div");
    tlWrap.className = "timelineWrap";
    tlWrap.appendChild(tl);

    if (nowIdx >= 0) {
      const line = document.createElement("div");
      line.className = "nowLine";
      line.style.left = `${((nowIdx + 0.5) / 48) * 100}%`;
      tlWrap.appendChild(line);
    }

    block.appendChild(tlWrap);
    return block;
  }

  function renderBlock(mount, label, slots48, highlightNow) {
    const row = document.createElement("div");

    const lbl = document.createElement("div");
    lbl.className = "dayLabel";
    lbl.innerHTML = `<span>${esc(label)}</span><span></span>`;
    row.appendChild(lbl);

    row.appendChild(renderTimeline(slots48, { highlightNow }));
    mount.appendChild(row);
  }

  // ---------- Main ----------
  async function refresh() {
    const diag = [];
    const btn = el("btnRefresh");
    btn.disabled = true;

    try {
      diag.push("Завантажую дані…");
      const data = await fetchJson(`${DATA_URL}?_=${Date.now()}`);
      setMetaNow();

      diag.push(`Data loaded from: ${DATA_URL}`);
      diag.push(`Top-level keys: ${Object.keys(data || {}).join(", ")}`);

      const kyiv = resolve(data, KYIV, KYIV.queue, diag, "kyiv");
      el("kyivContent").innerHTML = "";
      if (kyiv) {
        renderBlock(el("kyivContent"), `Сьогодні (${kyiv.dt})`, kyiv.todaySlots, true);
        renderBlock(el("kyivContent"), `Завтра (${kyiv.d2})`, kyiv.tomorrowSlots, false);
      }

      const homeSpec = { cpuCandidates: HOME.cpuCandidates, hints: HOME.hints };
      const homeLight = resolve(data, homeSpec, HOME.light.queue, diag, "brovary-light");
      const homeWater = resolve(data, homeSpec, HOME.water.queue, diag, "brovary-water");

      el("homeTodayContent").innerHTML = "";
      el("homeTomorrowContent").innerHTML = "";

      if (homeLight && homeWater) {
        el("homeTodaySub").textContent = `${HOME.cityLabel} • ${homeLight.dt}`;
        el("homeTomorrowSub").textContent = `${HOME.cityLabel} • ${homeLight.d2}`;

        renderBlock(el("homeTodayContent"), HOME.light.label, homeLight.todaySlots, true);
        renderBlock(el("homeTodayContent"), HOME.water.label, homeWater.todaySlots, true);

        renderBlock(el("homeTomorrowContent"), HOME.light.label, homeLight.tomorrowSlots, false);
        renderBlock(el("homeTomorrowContent"), HOME.water.label, homeWater.tomorrowSlots, false);
      } else {
        if (!homeLight) diag.push("[home] light schedule missing");
        if (!homeWater) diag.push("[home] water schedule missing");
      }

      setDiag(diag);
    } catch (e) {
      diag.push(`ERROR: ${e?.message || String(e)}`);
      setDiag(diag);
      el("lastUpdate").textContent = "—";
      el("nextUpdate").textContent = "—";
    } finally {
      btn.disabled = false;
    }
  }

  function boot() {
    injectCss();
    buildLayout();
    refresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

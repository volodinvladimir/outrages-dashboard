(() => {
  "use strict";

  const DATA_URL = "https://svitlo-proxy.svitlo-proxy.workers.dev/";
  const AUTO_REFRESH_MIN = 60;

  const KYIV = {
    id: "kyiv",
    title: "ЯвКурсі · Київ — світло (черга 6.1)",
    subtitle: "Сьогодні та завтра (півгодинні слоти)",
    queue: "6.1",
    regionCpuCandidates: ["kyiv"],
    regionHints: ["м.Київ", "Київ", "Kyiv", "Kyiv City"],
  };

  const HOME = {
    cityLabel: "Бровари",
    // головний фікс: у різних джерелах буває kyivska-oblast або kiivska-oblast
    regionCpuCandidates: ["kyivska-oblast", "kiivska-oblast", "kyiv_oblast", "kyivska_oblast"],
    regionHints: ["Бровари", "Brovary", "Київська область", "Kyiv region", "Kyiv Oblast"],
    light: { queue: "3.1", label: "Світло", titleSuffix: "(черга 3.1)" },
    water: { queue: "1.2", label: "Вода", titleSuffix: "(черга 1.2)" },
  };

  let autoTimer = null;

  // ---------------- CSS + Layout ----------------
  function injectCss() {
    if (document.getElementById("yk-svitlo-css")) return;
    const style = document.createElement("style");
    style.id = "yk-svitlo-css";
    style.textContent = `
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
        background: radial-gradient(900px 500px at 10% 0%, rgba(74,222,128,.10), transparent 60%),
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
      .actions{display:flex;gap:10px;align-items:flex-start}
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

      .dayLabel{display:flex;align-items:center;justify-content:space-between;margin:10px 0 6px;color:var(--muted);font-size:12px;font-weight:700}
      .axis{display:flex;justify-content:space-between;color:var(--muted);font-size:11px;margin:0 0 6px;padding:0 1px}
      .timeline{display:grid;grid-template-columns: repeat(48, minmax(8px, 1fr));gap:3px}
      .slot{height:14px;border-radius:4px;background: var(--gray);box-shadow: inset 0 0 0 1px rgba(255,255,255,.08)}
      .slot.on{background: var(--green)}
      .slot.off{background: var(--red)}
      .slot.unknown{background: var(--gray)}
      .slot.now{outline:2px solid rgba(255,255,255,.75);outline-offset:1px}

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
      }
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function buildLayout() {
    const old = document.getElementById("yk-root");
    if (old) old.remove();

    const wrap = document.createElement("div");
    wrap.className = "wrap";
    wrap.id = "yk-root";

    wrap.innerHTML = `
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
        <div class="card" id="cardKyiv">
          <div class="cardhead">
            <p class="title">${escapeHtml(KYIV.title)}</p>
            <p class="subtitle">${escapeHtml(KYIV.subtitle)}</p>
          </div>
          <div id="kyivContent"></div>
          <div class="legend">
            <span><span class="dot on"></span>Є світло</span>
            <span><span class="dot off"></span>Немає світла</span>
            <span><span class="dot unknown"></span>Невідомо</span>
          </div>
          <div class="source">Джерело: ${escapeHtml(DATA_URL)}</div>
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
    `;

    document.body.appendChild(wrap);
  }

  // ---------------- Data helpers ----------------
  function normalizeText(s) {
    return String(s || "").trim().toLowerCase();
  }

  function asArrayRegions(regions) {
    if (!regions) return [];
    if (Array.isArray(regions)) return regions;
    if (typeof regions === "object") return Object.values(regions);
    return [];
  }

  // Головний фікс: НІЯКОГО fallback "перший регіон"
  function pickRegion(allRegions, cpuCandidates, hints) {
    const cpuList = (cpuCandidates || []).map(normalizeText).filter(Boolean);
    if (cpuList.length) {
      const hit = allRegions.find(r => cpuList.includes(normalizeText(r.cpu)));
      if (hit) return hit;
    }

    const hs = (hints || []).map(normalizeText).filter(Boolean);
    if (hs.length) {
      const hit = allRegions.find(r => {
        const text = [
          r.cpu, r.name, r.title, r.city, r.region,
          r.name_ua, r.name_en, r.name_ru
        ].map(normalizeText).join(" ");
        return hs.some(h => text.includes(h));
      });
      if (hit) return hit;
    }

    return null;
  }

  function getScheduleContainer(region) {
    if (!region || typeof region !== "object") return null;
    return region.schedule || region.queues || region.schedules || region.queue || null;
  }

  function getQueueObject(container, queueKey) {
    if (!container || typeof container !== "object") return null;
    return container[queueKey] || null;
  }

  function slotKey(i) {
    const minutes = i * 30;
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  // Під svitlo-proxy: значення часто 0/1/2
  // Робимо універсально:
  // - якщо є 2 => 1=ON, 2=OFF, 0=UNKNOWN
  // - якщо 2 немає => 0=ON, 1=OFF
  function detectScheme(dayMap) {
    const vals = Object.values(dayMap || {})
      .map(v => (typeof v === "string" ? Number(v) : v))
      .filter(v => Number.isFinite(v));
    return vals.includes(2) ? "012" : "01";
  }

  function decodeValue(v, scheme) {
    const n = (typeof v === "string") ? Number(v) : v;
    if (!Number.isFinite(n)) return "unknown";

    if (scheme === "012") {
      if (n === 1) return "on";
      if (n === 2) return "off";
      return "unknown";
    } else {
      // 01
      if (n === 0) return "on";
      if (n === 1) return "off";
      return "unknown";
    }
  }

  function normalizeTo48(dayMap) {
    const out = new Array(48).fill("unknown");
    if (!dayMap || typeof dayMap !== "object") return out;

    const scheme = detectScheme(dayMap);

    for (let i = 0; i < 48; i++) {
      const k = slotKey(i);
      out[i] = decodeValue(dayMap[k], scheme);
    }
    return out;
  }

  function axisEl() {
    const axis = document.createElement("div");
    axis.className = "axis";
    axis.innerHTML = `<span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>`;
    return axis;
  }

  function nowIndexForToday() {
    const d = new Date();
    const mins = d.getHours() * 60 + d.getMinutes();
    return Math.min(47, Math.max(0, Math.floor(mins / 30)));
  }

  function renderTimeline(slots48, { highlightNow = false } = {}) {
    const wrap = document.createElement("div");
    wrap.appendChild(axisEl());

    const tl = document.createElement("div");
    tl.className = "timeline";

    const nowIdx = highlightNow ? nowIndexForToday() : -1;

    for (let i = 0; i < 48; i++) {
      const st = slots48[i] || "unknown";
      const cell = document.createElement("div");
      cell.className = `slot ${st}${i === nowIdx ? " now" : ""}`;
      tl.appendChild(cell);
    }

    wrap.appendChild(tl);
    return wrap;
  }

  function renderBlock(mount, label, slots48, highlightNow) {
    const row = document.createElement("div");
    const lbl = document.createElement("div");
    lbl.className = "dayLabel";
    lbl.innerHTML = `<span>${escapeHtml(label)}</span><span></span>`;
    row.appendChild(lbl);
    row.appendChild(renderTimeline(slots48, { highlightNow }));
    mount.appendChild(row);
  }

  // ---------------- Refresh ----------------
  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function formatTime(d) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  function scheduleNextAuto() {
    const next = new Date(Date.now() + AUTO_REFRESH_MIN * 60 * 1000);
    setText("nextUpdate", `${formatTime(next)} (через ~${AUTO_REFRESH_MIN} хв)`);
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = setTimeout(() => refresh(), AUTO_REFRESH_MIN * 60 * 1000);
  }

  function logDiag(lines) {
    const box = document.getElementById("diagBox");
    if (box) box.textContent = lines.join("\n");
  }

  async function fetchJson(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.json();
  }

  function resolveSchedule(data, spec, queueKey, diagLines, tag) {
    const regions = asArrayRegions(data.regions);
    const region = pickRegion(regions, spec.regionCpuCandidates, spec.regionHints);

    if (!region) {
      diagLines.push(`[${tag}] region => NOT FOUND (cpuCandidates=${JSON.stringify(spec.regionCpuCandidates)})`);
      diagLines.push(`  available cpu (sample): ${regions.map(r => r.cpu).filter(Boolean).slice(0, 25).join(", ")}`);
      return null;
    }

    const container = getScheduleContainer(region);
    const qObj = getQueueObject(container, queueKey);

    if (!qObj) {
      diagLines.push(`[${tag}] cpu=${region.cpu || "?"} queue=${queueKey} => NOT FOUND`);
      diagLines.push(`  available queues (sample): ${Object.keys(container || {}).slice(0, 30).join(", ")}`);
      return null;
    }

    const dt = data.date_today;
    const d2 = data.date_tomorrow;

    const todayMap = (dt && qObj[dt]) ? qObj[dt] : null;
    const tomorrowMap = (d2 && qObj[d2]) ? qObj[d2] : null;

    const todaySlots = normalizeTo48(todayMap || {});
    const tomorrowSlots = normalizeTo48(tomorrowMap || {});

    diagLines.push(`[${tag}] cpu=${region.cpu || "?"} queue=${queueKey} => OK`);

    return { region, todaySlots, tomorrowSlots };
  }

  async function refresh() {
    const diag = [];
    try {
      diag.push("Завантажую дані…");
      const data = await fetchJson(DATA_URL);

      const now = new Date();
      setText("lastUpdate", formatTime(now));
      scheduleNextAuto();

      diag.push(`Data loaded from: ${DATA_URL}`);
      diag.push(`Top-level keys: ${Object.keys(data || {}).join(", ")}`);

      const dt = data.date_today ? String(data.date_today) : "сьогодні";
      const d2 = data.date_tomorrow ? String(data.date_tomorrow) : "завтра";

      const homeTodaySub = document.getElementById("homeTodaySub");
      const homeTomorrowSub = document.getElementById("homeTomorrowSub");
      if (homeTodaySub) homeTodaySub.textContent = `${HOME.cityLabel} • ${dt}`;
      if (homeTomorrowSub) homeTomorrowSub.textContent = `${HOME.cityLabel} • ${d2}`;

      // KYIV
      const kyiv = resolveSchedule(data, KYIV, KYIV.queue, diag, "kyiv");
      const kyivMount = document.getElementById("kyivContent");
      if (kyivMount) kyivMount.innerHTML = "";
      if (kyiv && kyivMount) {
        renderBlock(kyivMount, `Сьогодні (${dt})`, kyiv.todaySlots, true);
        renderBlock(kyivMount, `Завтра (${d2})`, kyiv.tomorrowSlots, false);
      }

      // HOME
      const homeLight = resolveSchedule(data, HOME, HOME.light.queue, diag, "brovary-light");
      const homeWater = resolveSchedule(data, HOME, HOME.water.queue, diag, "brovary-water");

      const homeTodayMount = document.getElementById("homeTodayContent");
      const homeTomorrowMount = document.getElementById("homeTomorrowContent");
      if (homeTodayMount) homeTodayMount.innerHTML = "";
      if (homeTomorrowMount) homeTomorrowMount.innerHTML = "";

      if (homeLight && homeWater && homeTodayMount && homeTomorrowMount) {
        // LEFT: today (Light + Water)
        renderBlock(homeTodayMount, `Світло ${HOME.light.titleSuffix}`, homeLight.todaySlots, true);
        renderBlock(homeTodayMount, `Вода ${HOME.water.titleSuffix}`, homeWater.todaySlots, true);

        // RIGHT: tomorrow (Light + Water)
        renderBlock(homeTomorrowMount, `Світло ${HOME.light.titleSuffix}`, homeLight.tomorrowSlots, false);
        renderBlock(homeTomorrowMount, `Вода ${HOME.water.titleSuffix}`, homeWater.tomorrowSlots, false);
      } else {
        if (!homeLight) diag.push("[home] light schedule missing");
        if (!homeWater) diag.push("[home] water schedule missing");
      }

      logDiag(diag);
    } catch (e) {
      diag.push(`ERROR: ${e?.message || String(e)}`);
      logDiag(diag);
      setText("lastUpdate", "—");
      setText("nextUpdate", "—");
    }
  }

  function boot() {
    injectCss();
    buildLayout();
    const btn = document.getElementById("btnRefresh");
    if (btn) btn.addEventListener("click", refresh);
    refresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

/* YavKursi • Svitlo dashboard (Kyiv + Home)
   Bottom layout requested:
   - Left bottom card: TODAY -> Light (3.1) then Water (1.2)
   - Right bottom card: TOMORROW -> Light (3.1) then Water (1.2)
*/

(() => {
  "use strict";

  // =========================
  // CONFIG
  // =========================
  const DATA_URL = "https://svitlo-proxy.svitlo-proxy.workers.dev/";

  // Kyiv (electricity)
  const KYIV = {
    id: "kyiv",
    title: "ЯвКурсі · Київ — світло (черга 6.1)",
    subtitle: "Сьогодні та завтра (півгодинні слоти)",
    queue: "6.1",
    // працює у вас (по діагностиці було cpu=kyiv => OK)
    regionCpuCandidates: ["kyiv"],
    regionHints: ["м.Київ", "Київ", "Kyiv", "Kyiv City"],
  };

  // Home (Brovary)
  const HOME = {
    cityLabel: "Бровари",
    // у вас працює (cpu=kyivska-oblast => OK)
    regionCpuCandidates: ["kyivska-oblast"],
    regionHints: ["Бровари", "Brovary", "Київська область", "Kyiv region"],
    light: { queue: "3.1", label: "Світло", titleSuffix: "(черга 3.1)" },
    water: { queue: "1.2", label: "Вода", titleSuffix: "(черга 1.2)" },
  };

  const AUTO_REFRESH_MIN = 60;

  // =========================
  // DOM + CSS (self-contained)
  // =========================
  function injectCss() {
    if (document.getElementById("yk-svitlo-css")) return;
    const style = document.createElement("style");
    style.id = "yk-svitlo-css";
    style.textContent = `
      :root{
        --bg:#0b0e12;
        --card:#0f141b;
        --card2:#0d1117;
        --text:#e6edf3;
        --muted:#9aa4b2;
        --line:#1b2330;
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
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
      }
      .wrap{max-width:1280px;margin:0 auto;padding:18px 18px 30px}
      .topbar{
        display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px
      }
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
      .grid{
        display:grid;
        grid-template-columns: 1fr;
        gap:14px;
      }
      .grid2{
        display:grid;
        grid-template-columns: 1fr 1fr;
        gap:14px;
      }
      @media (max-width: 980px){
        .grid2{grid-template-columns:1fr}
      }

      .card{
        background: linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,.015));
        border:1px solid rgba(255,255,255,.08);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        padding:14px 14px 12px;
        overflow:hidden;
      }
      .cardhead{display:flex;flex-direction:column;gap:3px;margin-bottom:10px}
      .cardhead .title{font-size:16px;font-weight:800;margin:0}
      .cardhead .subtitle{font-size:12px;color:var(--muted);margin:0}

      .dayLabel{
        display:flex;align-items:center;justify-content:space-between;
        margin:10px 0 6px;
        color:var(--muted);
        font-size:12px;
        font-weight:700;
      }
      .axis{
        display:flex;
        justify-content:space-between;
        color:var(--muted);
        font-size:11px;
        margin:0 0 6px;
        padding:0 1px;
      }
      .timeline{
        display:grid;
        grid-template-columns: repeat(48, minmax(8px, 1fr));
        gap:3px;
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
      .slot.now{
        outline:2px solid rgba(255,255,255,.75);
        outline-offset:1px;
      }

      .legend{
        display:flex;gap:14px;align-items:center;flex-wrap:wrap;
        margin-top:10px;color:var(--muted);font-size:12px
      }
      .dot{width:10px;height:10px;border-radius:999px;display:inline-block;margin-right:8px}
      .dot.on{background:var(--green)}
      .dot.off{background:var(--red)}
      .dot.unknown{background:var(--gray)}

      .source{
        margin-top:10px;
        color:var(--muted);
        font-size:12px;
        display:flex;justify-content:flex-end;
      }

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

  function buildLayout() {
    const root =
      document.getElementById("app") ||
      document.querySelector("main") ||
      document.body;

    // не чіпаємо head, але чистимо контейнер
    if (root !== document.body) root.innerHTML = "";
    else {
      // якщо body — залишимо існуючий контент, але додамо в кінець (на випадок вашого HTML)
      // і уникнемо дублювань
      const old = document.getElementById("yk-root");
      if (old) old.remove();
    }

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
          <div class="meta" id="metaBox">
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
          <div class="card" id="cardHomeToday">
            <div class="cardhead">
              <p class="title">Дім — сьогодні</p>
              <p class="subtitle" id="homeTodaySub">—</p>
            </div>
            <div id="homeTodayContent"></div>
          </div>

          <div class="card" id="cardHomeTomorrow">
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

    if (root === document.body) document.body.appendChild(wrap);
    else root.appendChild(wrap);
  }

  // =========================
  // DATA PARSING (robust)
  // =========================
  function asArrayRegions(regions) {
    if (!regions) return [];
    if (Array.isArray(regions)) return regions;
    if (typeof regions === "object") return Object.values(regions);
    return [];
  }

  function normalizeText(s) {
    return String(s || "").trim().toLowerCase();
  }

  function pickRegion(allRegions, cpuCandidates, hints) {
    // 1) exact cpu match
    if (cpuCandidates?.length) {
      for (const cpu of cpuCandidates) {
        const hit = allRegions.find(r => normalizeText(r.cpu) === normalizeText(cpu));
        if (hit) return hit;
      }
    }
    // 2) hints in name/title
    const hs = (hints || []).map(normalizeText).filter(Boolean);
    if (hs.length) {
      const hit = allRegions.find(r => {
        const name = normalizeText(r.name || r.title || r.city || r.region || "");
        return hs.some(h => name.includes(h));
      });
      if (hit) return hit;
    }
    // 3) fallback first region
    return allRegions[0] || null;
  }

  function getScheduleContainer(region) {
    if (!region || typeof region !== "object") return null;
    return (
      region.queues ||
      region.queue ||
      region.schedules ||
      region.schedule ||
      region.outages ||
      region.data ||
      region
    );
  }

  function getQueueObject(scheduleContainer, queueKey) {
    if (!scheduleContainer) return null;

    // direct by key
    if (typeof scheduleContainer === "object" && scheduleContainer[queueKey]) return scheduleContainer[queueKey];

    // nested common patterns
    if (scheduleContainer.queues && scheduleContainer.queues[queueKey]) return scheduleContainer.queues[queueKey];
    if (scheduleContainer.schedule && scheduleContainer.schedule[queueKey]) return scheduleContainer.schedule[queueKey];

    // try to find by "queue"/"id" property
    const values = typeof scheduleContainer === "object" ? Object.values(scheduleContainer) : [];
    const hit = values.find(v => v && typeof v === "object" && (v.queue === queueKey || v.id === queueKey));
    return hit || null;
  }

  function getDayMap(queueObj, dateStr) {
    if (!queueObj) return null;

    // direct date keys
    if (queueObj[dateStr]) return queueObj[dateStr];

    // common containers
    const containers = ["days", "data", "schedule", "by_date", "dates"];
    for (const k of containers) {
      if (queueObj[k] && queueObj[k][dateStr]) return queueObj[k][dateStr];
    }

    // today/tomorrow arrays
    if (dateStr === "__today__" && queueObj.today) return queueObj.today;
    if (dateStr === "__tomorrow__" && queueObj.tomorrow) return queueObj.tomorrow;

    return null;
  }

  function slotKey(i) {
    const minutes = i * 30;
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  function toState(v) {
    if (v === null || v === undefined) return "unknown";
    if (typeof v === "boolean") return v ? "on" : "off";
    if (typeof v === "number") return v > 0 ? "on" : "off";

    const s = normalizeText(v);
    if (!s) return "unknown";
    if (["1", "on", "yes", "true", "light", "power", "available"].includes(s)) return "on";
    if (["0", "off", "no", "false", "blackout", "unavailable"].includes(s)) return "off";

    // some APIs may send "0/1" strings or "ON/OFF"
    if (s.includes("on")) return "on";
    if (s.includes("off")) return "off";

    return "unknown";
  }

  function normalizeTo48(dayMap) {
    // Array case
    if (Array.isArray(dayMap)) {
      // If already 48
      if (dayMap.length === 48) return dayMap.map(toState);

      // If 24 hours -> expand each hour to 2 slots
      if (dayMap.length === 24) {
        const out = [];
        for (const h of dayMap) out.push(toState(h), toState(h));
        return out;
      }
    }

    // Object keyed by HH:MM
    const out = [];
    for (let i = 0; i < 48; i++) {
      const k = slotKey(i);
      const v =
        (dayMap && (dayMap[k] ?? dayMap[`${k}:00`] ?? dayMap[`${k}:0`])) ??
        null;
      out.push(toState(v));
    }
    return out;
  }

  // =========================
  // RENDER
  // =========================
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
      cell.title = `${slotKey(i)} • ${st === "on" ? "є світло" : st === "off" ? "немає світла" : "невідомо"}`;
      tl.appendChild(cell);
    }

    wrap.appendChild(tl);
    return wrap;
  }

  function renderDayBlock(mount, dayLabel, slots48, { highlightNow = false } = {}) {
    const row = document.createElement("div");

    const lbl = document.createElement("div");
    lbl.className = "dayLabel";
    lbl.innerHTML = `<span>${escapeHtml(dayLabel)}</span><span></span>`;
    row.appendChild(lbl);

    row.appendChild(renderTimeline(slots48, { highlightNow }));
    mount.appendChild(row);
  }

  function renderHomeDayCard(mount, dayDate, lightSlots, waterSlots, highlightNow) {
    // Light
    const lightTitle = `${HOME.light.label} ${HOME.light.titleSuffix}`;
    const waterTitle = `${HOME.water.label} ${HOME.water.titleSuffix}`;

    renderDayBlock(mount, lightTitle, lightSlots, { highlightNow });
    renderDayBlock(mount, waterTitle, waterSlots, { highlightNow });
  }

  // =========================
  // FETCH + MAIN
  // =========================
  let autoTimer = null;
  let lastLoadedAt = null;

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

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function resolveSchedule(data, spec, queueKey, diagLines, tag) {
    const regions = asArrayRegions(data.regions);
    const region = pickRegion(regions, spec.regionCpuCandidates, spec.regionHints);

    if (!region) {
      diagLines.push(`[${tag}] region => NOT FOUND`);
      return null;
    }

    const scheduleContainer = getScheduleContainer(region);
    const queueObj = getQueueObject(scheduleContainer, queueKey);

    if (!queueObj) {
      diagLines.push(`[${tag}] cpu=${region.cpu || "?"} queue=${queueKey} => NOT FOUND`);
      return null;
    }

    const todayKey = data.date_today || "__today__";
    const tomorrowKey = data.date_tomorrow || "__tomorrow__";

    // try exact date keys, else fallback to today/tomorrow fields
    const todayMap = getDayMap(queueObj, todayKey) ?? getDayMap(queueObj, "__today__");
    const tomorrowMap = getDayMap(queueObj, tomorrowKey) ?? getDayMap(queueObj, "__tomorrow__");

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

      lastLoadedAt = new Date();
      setText("lastUpdate", `${formatTime(lastLoadedAt)}`);
      scheduleNextAuto();

      diag.push(`Data loaded from: ${DATA_URL}`);
      diag.push(`Top-level keys: ${Object.keys(data || {}).join(", ")}`);

      // subtitles with dates
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
        renderDayBlock(kyivMount, `Сьогодні (${dt})`, kyiv.todaySlots, { highlightNow: true });
        renderDayBlock(kyivMount, `Завтра (${d2})`, kyiv.tomorrowSlots, { highlightNow: false });
      }

      // HOME (today card + tomorrow card)
      const homeLight = resolveSchedule(data, HOME, HOME.light.queue, diag, "brovary-light");
      const homeWater = resolveSchedule(data, HOME, HOME.water.queue, diag, "brovary-water");

      const homeTodayMount = document.getElementById("homeTodayContent");
      const homeTomorrowMount = document.getElementById("homeTomorrowContent");
      if (homeTodayMount) homeTodayMount.innerHTML = "";
      if (homeTomorrowMount) homeTomorrowMount.innerHTML = "";

      if (homeLight && homeWater && homeTodayMount && homeTomorrowMount) {
        // LEFT: today (Light + Water)
        renderHomeDayCard(
          homeTodayMount,
          dt,
          homeLight.todaySlots,
          homeWater.todaySlots,
          true
        );

        // RIGHT: tomorrow (Light + Water)
        renderHomeDayCard(
          homeTomorrowMount,
          d2,
          homeLight.tomorrowSlots,
          homeWater.tomorrowSlots,
          false
        );
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

  // =========================
  // BOOT
  // =========================
  function boot() {
    injectCss();
    buildLayout();

    const btn = document.getElementById("btnRefresh");
    if (btn) btn.addEventListener("click", () => refresh());

    // first load
    refresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

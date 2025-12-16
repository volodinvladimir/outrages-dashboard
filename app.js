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

  // ---------------- DOM helpers ----------------
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
    const app = el("app");
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
          <div class="card" id="cardKyiv">
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

    el("btnRefresh").addEventListener("click", () => refresh());
  }

  // ---------------- Time helpers ----------------
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

  // ---------------- Data fetch ----------------
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
    autoTimer = setTimeout(() => refresh(), AUTO_REFRESH_MIN * 60 * 1000);
  }

  // ---------------- Parsing (svitlo-proxy) ----------------
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
  // - if there is any '2' => 1=ON, 2=OFF, 0=UNKNOWN
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
    } else {
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
      out[i] = decode(dayMap[k], scheme);
    }
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

  // ---------------- Rendering ----------------
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
      cell.title = `${slotKey(i)} • ${st === "on" ? "є" : st === "off" ? "немає" : "невідомо"}`;
      tl.appendChild(cell);
    }

    const tlWrap = document.createElement("div");
    tlWrap.className = "timelineWrap";
    tlWrap.appendChild(tl);

    // ✅ vertical now line
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

  // ---------------- Main refresh ----------------
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

      // KYIV
      const kyiv = resolve(data, KYIV, KYIV.queue, diag, "kyiv");
      el("kyivContent").innerHTML = "";
      if (kyiv) {
        renderBlock(el("kyivContent"), `Сьогодні (${kyiv.dt})`, kyiv.todaySlots, true);
        renderBlock(el("kyivContent"), `Завтра (${kyiv.d2})`, kyiv.tomorrowSlots, false);
      }

      // HOME
      const homeSpec = { cpuCandidates: HOME.cpuCandidates, hints: HOME.hints };
      const homeLight = resolve(data, homeSpec, HOME.light.queue, diag, "brovary-light");
      const homeWater = resolve(data, homeSpec, HOME.water.queue, diag, "brovary-water");

      el("homeTodayContent").innerHTML = "";
      el("homeTomorrowContent").innerHTML = "";

      if (homeLight && homeWater) {
        el("homeTodaySub").textContent = `${HOME.cityLabel} • ${homeLight.dt}`;
        el("homeTomorrowSub").textContent = `${HOME.cityLabel} • ${homeLight.d2}`;

        // LEFT: today (Light + Water) — highlight now
        renderBlock(el("homeTodayContent"), HOME.light.label, homeLight.todaySlots, true);
        renderBlock(el("homeTodayContent"), HOME.water.label, homeWater.todaySlots, true);

        // RIGHT: tomorrow (Light + Water) — no now highlight
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

  // ---------------- Boot ----------------
  function boot() {
    buildLayout();
    refresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

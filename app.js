/* eslint-disable no-console */

/**
 * Dashboard для графіків відключень (svitlo-proxy).
 * Фікс: правильний парсинг формату:
 * {
 *   date_today, date_tomorrow,
 *   regions: [{ cpu, name_ua, name_en, schedule: { "6.1": { "YYYY-MM-DD": { "00:00": 1, ... } } } }]
 * }
 */

const API_PRIMARY = "https://svitlo-proxy.svitlo-proxy.workers.dev/"; // публічний проксі
const API_FALLBACK = "./data/svitlo_proxy_cache.json";               // локальний кеш (опційно)
const AUTO_REFRESH_MINUTES = 60;

const CONFIG_DEFAULT = [
  {
    id: "kyiv",
    mountId: "chart-kyiv",
    title: "ЯвКурсі • Київ — світло",
    cpu: "kyiv",
    queue: "6.1",
    mode: "electricity",
    invert: false,
    regionHints: ["Київ", "Kyiv"],
  },
  {
    id: "brovary-light",
    mountId: "chart-brovary-light",
    title: "Дім — світло (Бровари)",
    // Бровари входять у Київську область, у svitlo-proxy це регіон cpu=kiivska-oblast
    cpu: "kiivska-oblast",
    queue: "3.1",
    mode: "electricity",
    invert: false,
    regionHints: ["Київська", "Kyiv region", "Kyiv Oblast"],
  },
  {
    id: "brovary-water",
    mountId: "chart-brovary-water",
    title: "Дім — вода (Бровари)",
    cpu: "kiivska-oblast",
    queue: "1.2",
    mode: "water",
    invert: false,
    regionHints: ["Київська", "Kyiv region", "Kyiv Oblast"],
  },
];

const $ = (id) => document.getElementById(id);

const state = {
  config: loadConfig(),
  data: null,
  source: null,
  lastUpdated: null,
  nextRefreshAt: null,
  timer: null,
};

/* -------------------- Config -------------------- */

function loadConfig() {
  try {
    const raw = localStorage.getItem("yavkursi_svitlo_config");
    const cfg = raw ? JSON.parse(raw) : null;
    const finalCfg = Array.isArray(cfg) && cfg.length ? migrateConfig(cfg) : migrateConfig(CONFIG_DEFAULT);

    // якщо міграція щось змінила — збережемо
    localStorage.setItem("yavkursi_svitlo_config", JSON.stringify(finalCfg));
    return finalCfg;
  } catch {
    const finalCfg = migrateConfig(CONFIG_DEFAULT);
    try {
      localStorage.setItem("yavkursi_svitlo_config", JSON.stringify(finalCfg));
    } catch {}
    return finalCfg;
  }
}

function migrateConfig(cfg) {
  // Міграція зі старого формату (де були лише regionHints і не було cpu)
  const cloned = cfg.map((x) => ({ ...x }));

  for (const item of cloned) {
    item.queue = String(item.queue || "").trim();

    // якщо cpu відсутній — намагаємось здогадатися
    if (!item.cpu) {
      const hintText = (item.regionHints || []).join(" ").toLowerCase();
      if (hintText.includes("бровар") || hintText.includes("kyiv region") || hintText.includes("київська область")) {
        item.cpu = "kiivska-oblast";
      } else if (hintText.includes("м.київ") || hintText.includes("київ") || hintText.includes("kyiv city") || hintText === "kyiv") {
        item.cpu = "kyiv";
      }
    }

    // підстрахуємось для старих brovary-* конфігів
    if (item.id === "brovary-light" || item.id === "brovary-water") {
      item.cpu = "kiivska-oblast";
    }
    if (item.id === "kyiv") {
      item.cpu = "kyiv";
    }

    if (!Array.isArray(item.regionHints)) item.regionHints = [];
    if (!item.mode) item.mode = "electricity";
    if (typeof item.invert !== "boolean") item.invert = false;
  }

  return cloned;
}

/* -------------------- Time helpers -------------------- */

function nowKyiv() {
  return new Date();
}

function formatDateUA(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
}

function formatTimeHHMM(minutesFromMidnight) {
  const h = String(Math.floor(minutesFromMidnight / 60)).padStart(2, "0");
  const m = String(minutesFromMidnight % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function minutesSinceMidnight(d) {
  return d.getHours() * 60 + d.getMinutes();
}

function halfHourIndexFromMinutes(mins) {
  return Math.floor(mins / 30);
}

/* -------------------- Data fetch -------------------- */

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json();
}

async function loadData() {
  try {
    const data = await fetchJson(API_PRIMARY);
    state.source = API_PRIMARY;
    return data;
  } catch (e) {
    debug(`Direct fetch failed: ${String(e)}\nTrying fallback cache: ${API_FALLBACK}`);
  }

  const data = await fetchJson(API_FALLBACK);
  state.source = API_FALLBACK;
  return data;
}

/* -------------------- Parsing helpers -------------------- */

function isObject(x) {
  return x && typeof x === "object" && !Array.isArray(x);
}

function asString(x) {
  return typeof x === "string" ? x : "";
}

function includesAny(haystack, needles) {
  const h = (haystack || "").toLowerCase();
  return (needles || []).some((n) => h.includes(String(n).toLowerCase()));
}

function mapToState(v, invert) {
  let st = "unk";

  if (v === true) st = "on";
  else if (v === false) st = "off";
  else if (typeof v === "number") {
    if (v === 1) st = "on";
    else if (v === 0) st = "off";
    else st = "unk"; // часто 2 = "може бути"
  } else if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "1" || s === "on" || s === "yes" || s === "true" || s === "light") st = "on";
    else if (s === "0" || s === "off" || s === "no" || s === "false" || s === "blackout" || s === "outage") st = "off";
    else if (s === "2" || s === "unknown" || s === "n/a") st = "unk";
  }

  if (invert) {
    if (st === "on") return "off";
    if (st === "off") return "on";
  }
  return st;
}

function normalizeSlots(input, invert = false) {
  // output: Array(48) with values: "on" | "off" | "unk"
  const out = new Array(48).fill("unk");
  if (input == null) return out;

  // array of 48 values
  if (Array.isArray(input)) {
    const arr = input.slice(0, 48);
    for (let i = 0; i < 48; i++) out[i] = mapToState(arr[i], invert);
    return out;
  }

  // string like "0102..."
  if (typeof input === "string") {
    const cleaned = input.trim().replace(/[^012]/g, "");
    if (cleaned.length >= 48) {
      for (let i = 0; i < 48; i++) out[i] = mapToState(cleaned[i], invert);
      return out;
    }
  }

  // object mapping "HH:MM" -> 0/1/2
  if (isObject(input)) {
    const keys = Object.keys(input);
    const hasTimeKeys = keys.some((k) => /^\d{1,2}:\d{2}$/.test(k));
    if (hasTimeKeys) {
      for (const k of keys) {
        const m = k.match(/^(\d{1,2}):(\d{2})$/);
        if (!m) continue;
        const hh = Number(m[1]);
        const mm = Number(m[2]);
        const idx = hh * 2 + (mm >= 30 ? 1 : 0);
        if (idx >= 0 && idx < 48) out[idx] = mapToState(input[k], invert);
      }
      return out;
    }

    if (Array.isArray(input.slots)) return normalizeSlots(input.slots, invert);
  }

  return out;
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
  }
  return undefined;
}

function findAnyTimestamp(data) {
  // у цьому проксі може не бути timestamp — тоді повернемо null
  const ts = pick(data, ["timestamp", "updated_at", "updatedAt", "last_update", "lastUpdate"]);
  return ts || null;
}

/**
 * Нормальний парсер саме під svitlo-proxy:
 * data.regions[].schedule[queue][YYYY-MM-DD] = { "00:00": 1, "00:30": 2, ... }
 */
function extractScheduleProxy(data, item) {
  if (!data || !Array.isArray(data.regions)) return null;

  const cpuWanted = String(item.cpu || "").trim();
  const queue = String(item.queue || "").trim();
  if (!queue) return null;

  const dateToday = asString(data.date_today);
  const dateTomorrow = asString(data.date_tomorrow);

  // 1) find region by cpu
  let region = null;

  if (cpuWanted) {
    region = data.regions.find((r) => String(r.cpu || "").trim() === cpuWanted) || null;
  }

  // 2) fallback by hints (name_ua/name_en/cpu)
  if (!region && item.regionHints && item.regionHints.length) {
    region = data.regions.find((r) => {
      const text = `${r.cpu || ""} ${r.name_ua || ""} ${r.name_en || ""} ${r.name_ru || ""}`;
      return includesAny(text, item.regionHints);
    }) || null;
  }

  if (!region || !isObject(region.schedule)) return null;

  const qObj = region.schedule[queue];
  if (!isObject(qObj)) return null;

  // qObj може бути:
  // { "2025-12-16": { "00:00": 1, ... }, "2025-12-17": { ... } }
  // або інколи одразу { "00:00": 1, ... } (без дат)
  const todayRaw = (dateToday && qObj[dateToday]) ? qObj[dateToday] : pick(qObj, ["today", "day_0", "d0"]);
  const tomorrowRaw = (dateTomorrow && qObj[dateTomorrow]) ? qObj[dateTomorrow] : pick(qObj, ["tomorrow", "day_1", "d1"]);

  // якщо дат немає, але це time-map — вважаймо це "today"
  const looksLikeTimeMap = isObject(qObj) && Object.keys(qObj).some((k) => /^\d{1,2}:\d{2}$/.test(k));
  const todayFinalRaw = todayRaw || (looksLikeTimeMap ? qObj : null);

  const todaySlots = normalizeSlots(todayFinalRaw, item.invert);
  const tomorrowSlots = normalizeSlots(tomorrowRaw, item.invert);

  const score = scoreSlots(todaySlots) + scoreSlots(tomorrowSlots);
  if (score <= 0) return null;

  return {
    score,
    todaySlots,
    tomorrowSlots,
    regionText: `${region.name_ua || region.name_en || region.cpu || "region"} (${region.cpu || "—"})`,
  };
}

function scoreSlots(slots) {
  return (slots || []).reduce((acc, s) => acc + (s === "unk" ? 0 : 1), 0);
}

/* -------------------- Rendering -------------------- */

function buildHoursBar() {
  const div = document.createElement("div");
  div.className = "hours";
  div.innerHTML = `<span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>`;
  return div;
}

function textsForMode(mode) {
  if (mode === "water") {
    return { on: "Є вода", off: "Немає води", unk: "Невідомо" };
  }
  return { on: "Є світло", off: "Немає світла", unk: "Невідомо" };
}

function renderChart(mountId, schedule, label, mode = "electricity") {
  const mount = $(mountId);
  mount.innerHTML = "";

  const now = nowKyiv();
  const today = new Date(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(today.getDate() + 1);

  const nowIdx = halfHourIndexFromMinutes(minutesSinceMidnight(now));
  const t = textsForMode(mode);

  const rows = [
    { dayLabel: `Сьогодні (${formatDateUA(today)})`, slots: schedule?.todaySlots || new Array(48).fill("unk"), isToday: true },
    { dayLabel: `Завтра (${formatDateUA(tomorrow)})`, slots: schedule?.tomorrowSlots || new Array(48).fill("unk"), isToday: false },
  ];

  for (const row of rows) {
    const rowWrap = document.createElement("div");
    rowWrap.className = "row";

    const header = document.createElement("div");
    header.className = "row__label";
    header.innerHTML = `<strong>${row.dayLabel}</strong><span>${label || ""}</span>`;
    rowWrap.appendChild(header);

    rowWrap.appendChild(buildHoursBar());

    const timeline = document.createElement("div");
    timeline.className = "timeline";

    for (let i = 0; i < 48; i++) {
      const slot = document.createElement("div");
      const st = row.slots[i] || "unk";
      slot.className = `slot ${st}`;

      if (row.isToday && i === nowIdx) slot.classList.add("now");

      const start = i * 30;
      const end = start + 30;
      slot.dataset.tipTitle = row.dayLabel;
      slot.dataset.tipText = `${formatTimeHHMM(start)}–${formatTimeHHMM(end)} • ${st === "on" ? t.on : st === "off" ? t.off : t.unk}`;

      slot.addEventListener("mousemove", onSlotMove);
      slot.addEventListener("mouseenter", onSlotEnter);
      slot.addEventListener("mouseleave", onSlotLeave);

      timeline.appendChild(slot);
    }

    rowWrap.appendChild(timeline);
    mount.appendChild(rowWrap);
  }

  if (!schedule) {
    const warn = document.createElement("div");
    warn.style.marginTop = "10px";
    warn.style.color = "rgba(255,170,170,.95)";
    warn.style.fontSize = "12px";
    warn.textContent = "Не вдалося знайти графік у JSON. Дивіться блок «Діагностика» нижче.";
    mount.appendChild(warn);
  }
}

/* -------------------- Tooltip -------------------- */

const tooltip = $("tooltip");

function onSlotEnter(e) {
  tooltip.style.display = "block";
  tooltip.setAttribute("aria-hidden", "false");
  updateTooltip(e);
}

function onSlotMove(e) {
  updateTooltip(e);
}

function onSlotLeave() {
  tooltip.style.display = "none";
  tooltip.setAttribute("aria-hidden", "true");
}

function updateTooltip(e) {
  const el = e.currentTarget;
  const title = el.dataset.tipTitle || "";
  const text = el.dataset.tipText || "";

  tooltip.innerHTML = `<strong>${escapeHtml(title)}</strong>${escapeHtml(text)}`;

  const pad = 14;
  let x = e.clientX + pad;
  let y = e.clientY + pad;

  const rect = tooltip.getBoundingClientRect();
  if (x + rect.width > window.innerWidth - 8) x = e.clientX - rect.width - pad;
  if (y + rect.height > window.innerHeight - 8) y = e.clientY - rect.height - pad;

  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  }[c]));
}

/* -------------------- Diagnostics -------------------- */

function debug(message) {
  const el = $("debug");
  el.textContent = message;
}

function appendDebug(line) {
  const el = $("debug");
  el.textContent += `\n${line}`;
}

/* -------------------- App -------------------- */

function computeNextRefresh() {
  const now = new Date();
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  state.nextRefreshAt = next;
  renderNextRefresh();
}

function renderNextRefresh() {
  const el = $("nextRefresh");
  if (!state.nextRefreshAt) return (el.textContent = "—");

  const diffMs = state.nextRefreshAt - new Date();
  const mins = Math.max(0, Math.round(diffMs / 60000));
  el.textContent = `${state.nextRefreshAt.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })} (через ~${mins} хв)`;
}

async function refresh() {
  $("refreshBtn").disabled = true;
  $("refreshBtn").textContent = "Оновлення…";

  try {
    debug("Завантажую дані…");
    const data = await loadData();
    state.data = data;

    $("sourceUrl").textContent = state.source || "—";

    state.lastUpdated = findAnyTimestamp(data);
    $("lastUpdated").textContent = state.lastUpdated ? String(state.lastUpdated) : "—";

    appendDebug(`Data loaded from: ${state.source}`);
    appendDebug(`Top-level keys: ${Object.keys(data || {}).slice(0, 30).join(", ") || "(array/json)"}`);

    // Render all charts
    for (const item of state.config) {
      const schedule = extractScheduleProxy(data, item);
      renderChart(item.mountId, schedule, `черга ${item.queue}`, item.mode);

      appendDebug(
        `[${item.id}] cpu=${item.cpu || "—"} queue=${item.queue} => ${schedule ? "OK" : "NOT FOUND"}`
      );
      if (schedule?.regionText) appendDebug(`  matched: ${schedule.regionText}`);
    }

    computeNextRefresh();
  } catch (e) {
    debug(
      `Помилка: ${String(e)}\n\nМожливі причини:\n- CORS (браузер блокує запит до проксі)\n- Проксі тимчасово недоступний\n- Формат JSON змінився\n\nСпробуйте:\n1) Оновити сторінку\n2) Відкрити консоль браузера та надіслати помилку`
    );
  } finally {
    $("refreshBtn").disabled = false;
    $("refreshBtn").textContent = "Оновити";
  }
}

function startAutoRefresh() {
  if (state.timer) clearInterval(state.timer);

  state.timer = setInterval(() => {
    if (state.nextRefreshAt && new Date() >= state.nextRefreshAt) {
      refresh();
    } else {
      renderNextRefresh();
    }
  }, 30_000);
}

document.addEventListener("DOMContentLoaded", () => {
  $("refreshBtn").addEventListener("click", () => refresh());
  refresh();
  startAutoRefresh();
});

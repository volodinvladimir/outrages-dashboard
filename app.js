/* eslint-disable no-console */

const API_PRIMARY = "https://svitlo-proxy.svitlo-proxy.workers.dev/";   // публічний проксі (ключі сховані у воркері)
const API_FALLBACK = "./data/svitlo_proxy_cache.json";                  // кеш, який може оновлювати GitHub Action
const AUTO_REFRESH_MINUTES = 60;

const CONFIG_DEFAULT = [
  {
    id: "kyiv",
    mountId: "chart-kyiv",
    title: "ЯвКурсі • Київ — світло",
    regionHints: ["м.Київ", "Київ", "Kyiv", "Kyiv City"],
    queue: "6.1",
    mode: "electricity",
    invert: false,
  },
  {
    id: "brovary-light",
    mountId: "chart-brovary-light",
    title: "Дім — світло (Бровари)",
    regionHints: ["Бровари", "Brovary", "Київська область", "Kyiv region"],
    queue: "3.1",
    mode: "electricity",
    invert: false,
  },
  {
    id: "brovary-water",
    mountId: "chart-brovary-water",
    title: "Дім — вода (Бровари)",
    regionHints: ["Бровари", "Brovary", "Київська область", "Kyiv region"],
    queue: "1.2",
    mode: "water",
    invert: false,
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

function loadConfig() {
  try {
    const raw = localStorage.getItem("yavkursi_svitlo_config");
    if (!raw) return CONFIG_DEFAULT;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return CONFIG_DEFAULT;
    return parsed;
  } catch {
    return CONFIG_DEFAULT;
  }
}

function saveConfig() {
  localStorage.setItem("yavkursi_svitlo_config", JSON.stringify(state.config));
}

function nowKyiv() {
  // браузер користувача зазвичай у Europe/Kyiv, але на всяк випадок:
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
  // 1) пробуємо напряму (у браузері)
  try {
    const data = await fetchJson(API_PRIMARY);
    state.source = API_PRIMARY;
    return data;
  } catch (e) {
    debug(`Direct fetch failed: ${String(e)}\nTrying fallback cache: ${API_FALLBACK}`);
  }

  // 2) fallback: локальний кеш (оновлюється GitHub Action)
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
  return needles.some((n) => h.includes(String(n).toLowerCase()));
}

function normalizeSlots(input, invert = false) {
  // Expected output: Array(48) with values: "on" | "off" | "unk"
  const out = new Array(48).fill("unk");

  if (input == null) return out;

  // 1) array of 48 values (0/1/true/false/"on"/"off"/etc.)
  if (Array.isArray(input)) {
    const arr = input.slice(0, 48);
    for (let i = 0; i < 48; i++) {
      const v = arr[i];
      out[i] = mapToState(v, invert);
    }
    return out;
  }

  // 2) string of length >= 48 like "010011..."
  if (typeof input === "string") {
    const s = input.trim();
    // remove non 0/1/2 chars
    const cleaned = s.replace(/[^012]/g, "");
    if (cleaned.length >= 48) {
      for (let i = 0; i < 48; i++) {
        out[i] = mapToState(cleaned[i], invert);
      }
      return out;
    }
  }

  // 3) object mapping times to state
  if (isObject(input)) {
    // If it looks like {"00:00":"on", "00:30":"off", ...}
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

    // If it looks like {slots:[...]} or {today:[...]}
    if (Array.isArray(input.slots)) return normalizeSlots(input.slots, invert);
  }

  return out;
}

function mapToState(v, invert) {
  // Try to interpret many variants
  let st = "unk";

  if (v === true) st = "on";
  else if (v === false) st = "off";
  else if (typeof v === "number") {
    if (v === 1) st = "on";
    else if (v === 0) st = "off";
    else st = "unk";
  } else if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "1" || s === "on" || s === "yes" || s === "true" || s === "grid on" || s === "light") st = "on";
    else if (s === "0" || s === "off" || s === "no" || s === "false" || s === "grid off" || s === "blackout" || s === "outage") st = "off";
    else if (s === "2" || s === "unknown" || s === "n/a") st = "unk";
  }

  if (invert) {
    if (st === "on") return "off";
    if (st === "off") return "on";
  }
  return st;
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
  }
  return undefined;
}

function findAnyTimestamp(data) {
  const candidates = [];
  walk(data, (node) => {
    if (!isObject(node)) return;
    const v = pick(node, ["updated_at", "updatedAt", "last_update", "lastUpdate", "schedule_updated", "scheduleUpdated", "timestamp"]);
    if (v) candidates.push(v);
  });
  if (candidates.length === 0) return null;
  // pick the "largest" string/number-ish
  return candidates[0];
}

function walk(node, fn, ctx = { regionTrail: [] }) {
  fn(node, ctx);
  if (Array.isArray(node)) {
    for (const item of node) walk(item, fn, ctx);
  } else if (isObject(node)) {
    // update region context when sees name-ish keys
    const name = pick(node, ["region_name", "regionName", "region", "name", "title", "city", "oblast", "area"]);
    const nextCtx = { regionTrail: ctx.regionTrail };
    if (typeof name === "string" && name.length <= 80) {
      nextCtx.regionTrail = [...ctx.regionTrail, name];
    }
    for (const k of Object.keys(node)) {
      walk(node[k], fn, nextCtx);
    }
  }
}

/**
 * Tries to extract {todaySlots, tomorrowSlots, meta} for a given regionHints + queue.
 * We use a best-effort heuristic because the proxy JSON can change.
 */
function extractSchedule(data, regionHints, queue, invert = false) {
  const matches = [];

  walk(data, (node, ctx) => {
    if (!isObject(node)) return;

    // look for queue identifiers
    const q = pick(node, ["queue", "queue_id", "queueId", "group", "group_id", "groupId", "cherga", "черга"]);
    const qStr = q != null ? String(q) : "";

    const regionText = (ctx.regionTrail || []).join(" / ");

    const regionOk = regionHints && regionHints.length
      ? includesAny(regionText, regionHints) || includesAny(pick(node, ["region_name", "regionName", "region", "name", "title"]), regionHints)
      : true;

    const queueOk = qStr === queue
      || qStr.replace(/\s/g, "") === queue.replace(/\s/g, "")
      || (pick(node, ["queues"]) && Object.prototype.hasOwnProperty.call(node.queues, queue));

    if (!regionOk || !queueOk) return;

    // possible schedules
    let today = pick(node, ["today", "day_0", "d0", "schedule_today", "scheduleToday"]);
    let tomorrow = pick(node, ["tomorrow", "day_1", "d1", "schedule_tomorrow", "scheduleTomorrow"]);

    // nested schedule object
    if (!today || !tomorrow) {
      const sch = pick(node, ["schedule", "graph", "outages", "slots"]);
      if (isObject(sch)) {
        today = today ?? pick(sch, ["today", "day_0", "d0"]);
        tomorrow = tomorrow ?? pick(sch, ["tomorrow", "day_1", "d1"]);
      }
    }

    // or in queues map
    if ((!today || !tomorrow) && isObject(node.queues) && isObject(node.queues[queue])) {
      const qObj = node.queues[queue];
      today = today ?? pick(qObj, ["today", "day_0", "d0", "slots_today"]);
      tomorrow = tomorrow ?? pick(qObj, ["tomorrow", "day_1", "d1", "slots_tomorrow"]);
    }

    const todaySlots = normalizeSlots(today, invert);
    const tomorrowSlots = normalizeSlots(tomorrow, invert);

    // accept if at least something non-unknown
    const score = scoreSlots(todaySlots) + scoreSlots(tomorrowSlots);

    if (score > 0) {
      matches.push({
        score,
        todaySlots,
        tomorrowSlots,
        regionText,
        rawNode: node
      });
    }
  });

  matches.sort((a, b) => b.score - a.score);
  return matches[0] || null;
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

function renderChart(mountId, schedule, label) {
  const mount = $(mountId);
  mount.innerHTML = "";

  const now = nowKyiv();
  const today = new Date(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(today.getDate() + 1);

  const nowIdx = halfHourIndexFromMinutes(minutesSinceMidnight(now));

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
      slot.dataset.tipText = `${formatTimeHHMM(start)}–${formatTimeHHMM(end)} • ${st === "on" ? "Є світло" : st === "off" ? "Немає світла" : "Невідомо"}`;

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

    // last update best-effort
    state.lastUpdated = findAnyTimestamp(data);
    $("lastUpdated").textContent = state.lastUpdated ? String(state.lastUpdated) : "—";

    appendDebug(`Data loaded from: ${state.source}`);
    appendDebug(`Top-level keys: ${Object.keys(data || {}).slice(0, 30).join(", ") || "(array/json)"}`);

    // Render all charts
    for (const item of state.config) {
      const schedule = extractSchedule(data, item.regionHints, item.queue, item.invert);
      renderChart(item.mountId, schedule, `${item.queue}`);
      appendDebug(`[${item.id}] regionHints=${JSON.stringify(item.regionHints)} queue=${item.queue} => ${schedule ? "OK" : "NOT FOUND"}`);
      if (schedule && schedule.regionText) appendDebug(`  matched region trail: ${schedule.regionText}`);
    }

    computeNextRefresh();
  } catch (e) {
    debug(`Помилка: ${String(e)}\n\nМожливі причини:\n- CORS (браузер блокує запит до проксі)\n- Проксі тимчасово недоступний\n- Формат JSON змінився\n\nСпробуйте:\n1) Увімкнути GitHub Action (див. README) і оновити сторінку\n2) Відкрити консоль браузера та надіслати помилку`);
  } finally {
    $("refreshBtn").disabled = false;
    $("refreshBtn").textContent = "Оновити";
  }
}

function startAutoRefresh() {
  if (state.timer) clearInterval(state.timer);

  state.timer = setInterval(() => {
    // if it is time (or past) — refresh
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

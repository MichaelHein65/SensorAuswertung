const { DateTime, Settings } = luxon;
Settings.defaultLocale = "de";
const AXIS_STORAGE_KEY = "sensor-panorama-axis-ranges-v1";

const state = {
  rawData: [],
  visibleMetrics: new Set(["temperature", "humidity", "pressure"]),
  mode: "day",
  anchorDate: DateTime.local().startOf("day"),
  customRange: null,
  filteredData: [],
  focusIndex: 0,
  axisRanges: {},
};

const METRICS = {
  temperature: {
    key: "temperature",
    label: "Temperatur",
    unit: "°C",
    color: "#d24a32",
    axisName: "°C",
    min: 15,
    max: 30,
    format: (v) => `${v.toFixed(2)} °C`,
  },
  humidity: {
    key: "humidity",
    label: "Luftfeuchte",
    unit: "%",
    color: "#226f63",
    axisName: "%",
    min: 20,
    max: 60,
    format: (v) => `${v.toFixed(2)} %`,
  },
  pressure: {
    key: "pressure",
    label: "Druck",
    unit: "hPa",
    color: "#3f5fca",
    axisName: "hPa",
    min: 950,
    max: 1100,
    format: (v) => `${v.toFixed(2)} hPa`,
  },
};

const statusEl = document.getElementById("status");
const rangeLabelEl = document.getElementById("rangeLabel");
const chartTitleEl = document.getElementById("chartTitle");
const kpiGridEl = document.getElementById("kpiGrid");
const metricRowEl = document.getElementById("metricRow");
const quickPicksEl = document.getElementById("quickPicks");
const focusDateEl = document.getElementById("focusDate");
const focusSlider = document.getElementById("focusSlider");
const resetAxesBtn = document.getElementById("resetAxes");

const chart = echarts.init(document.getElementById("chart"), null, { renderer: "canvas" });

function setStatus(text, tone = "ok") {
  statusEl.textContent = text;
  statusEl.style.background = tone === "error" ? "rgba(210, 74, 50, 0.14)" : "rgba(34, 111, 99, 0.12)";
}

function loadAxisRangesFromStorage() {
  try {
    const raw = localStorage.getItem(AXIS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (_err) {
    return null;
  }
}

function persistAxisRanges() {
  try {
    localStorage.setItem(AXIS_STORAGE_KEY, JSON.stringify(state.axisRanges));
  } catch (_err) {
    // Ignore storage errors (private mode/quota), app still works with in-memory state.
  }
}

function initAxisRanges() {
  const storedRanges = loadAxisRangesFromStorage();
  Object.values(METRICS).forEach((metric) => {
    const stored = storedRanges ? storedRanges[metric.key] : null;
    const storedMin = stored ? Number(stored.min) : NaN;
    const storedMax = stored ? Number(stored.max) : NaN;
    if (Number.isFinite(storedMin) && Number.isFinite(storedMax) && storedMin < storedMax) {
      state.axisRanges[metric.key] = { min: storedMin, max: storedMax };
    } else {
      state.axisRanges[metric.key] = { min: metric.min, max: metric.max };
    }
  });
}

function setAxisRangesToMetricDefaults() {
  Object.values(METRICS).forEach((metric) => {
    state.axisRanges[metric.key] = { min: metric.min, max: metric.max };
  });
}

function axisInputIds(key) {
  return {
    min: `${key}Min`,
    max: `${key}Max`,
  };
}

function syncAxisInputs() {
  Object.values(METRICS).forEach((metric) => {
    const ids = axisInputIds(metric.key);
    const minEl = document.getElementById(ids.min);
    const maxEl = document.getElementById(ids.max);
    const range = state.axisRanges[metric.key];
    if (!minEl || !maxEl || !range) return;
    minEl.value = String(range.min);
    maxEl.value = String(range.max);
  });
}

function applyAxisRange(metricKey) {
  const ids = axisInputIds(metricKey);
  const minEl = document.getElementById(ids.min);
  const maxEl = document.getElementById(ids.max);
  if (!minEl || !maxEl) return;

  const min = Number(minEl.value);
  const max = Number(maxEl.value);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
    setStatus("Y-Achse ungueltig: Min muss kleiner als Max sein.", "error");
    syncAxisInputs();
    return;
  }

  state.axisRanges[metricKey] = { min, max };
  persistAxisRanges();
  renderChart(state.filteredData);
}

function parseData(content) {
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    return [];
  }

  return lines
    .slice(1)
    .map((line) => {
      const [timestamp, t, h, p] = line.split("|");
      const dt = DateTime.fromISO(timestamp, { zone: "local" });
      if (!dt.isValid) {
        return null;
      }
      return {
        dt,
        temperature: Number(t),
        humidity: Number(h),
        pressure: Number(p),
      };
    })
    .filter((row) => row && Number.isFinite(row.temperature) && Number.isFinite(row.humidity) && Number.isFinite(row.pressure))
    .sort((a, b) => a.dt.toMillis() - b.dt.toMillis());
}

function computeInterval() {
  if (state.customRange) {
    return state.customRange;
  }

  const d = state.anchorDate;
  if (state.mode === "day") {
    const start = d.startOf("day");
    return { start, end: start.plus({ days: 1 }) };
  }
  if (state.mode === "week") {
    const start = d.startOf("week");
    return { start, end: start.plus({ weeks: 1 }) };
  }
  if (state.mode === "month") {
    const start = d.startOf("month");
    return { start, end: start.plus({ months: 1 }) };
  }
  const start = d.startOf("year");
  return { start, end: start.plus({ years: 1 }) };
}

function floorKey(dt, mode) {
  if (mode === "day") return dt.toISO();
  if (mode === "week") return dt.startOf("hour").toISO();
  if (mode === "month") return dt.startOf("day").toISODate();
  const isoWeek = `${dt.weekYear}-W${String(dt.weekNumber).padStart(2, "0")}`;
  return isoWeek;
}

function aggregate(rows) {
  const mode = state.mode;
  if (mode === "day") {
    return rows;
  }

  const bucket = new Map();
  for (const row of rows) {
    const key = floorKey(row.dt, mode);
    if (!bucket.has(key)) {
      bucket.set(key, {
        key,
        count: 0,
        timestamp: row.dt,
        temperature: 0,
        humidity: 0,
        pressure: 0,
      });
    }
    const b = bucket.get(key);
    b.count += 1;
    b.temperature += row.temperature;
    b.humidity += row.humidity;
    b.pressure += row.pressure;
    if (row.dt < b.timestamp) b.timestamp = row.dt;
  }

  return [...bucket.values()]
    .map((b) => ({
      dt: b.timestamp,
      temperature: b.temperature / b.count,
      humidity: b.humidity / b.count,
      pressure: b.pressure / b.count,
    }))
    .sort((a, b) => a.dt.toMillis() - b.dt.toMillis());
}

function renderKpis(data) {
  kpiGridEl.innerHTML = "";

  Object.values(METRICS).forEach((metric) => {
    const values = data.map((d) => d[metric.key]);
    const last = values.at(-1);
    const avg = values.reduce((sum, v) => sum + v, 0) / (values.length || 1);
    const min = values.length ? Math.min(...values) : NaN;
    const max = values.length ? Math.max(...values) : NaN;

    const card = document.createElement("article");
    card.className = "kpi";
    card.innerHTML = `
      <p class="label">${metric.label}</p>
      <div class="kpi-main">
        <div class="kpi-value">${Number.isFinite(last) ? last.toFixed(2) : "-"}</div>
        <span class="kpi-unit">${metric.unit}</span>
      </div>
      <div class="kpi-mini">
        <span>Mittel ${Number.isFinite(avg) ? avg.toFixed(2) : "-"}</span>
        <span>Min ${Number.isFinite(min) ? min.toFixed(2) : "-"}</span>
        <span>Max ${Number.isFinite(max) ? max.toFixed(2) : "-"}</span>
      </div>
    `;
    kpiGridEl.appendChild(card);
  });
}

function formatRangeLabel(interval) {
  const start = interval.start;
  const end = interval.end.minus({ seconds: 1 });

  if (state.customRange) {
    return `${start.toFormat("dd.LL.yyyy HH:mm")} - ${end.toFormat("dd.LL.yyyy HH:mm")}`;
  }
  if (state.mode === "day") return start.toFormat("cccc, dd. LLL yyyy");
  if (state.mode === "week") return `KW ${start.weekNumber}, ${start.toFormat("yyyy")} (${start.toFormat("dd.LL")} - ${end.toFormat("dd.LL")})`;
  if (state.mode === "month") return start.toFormat("LLLL yyyy");
  return start.toFormat("yyyy");
}

function buildSeries(data) {
  const series = [];
  const yAxis = [];
  const visibleMetrics = Object.values(METRICS).filter((metric) => state.visibleMetrics.has(metric.key));
  const rightAxisKey = visibleMetrics.some((m) => m.key === "pressure")
    ? "pressure"
    : (visibleMetrics.some((m) => m.key === "humidity") ? "humidity" : "temperature");

  const axisIndex = {};
  let leftAxisCount = 0;

  visibleMetrics.forEach((metric, idx) => {
    const isRightAxis = metric.key === rightAxisKey;
    const offset = isRightAxis ? 0 : (leftAxisCount * 56);
    if (!isRightAxis) {
      leftAxisCount += 1;
    }

    axisIndex[metric.key] = idx;
    const dynamicRange = state.axisRanges[metric.key] || { min: metric.min, max: metric.max };
    yAxis.push({
      type: "value",
      name: metric.axisName,
      min: dynamicRange.min,
      max: dynamicRange.max,
      position: isRightAxis ? "right" : "left",
      offset,
      axisLine: { show: true, lineStyle: { color: metric.color } },
      splitLine: { show: metric.key === "temperature" },
      axisLabel: { color: "#45534d" },
    });
    series.push({
      name: metric.label,
      type: "line",
      yAxisIndex: axisIndex[metric.key],
      smooth: 0.18,
      symbol: data.length < 80 ? "circle" : "none",
      symbolSize: 6,
      lineStyle: { width: 2.4, color: metric.color },
      itemStyle: { color: metric.color },
      emphasis: { focus: "series" },
      areaStyle: metric.key === "temperature" ? { opacity: 0.09, color: metric.color } : undefined,
      data: data.map((row) => [row.dt.toISO(), row[metric.key]]),
    });
  });

  return { series, yAxis };
}

function renderChart(data) {
  const { series, yAxis } = buildSeries(data);

  chart.setOption({
    animationDuration: 420,
    grid: { left: 45, right: 65, top: 34, bottom: 62 },
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(16, 29, 26, 0.88)",
      borderWidth: 0,
      textStyle: { color: "#f0f5f2" },
      formatter(params) {
        if (!params.length) return "";
        const rawAxis = params[0].axisValue;
        let dt;
        if (typeof rawAxis === "number") {
          dt = DateTime.fromMillis(rawAxis);
        } else if (typeof rawAxis === "string") {
          dt = DateTime.fromISO(rawAxis);
          if (!dt.isValid) {
            const asNum = Number(rawAxis);
            if (Number.isFinite(asNum)) {
              dt = DateTime.fromMillis(asNum);
            }
          }
        } else if (rawAxis instanceof Date) {
          dt = DateTime.fromJSDate(rawAxis);
        } else {
          dt = DateTime.invalid("Unsupported axis value");
        }

        const dateText = dt.isValid ? dt.toFormat("dd.LL.yyyy HH:mm") : "Unbekanntes Datum";
        const rows = params.map((p) => `${p.marker} ${p.seriesName}: <b>${Number(p.data[1]).toFixed(2)}</b>`).join("<br>");
        return `<b>${dateText}</b><br>${rows}`;
      },
    },
    legend: {
      top: 0,
      textStyle: { color: "#32423b", fontWeight: 600 },
    },
    xAxis: {
      type: "time",
      axisLabel: { color: "#45534d" },
      axisLine: { lineStyle: { color: "#8aa29a" } },
    },
    yAxis,
    dataZoom: [
      { type: "inside" },
      { type: "slider", height: 20, bottom: 16 },
    ],
    series,
  }, { notMerge: true });
}

function getQuickPresets() {
  const now = DateTime.local();
  return [
    { label: "Heute", mode: "day", date: now.startOf("day") },
    { label: "Gestern", mode: "day", date: now.minus({ days: 1 }).startOf("day") },
    { label: "Diese Woche", mode: "week", date: now.startOf("week") },
    { label: "Letzte Woche", mode: "week", date: now.minus({ weeks: 1 }).startOf("week") },
    { label: "Dieser Monat", mode: "month", date: now.startOf("month") },
    { label: "Dieses Jahr", mode: "year", date: now.startOf("year") },
  ];
}

function renderQuickPicks() {
  quickPicksEl.innerHTML = "";
  getQuickPresets().forEach((preset) => {
    const btn = document.createElement("button");
    btn.className = "quick-btn";
    btn.textContent = preset.label;
    btn.addEventListener("click", () => {
      state.mode = preset.mode;
      state.anchorDate = preset.date;
      state.customRange = null;
      syncModeButtons();
      refresh();
    });
    quickPicksEl.appendChild(btn);
  });
}

function syncModeButtons() {
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === state.mode);
  });
}

function moveInterval(direction) {
  state.customRange = null;
  const sign = direction > 0 ? 1 : -1;
  if (state.mode === "day") state.anchorDate = state.anchorDate.plus({ days: sign });
  if (state.mode === "week") state.anchorDate = state.anchorDate.plus({ weeks: sign });
  if (state.mode === "month") state.anchorDate = state.anchorDate.plus({ months: sign });
  if (state.mode === "year") state.anchorDate = state.anchorDate.plus({ years: sign });
  refresh();
}

function filterData() {
  const interval = computeInterval();
  const rows = state.rawData.filter((row) => row.dt >= interval.start && row.dt < interval.end);
  state.filteredData = aggregate(rows);
  rangeLabelEl.textContent = formatRangeLabel(interval);
  chartTitleEl.textContent = `Messwerte ${state.mode.toUpperCase()} (${state.filteredData.length} Punkte)`;
}

function updateFocusUi() {
  if (!state.filteredData.length) {
    focusSlider.min = 0;
    focusSlider.max = 0;
    focusSlider.value = 0;
    focusDateEl.textContent = "Keine Daten";
    return;
  }

  state.focusIndex = Math.max(0, Math.min(state.focusIndex, state.filteredData.length - 1));
  focusSlider.min = 0;
  focusSlider.max = state.filteredData.length - 1;
  focusSlider.value = state.focusIndex;

  const focused = state.filteredData[state.focusIndex];
  focusDateEl.textContent = focused.dt.toFormat("cccc, dd.LL.yyyy HH:mm");

  chart.dispatchAction({ type: "showTip", seriesIndex: 0, dataIndex: state.focusIndex });
}

function refresh() {
  filterData();
  renderKpis(state.filteredData);
  renderChart(state.filteredData);
  updateFocusUi();

  if (!state.filteredData.length) {
    setStatus("Keine Daten im gewaehlten Zeitraum.", "error");
  } else {
    const newest = state.filteredData.at(-1).dt.toFormat("dd.LL.yyyy HH:mm");
    setStatus(`${state.filteredData.length} Werte im Fokus. Letzter Punkt: ${newest}`);
  }
}

async function loadData() {
  try {
    const res = await fetch("./data/Sensordaten.txt", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const content = await res.text();
    state.rawData = parseData(content);
  } catch (err) {
    console.error(err);
    setStatus("Daten konnten nicht geladen werden. Starte lokalen Server oder synchronisiere die Datei neu.", "error");
    state.rawData = [];
  }

  if (state.rawData.length) {
    const latest = state.rawData.at(-1).dt;
    state.anchorDate = latest.startOf("day");
  }

  refresh();
}

function initControls() {
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.mode = btn.dataset.mode;
      state.customRange = null;
      syncModeButtons();
      refresh();
    });
  });

  document.getElementById("stepBack").addEventListener("click", () => moveInterval(-1));
  document.getElementById("stepForward").addEventListener("click", () => moveInterval(1));

  metricRowEl.querySelectorAll(".metric-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const metric = chip.dataset.metric;
      if (state.visibleMetrics.has(metric) && state.visibleMetrics.size === 1) {
        return;
      }
      if (state.visibleMetrics.has(metric)) {
        state.visibleMetrics.delete(metric);
        chip.classList.remove("active");
      } else {
        state.visibleMetrics.add(metric);
        chip.classList.add("active");
      }
      renderChart(state.filteredData);
    });
  });

  focusSlider.addEventListener("input", (e) => {
    state.focusIndex = Number(e.target.value);
    updateFocusUi();
  });

  document.getElementById("focusPrev").addEventListener("click", () => {
    state.focusIndex -= 1;
    updateFocusUi();
  });

  document.getElementById("focusNext").addEventListener("click", () => {
    state.focusIndex += 1;
    updateFocusUi();
  });

  flatpickr("#customRange", {
    mode: "range",
    enableTime: true,
    time_24hr: true,
    dateFormat: "Y-m-d H:i",
    locale: flatpickr.l10ns.de,
    onClose(selectedDates) {
      if (selectedDates.length === 2) {
        state.customRange = {
          start: DateTime.fromJSDate(selectedDates[0]),
          end: DateTime.fromJSDate(selectedDates[1]),
        };
        refresh();
      }
    },
  });

  Object.values(METRICS).forEach((metric) => {
    const ids = axisInputIds(metric.key);
    const minEl = document.getElementById(ids.min);
    const maxEl = document.getElementById(ids.max);
    if (!minEl || !maxEl) return;
    minEl.addEventListener("change", () => applyAxisRange(metric.key));
    maxEl.addEventListener("change", () => applyAxisRange(metric.key));
  });

  resetAxesBtn.addEventListener("click", () => {
    setAxisRangesToMetricDefaults();
    syncAxisInputs();
    persistAxisRanges();
    renderChart(state.filteredData);
  });

  window.addEventListener("resize", () => chart.resize());
}

initAxisRanges();
syncAxisInputs();
renderQuickPicks();
syncModeButtons();
initControls();
loadData();

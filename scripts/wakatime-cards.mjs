import fs from "fs";
import path from "path";
import axios from "axios";

const OUT_DIR = "assets";
const OUT_LANGS = path.join(OUT_DIR, "wakatime-langs.svg");
const OUT_EDITORS = path.join(OUT_DIR, "wakatime-editors.svg");
const OUT_OS = path.join(OUT_DIR, "wakatime-os.svg");

const API_KEY = process.env.WAKATIME_API_KEY;
if (!API_KEY) {
  console.error("Missing WAKATIME_API_KEY");
  process.exit(1);
}

// Radical theme
const theme = {
  bg1: "#141321",
  bg2: "#1a1b27",
  title: "#ff4d6d",
  text: "#e4e4e7",
  muted: "#9aa4bf",
  barBg: "#2a2b3d",
  bars: ["#ff4d6d", "#f1fa8c", "#8be9fd", "#50fa7b", "#bd93f9", "#ffb86c", "#ff79c6"],
};

function b64(s) {
  return Buffer.from(s).toString("base64");
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmtMinutes(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

async function fetchSummaryAllTime() {
  const auth = b64(API_KEY);
  const url = "https://wakatime.com/api/v1/users/current/summaries?range=all_time";
  const res = await axios.get(url, {
    headers: { Authorization: `Basic ${auth}` },
    timeout: 30000,
  });
  return res.data;
}

function aggregateDays(days, key) {
  const map = new Map();
  let totalSeconds = 0;

  for (const day of days) {
    totalSeconds += day.grand_total?.total_seconds || 0;
    for (const item of day[key] || []) {
      map.set(item.name, (map.get(item.name) || 0) + (item.total_seconds || 0));
    }
  }

  return { map, totalSeconds };
}

// ✅ فقط اینجا اصلاح شد: فاصله‌ی هدر بیشتر شد تا ردیف اول (که معمولاً Other است) روی خط نیفتد.
function renderSvg({ title, totalText, rows }) {
  const width = 900;
  const padding = 28;
  const rowH = 34;

  // Increased spacing:
  const headerH = 98; // قبلاً حدود 78 بود — الان ردیف اول پایین‌تر می‌آید
  const dividerY = 78; // خط جداکننده پایین‌تر آمد

  const barX = 360;
  const barW = width - barX - padding;
  const barH = 10;

  const height = headerH + rows.length * rowH + 30;

  const gradientId = "bgGrad";

  const svgRows = rows
    .map((r, i) => {
      const y = headerH + i * rowH;
      const color = theme.bars[i % theme.bars.length];
      const pct = Math.max(0, Math.min(1, r.percent / 100));
      const fillW = Math.round(barW * pct);

      return `
        <text x="${padding}" y="${y}" fill="${theme.text}" font-size="14" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto">${escapeXml(
          r.name
        )}</text>
        <text x="${barX - 14}" y="${y}" text-anchor="end" fill="${theme.muted}" font-size="13" font-family="ui-sans-serif, system-ui">${escapeXml(
          r.time
        )}</text>
        <rect x="${barX}" y="${y - 12}" rx="6" ry="6" width="${barW}" height="${barH}" fill="${theme.barBg}" />
        <rect x="${barX}" y="${y - 12}" rx="6" ry="6" width="${fillW}" height="${barH}" fill="${color}" />
        <text x="${width - padding}" y="${y}" text-anchor="end" fill="${theme.muted}" font-size="13" font-family="ui-sans-serif, system-ui">${r.percent.toFixed(
          2
        )}%</text>
      `;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(
    title
  )}">
  <defs>
    <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${theme.bg1}"/>
      <stop offset="100%" stop-color="${theme.bg2}"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#000000" flood-opacity="0.35"/>
    </filter>
  </defs>

  <rect x="0" y="0" width="${width}" height="${height}" rx="18" ry="18" fill="url(#${gradientId})" filter="url(#shadow)" />
  <text x="${padding}" y="44" fill="${theme.title}" font-size="22" font-weight="700" font-family="ui-sans-serif, system-ui">📊 ${escapeXml(
    title
  )}</text>
  <text x="${width - padding}" y="44" text-anchor="end" fill="${theme.text}" font-size="14" font-weight="600" font-family="ui-sans-serif, system-ui">${escapeXml(
    totalText
  )}</text>

  <line x1="${padding}" y1="${dividerY}" x2="${width - padding}" y2="${dividerY}" stroke="#334155" stroke-width="1" opacity="0.65" />

  ${svgRows}
</svg>`;
}

function buildRowsFromMap(map, totalSecondsForPct, limit = 10) {
  const items = [...map.entries()]
    .map(([name, seconds]) => ({ name, seconds }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, limit);

  return items.map((it) => {
    const mins = Math.round(it.seconds / 60);
    const percent = totalSecondsForPct > 0 ? (it.seconds / totalSecondsForPct) * 100 : 0;
    return { name: it.name, time: fmtMinutes(mins), percent };
  });
}

async function main() {
  const data = await fetchSummaryAllTime();
  const days = data.data || [];

  // LANGUAGES (All-time) — ✅ Total شامل Other است
  const { map: langMap, totalSeconds: totalAll } = aggregateDays(days, "languages");
  const langRows = buildRowsFromMap(langMap, totalAll, 10);

  const langsSvg = renderSvg({
    title: "WakaTime • Languages",
    totalText: `All time: ${fmtMinutes(Math.round(totalAll / 60))}`,
    rows: langRows,
  });

  // EDITORS (All-time)
  const { map: editorMap, totalSeconds: totalEditors } = aggregateDays(days, "editors");
  const editorRows = buildRowsFromMap(editorMap, totalEditors, 10);

  const editorsSvg = renderSvg({
    title: "WakaTime • Editors",
    totalText: `All time: ${fmtMinutes(Math.round(totalEditors / 60))}`,
    rows: editorRows,
  });

  // OS (All-time)
  const { map: osMap, totalSeconds: totalOs } = aggregateDays(days, "operating_systems");
  const osRows = buildRowsFromMap(osMap, totalOs, 10);

  const osSvg = renderSvg({
    title: "WakaTime • OS",
    totalText: `All time: ${fmtMinutes(Math.round(totalOs / 60))}`,
    rows: osRows,
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_LANGS, langsSvg, "utf8");
  fs.writeFileSync(OUT_EDITORS, editorsSvg, "utf8");
  fs.writeFileSync(OUT_OS, osSvg, "utf8");

  console.log(`Wrote ${OUT_LANGS}`);
  console.log(`Wrote ${OUT_EDITORS}`);
  console.log(`Wrote ${OUT_OS}`);
}

main().catch((e) => {
  console.error(e?.response?.data || e);
  process.exit(1);
});

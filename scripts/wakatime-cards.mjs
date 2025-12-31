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

// Radical theme (subtle + clean)
const theme = {
  bg1: "#141321",
  bg2: "#1a1b27",
  title: "#ff4d6d",
  text: "#e4e4e7",
  muted: "#9aa4bf",
  barBg: "#2a2b3d",
  otherColor: "#ff4d6d", // keep same hue, just reduce opacity
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

async function fetchAllTimeStats() {
  const auth = b64(API_KEY);
  const url = "https://wakatime.com/api/v1/users/current/stats/all_time";
  const res = await axios.get(url, {
    headers: { Authorization: `Basic ${auth}` },
    timeout: 30000,
  });
  return res.data;
}

function sumSeconds(list = []) {
  return (list || []).reduce((acc, x) => acc + (x.total_seconds || 0), 0);
}

function toRows(list = [], limit = 10) {
  return (list || [])
    .slice(0, limit)
    .map((x) => ({
      name: x.name,
      time: x.text || fmtMinutes(Math.round((x.total_seconds || 0) / 60)),
      percent: Number(x.percent || 0),
      seconds: x.total_seconds || 0,
    }));
}

// ✅ Major visual upgrades here:
// - Reserve a right column for percent so it never overlaps the bar
// - Rank numbers (#1, #2, ...)
// - "Updated hourly" label (small)
// - Other slightly dimmed but still visible
// - very subtle glow on filled bars
function renderSvg({ title, totalText, rows }) {
  const width = 900;
  const padding = 28;
  const rowH = 34;

  // Extra header spacing so top row (often Other) doesn't touch divider
  const headerH = 104;
  const dividerY = 82;

  // Columns
  const rankW = 30;              // for #1, #2, ...
  const nameX = padding + rankW; // name starts after rank
  const barX = 380;              // bars start
  const pctColW = 76;            // reserved column for percent text (prevents overlap)
  const barW = width - barX - padding - pctColW; // reduced width so bar ends before percent column
  const barH = 10;

  const height = headerH + rows.length * rowH + 30;

  const svgRows = rows
    .map((r, i) => {
      const y = headerH + i * rowH;
      const isOther = r.name === "Other";

      const baseColor = isOther ? theme.otherColor : theme.bars[i % theme.bars.length];
      const barOpacity = isOther ? 0.85 : 1; // ✅ "کمی" کم‌رنگ، ولی واضح

      const pct = Math.max(0, Math.min(1, r.percent / 100));
      const fillW = Math.round(barW * pct);

      const rankText = `#${i + 1}`;

      return `
        <text x="${padding}" y="${y}" fill="${theme.muted}" font-size="12" font-weight="600"
              font-family="ui-sans-serif, system-ui">${escapeXml(rankText)}</text>

        <text x="${nameX}" y="${y}" fill="${theme.text}" font-size="14"
              font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto">${escapeXml(r.name)}</text>

        <text x="${barX - 16}" y="${y}" text-anchor="end" fill="${theme.muted}" font-size="13"
              font-family="ui-sans-serif, system-ui">${escapeXml(r.time)}</text>

        <rect x="${barX}" y="${y - 12}" rx="6" ry="6" width="${barW}" height="${barH}" fill="${theme.barBg}" />

        <rect x="${barX}" y="${y - 12}" rx="6" ry="6" width="${fillW}" height="${barH}"
              fill="${baseColor}" opacity="${barOpacity}" filter="url(#barGlow)" />

        <text x="${width - padding}" y="${y}" text-anchor="end" fill="${theme.muted}" font-size="13"
              font-family="ui-sans-serif, system-ui">${r.percent.toFixed(2)}%</text>
      `;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(
    title
  )}">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${theme.bg1}"/>
      <stop offset="100%" stop-color="${theme.bg2}"/>
    </linearGradient>

    <!-- subtle bar glow -->
    <filter id="barGlow" x="-20%" y="-50%" width="140%" height="200%">
      <feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="#ffffff" flood-opacity="0.08"/>
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.22"/>
    </filter>

    <!-- subtle card shadow -->
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#000000" flood-opacity="0.35"/>
    </filter>
  </defs>

  <rect x="0" y="0" width="${width}" height="${height}" rx="18" ry="18" fill="url(#bgGrad)" filter="url(#shadow)" />

  <text x="${padding}" y="46" fill="${theme.title}" font-size="22" font-weight="800"
        font-family="ui-sans-serif, system-ui">📊 ${escapeXml(title)}</text>

  <text x="${padding}" y="70" fill="${theme.muted}" font-size="12" font-weight="600"
        font-family="ui-sans-serif, system-ui">Updated hourly</text>

  <text x="${width - padding}" y="46" text-anchor="end" fill="${theme.text}" font-size="14" font-weight="700"
        font-family="ui-sans-serif, system-ui">${escapeXml(totalText)}</text>

  <line x1="${padding}" y1="${dividerY}" x2="${width - padding}" y2="${dividerY}"
        stroke="#334155" stroke-width="1" opacity="0.65" />

  ${svgRows}
</svg>`;
}

async function main() {
  const payload = await fetchAllTimeStats();
  const d = payload?.data;

  if (!d) {
    console.error("WakaTime returned empty data");
    process.exit(1);
  }

  const languages = d.languages || [];
  const editors = d.editors || [];
  const operatingSystems = d.operating_systems || [];

  // ✅ Total from languages sum (includes Other) => always consistent
  const totalSecondsFromLangs = sumSeconds(languages);
  const totalSeconds = totalSecondsFromLangs > 0 ? totalSecondsFromLangs : (d.total_seconds || 0);

  const totalText = `Total: ${fmtMinutes(Math.round(totalSeconds / 60))}`;

  const langsSvg = renderSvg({
    title: "WakaTime • Languages",
    totalText,
    rows: toRows(languages, 10),
  });

  const editorsSvg = renderSvg({
    title: "WakaTime • Editors",
    totalText,
    rows: toRows(editors, 10),
  });

  const osSvg = renderSvg({
    title: "WakaTime • OS",
    totalText,
    rows: toRows(operatingSystems, 10),
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

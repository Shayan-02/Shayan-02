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
  otherColor: "#ff4d6d", // keep same hue, just reduce opacity for "Other"
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

function pickTopLabel(rows) {
  if (!rows || rows.length === 0) return "";
  const top = rows[0];
  const pct = Number.isFinite(top.percent) ? top.percent.toFixed(2) : "0.00";
  return `Top: ${top.name} (${pct}%)`;
}

// Visual upgrades:
// - Reserve right column for percent (no overlap)
// - Rank numbers with colored dots
// - Icons per card
// - "Updated hourly" label
// - Top item label in header
// - Other slightly dimmed but still visible
// - subtle glow on filled bars
function renderSvg({ icon, title, totalText, topText, rows }) {
  const width = 900;
  const padding = 28;
  const rowH = 34;

  const headerH = 112; // extra spacing
  const dividerY = 88;

  // Columns
  const rankW = 46;              // rank + dot area
  const nameX = padding + rankW; // name starts after rank
  const barX = 380;              // bars start
  const pctColW = 82;            // reserved column for percent text
  const barW = width - barX - padding - pctColW;
  const barH = 10;

  const height = headerH + rows.length * rowH + 30;

  const svgRows = rows
    .map((r, i) => {
      const y = headerH + i * rowH;
      const isOther = r.name === "Other";

      const baseColor = isOther ? theme.otherColor : theme.bars[i % theme.bars.length];
      const barOpacity = isOther ? 0.85 : 1;

      const pct = Math.max(0, Math.min(1, r.percent / 100));
      const fillW = Math.round(barW * pct);

      const rankText = `#${i + 1}`;

      const dotCx = padding + 28;
      const dotCy = y - 6;

      const isTiny = r.percent < 1;
      const nameColor = isTiny ? "#cbd5e1" : theme.text;
      const nameOpacity = isTiny ? 0.92 : 1;

      return `
        <circle cx="${dotCx}" cy="${dotCy}" r="5" fill="${baseColor}" opacity="${barOpacity}"/>

        <text x="${padding}" y="${y}" fill="${theme.muted}" font-size="12" font-weight="700"
              font-family="ui-sans-serif, system-ui">${escapeXml(rankText)}</text>

        <text x="${nameX}" y="${y}" fill="${nameColor}" opacity="${nameOpacity}" font-size="14"
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

  // Header layout
  const headerTitle = `${icon} ${title}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(
    title
  )}">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${theme.bg1}"/>
      <stop offset="100%" stop-color="${theme.bg2}"/>
    </linearGradient>

    <filter id="barGlow" x="-20%" y="-50%" width="140%" height="200%">
      <feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="#ffffff" flood-opacity="0.08"/>
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.22"/>
    </filter>

    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#000000" flood-opacity="0.35"/>
    </filter>
  </defs>

  <rect x="0" y="0" width="${width}" height="${height}" rx="18" ry="18" fill="url(#bgGrad)" filter="url(#shadow)" />

  <text x="${padding}" y="46" fill="${theme.title}" font-size="22" font-weight="900"
        font-family="ui-sans-serif, system-ui">${escapeXml(headerTitle)}</text>

  <text x="${padding}" y="72" fill="${theme.muted}" font-size="12" font-weight="600"
        font-family="ui-sans-serif, system-ui">Updated hourly</text>

  <text x="${width - padding}" y="46" text-anchor="end" fill="${theme.text}" font-size="14" font-weight="800"
        font-family="ui-sans-serif, system-ui">${escapeXml(totalText)}</text>

  <text x="${width - padding}" y="72" text-anchor="end" fill="${theme.muted}" font-size="12" font-weight="700"
        font-family="ui-sans-serif, system-ui">${escapeXml(topText || "")}</text>

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

  // Total from languages sum (includes Other) => consistent
  const totalSecondsFromLangs = sumSeconds(languages);
  const totalSeconds = totalSecondsFromLangs > 0 ? totalSecondsFromLangs : (d.total_seconds || 0);
  const totalText = `Total: ${fmtMinutes(Math.round(totalSeconds / 60))}`;

  const langRows = toRows(languages, 10);
  const editorRows = toRows(editors, 10);
  const osRows = toRows(operatingSystems, 10);

  const langsSvg = renderSvg({
    icon: "💻",
    title: "WakaTime • Languages",
    totalText,
    topText: pickTopLabel(langRows),
    rows: langRows,
  });

  const editorsSvg = renderSvg({
    icon: "🛠️",
    title: "WakaTime • Editors",
    totalText,
    topText: pickTopLabel(editorRows),
    rows: editorRows,
  });

  const osSvg = renderSvg({
    icon: "🖥️",
    title: "WakaTime • OS",
    totalText,
    topText: pickTopLabel(osRows),
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

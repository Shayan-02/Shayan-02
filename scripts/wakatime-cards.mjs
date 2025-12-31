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

// ✅ Correct endpoint for All-time (no "Missing start date")
async function fetchAllTimeStats() {
  const auth = b64(API_KEY);
  const url = "https://wakatime.com/api/v1/users/current/stats/all_time";
  const res = await axios.get(url, {
    headers: { Authorization: `Basic ${auth}` },
    timeout: 30000,
  });
  return res.data;
}

// ✅ header spacing increased so "Other" doesn't collide with divider
function renderSvg({ title, totalText, rows }) {
  const width = 900;
  const padding = 28;
  const rowH = 34;

  const headerH = 98;   // more space above rows
  const dividerY = 78;  // divider lower

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

function toRows(list = [], limit = 10) {
  // list items usually include: name, percent, total_seconds, text
  return (list || [])
    .slice(0, limit)
    .map((x) => ({
      name: x.name,
      time: x.text || fmtMinutes(Math.round((x.total_seconds || 0) / 60)),
      percent: Number(x.percent || 0),
    }));
}

async function main() {
  const payload = await fetchAllTimeStats();
  const d = payload?.data;

  if (!d) {
    console.error("WakaTime returned empty data");
    process.exit(1);
  }

  // ✅ total includes "Other" naturally
  const totalText =
    d.human_readable_total || (d.total_seconds ? fmtMinutes(Math.round(d.total_seconds / 60)) : "0m");
  const totalLabel = `All time: ${totalText}`;

  // Languages / Editors / OS (Other stays at top if it's top)
  const langRows = toRows(d.languages, 10);
  const editorRows = toRows(d.editors, 10);
  const osRows = toRows(d.operating_systems, 10);

  const langsSvg = renderSvg({
    title: "WakaTime • Languages",
    totalText: totalLabel,
    rows: langRows,
  });

  const editorsSvg = renderSvg({
    title: "WakaTime • Editors",
    totalText: totalLabel,
    rows: editorRows,
  });

  const osSvg = renderSvg({
    title: "WakaTime • OS",
    totalText: totalLabel,
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

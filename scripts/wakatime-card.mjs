import fs from "fs";
import path from "path";
import axios from "axios";

const OUT_DIR = "assets";
const OUT_FILE = path.join(OUT_DIR, "wakatime.svg");

const API_KEY = process.env.WAKATIME_API_KEY;
if (!API_KEY) {
  console.error("Missing WAKATIME_API_KEY");
  process.exit(1);
}

// Basic theme (you can edit these)
const theme = {
  bg1: "#0f172a",
  bg2: "#111827",
  title: "#e5e7eb",
  text: "#cbd5e1",
  muted: "#94a3b8",
  barBg: "#1f2937",
  // palette for bars (cycled)
  bars: ["#a78bfa", "#22c55e", "#38bdf8", "#fb7185", "#fbbf24", "#60a5fa", "#34d399"],
};

function b64(s) {
  return Buffer.from(s).toString("base64");
}

function fmtMinutes(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// WakaTime endpoint: user summaries (last 7 days). Works with API key.
async function fetchSummary() {
  const auth = b64(API_KEY);
  const url = "https://wakatime.com/api/v1/users/current/summaries?range=last_7_days";
  const res = await axios.get(url, {
    headers: { Authorization: `Basic ${auth}` },
    timeout: 20000,
  });
  return res.data;
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderSvg({ title, subtitle, totalText, rows }) {
  const width = 900;
  const padding = 28;
  const rowH = 34;
  const headerH = 92;
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
        <text x="${padding}" y="${y}" fill="${theme.text}" font-size="14" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto">${escapeXml(r.name)}</text>
        <text x="${barX - 14}" y="${y}" text-anchor="end" fill="${theme.muted}" font-size="13" font-family="ui-sans-serif, system-ui">${escapeXml(r.time)}</text>
        <rect x="${barX}" y="${y - 12}" rx="6" ry="6" width="${barW}" height="${barH}" fill="${theme.barBg}" />
        <rect x="${barX}" y="${y - 12}" rx="6" ry="6" width="${fillW}" height="${barH}" fill="${color}" />
        <text x="${width - padding}" y="${y}" text-anchor="end" fill="${theme.muted}" font-size="13" font-family="ui-sans-serif, system-ui">${r.percent.toFixed(2)}%</text>
      `;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(title)}">
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
  <text x="${padding}" y="42" fill="${theme.title}" font-size="22" font-weight="700" font-family="ui-sans-serif, system-ui">📊 ${escapeXml(title)}</text>
  <text x="${padding}" y="68" fill="${theme.muted}" font-size="13" font-family="ui-sans-serif, system-ui">${escapeXml(subtitle)}</text>
  <text x="${width - padding}" y="42" text-anchor="end" fill="${theme.text}" font-size="14" font-weight="600" font-family="ui-sans-serif, system-ui">${escapeXml(totalText)}</text>
  <line x1="${padding}" y1="82" x2="${width - padding}" y2="82" stroke="#334155" stroke-width="1" opacity="0.8" />

  ${svgRows}
</svg>`;
}

async function main() {
  const data = await fetchSummary();
  const days = data.data || [];
  // accumulate languages across the period
  const langMap = new Map();
  let totalSeconds = 0;

  for (const day of days) {
    totalSeconds += day.grand_total?.total_seconds || 0;
    for (const l of day.languages || []) {
      const prev = langMap.get(l.name) || { seconds: 0 };
      langMap.set(l.name, { seconds: prev.seconds + (l.total_seconds || 0) });
    }
  }

  const totalMinutes = Math.round(totalSeconds / 60);
  const totalText = `Last 7 days: ${fmtMinutes(totalMinutes)}`;

  const langs = [...langMap.entries()]
    .map(([name, v]) => ({ name, seconds: v.seconds }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 10);

  const rows = langs.map((l) => {
    const mins = Math.round(l.seconds / 60);
    const percent = totalSeconds > 0 ? (l.seconds / totalSeconds) * 100 : 0;
    return { name: l.name, time: fmtMinutes(mins), percent };
  });

  const title = "My WakaTime Languages";
  const subtitle = "Top languages (auto-updated via GitHub Actions)";
  const svg = renderSvg({ title, subtitle, totalText, rows });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, svg, "utf8");
  console.log(`Wrote ${OUT_FILE}`);
}

main().catch((e) => {
  console.error(e?.response?.data || e);
  process.exit(1);
});

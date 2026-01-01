import fs from "fs";
import path from "path";

// Outputs
const OUT_DIR = "assets";
const OUT_STATS = path.join(OUT_DIR, "github-stats.svg");
const OUT_ACTIVITY = path.join(OUT_DIR, "github-activity.svg");
const OUT_LANGS = path.join(OUT_DIR, "github-langs.svg");

// ENV
const GH_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const USERNAME = process.env.GH_USERNAME; // e.g. Shayan-02

if (!GH_TOKEN) {
  console.error("Missing GH_TOKEN (recommended) or GITHUB_TOKEN");
  process.exit(1);
}
if (!USERNAME) {
  console.error("Missing GH_USERNAME");
  process.exit(1);
}

// Time range (fixed)
const FROM_ISO = "2021-01-01T00:00:00Z";
const TO_ISO = new Date().toISOString();

// Official / GitHub-friendly theme (not neon pink)
const theme = {
  bg1: "#0B1220",
  bg2: "#111827",
  title: "#E5E7EB",
  accent: "#0EA5E9", // official blue
  text: "#E5E7EB",
  muted: "#94A3B8",
  barBg: "#1F2937",
  stroke: "#334155",
  bars: ["#0EA5E9", "#22C55E", "#A78BFA", "#F59E0B", "#38BDF8", "#14B8A6", "#EAB308"],
};

function escapeXml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmtNumber(n) {
  const x = Number(n || 0);
  return x.toLocaleString("en-US");
}

function humanBytes(bytes) {
  const b = Number(bytes || 0);
  const mb = 1024 * 1024;
  const kb = 1024;
  if (b >= mb) return `${(b / mb).toFixed(1)} MB`;
  if (b >= kb) return `${(b / kb).toFixed(1)} KB`;
  return `${b} B`;
}

async function ghGraphQL(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  if (!res.ok || json.errors) {
    console.error("GitHub GraphQL error:", JSON.stringify(json.errors || json, null, 2));
    process.exit(1);
  }
  return json.data;
}

function svgHeader({ width, height, title, subtitleLeft, subtitleRight }) {
  const padding = 28;
  const dividerY = 88;

  return `
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${theme.bg1}"/>
      <stop offset="100%" stop-color="${theme.bg2}"/>
    </linearGradient>

    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#000000" flood-opacity="0.35"/>
    </filter>

    <filter id="barGlow" x="-20%" y="-50%" width="140%" height="200%">
      <feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="#ffffff" flood-opacity="0.06"/>
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.22"/>
    </filter>
  </defs>

  <rect x="0" y="0" width="${width}" height="${height}" rx="18" ry="18" fill="url(#bgGrad)" filter="url(#shadow)" />

  <text x="${padding}" y="46" fill="${theme.title}" font-size="22" font-weight="900"
        font-family="ui-sans-serif, system-ui">${escapeXml(title)}</text>

  <text x="${padding}" y="72" fill="${theme.muted}" font-size="12" font-weight="650"
        font-family="ui-sans-serif, system-ui">${escapeXml(subtitleLeft)}</text>

  <text x="${width - padding}" y="72" text-anchor="end" fill="${theme.muted}" font-size="12" font-weight="650"
        font-family="ui-sans-serif, system-ui">${escapeXml(subtitleRight)}</text>

  <line x1="${padding}" y1="${dividerY}" x2="${width - padding}" y2="${dividerY}"
        stroke="${theme.stroke}" stroke-width="1" opacity="0.75" />
`;
}

/**
 * Card 1: Grid stats (professional, readable)
 */
function renderGridStatsCard({ title, subtitleLeft, subtitleRight, items, topText }) {
  const width = 900;
  const padding = 28;
  const headerH = 112;
  const cols = 3;
  const rows = Math.ceil(items.length / cols);

  const cardGap = 14;
  const boxH = 74;
  const boxW = Math.floor((width - padding * 2 - cardGap * (cols - 1)) / cols);

  const height = headerH + rows * (boxH + cardGap) + 30;

  const boxes = items
    .map((it, idx) => {
      const r = Math.floor(idx / cols);
      const c = idx % cols;
      const x = padding + c * (boxW + cardGap);
      const y = headerH + r * (boxH + cardGap);

      const accent = theme.bars[idx % theme.bars.length];

      return `
        <rect x="${x}" y="${y}" rx="14" ry="14" width="${boxW}" height="${boxH}"
              fill="${theme.barBg}" opacity="0.9" />
        <rect x="${x}" y="${y}" rx="14" ry="14" width="6" height="${boxH}"
              fill="${accent}" opacity="0.95" />

        <text x="${x + 18}" y="${y + 28}" fill="${theme.muted}" font-size="12" font-weight="700"
              font-family="ui-sans-serif, system-ui">${escapeXml(it.label)}</text>

        <text x="${x + 18}" y="${y + 54}" fill="${theme.text}" font-size="22" font-weight="900"
              font-family="ui-sans-serif, system-ui">${escapeXml(it.value)}</text>
      `;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"
     xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(title)}">
  ${svgHeader({
    width,
    height,
    title,
    subtitleLeft,
    subtitleRight: topText,
  })}
  ${boxes}
</svg>`;
}

/**
 * Card 2: WakaTime-style bar chart with rank + Top
 */
function renderBarsCard({ title, subtitleLeft, subtitleRight, totalText, topText, rows }) {
  const width = 900;
  const padding = 28;

  const headerH = 124; // bit taller: total/top line
  const rowH = 34;
  const dividerY = 98;

  const rankW = 46;
  const nameX = padding + rankW;
  const barX = 380;
  const pctColW = 82;
  const barW = width - barX - padding - pctColW;
  const barH = 10;

  const height = headerH + rows.length * rowH + 30;

  const svgRows = rows
    .map((r, i) => {
      const y = headerH + i * rowH;
      const color = theme.bars[i % theme.bars.length];
      const pct = Math.max(0, Math.min(1, r.percent / 100));
      const fillW = Math.round(barW * pct);

      const dotCx = padding + 28;
      const dotCy = y - 6;

      return `
        <circle cx="${dotCx}" cy="${dotCy}" r="5" fill="${color}" opacity="0.95"/>
        <text x="${padding}" y="${y}" fill="${theme.muted}" font-size="12" font-weight="750"
              font-family="ui-sans-serif, system-ui">#${i + 1}</text>

        <text x="${nameX}" y="${y}" fill="${theme.text}" font-size="14" font-weight="650"
              font-family="ui-sans-serif, system-ui">${escapeXml(r.name)}</text>

        <text x="${barX - 16}" y="${y}" text-anchor="end" fill="${theme.muted}" font-size="13" font-weight="650"
              font-family="ui-sans-serif, system-ui">${escapeXml(r.valueText)}</text>

        <rect x="${barX}" y="${y - 12}" rx="6" ry="6" width="${barW}" height="${barH}" fill="${theme.barBg}" opacity="0.95"/>
        <rect x="${barX}" y="${y - 12}" rx="6" ry="6" width="${fillW}" height="${barH}" fill="${color}" filter="url(#barGlow)" />

        <text x="${width - padding}" y="${y}" text-anchor="end" fill="${theme.muted}" font-size="13" font-weight="700"
              font-family="ui-sans-serif, system-ui">${r.percent.toFixed(2)}%</text>
      `;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"
     xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(title)}">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${theme.bg1}"/>
      <stop offset="100%" stop-color="${theme.bg2}"/>
    </linearGradient>

    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#000000" flood-opacity="0.35"/>
    </filter>

    <filter id="barGlow" x="-20%" y="-50%" width="140%" height="200%">
      <feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="#ffffff" flood-opacity="0.06"/>
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.22"/>
    </filter>
  </defs>

  <rect x="0" y="0" width="${width}" height="${height}" rx="18" ry="18" fill="url(#bgGrad)" filter="url(#shadow)" />

  <text x="${padding}" y="46" fill="${theme.title}" font-size="22" font-weight="900"
        font-family="ui-sans-serif, system-ui">${escapeXml(title)}</text>

  <text x="${padding}" y="72" fill="${theme.muted}" font-size="12" font-weight="650"
        font-family="ui-sans-serif, system-ui">${escapeXml(subtitleLeft)}</text>

  <text x="${width - padding}" y="46" text-anchor="end" fill="${theme.text}" font-size="14" font-weight="900"
        font-family="ui-sans-serif, system-ui">${escapeXml(totalText)}</text>

  <text x="${width - padding}" y="72" text-anchor="end" fill="${theme.muted}" font-size="12" font-weight="650"
        font-family="ui-sans-serif, system-ui">${escapeXml(topText)}</text>

  <line x1="${padding}" y1="${dividerY}" x2="${width - padding}" y2="${dividerY}"
        stroke="${theme.stroke}" stroke-width="1" opacity="0.75" />

  ${svgRows}
</svg>`;
}

/**
 * Card 3: Languages bar chart (repo size-based)
 */
function renderLanguagesCard({ title, subtitleLeft, totalText, topText, rows }) {
  // reuse bars card style
  return renderBarsCard({
    title,
    subtitleLeft,
    subtitleRight: "",
    totalText,
    topText,
    rows,
  });
}

/**
 * Fetch:
 * - Total repos (public + private)
 * - Total stars across owned repos (public + private; excludes forks)
 * - Followers
 * - ContributionsCollection from 2021 → now (includes private if token allows)
 * - Top languages by size (public + private; excludes forks)
 */
async function fetchData() {
  // User basic + contributions
  const qUser = `
    query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        login
        followers { totalCount }
        repositories(ownerAffiliations: OWNER) { totalCount }  # includes private if token has access
        contributionsCollection(from: $from, to: $to) {
          totalCommitContributions
          totalIssueContributions
          totalPullRequestContributions
          totalPullRequestReviewContributions
        }
      }
    }
  `;
  const userData = await ghGraphQL(qUser, { login: USERNAME, from: FROM_ISO, to: TO_ISO });
  const u = userData.user;

  // Repo pagination for:
  // - total stars (sum stargazerCount)
  // - languages (sum sizes)
  const qRepos = `
    query($login:String!, $cursor:String) {
      user(login:$login) {
        repositories(
          first: 100,
          after: $cursor,
          ownerAffiliations: OWNER,
          orderBy: { field: UPDATED_AT, direction: DESC }
        ) {
          pageInfo { hasNextPage endCursor }
          nodes {
            isFork
            stargazerCount
            languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
              edges { size node { name } }
            }
          }
        }
      }
    }
  `;

  let cursor = null;
  let starsTotal = 0;
  const langMap = new Map();

  while (true) {
    const data = await ghGraphQL(qRepos, { login: USERNAME, cursor });
    const page = data.user.repositories;
    const nodes = page.nodes || [];

    for (const r of nodes) {
      if (r.isFork) continue; // keep clean
      starsTotal += Number(r.stargazerCount || 0);

      for (const e of (r.languages?.edges || [])) {
        const name = e.node?.name;
        const size = Number(e.size || 0);
        if (!name) continue;
        langMap.set(name, (langMap.get(name) || 0) + size);
      }
    }

    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }

  const commits = Number(u.contributionsCollection.totalCommitContributions || 0);
  const prs = Number(u.contributionsCollection.totalPullRequestContributions || 0);
  const issues = Number(u.contributionsCollection.totalIssueContributions || 0);
  const reviews = Number(u.contributionsCollection.totalPullRequestReviewContributions || 0);

  const contribTotal = commits + prs + issues + reviews;

  const langEntries = [...langMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const langTotalSize = langEntries.reduce((acc, [, v]) => acc + v, 0) || 1;

  const langRows = langEntries.map(([name, size]) => ({
    name,
    valueText: humanBytes(size),
    percent: (size / langTotalSize) * 100,
  }));

  return {
    followers: u.followers.totalCount,
    reposTotal: u.repositories.totalCount,
    starsTotal,
    commits,
    prs,
    issues,
    reviews,
    contribTotal,
    langRows,
  };
}

function pickTopActivity({ commits, prs, issues, reviews }) {
  const arr = [
    ["Commits", commits],
    ["PRs", prs],
    ["Issues", issues],
    ["Reviews", reviews],
  ].sort((a, b) => b[1] - a[1]);
  const [name, value] = arr[0];
  return `${name}: ${fmtNumber(value)}`;
}

function makeActivityRows({ commits, prs, issues, reviews, contribTotal }) {
  const total = contribTotal || 1;
  const rows = [
    { name: "Commits", value: commits },
    { name: "Pull Requests", value: prs },
    { name: "Issues", value: issues },
    { name: "Reviews", value: reviews },
  ];

  return rows.map((r) => ({
    name: r.name,
    valueText: fmtNumber(r.value),
    percent: (r.value / total) * 100,
  }));
}

async function main() {
  const d = await fetchData();

  const subtitleRange = `All-time (since 2021) • Includes private repositories`;
  const updated = `Updated hourly`;

  // Card 1: Grid stats (public+private)
  const statsItems = [
    { label: "Repositories (Total)", value: fmtNumber(d.reposTotal) },
    { label: "Stars (Total)", value: fmtNumber(d.starsTotal) },
    { label: "Followers", value: fmtNumber(d.followers) },
    { label: "Commits (since 2021)", value: fmtNumber(d.commits) },
    { label: "Pull Requests (since 2021)", value: fmtNumber(d.prs) },
    { label: "Issues (since 2021)", value: fmtNumber(d.issues) },
  ];

  const topActivity = pickTopActivity(d);

  const statsSvg = renderGridStatsCard({
    title: "📊 GitHub • Stats",
    subtitleLeft: `${updated} • ${subtitleRange}`,
    subtitleRight: "",
    topText: `Top: ${topActivity}`,
    items: statsItems,
  });

  // Card 2: Activity breakdown (WakaTime-style)
  const activityRows = makeActivityRows(d);
  const activitySvg = renderBarsCard({
    title: "📈 GitHub • Activity",
    subtitleLeft: `${updated} • ${subtitleRange}`,
    subtitleRight: "",
    totalText: `Total: ${fmtNumber(d.contribTotal)} contributions`,
    topText: `Top: ${topActivity}`,
    rows: activityRows,
  });

  // Card 3: Languages (size-based)
  const topLang = d.langRows[0]
    ? `${d.langRows[0].name} (${d.langRows[0].percent.toFixed(2)}%)`
    : "—";

  const langsSvg = renderLanguagesCard({
    title: "💻 GitHub • Languages",
    subtitleLeft: `${updated} • Based on repository size (public + private)`,
    totalText: `Total: ${fmtNumber(d.langRows.length)} langs`,
    topText: `Top: ${topLang}`,
    rows: d.langRows,
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_STATS, statsSvg, "utf8");
  fs.writeFileSync(OUT_ACTIVITY, activitySvg, "utf8");
  fs.writeFileSync(OUT_LANGS, langsSvg, "utf8");

  console.log(`Wrote ${OUT_STATS}`);
  console.log(`Wrote ${OUT_ACTIVITY}`);
  console.log(`Wrote ${OUT_LANGS}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

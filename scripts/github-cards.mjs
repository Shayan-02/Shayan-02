import fs from "fs";
import path from "path";

const OUT_DIR = "assets";
const OUT_STATS = path.join(OUT_DIR, "github-stats.svg");
const OUT_LANGS = path.join(OUT_DIR, "github-langs.svg");

// Use a PAT in secrets: GH_TOKEN (recommended) or fallback to GITHUB_TOKEN
const GH_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const USERNAME = process.env.GH_USERNAME; // e.g. Shayan-02

if (!GH_TOKEN) {
  console.error("Missing GH_TOKEN (or GITHUB_TOKEN)");
  process.exit(1);
}
if (!USERNAME) {
  console.error("Missing GH_USERNAME");
  process.exit(1);
}

// Radical theme aligned with your WakaTime cards
const theme = {
  bg1: "#141321",
  bg2: "#1a1b27",
  title: "#ff4d6d",
  text: "#e4e4e7",
  muted: "#9aa4bf",
  barBg: "#2a2b3d",
  bars: ["#ff4d6d", "#f1fa8c", "#8be9fd", "#50fa7b", "#bd93f9", "#ffb86c", "#ff79c6"],
};

function escapeXml(str) {
  return String(str)
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

// We’ll estimate "all-time contributions" using contributionsCollection over a long range.
// (GitHub حساب‌کردن all-time دقیق ۱۰۰٪ برای همه رویدادها سخت است، ولی این بسیار نزدیک و کاربردی است.)
function isoYearsAgo(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString();
}

function renderStatsSvg({ title, totalText, topText, rows }) {
  const width = 900;
  const padding = 28;
  const rowH = 34;

  const headerH = 112;
  const dividerY = 88;

  const labelX = padding;
  const valueX = width - padding;

  const height = headerH + rows.length * rowH + 30;

  const rowSvg = rows
    .map((r, i) => {
      const y = headerH + i * rowH;
      const dotColor = theme.bars[i % theme.bars.length];
      return `
        <circle cx="${labelX + 16}" cy="${y - 6}" r="5" fill="${dotColor}" opacity="0.95"/>
        <text x="${labelX + 32}" y="${y}" fill="${theme.text}" font-size="14" font-weight="650"
              font-family="ui-sans-serif, system-ui">${escapeXml(r.label)}</text>
        <text x="${valueX}" y="${y}" text-anchor="end" fill="${theme.muted}" font-size="14" font-weight="700"
              font-family="ui-sans-serif, system-ui">${escapeXml(r.value)}</text>
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

    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#000000" flood-opacity="0.35"/>
    </filter>
  </defs>

  <rect x="0" y="0" width="${width}" height="${height}" rx="18" ry="18" fill="url(#bgGrad)" filter="url(#shadow)" />

  <text x="${padding}" y="46" fill="${theme.title}" font-size="22" font-weight="900"
        font-family="ui-sans-serif, system-ui">📈 ${escapeXml(title)}</text>

  <text x="${padding}" y="72" fill="${theme.muted}" font-size="12" font-weight="600"
        font-family="ui-sans-serif, system-ui">Updated hourly</text>

  <text x="${width - padding}" y="46" text-anchor="end" fill="${theme.text}" font-size="14" font-weight="800"
        font-family="ui-sans-serif, system-ui">${escapeXml(totalText)}</text>

  <text x="${width - padding}" y="72" text-anchor="end" fill="${theme.muted}" font-size="12" font-weight="700"
        font-family="ui-sans-serif, system-ui">${escapeXml(topText)}</text>

  <line x1="${padding}" y1="${dividerY}" x2="${width - padding}" y2="${dividerY}"
        stroke="#334155" stroke-width="1" opacity="0.65" />

  ${rowSvg}
</svg>`;
}

function renderLangsSvg({ title, totalText, topText, rows }) {
  const width = 900;
  const padding = 28;
  const rowH = 34;

  const headerH = 112;
  const dividerY = 88;

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
        <text x="${padding}" y="${y}" fill="${theme.muted}" font-size="12" font-weight="700"
              font-family="ui-sans-serif, system-ui">#${i + 1}</text>
        <text x="${nameX}" y="${y}" fill="${theme.text}" font-size="14"
              font-family="ui-sans-serif, system-ui">${escapeXml(r.name)}</text>

        <text x="${barX - 16}" y="${y}" text-anchor="end" fill="${theme.muted}" font-size="13"
              font-family="ui-sans-serif, system-ui">${escapeXml(r.weight)}</text>

        <rect x="${barX}" y="${y - 12}" rx="6" ry="6" width="${barW}" height="${barH}" fill="${theme.barBg}" />
        <rect x="${barX}" y="${y - 12}" rx="6" ry="6" width="${fillW}" height="${barH}" fill="${color}" opacity="1" />

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
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#000000" flood-opacity="0.35"/>
    </filter>
  </defs>

  <rect x="0" y="0" width="${width}" height="${height}" rx="18" ry="18" fill="url(#bgGrad)" filter="url(#shadow)" />

  <text x="${padding}" y="46" fill="${theme.title}" font-size="22" font-weight="900"
        font-family="ui-sans-serif, system-ui">🧠 ${escapeXml(title)}</text>

  <text x="${padding}" y="72" fill="${theme.muted}" font-size="12" font-weight="600"
        font-family="ui-sans-serif, system-ui">Updated hourly</text>

  <text x="${width - padding}" y="46" text-anchor="end" fill="${theme.text}" font-size="14" font-weight="800"
        font-family="ui-sans-serif, system-ui">${escapeXml(totalText)}</text>

  <text x="${width - padding}" y="72" text-anchor="end" fill="${theme.muted}" font-size="12" font-weight="700"
        font-family="ui-sans-serif, system-ui">${escapeXml(topText)}</text>

  <line x1="${padding}" y1="${dividerY}" x2="${width - padding}" y2="${dividerY}"
        stroke="#334155" stroke-width="1" opacity="0.65" />

  ${svgRows}
</svg>`;
}

function humanWeight(bytes) {
  // just a friendly measure; bytes from GraphQL are rough, but visually nice
  const b = Number(bytes || 0);
  if (b > 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  if (b > 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
}

async function main() {
  const from = isoYearsAgo(15); // large range to approximate all-time

  // 1) User + contributions (approx all-time)
  const userQuery = `
    query($login:String!, $from:DateTime!) {
      user(login:$login) {
        name
        login
        followers { totalCount }
        repositories(privacy:PUBLIC, ownerAffiliations:OWNER) { totalCount }
        starredRepositories { totalCount }

        contributionsCollection(from:$from) {
          totalCommitContributions
          totalIssueContributions
          totalPullRequestContributions
          totalPullRequestReviewContributions
        }
      }
    }
  `;
  const userData = await ghGraphQL(userQuery, { login: USERNAME, from });
  const u = userData.user;

  const commits = u.contributionsCollection.totalCommitContributions || 0;
  const prs = u.contributionsCollection.totalPullRequestContributions || 0;
  const issues = u.contributionsCollection.totalIssueContributions || 0;
  const reviews = u.contributionsCollection.totalPullRequestReviewContributions || 0;
  const contribTotal = commits + prs + issues + reviews;

  // 2) Repos list to compute top languages (sum bytes)
  const langMap = new Map();
  let repoCursor = null;

  const reposQuery = `
    query($login:String!, $cursor:String) {
      user(login:$login) {
        repositories(
          first: 100,
          after: $cursor,
          ownerAffiliations: OWNER,
          privacy: PUBLIC,
          orderBy: { field: UPDATED_AT, direction: DESC }
        ) {
          pageInfo { hasNextPage endCursor }
          nodes {
            name
            isFork
            primaryLanguage { name }
            languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
              edges { size node { name } }
            }
          }
        }
      }
    }
  `;

  while (true) {
    const reposData = await ghGraphQL(reposQuery, { login: USERNAME, cursor: repoCursor });
    const page = reposData.user.repositories;
    const nodes = page.nodes || [];

    for (const r of nodes) {
      // Optional: ignore forks to keep it clean
      if (r.isFork) continue;

      for (const e of (r.languages?.edges || [])) {
        const lang = e.node?.name;
        const size = e.size || 0;
        if (!lang) continue;
        langMap.set(lang, (langMap.get(lang) || 0) + size);
      }
    }

    if (!page.pageInfo.hasNextPage) break;
    repoCursor = page.pageInfo.endCursor;
  }

  const langEntries = [...langMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const totalLangSize = langEntries.reduce((acc, [, v]) => acc + v, 0) || 1;

  const langRows = langEntries.map(([name, size]) => ({
    name,
    weight: humanWeight(size),
    percent: (size / totalLangSize) * 100,
  }));

  const topLang = langRows[0] ? `${langRows[0].name} (${langRows[0].percent.toFixed(2)}%)` : "—";
  const topStat = commits >= prs ? `Commits: ${fmtNumber(commits)}` : `PRs: ${fmtNumber(prs)}`;

  // Build cards
  const statsSvg = renderStatsSvg({
    title: "GitHub • Stats",
    totalText: `Total: ${fmtNumber(contribTotal)} contributions`,
    topText: `Top: ${topStat}`,
    rows: [
      { label: "Public Repos", value: fmtNumber(u.repositories.totalCount) },
      { label: "Stars (Public)", value: fmtNumber(u.starredRepositories.totalCount) },
      { label: "Followers", value: fmtNumber(u.followers.totalCount) },
      { label: "Commits", value: fmtNumber(commits) },
      { label: "Pull Requests", value: fmtNumber(prs) },
      { label: "Issues", value: fmtNumber(issues) },
      { label: "Reviews", value: fmtNumber(reviews) },
    ],
  });

  const langsSvg = renderLangsSvg({
    title: "GitHub • Top Languages",
    totalText: `Total: ${fmtNumber(langEntries.length)} langs`,
    topText: `Top: ${topLang}`,
    rows: langRows,
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_STATS, statsSvg, "utf8");
  fs.writeFileSync(OUT_LANGS, langsSvg, "utf8");

  console.log(`Wrote ${OUT_STATS}`);
  console.log(`Wrote ${OUT_LANGS}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

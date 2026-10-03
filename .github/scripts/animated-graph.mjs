// animated-graph.mjs
// Builds an animated GitHub contribution graph (with month and weekday labels,
// per-day dates and a "last updated" date) as dark and light SVG files.
// Usage: node animated-graph.mjs <github-username> [outDir] [--input saved.html]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const args = process.argv.slice(2);
const user = args[0];
const outDir = args[1] && !args[1].startsWith("--") ? args[1] : "dist";
const inputIdx = args.indexOf("--input");
if (!user) { console.error("Usage: node animated-graph.mjs <username> [outDir]"); process.exit(1); }

async function getHtml() {
  if (inputIdx > -1) return readFileSync(args[inputIdx + 1], "utf8");
  const url = `https://github.com/users/${user}/contributions`;
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, { headers: { "User-Agent": "animated-graph" } });
    if (r.ok) return await r.text();
    await new Promise((s) => setTimeout(s, 2000));
  }
  throw new Error(`Could not fetch ${url}`);
}

function parse(html) {
  const counts = {};
  for (const m of html.matchAll(/for="(contribution-day-component-\d+-\d+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
    const n = m[2].match(/^(\d+) contribution/);
    counts[m[1]] = n ? Number(n[1]) : 0;
  }
  const cells = [];
  for (const m of html.matchAll(/data-date="(\d{4}-\d{2}-\d{2})"\s+id="(contribution-day-component-(\d+)-(\d+))"\s+data-level="(\d)"/g)) {
    cells.push({ date: m[1], row: Number(m[3]), col: Number(m[4]), level: Number(m[5]), count: counts[m[2]] ?? 0 });
  }
  if (!cells.length) throw new Error("No contribution cells found. GitHub's page format may have changed.");
  return cells;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const THEMES = {
  dark:  { file: "contribution-graph-dark.svg", text: "#8b949e", strong: "#e6edf3", levels: ["#161b22","#0e4429","#006d32","#26a641","#39d353"], glow: "#58a6ff" },
  light: { file: "contribution-graph.svg",      text: "#57606a", strong: "#1f2328", levels: ["#ebedf0","#9be9a8","#40c463","#30a14e","#216e39"], glow: "#0969da" },
};

function build(cells, t) {
  const S = 12, G = 3, STEP = S + G, LEFT = 34, TOP = 28;
  const cols = Math.max(...cells.map((c) => c.col)) + 1;
  const W = LEFT + cols * STEP + 10, H = TOP + 7 * STEP + 34;
  const total = cells.reduce((a, c) => a + c.count, 0);
  const last = cells.reduce((a, c) => (c.date > a ? c.date : a), "");
  const fmt = (d) => { const [y, m, dd] = d.split("-"); return `${Number(dd)} ${MONTHS[Number(m) - 1]} ${y}`; };

  // month labels: first column whose first cell starts a new month
  const firstOfCol = {};
  cells.forEach((c) => { if (!(c.col in firstOfCol) || c.row < firstOfCol[c.col].row) firstOfCol[c.col] = c; });
  let labels = "", prevMonth = -1, prevX = -99;
  for (let col = 0; col < cols; col++) {
    const c = firstOfCol[col]; if (!c) continue;
    const mo = Number(c.date.slice(5, 7)) - 1, x = LEFT + col * STEP;
    const nxt = firstOfCol[col + 2], partialStart = col === 0 && nxt && Number(nxt.date.slice(5, 7)) - 1 !== mo;
    if (partialStart) { prevMonth = mo; continue; }
    if (mo !== prevMonth && x - prevX >= 3 * STEP) { labels += `<text x="${x}" y="${TOP - 10}" class="m">${MONTHS[mo]}</text>`; prevX = x; }
    prevMonth = mo;
  }
  const days = [["Mon", 1], ["Wed", 3], ["Fri", 5]].map(([n, r]) => `<text x="0" y="${TOP + r * STEP + 10}" class="m">${n}</text>`).join("");

  let rects = "";
  for (const c of cells) {
    const x = LEFT + c.col * STEP, y = TOP + c.row * STEP;
    const delay = (c.col * 0.04 + c.row * 0.015).toFixed(2);
    const active = c.level > 0 ? " on" : "";
    const label = `${c.count} contribution${c.count === 1 ? "" : "s"} on ${fmt(c.date)}`;
    rects += `<rect class="c${active}" x="${x}" y="${y}" width="${S}" height="${S}" rx="2" fill="${t.levels[c.level]}" style="animation-delay:${delay}s${c.level > 0 ? `,${(Number(delay) + 2.5).toFixed(2)}s` : ""}"><title>${label}</title></rect>`;
  }
  const today = cells.find((c) => c.date === last);
  const ring = today ? `<rect class="ring" x="${LEFT + today.col * STEP - 2}" y="${TOP + today.row * STEP - 2}" width="${S + 4}" height="${S + 4}" rx="4" fill="none" stroke="${t.glow}" stroke-width="1.5"/>` : "";

  const ly = TOP + 7 * STEP + 22;
  let legend = `<text x="${W - 10 - 5 * STEP - 62}" y="${ly + 9}" class="m">Less</text>`;
  t.levels.forEach((l, i) => { legend += `<rect x="${W - 10 - 5 * STEP - 30 + i * STEP}" y="${ly}" width="${S}" height="${S}" rx="2" fill="${l}"/>`; });
  legend += `<text x="${W - 10 - 28 + 28 - 22}" y="${ly + 9}" class="m" text-anchor="start">More</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${user} contribution graph: ${total} contributions in the last year, updated ${fmt(last)}">
<style>
.m{font:10px -apple-system,Segoe UI,Helvetica,Arial,sans-serif;fill:${t.text}}
.s{font:12px -apple-system,Segoe UI,Helvetica,Arial,sans-serif;fill:${t.strong}}
.c{transform-box:fill-box;transform-origin:center;animation:pop .5s ease-out both}
.c.on{animation:pop .5s ease-out both,pulse 3s ease-in-out infinite}
@keyframes pop{0%{opacity:0;transform:scale(.2)}70%{opacity:1;transform:scale(1.25)}100%{opacity:1;transform:scale(1)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.55}}
.sweep{animation:sweep 5s linear 2s infinite;opacity:0}
@keyframes sweep{0%{transform:translateX(0);opacity:0}8%{opacity:.35}92%{opacity:.35}100%{transform:translateX(${cols * STEP}px);opacity:0}}
.ring{animation:ring 1.6s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
@keyframes ring{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.2;transform:scale(1.5)}}
@media (prefers-reduced-motion:reduce){.c,.c.on,.sweep,.ring{animation:none;opacity:1}.sweep{opacity:0}}
</style>
${labels}${days}
${rects}
<rect class="sweep" x="${LEFT}" y="${TOP - 2}" width="${STEP * 2}" height="${7 * STEP + 1}" fill="${t.glow}" rx="6"/>
${ring}
<text x="${LEFT}" y="${ly + 9}" class="s">${total} contribution${total === 1 ? "" : "s"} in the last year · updated ${fmt(last)}</text>
${legend}
</svg>`;
}

const cells = parse(await getHtml());
mkdirSync(outDir, { recursive: true });
for (const t of Object.values(THEMES)) writeFileSync(`${outDir}/${t.file}`, build(cells, t));
console.log(`Wrote ${Object.keys(THEMES).length} SVGs to ${outDir} (${cells.length} days)`);

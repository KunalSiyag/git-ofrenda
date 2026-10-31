// Renders a self-contained HTML ofrenda. Dates, names and commit messages come
// from git; only the epitaph, last words and offering come from the model.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ticks = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
const day = (iso) => iso.slice(0, 10);

function years(days) {
  if (days < 60) return `${days} days`;
  if (days < 730) return `${Math.round(days / 30)} months`;
  return `${(days / 365.25).toFixed(1)} years`;
}

const PICADO_COLORS = ['#e8418c', '#f59e0b', '#8b5cf6', '#10b981', '#ef4444', '#06b6d4'];

function card(f, i) {
  const g = f.ghost;
  return `
  <article class="grave" style="--d:${(i * 0.37) % 2}s">
    <div class="candle" aria-hidden="true"><span class="flame"></span></div>
    <h3><code>${esc(f.path)}</code></h3>
    <p class="dates">${day(f.born.date)} — ${day(f.died.date)} · ${years(f.lifespanDays)}</p>
    ${g ? `<p class="epitaph">${ticks(g.epitaph)}</p>
    <blockquote>“${ticks(g.last_words)}”</blockquote>
    <p class="offering"><span aria-hidden="true">🕯️</span> Leave: ${ticks(g.offering)}</p>` : `<p class="epitaph">It rests quietly. The ghost did not answer.</p>`}
    <dl>
      <div><dt>Lines at death</dt><dd>${f.lines}</dd></div>
      <div><dt>Commits lived</dt><dd>${f.commits}</dd></div>
      <div><dt>Hands that shaped it</dt><dd>${f.authors.length}</dd></div>
    </dl>
    <p class="death">Laid to rest by ${esc(f.died.author)} in <q>${esc(f.died.subject)}</q>${f.died.successors.length ? `, the same moment <code>${esc(f.died.successors[0])}</code>${f.died.successors.length > 1 ? ` and ${f.died.successors.length - 1} more` : ''} were born` : ''}.</p>
  </article>`;
}

export function renderAltar({ repoName, departed, totalDead, model, generatedAt }) {
  const tiers = [departed.slice(0, 1), departed.slice(1, 4), departed.slice(4)];
  const flags = Array.from({ length: 14 }, (_, i) => `<span style="--c:${PICADO_COLORS[i % PICADO_COLORS.length]}"></span>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ofrenda for ${esc(repoName)}</title>
<style>
:root{--night:#120a1f;--ink:#f6efe4;--muted:#c9b8d9;--marigold:#f59e0b;--stone:#241736;--stone-edge:#3a2752;}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(1200px 600px at 50% -10%,#3b1d4f 0%,var(--night) 60%) fixed;color:var(--ink);font:16px/1.55 Georgia,'Iowan Old Style',serif;min-height:100vh}
.picado{display:flex;justify-content:center;gap:6px;padding:0 16px;overflow:hidden}
.picado span{width:56px;height:64px;flex:none;background:var(--c);opacity:.9;clip-path:polygon(0 0,100% 0,100% 78%,88% 100%,75% 82%,62% 100%,50% 82%,38% 100%,25% 82%,12% 100%,0 78%);
  -webkit-mask:radial-gradient(circle at 50% 38%,transparent 9px,#000 10px);mask:radial-gradient(circle at 50% 38%,transparent 9px,#000 10px);animation:sway 4s ease-in-out infinite alternate}
.picado span:nth-child(even){animation-delay:-2s}
@keyframes sway{to{transform:rotate(2.5deg) translateY(2px)}}
header{text-align:center;padding:28px 16px 8px;max-width:760px;margin:0 auto}
h1{font-size:clamp(28px,5vw,46px);margin:.2em 0;letter-spacing:.01em}
h1 em{color:var(--marigold);font-style:normal}
.sub{color:var(--muted);margin:0}
.tier{display:grid;gap:18px;padding:20px 16px;max-width:1180px;margin:0 auto;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));position:relative}
.tier::after{content:"";position:absolute;left:16px;right:16px;bottom:0;height:10px;border-radius:4px;background:linear-gradient(90deg,#7c2d12,#b45309,#7c2d12);opacity:.55}
.tier.top{max-width:560px;grid-template-columns:1fr}
.grave{position:relative;background:linear-gradient(180deg,var(--stone-edge),var(--stone));border-radius:120px 120px 10px 10px;padding:44px 24px 22px;box-shadow:0 10px 30px #0008,inset 0 1px 0 #ffffff14}
.grave h3{margin:0 0 4px;text-align:center;font-size:17px;word-break:break-all}
.grave h3 code{color:var(--marigold);background:none}
.dates{text-align:center;color:var(--muted);margin:0 0 14px;font-size:14px;font-variant-numeric:tabular-nums}
.epitaph{text-align:center;font-size:19px;font-style:italic;margin:0 0 12px}
blockquote{margin:0 0 12px;padding:10px 14px;border-left:3px solid var(--marigold);background:#0003;border-radius:0 8px 8px 0}
.offering{margin:0 0 12px;color:#fde68a}
dl{display:flex;justify-content:space-between;gap:8px;margin:0 0 10px;padding:10px 0;border-top:1px dashed #ffffff22;border-bottom:1px dashed #ffffff22}
dl div{text-align:center;flex:1}
dt{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
dd{margin:0;font-size:20px;font-variant-numeric:tabular-nums}
.death{font-size:13px;color:var(--muted);margin:0}
code{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:.88em;background:#0004;padding:1px 4px;border-radius:4px}
.candle{position:absolute;top:-18px;left:50%;width:12px;height:30px;margin-left:-6px;background:linear-gradient(#fff7e6,#e9d5b5);border-radius:3px}
.flame{position:absolute;left:50%;top:-16px;width:12px;height:18px;margin-left:-6px;background:radial-gradient(ellipse at 50% 70%,#fff 0 20%,#fcd34d 40%,#f97316 70%,transparent 72%);border-radius:50% 50% 50% 50%/60% 60% 40% 40%;filter:drop-shadow(0 0 10px #f59e0b);animation:flicker 1.6s var(--d) infinite alternate ease-in-out}
@keyframes flicker{0%{transform:scale(1) rotate(-2deg)}50%{transform:scale(1.08,.94) rotate(2deg)}100%{transform:scale(.95,1.06) rotate(-1deg)}}
.petals{position:fixed;inset:0;pointer-events:none;overflow:hidden}
.petals i{position:absolute;top:-20px;width:10px;height:10px;border-radius:50% 0;background:var(--marigold);opacity:.7;animation:fall linear infinite}
@keyframes fall{to{transform:translateY(110vh) rotate(540deg)}}
footer{text-align:center;color:var(--muted);font-size:13px;padding:24px 16px 40px;max-width:760px;margin:0 auto}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
</head>
<body>
<div class="petals" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<i style="left:${(i * 53) % 100}%;animation-duration:${9 + (i % 5) * 2}s;animation-delay:-${(i * 1.7).toFixed(1)}s"></i>`).join('')}</div>
<nav class="picado" aria-hidden="true">${flags}</nav>
<header>
  <p class="sub">Ofrenda for the departed files of</p>
  <h1><em>${esc(repoName)}</em></h1>
  <p class="sub">${totalDead} files have died in this repository. These ${departed.length} lived longest and carried the most.</p>
</header>
${tiers.filter((t) => t.length).map((t, ti) => `<section class="tier${ti === 0 ? ' top' : ''}">${t.map((f, i) => card(f, ti * 10 + i)).join('')}</section>`).join('\n')}
<footer>Dates, names and commit messages come straight from <code>git log</code>. Epitaphs and last words were written by <code>${esc(model)}</code> running locally, and every identifier a ghost quotes was checked against its real final source. Made with git-ofrenda · ${esc(generatedAt.slice(0, 10))}</footer>
</body>
</html>`;
}

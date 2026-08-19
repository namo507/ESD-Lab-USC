#!/usr/bin/env node
/**
 * WCAG contrast probe.
 *
 * Renders the built app and measures computed contrast for every element that
 * paints text, in both themes, at rest and under forced :hover / :focus-visible
 * / :active. Exits non-zero on any failure.
 *
 * This exists because contrast bugs are invisible to code review. A token that
 * flips with the theme, reused as a fill under text that does not flip, reads
 * perfectly well in the stylesheet and renders at 1.1:1. Four rounds of those
 * shipped to production before anything measured them.
 *
 * Four corrections are baked in. Each one silently falsified a run before it
 * was found, so none of them should be removed without a replacement:
 *
 *   1. RENDER GUARD. A page that failed to load has no text and therefore no
 *      failures, which looks identical to a clean pass. The first run of this
 *      probe reported a perfect score against six blank error pages. Every
 *      route must clear MIN_TEXT_NODES or the run fails.
 *   2. Gradient backdrops are skipped, not assumed to be white. Assuming white
 *      manufactured a screen of bogus 1.1:1 failures on the hero panels.
 *   3. Semi-transparent fills are composited, not walked past. Skipping them
 *      scored Leaflet's 84%-opaque attribution panel against the map tile
 *      behind it and pointed a fix in the wrong direction.
 *   4. Only elements that actually render text are judged against the 4.5 text
 *      threshold. Scoring icon-only buttons that way invented 18 failures.
 *
 * Usage:  node scripts/contrast-probe.mjs [--base URL] [--json PATH]
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

/* Routes are the ones that render real content from the in-browser mocks.
   /nano/dashboard is deliberately absent: it reads dashboard/data/*.json,
   which is generated from live REDCap and not present in CI, so it renders an
   error state with ~18 text nodes. Adding it back without supplying that data
   would trip the render guard rather than pass quietly -- which is the point. */
const ROUTES = [
  '/', '/overview', '/redcap', '/redcap-portfolio', '/pipeline-health',
  '/participants', '/qa', '/results', '/runs', '/publications',
  '/data-explorer', '/matlab', '/ecg-quality', '/sdoh-map', '/executive',
];

/* Lowest observed is ~169 on a healthy route; the excluded error state is 18. */
const MIN_TEXT_NODES = 60;

const args = process.argv.slice(2);
const argOf = (flag, dflt) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : dflt; };
const BASE = argOf('--base', process.env.CONTRAST_BASE || 'http://127.0.0.1:4173');
const JSON_OUT = argOf('--json', null);

const IN_PAGE = `
const lum = ([r,g,b]) => { const f=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);};
  return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); };
const parse = s => { const m=String(s).match(/rgba?\\(([^)]+)\\)/); if(!m) return null;
  const p=m[1].split(/[,\\s/]+/).filter(Boolean).map(Number); return {rgb:p.slice(0,3), a:p.length>3?p[3]:1}; };
const ratio = (a,b) => { const [x,y]=[lum(a),lum(b)].sort((m,n)=>n-m); return (x+0.05)/(y+0.05); };
const effBg = el => { const stack=[]; let n=el;
  while(n&&n.nodeType===1){ const cs=getComputedStyle(n);
    if (cs.backgroundImage && cs.backgroundImage!=='none') return null;
    const c=parse(cs.backgroundColor);
    if(c&&c.a>0.001){ stack.push(c); if(c.a>0.999) break; }
    n=n.parentElement; }
  if(!stack.length || stack[stack.length-1].a<=0.999) return null;
  let out=stack[stack.length-1].rgb;
  for(let i=stack.length-2;i>=0;i--){ const t=stack[i];
    out=[0,1,2].map(j=>Math.round(t.rgb[j]*t.a + out[j]*(1-t.a))); }
  return out; };
const ownText = el => [...el.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim())
  .map(n=>n.textContent.trim()).join(' ');
`;

const collectResting = (page) => page.evaluate(`(() => {
  ${IN_PAGE}
  const rules=[];
  const walk=rs=>{for(let i=0;i<rs.length;i++){const r=rs[i];
    if(!r.selectorText){if(r.cssRules)walk(r.cssRules);continue;}
    if(r.style&&r.style.color)rules.push(r);}};
  for(const s of document.styleSheets){try{walk(s.cssRules);}catch(e){}}
  const winner=el=>{let best=null;for(const r of rules)for(const sel of r.selectorText.split(',')){
    let m=false;try{m=el.matches(sel.trim());}catch(e){}
    if(m)best={sel:sel.trim(),val:r.style.color};} return best;};
  const out=[]; let textNodes=0;
  for(const el of document.querySelectorAll('body *')){
    const own=ownText(el); if(own) textNodes++;
    const cs=getComputedStyle(el);
    if(cs.display==='none'||cs.visibility==='hidden'||+cs.opacity===0)continue;
    const b=el.getBoundingClientRect(); if(b.width<2||b.height<2)continue;
    if(!own)continue;
    const fg=parse(cs.color); const bg=effBg(el);
    if(!fg||!bg||fg.a<0.5)continue;
    const cr=ratio(fg.rgb,bg); const px=parseFloat(cs.fontSize);
    const need=(px>=24||(px>=18.66&&+cs.fontWeight>=700))?3:4.5;
    if(cr>=need)continue;
    const w=winner(el);
    out.push({state:'rest', sel:w?w.sel:'(inherited)', declared:w?w.val:cs.color,
      color:cs.color, bg:'rgb('+bg+')', ratio:+cr.toFixed(2), need, text:own.slice(0,36)});
  }
  return { out, textNodes };
})()`);

async function collectStates(page, findings, theme, route) {
  // Sampling a forced pseudo-state mid-transition returns an interpolated
  // colour, which reported a clean 0 twice while real failures sat behind it.
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable'); await cdp.send('Runtime.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', {
    nodeId: root.nodeId,
    selector: 'button, a, input, select, [role=button], [role=tab], [role=radio]',
  });
  for (const nodeId of nodeIds) {
    for (const st of [['hover'], ['focus-visible'], ['active']]) {
      try {
        const { object } = await cdp.send('DOM.resolveNode', { nodeId });
        const txt = await cdp.send('Runtime.callFunctionOn', {
          objectId: object.objectId,
          functionDeclaration:
            'function(){return [...this.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join("")}',
          returnByValue: true,
        });
        if (!txt.result.value) continue;
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: st });
        const s = await cdp.send('CSS.getComputedStyleForNode', { nodeId });
        const g = (n) => (s.computedStyle.find((x) => x.name === n) || {}).value;
        const pc = (v) => { const m = String(v).match(/rgba?\(([^)]+)\)/); if (!m) return null;
          const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
          return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 }; };
        const fg = pc(g('color')); const bg = pc(g('background-color'));
        if (!fg || !bg || bg.a < 0.85) continue;
        const L = ([r, gg, b]) => { const f = (c) => { c /= 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
          return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b); };
        const [x, y] = [L(fg.rgb), L(bg.rgb)].sort((a, b) => b - a);
        const cr = (x + 0.05) / (y + 0.05);
        const px = parseFloat(g('font-size'));
        const need = (px >= 24 || (px >= 18.66 && +g('font-weight') >= 700)) ? 3 : 4.5;
        if (cr >= need) continue;
        const attrs = (await cdp.send('DOM.describeNode', { nodeId })).node.attributes || [];
        const ci = attrs.indexOf('class');
        findings.push({ state: st[0], theme, route, sel: '(state)', declared: g('color'),
          color: g('color'), bg: g('background-color'), ratio: +cr.toFixed(2), need,
          text: (ci >= 0 ? attrs[ci + 1] : '').slice(0, 46) });
      } catch { /* node detached mid-sweep */ }
    }
    try { await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] }); } catch { /* */ }
  }
  await cdp.detach().catch(() => {});
}

/* CI installs the browser with `npx playwright install chromium` and the
   default resolution works. Sandboxes that ship a prebuilt Chromium expose it
   at a fixed path instead, so allow an override rather than downloading a
   second copy. */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const findings = [];
const unrendered = [];

for (const route of ROUTES) {
  const loaded = await page.goto(BASE + route, { waitUntil: 'networkidle' })
    .then(() => true).catch(() => false);
  if (!loaded) { unrendered.push(`${route} (navigation failed)`); continue; }
  await page.waitForTimeout(1800);

  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme });
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    await page.waitForTimeout(500);
    // The assistant drawer is most of the shared chrome and is closed by default.
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button,[role=button]')].find((x) =>
        /buddy|assistant|chat/i.test(x.textContent + ' ' + (x.getAttribute('aria-label') || '')));
      if (b) b.click();
    }).catch(() => {});
    await page.waitForTimeout(500);

    const { out, textNodes } = await collectResting(page);
    if (theme === 'light' && textNodes < MIN_TEXT_NODES) {
      unrendered.push(`${route} (${textNodes} text nodes, expected >= ${MIN_TEXT_NODES})`);
    }
    for (const f of out) findings.push({ ...f, theme, route });
    await collectStates(page, findings, theme, route);
  }
}
await browser.close();

const uniq = new Map();
for (const f of findings) {
  const k = `${f.theme}|${f.state}|${f.sel}|${f.declared}|${f.bg}`;
  if (!uniq.has(k) || f.ratio < uniq.get(k).ratio) uniq.set(k, f);
}
const rows = [...uniq.values()].sort((a, b) => a.ratio - b.ratio);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(findings, null, 1));

console.log(`contrast probe: ${ROUTES.length} routes x 2 themes x 4 states`);

if (unrendered.length) {
  console.error('\nFAIL: these routes did not render enough content to measure.');
  console.error('A blank or errored page has no text and therefore no failures,');
  console.error('which is indistinguishable from a clean pass. Refusing to certify it.');
  for (const u of unrendered) console.error(`  - ${u}`);
  process.exit(1);
}

if (!rows.length) {
  console.log('0 contrast failures.');
  process.exit(0);
}

console.error(`\nFAIL: ${rows.length} distinct contrast failures.\n`);
for (const r of rows) {
  console.error(`  ${r.theme.padEnd(5)} :${r.state.padEnd(13)} ${String(r.ratio).padStart(5)} / ${r.need}   ${r.color} on ${r.bg}`);
  console.error(`        ${r.sel.slice(0, 72)}`);
  console.error(`        "${r.text.slice(0, 40)}"   [${r.route}]`);
}
process.exit(1);

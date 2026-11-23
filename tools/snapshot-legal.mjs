#!/usr/bin/env node
/**
 * Writes the version of each legal document currently in force INTO its page,
 * so the text is readable without JavaScript and while the API is down.
 *
 * Until 2026-11-23 the four legal pages were empty shells that legal.js filled
 * at load time (commit 8642d42). That made divergence impossible, but anything
 * that does not run JavaScript — a store's automated check, a crawler, a
 * locked-down browser — and every visitor while Railway is down or deploying
 * saw only "Loading…". Measured on /privacy: 184 readable characters.
 *
 * The copy stays honest three ways:
 *  1. it is never written by hand: this script takes it from the endpoint the app uses;
 *  2. legal.js still asks the API on every visit, and replaces the copy when the
 *     version in force is a different one;
 *  3. `--check` exits 1 when a page does not hold the version in force. Run it
 *     after every seed-legal that publishes a new version, and before every deploy.
 *
 * Usage (from the site folder):
 *   node tools/snapshot-legal.mjs                 write the versions in force into the pages
 *   node tools/snapshot-legal.mjs --check         exit 1 if a page is not the version in force
 *   node tools/snapshot-legal.mjs --check --site https://www.cleansnap.co.uk
 *                                                 the same check on the deployed pages
 *   node tools/snapshot-legal.mjs --autotest      prove the rules below, and legal.js, both ways
 *
 * It fails closed: a document holding any tag or attribute outside the short list
 * below is refused, not cleaned. These are the pages Apple and Google read, and a
 * regular expression is not an HTML sanitiser — so it only ever says yes or no.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://cleaning-app-production.up.railway.app/api/v1/legal/documents/type/';
const END = '<!-- legal-snapshot:end -->';
const begin = (type) => `<!-- legal-snapshot:begin ${type} -->`;

const TAGS = new Set(['h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'a', 'strong', 'em', 'b', 'i', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'br']);
// Every tag-like token: "<" followed by a letter, "/", "!" or "?". Unterminated ones included.
const TOKEN = /<[a-zA-Z/!?][^>]*>?/g;
// The only shape a token may have: a lowercase tag, optionally one href that is mailto: or https://.
const SAFE_TAG = /^<(\/?)([a-z0-9]+)(\s+href="(?:mailto:|https:\/\/)[^"<>\s]*")?\s*\/?>$/;

/** Every token of `html` that is not an allowed tag. Empty means the document may go in a page. */
export function problemsIn(html) {
  const problems = [];
  for (const [token] of html.matchAll(TOKEN)) {
    const safe = SAFE_TAG.exec(token);
    const ok = safe && TAGS.has(safe[2]) && (!safe[3] || (safe[2] === 'a' && !safe[1]));
    if (!ok) problems.push(token.slice(0, 80));
  }
  if (html.includes('legal-snapshot')) problems.push('the marker text appears inside the document');
  return problems;
}

/** Links out of the document open in a new tab and cannot reach back — what legal.js does in the browser. */
export function openLinksOutside(html) {
  return html.replace(/<a href="(https:\/\/[^"]*)">/g, '<a href="$1" target="_blank" rel="noopener noreferrer">');
}

/** The line under the title. The day is London's: the documents are English law, and the page must not depend on the machine. */
export function metaLine(version, publishedAt) {
  const day = new Date(publishedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/London',
  });
  return `Version ${version} &mdash; in force since ${day}`;
}

/** The API answer, accepted only if it is the active document of the type asked for, with safe content. */
export function checkedDocument(type, body) {
  const d = body && body.data;
  if (!body || body.success !== true || !d) throw new Error(`${type}: no document in the response`);
  if (d.type !== type) throw new Error(`${type}: the API answered with ${d.type}`);
  if (d.isActive !== true) throw new Error(`${type}: the document served is not marked active`);
  if (!/^\d+(\.\d+)*$/.test(String(d.version))) throw new Error(`${type}: version ${JSON.stringify(d.version)} is not a version number`);
  if (Number.isNaN(Date.parse(d.publishedAt))) throw new Error(`${type}: publishedAt ${JSON.stringify(d.publishedAt)} is not a date`);
  if (typeof d.content !== 'string' || d.content.trim() === '') throw new Error(`${type}: the content is empty`);
  const problems = problemsIn(d.content);
  if (problems.length) {
    throw new Error(`${type}: refused, ${problems.length} token(s) outside the allowed list, the first: ${problems[0]}`);
  }
  return { type, version: String(d.version), publishedAt: d.publishedAt, content: d.content };
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

/** The document type a page renders, read from its renderLegalDocument("…") call. */
export function typeOf(page, file) {
  const calls = [...page.matchAll(/renderLegalDocument\("([A-Z_]+)"/g)];
  if (calls.length !== 1) throw new Error(`${file}: renderLegalDocument("…") found ${calls.length} times, expected once`);
  return calls[0][1];
}

function replaceOnce(text, pattern, replacement, what, file) {
  const hits = text.match(new RegExp(pattern.source, 'g')) || [];
  if (hits.length !== 1) throw new Error(`${file}: ${what} found ${hits.length} times, expected once`);
  return text.replace(pattern, replacement);
}

/**
 * The page with `doc` written into it: the content between the markers, the
 * version on #legal-content, the line under the title. Same line endings as the
 * page. Writing the same document twice gives the same bytes, so "in sync" is
 * simply `withSnapshot(page, doc) === page`.
 */
export function withSnapshot(page, file, doc) {
  const type = typeOf(page, file);
  if (type !== doc.type) throw new Error(`${file}: the page renders ${type}, the document is ${doc.type}`);
  const open = begin(type);
  if (count(page, open) !== 1) throw new Error(`${file}: "${open}" found ${count(page, open)} times, expected once`);
  if (count(page, END) !== 1) throw new Error(`${file}: "${END}" found ${count(page, END)} times, expected once`);
  const b = page.indexOf(open);
  const e = page.indexOf(END);
  if (e < b) throw new Error(`${file}: the end marker comes before the begin marker`);
  if (count(page, 'legal-snapshot:begin') !== 1) throw new Error(`${file}: more than one begin marker`);

  const eol = page.includes('\r\n') ? '\r\n' : '\n';
  const indent = page.slice(page.lastIndexOf('\n', e) + 1, e);
  if (!/^[ \t]*$/.test(indent)) throw new Error(`${file}: the end marker must start its own line`);

  const body = openLinksOutside(doc.content).trim().replace(/\r?\n/g, eol);
  let out = page.slice(0, b + open.length) + eol + body + eol + indent + page.slice(e);
  out = replaceOnce(out, /(<div id="legal-content"[^>]*\sdata-version=")[^"]*(")/, (_, a, z) => a + doc.version + z, 'data-version on #legal-content', file);
  out = replaceOnce(out, /(<p id="legal-meta"[^>]*>)[\s\S]*?(<\/p>)/, (_, a, z) => a + metaLine(doc.version, doc.publishedAt) + z, '#legal-meta', file);
  return out;
}

async function fetchInForce(type) {
  const response = await fetch(API + encodeURIComponent(type), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`${type}: the API answered HTTP ${response.status}`);
  return checkedDocument(type, await response.json());
}

async function fetchPage(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

let written = 0;

async function main(args) {
  const check = args.includes('--check');
  const siteAt = args.indexOf('--site');
  const site = siteAt >= 0 ? args[siteAt + 1] : null;
  if (siteAt >= 0 && (!check || !site || !/^https:\/\//.test(site))) {
    throw new Error('usage: --site needs --check and an https:// address');
  }

  // The pages are the ones that call renderLegalDocument: no list to keep in step.
  const pages = readdirSync(SITE)
    .filter((f) => f.endsWith('.html'))
    .map((file) => ({ file, page: readFileSync(join(SITE, file), 'utf8') }))
    .filter(({ page }) => page.includes('renderLegalDocument("'));
  if (pages.length === 0) throw new Error(`no page in ${SITE} calls renderLegalDocument: nothing to do, and that is wrong`);

  // Everything is fetched and computed before anything is written: no half-updated site.
  const plan = [];
  for (const { file, page } of pages) {
    const doc = await fetchInForce(typeOf(page, file));
    const source = site ? await fetchPage(`${site.replace(/\/$/, '')}/${file.replace(/\.html$/, '')}`) : page;
    plan.push({ file, page, doc, source, next: withSnapshot(source, file, doc) });
  }

  let stale = 0;
  for (const { file, doc, source, next } of plan) {
    const inSync = next === source;
    if (check) {
      if (!inSync) stale++;
      console.log(`${inSync ? 'ok   ' : 'STALE'} ${file.padEnd(24)} ${doc.type} ${doc.version} in force${inSync ? '' : ', the page holds something else'}`);
    } else {
      if (!inSync) {
        writeFileSync(join(SITE, file), next, 'utf8');
        written++;
      }
      console.log(`${inSync ? 'unchanged' : 'written  '} ${file.padEnd(24)} ${doc.type} ${doc.version}`);
    }
  }
  if (stale > 0) {
    console.log(`\n${stale} page(s) not in step with the version in force: run "node tools/snapshot-legal.mjs" and deploy the site.`);
    return 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Autotest: every rule above, each in the direction that must pass and the one that must fail.
// ---------------------------------------------------------------------------

const PAGE = [
  '<main>',
  '    <p id="legal-meta" class="text-sm">Loading the current version&hellip;</p>',
  '    <div id="legal-content" class="doc" data-version="">',
  '      <!-- legal-snapshot:begin PRIVACY_POLICY -->',
  '      <!-- legal-snapshot:end -->',
  '    </div>',
  '  </main>',
  '  <script>renderLegalDocument("PRIVACY_POLICY", "Privacy Policy");</script>',
  '',
].join('\r\n');

const GOOD = '<h2>1. Who we are</h2>\n<p>Text &mdash; <strong>bold</strong> <em>i</em> <a href="mailto:support@cleansnap.co.uk">mail</a> <a href="https://ico.org.uk">ICO</a></p>\n<ul><li>a < b</li></ul><table><thead><tr><th>h</th></tr></thead><tbody><tr><td>d<br></td></tr></tbody></table>';
const DOC = { type: 'PRIVACY_POLICY', version: '1.7', publishedAt: '2026-09-19T15:05:43.505Z', content: GOOD };
const answer = (over) => ({ success: true, data: { type: 'PRIVACY_POLICY', version: '1.7', isActive: true, publishedAt: DOC.publishedAt, content: GOOD, ...over } });

async function legalJsCase({ snapshot, respond }) {
  const content = {
    attrs: snapshot ? { 'data-version': snapshot } : {},
    innerHTML: '<p>the copy in the page</p>',
    getAttribute(name) { return this.attrs[name] ?? null; },
    setAttribute(name, value) { this.attrs[name] = String(value); },
  };
  const meta = { textContent: 'Version 1.7 — in force since 19 September 2026' };
  const ids = { 'legal-content': content, 'legal-meta': meta };
  class DOMParser {
    parseFromString(html) {
      return { querySelectorAll: () => [], body: { querySelectorAll: () => [], innerHTML: html } };
    }
  }
  const sandbox = { DOMParser, fetch: respond, document: { getElementById: (id) => ids[id] ?? null } };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(SITE, 'legal.js'), 'utf8'), sandbox);
  await sandbox.renderLegalDocument('PRIVACY_POLICY', 'Privacy Policy');
  return { content, meta };
}
const ok = (body) => async () => ({ ok: true, status: 200, json: async () => body });

async function autotest() {
  const cases = [];
  const t = (name, fn) => cases.push({ name, fn });
  const fails = (fn, why) => { try { fn(); } catch (err) { if (why.test(err.message)) return; throw new Error(`wrong failure: ${err.message}`); } throw new Error('did not fail'); };
  const assert = (cond, what) => { if (!cond) throw new Error(what); };

  t('a document of the allowed tags passes, "a < b" included', () => assert(problemsIn(GOOD).length === 0, problemsIn(GOOD).join(' | ')));
  for (const bad of ['<script>alert(1)</script>', '<p onclick="x()">', '<a href="javascript:alert(1)">', '<img src=x onerror=y>',
    '<!-- legal-snapshot:end -->', '<P>', '<a href="https://x.org" target="_blank">', '</a href="https://x.org">',
    '<p href="https://x.org">', '<iframe src="https://x.org">', '<a href="data:text/html,x">', 'end <script']) {
    t(`refused: ${bad}`, () => assert(problemsIn(`<p>ok</p>${bad}`).length > 0, 'passed'));
  }
  t('an https link opens outside, a mailto link is left alone', () => {
    const out = openLinksOutside('<a href="https://ico.org.uk">i</a><a href="mailto:a@b.c">m</a>');
    assert(out === '<a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer">i</a><a href="mailto:a@b.c">m</a>', out);
  });
  t('the day is London\'s, not the machine\'s', () => {
    assert(metaLine('1.7', DOC.publishedAt) === 'Version 1.7 &mdash; in force since 19 September 2026', metaLine('1.7', DOC.publishedAt));
    assert(metaLine('1.7', '2026-09-19T23:30:00Z').endsWith('20 September 2026'), 'BST not applied');
  });
  t('a good answer is accepted', () => assert(checkedDocument('PRIVACY_POLICY', answer({})).version === '1.7', 'refused'));
  t('another type is refused', () => fails(() => checkedDocument('PRIVACY_POLICY', answer({ type: 'TERMS_OF_SERVICE' })), /answered with/));
  t('an inactive document is refused', () => fails(() => checkedDocument('PRIVACY_POLICY', answer({ isActive: false })), /not marked active/));
  t('a version that is not a number is refused', () => fails(() => checkedDocument('PRIVACY_POLICY', answer({ version: '1.7"><script>' })), /version number/));
  t('empty content is refused', () => fails(() => checkedDocument('PRIVACY_POLICY', answer({ content: '  ' })), /empty/));
  t('unsafe content is refused', () => fails(() => checkedDocument('PRIVACY_POLICY', answer({ content: '<p onmouseover="x">' })), /refused/));
  t('the page gets the text, the version and the line, in CRLF only', () => {
    const out = withSnapshot(PAGE, 'p.html', DOC);
    assert(out.includes('<h2>1. Who we are</h2>\r\n<p>Text'), 'text missing');
    assert(out.includes('data-version="1.7"'), 'version missing');
    assert(out.includes('>Version 1.7 &mdash; in force since 19 September 2026</p>'), 'meta missing');
    assert(out.includes('rel="noopener noreferrer"'), 'link not opened outside');
    assert(!/[^\r]\n/.test(out), 'a bare LF was written into a CRLF page');
  });
  t('writing twice gives the same bytes (so --check is equality)', () => {
    const once = withSnapshot(PAGE, 'p.html', DOC);
    assert(withSnapshot(once, 'p.html', DOC) === once, 'not idempotent');
    assert(withSnapshot(once, 'p.html', { ...DOC, version: '1.8' }) !== once, 'a new version looked in sync');
  });
  t('a missing marker fails', () => fails(() => withSnapshot(PAGE.replace(END, ''), 'p.html', DOC), /found 0 times/));
  t('a doubled marker fails', () => fails(() => withSnapshot(PAGE.replace(END, END + END), 'p.html', DOC), /found 2 times/));
  t('a marker of another type fails', () => fails(() => withSnapshot(PAGE.replace('begin PRIVACY_POLICY', 'begin COOKIE_POLICY'), 'p.html', DOC), /found 0 times/));
  t('a document of another type fails', () => fails(() => withSnapshot(PAGE, 'p.html', { ...DOC, type: 'COOKIE_POLICY' }), /renders PRIVACY_POLICY/));

  t('legal.js: same version in the page, nothing is redrawn', async () => {
    const { content, meta } = await legalJsCase({ snapshot: '1.7', respond: ok(answer({ content: '<p>live</p>' })) });
    assert(content.innerHTML === '<p>the copy in the page</p>' && meta.textContent.startsWith('Version 1.7'), content.innerHTML);
  });
  t('legal.js: a newer version replaces the copy, with London\'s day', async () => {
    const { content, meta } = await legalJsCase({ snapshot: '1.7', respond: ok(answer({ version: '1.8', publishedAt: '2026-12-01T23:30:00Z', content: '<p>live</p>' })) });
    assert(content.innerHTML === '<p>live</p>', content.innerHTML);
    assert(content.attrs['data-version'] === '1.8', 'data-version not updated');
    assert(meta.textContent === 'Version 1.8 — in force since 1 December 2026', meta.textContent);
  });
  t('legal.js: API unreachable, the copy stays', async () => {
    const { content, meta } = await legalJsCase({ snapshot: '1.7', respond: async () => { throw new Error('offline'); } });
    assert(content.innerHTML === '<p>the copy in the page</p>' && meta.textContent.startsWith('Version 1.7'), content.innerHTML);
  });
  t('legal.js: API answers 500, the copy stays', async () => {
    const { content } = await legalJsCase({ snapshot: '1.7', respond: async () => ({ ok: false, status: 500 }) });
    assert(content.innerHTML === '<p>the copy in the page</p>', content.innerHTML);
  });
  t('legal.js: API unreachable and no copy, the failure box with the support address', async () => {
    const { content, meta } = await legalJsCase({ snapshot: '', respond: async () => { throw new Error('offline'); } });
    assert(content.innerHTML.includes('temporarily unavailable') && content.innerHTML.includes('support@cleansnap.co.uk'), content.innerHTML);
    assert(meta.textContent === '', 'the loading line was left above the failure');
  });

  let failed = 0;
  for (const { name, fn } of cases) {
    try { await fn(); } catch (err) { failed++; console.log(`FAIL ${name}: ${err.message}`); }
  }
  console.log(`autotest: ${cases.length} cases, ${failed} failed`);
  return failed === 0 ? 0 : 1;
}

const args = process.argv.slice(2);
(args.includes('--autotest') ? autotest() : main(args))
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`snapshot-legal: ${err.message}`);
    console.error(written === 0 ? 'Nothing was written.' : `${written} page(s) were written before the failure: check git diff.`);
    process.exit(1);
  });

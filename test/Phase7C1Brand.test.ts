import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const file = (path: string) => resolve(ROOT, path);
const text = (path: string) => readFileSync(file(path), 'utf8');
const sha256 = (path: string) => createHash('sha256').update(readFileSync(file(path))).digest('hex');
const pngSize = (path: string) => {
  const data = readFileSync(file(path));
  assert.equal(data.subarray(1, 4).toString(), 'PNG');
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
};

test('1 approved master logo exists', () => assert.equal(existsSync(file('frontend/public/sicher-logo.png')), true));
test('2 approved master logo fingerprint is unchanged', () => assert.equal(sha256('frontend/public/sicher-logo.png'), 'a49f7823369b1c4a0949a424e6850c38dd6e7def74e8f9905808dc7872ce00d3'));
test('3 favicon PNG dimensions are exact', () => { assert.deepEqual(pngSize('frontend/public/favicon-16x16.png'), [16, 16]); assert.deepEqual(pngSize('frontend/public/favicon-32x32.png'), [32, 32]); assert.deepEqual(pngSize('frontend/public/apple-touch-icon.png'), [180, 180]); });
test('4 favicon ICO exists and is nonempty', () => assert.ok(statSync(file('frontend/public/favicon.ico')).size > 0));
test('5 index references every generated favicon', () => { const html = text('frontend/index.html'); for (const asset of ['/favicon-16x16.png', '/favicon-32x32.png', '/apple-touch-icon.png', '/favicon.ico']) assert.match(html, new RegExp(asset.replace('.', '\\.'))); });
test('6 navbar and footer Logo component use approved master with decorative semantics', () => { const jsx = text('frontend/src/components.jsx'); assert.match(jsx, /<img src="\/sicher-logo\.png" alt="" \/>/); assert.match(jsx, /className="brand-mark" aria-hidden="true"/); });
test('7 obsolete SVG mark is not referenced by the application', () => assert.doesNotMatch(text('frontend/src/components.jsx') + text('frontend/index.html') + text('frontend/src/styles.css'), /sicher-mark\.svg/));
test('8 approved brand variables and distinct semantic colors are declared', () => { const css = text('frontend/src/styles.css'); for (const token of ['--brand-ivory: #f4f0e8', '--brand-paper: #fbf9f4', '--brand-navy: #071436', '--brand-cobalt: #2454d6', '--brand-blue: #1747e8', '--brand-apricot: #f2a77e', '--brand-coral: #ff805c', '--status-proven:', '--status-not-proven:']) assert.match(css, new RegExp(token)); assert.doesNotMatch(css, /--status-proven:\s*var\(--brand-cobalt\)|--status-not-proven:\s*var\(--brand-(?:blue|apricot|coral)\)/); });
test('9 wallet remains frozen and the Phase 7D.4 transaction boundary is pinned', () => { assert.equal(sha256('frontend/src/wallet.js'), 'c6a32ec6fae41c2e6c5ef6ca2f00d4a88ffffedf3fefb7589b422d0b539c5a86'); assert.equal(sha256('frontend/src/walletContext.jsx'), 'aa8e1b0e2c7e045cd328de11bbad7554f536c35f5bc25e692ba4cdc71c5a82d4'); assert.equal(sha256('frontend/src/commitmentTransaction.js'), 'c422d530572b13fc33739a20aaf6182612f02f41280285666a0b73efafeea9d7'); });
test('10 verified data adapter implementation fingerprint remains unchanged', () => assert.equal(sha256('frontend/src/verifiedCommitments.ts'), '02a6c0f7e3a1de12f6c4002773b1f569016df30c78ea44489ca87411bd4bc22f'));
test('11 approved colors are consumed by rendered UI roles, not only declared', () => {
  const css = text('frontend/src/styles.css');
  assert.match(css, /body \{[^}]*background: var\(--brand-ivory\);[^}]*color: var\(--brand-navy\)/);
  assert.match(css, /\.proof-card \{[^}]*background: var\(--brand-paper\)/);
  assert.match(css, /\.proof-card-title span \{ color: var\(--text-muted\); \}/);
  assert.match(css, /\.button-primary \{[^}]*background: var\(--brand-cobalt\)/);
  assert.match(css, /\.button-primary:hover \{[^}]*var\(--brand-blue\)/);
  assert.match(css, /:focus-visible \{[^}]*var\(--brand-cobalt\)/);
  assert.match(css, /\.about-gradient \{[^}]*var\(--brand-apricot\)[^}]*var\(--brand-coral\)[^}]*var\(--brand-cobalt\)[^}]*var\(--brand-blue\)/);
});
test('12 proof status selectors remain independent from brand accents', () => {
  const css = text('frontend/src/styles.css');
  assert.match(css, /\.status-green \{[^}]*var\(--status-proven-soft\)[^}]*var\(--status-proven\)/);
  assert.match(css, /\.status-coral \{[^}]*var\(--status-not-proven-soft\)[^}]*var\(--status-not-proven\)/);
  assert.doesNotMatch(css, /\.status-(?:green|coral) \{[^}]*(?:brand-cobalt|brand-blue|brand-apricot|brand-coral)/);
});

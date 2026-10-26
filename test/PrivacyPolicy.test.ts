import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
// @ts-expect-error The frontend route helper is an intentionally untyped JavaScript module.
import { resolveRoute } from '../frontend/src/logic.js';

const ROOT = resolve(import.meta.dirname, '..');
const source = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');
const policy = source('frontend/src/privacyPolicy.jsx');
const main = source('frontend/src/main.jsx');
const components = source('frontend/src/components.jsx');

test('/privacy resolves and renders the Privacy Policy page', () => {
  assert.deepEqual(resolveRoute('/privacy'), { name: 'privacy' });
  assert.deepEqual(resolveRoute('/privacy/'), { name: 'privacy' });
  assert.match(main, /route\.name === 'privacy'.*<Privacy \/>/);
  assert.match(main, /usePageTitle\('Privacy Policy'\)/);
  assert.match(policy, /<h1>Privacy Policy<\/h1>/);
});

test('approved privacy contact and critical disclosures are present', () => {
  assert.match(policy, /justremotegigs@gmail\.com/);
  for (const disclosure of [
    'Sicher does not require you to create a traditional user account.',
    'Sicher uses browser',
    'The deployed registry does not provide Sicher with a mechanism to edit or delete an existing blockchain commitment.',
    "It does <strong>not necessarily revoke your wallet provider's authorization for the website<\/strong>.",
    'Sicher does not request your seed phrase, recovery phrase, mnemonic, or private key.',
  ]) assert.match(policy, new RegExp(disclosure.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('persistent footer links to Privacy', () => {
  assert.match(components, /<a href="\/privacy">Privacy<\/a>/);
});

test('existing public navigation routes still resolve', () => {
  assert.deepEqual(resolveRoute('/'), { name: 'home' });
  assert.deepEqual(resolveRoute('/explore'), { name: 'explore' });
  assert.deepEqual(resolveRoute('/start'), { name: 'start' });
  assert.deepEqual(resolveRoute('/about'), { name: 'about' });
  assert.deepEqual(resolveRoute('/proof/2'), { name: 'proof', id: '2' });
});

test('privacy implementation adds no banner, tracking, or form', () => {
  assert.doesNotMatch(policy, /<form|cookie banner|consent popup|analytics SDK|tracking pixel/i);
});

// Import smoke test for the Iwe book-manager app.
// Exercises the real CSV parsing + import code from index.html with the
// messy, real-world files users actually bring (varied headers, semicolons,
// missing header row) plus round-trip exports.
//
// Run: node tests/import-smoke.mjs
// Exits non-zero with the first failed expectation.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
assert.ok(m, 'no inline <script> found in index.html');

// ---- Minimal browser stubs (no DOM library needed) ----
function fakeEl() {
  return {
    value: '', textContent: '', innerHTML: '', hidden: false,
    style: {}, dataset: {}, files: [], options: [],
    classList: { add() {}, remove() {} },
    addEventListener() {}, removeEventListener() {}, click() {},
    appendChild() {}, remove() {}, select() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    showModal() {}, close() {},
  };
}
const elCache = new Map();
globalThis.document = {
  readyState: 'complete',
  addEventListener() {},
  getElementById: (id) => {
    if (!elCache.has(id)) elCache.set(id, fakeEl());
    return elCache.get(id);
  },
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => fakeEl(),
};
globalThis.location = { hash: '' };
globalThis.window = {};

// Run the app's real script.
(0, eval)(m[1]); // eslint-disable-line no-eval
await globalThis.window.App.ready.catch((e) => {
  throw new Error('app init failed: ' + (e && e.message));
});
const { actions: A, helpers: H } = globalThis.window.App;

// ---- Seed records that relational imports must match ----
await A.saveMate({ name: 'Adaeze Okafor', matric: 'SCI/2023/001', phone: '' });
await A.saveBook({ title: 'Engineering Mathematics II', price: 4500 });
await A.saveLevy({ title: 'Departmental Dues', amount: 2000, deadline: '' });

let n = 0;
const t = async (name, fn) => { n++; await fn(); console.log('ok ' + n + ' - ' + name); };
const imp = (fn, csv) => fn(H.parseCSV(csv));

await t('mates round-trip header imports', async () => {
  const r = await imp(A.importMates, 'name,matric,phone\nJohn Doe,SCI/2024/001,0803\n');
  assert.equal(r.added, 1);
});

await t('mates accept real-world header variants (Full Name / Matric No. / Phone Number)', async () => {
  const r = await imp(A.importMates, 'Full Name,Matric No.,Phone Number\nJane Doe,SCI/2024/002,0804\n');
  assert.equal(r.added, 1);
  const mate = globalThis.window.App.getState().mates.find((x) => x.matric === 'SCI/2024/002');
  assert.equal(mate && mate.phone, '0804');
});

await t('mates accept semicolon-delimited files', async () => {
  const r = await imp(A.importMates, 'name;matric;phone\nSemi Colon;SCI/2024/003;0805\n');
  assert.equal(r.added, 1);
});

await t('mates accept a headerless file positionally (name,matric,phone)', async () => {
  const r = await imp(A.importMates, 'No Header,SCI/2024/004,0806\n');
  assert.equal(r.added, 1);
  assert.equal(r.assumedHeader, true);
});

await t('books accept real-world headers (Book Title / Amount)', async () => {
  const r = await imp(A.importBooks, 'Book Title,Amount\nChemistry 101,3000\n');
  assert.equal(r.added, 1);
});

await t('levies accept real-world headers (Levy Name / Amount / Deadline)', async () => {
  const r = await imp(A.importLevies, 'Levy Name,Amount,Deadline\nLibrary Levy,1000,2026-12-31\n');
  assert.equal(r.added, 1);
});

await t('purchases accept real-world headers and the paid amount', async () => {
  const r = await imp(
    A.importPurchases,
    'Date,Matric No,Book Title,Quantity,Amount Paid\n2026-01-05,SCI/2023/001,Engineering Mathematics II,1,4500\n'
  );
  assert.equal(r.added, 1);
  const pur = globalThis.window.App.getState().purchases.at(-1);
  assert.equal(pur.paid, 4500);
});

await t('purchases round-trip header still imports', async () => {
  const r = await imp(
    A.importPurchases,
    'date,matric,book,qty,paid\n2026-01-05,SCI/2023/001,Engineering Mathematics II,1,2000\n'
  );
  assert.equal(r.added, 1);
});

await t('payments round-trip header still imports', async () => {
  const r = await imp(
    A.importPayments,
    'date,matric,levy,paid\n2026-01-06,SCI/2023/001,Departmental Dues,2000\n'
  );
  assert.equal(r.added, 1);
});

await t('relational imports report what was skipped and why', async () => {
  const r = await imp(
    A.importPayments,
    'date,matric,levy,paid\n2026-01-06,NOPE/000,Departmental Dues,500\n2026-01-06,SCI/2023/001,Missing Levy,500\n'
  );
  assert.equal(r.added, 0);
  assert.equal(r.skipped, 2);
  assert.ok(Array.isArray(r.sampleSkips) && r.sampleSkips.length > 0, 'expected sample skip reasons');
});

await t('empty file imports nothing without throwing', async () => {
  const r = await imp(A.importMates, '');
  assert.equal(r.added, 0);
});

await t('mates re-import with same matric updates instead of duplicating', async () => {
  const before = globalThis.window.App.getState().mates.length;
  const r = await imp(A.importMates, 'name,matric,phone\nJane Doe,SCI/2024/002,0809\n');
  assert.equal(r.added, 0);
  assert.equal(r.updated, 1);
  assert.equal(r.skipped, 0);
  const mate = globalThis.window.App.getState().mates.find((x) => x.matric === 'SCI/2024/002');
  assert.equal(mate && mate.phone, '0809');
  assert.equal(globalThis.window.App.getState().mates.length, before);
});

await t('purchases skip exact duplicates already recorded', async () => {
  const r = await imp(
    A.importPurchases,
    'Date,Matric No,Book Title,Quantity,Amount Paid\n2026-01-05,SCI/2023/001,Engineering Mathematics II,1,4500\n'
  );
  assert.equal(r.added, 0);
  assert.equal(r.skipped, 1);
  assert.ok(/duplicate/i.test(r.sampleSkips.join(' ')), 'expected duplicate reason, got: ' + JSON.stringify(r.sampleSkips));
});

await t('purchases skip duplicate rows within the same file', async () => {
  const r = await imp(
    A.importPurchases,
    'date,matric,book,qty,paid\n2026-03-01,SCI/2023/001,Engineering Mathematics II,1,100\n2026-03-01,SCI/2023/001,Engineering Mathematics II,1,100\n'
  );
  assert.equal(r.added, 1);
  assert.equal(r.skipped, 1);
});

await t('payments skip exact duplicates already recorded', async () => {
  const r = await imp(
    A.importPayments,
    'date,matric,levy,paid\n2026-01-06,SCI/2023/001,Departmental Dues,2000\n'
  );
  assert.equal(r.added, 0);
  assert.equal(r.skipped, 1);
  assert.ok(/duplicate/i.test(r.sampleSkips.join(' ')), 'expected duplicate reason, got: ' + JSON.stringify(r.sampleSkips));
});

console.log('pass: ' + n + ' import checks');

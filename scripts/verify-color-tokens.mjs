#!/usr/bin/env node
// Story 1.2 -- Design Token System
//
// Asserts that src/app.css's light-mode (`:root`) and dark-mode
// (`@media (prefers-color-scheme: dark)`) blocks contain the exact 22
// documented hex values for the 11 color tokens. No test runner (vitest/jest)
// is installed in this project yet, so this is a plain Node script run via
// `npm run test:tokens` -- it exits non-zero (and prints a diff) on any
// mismatch, catching transcription typos in values that were already
// contrast-verified upstream and must not silently drift.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.join(__dirname, '..', 'src', 'app.css');

/** @type {Record<string, { light: string; dark: string }>} */
const EXPECTED = {
  '--background': { light: '#f3f5f6', dark: '#151c21' },
  '--surface': { light: '#ffffff', dark: '#1d262c' },
  '--text-primary': { light: '#24303a', dark: '#e7eef1' },
  '--text-secondary': { light: '#5c6b75', dark: '#93a3ac' },
  '--border': { light: '#dce3e7', dark: '#2d3a41' },
  '--accent-primary': { light: '#35707d', dark: '#5fa0ad' },
  '--accent-run': { light: '#3e6fa6', dark: '#6f9fd4' },
  '--accent-rest': { light: '#7c8a93', dark: '#7c8790' },
  '--accent-cross': { light: '#6c5f92', dark: '#9789be' },
  '--accent-celebration': { light: '#c17a1b', dark: '#f0b75c' },
  '--accent-caution': { light: '#c1584a', dark: '#d9776a' },
};

const css = readFileSync(cssPath, 'utf8');

// Split the stylesheet into the `:root` (light) block and the
// `@media (prefers-color-scheme: dark)` block so a token declared only in
// one of the two can't be matched against the other.
function extractBlock(source, startPattern) {
  const startMatch = source.match(startPattern);
  if (!startMatch) {
    throw new Error(`Could not find block matching ${startPattern}`);
  }
  const braceStart = source.indexOf('{', startMatch.index);
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(braceStart + 1, i);
      }
    }
  }
  throw new Error('Unterminated block');
}

const rootBlock = extractBlock(css, /:root\s*\{/);
const darkMediaBlock = extractBlock(css, /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{/);
const darkRootBlock = extractBlock(darkMediaBlock, /:root\s*\{/);

function findValue(block, token) {
  const re = new RegExp(`(?<![\\w-])${token}\\s*:\\s*([^;]+);`);
  const match = block.match(re);
  return match ? match[1].trim().toLowerCase() : null;
}

let failures = [];

for (const [token, { light, dark }] of Object.entries(EXPECTED)) {
  const actualLight = findValue(rootBlock, token);
  const actualDark = findValue(darkRootBlock, token);

  if (actualLight !== light) {
    failures.push(`${token} (light): expected ${light}, got ${actualLight ?? '<missing>'}`);
  }
  if (actualDark !== dark) {
    failures.push(`${token} (dark): expected ${dark}, got ${actualDark ?? '<missing>'}`);
  }
}

const expectedCount = Object.keys(EXPECTED).length * 2;

if (failures.length > 0) {
  console.error(`Color token verification FAILED (${failures.length} mismatch(es)):`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Color token verification passed: all ${expectedCount} documented hex values (11 tokens x light/dark) match src/app.css.`,
);

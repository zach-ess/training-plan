#!/usr/bin/env node
// Story 1.2 -- Design Token System
//
// Asserts that src/app.css's tokens (colors, typography, radii, spacing)
// match spec-1-2-design-token-system.md's frozen tables exactly, and that
// the `--surface` hex duplicated into index.html's `theme-color` meta tags
// and vite.config.ts's manifest colors stay in sync with app.css's current
// `--surface` values. No test runner (vitest/jest) is installed in this
// project yet, so this is a plain Node script run via `npm run test:tokens`
// -- it exits non-zero (and prints errors) on any mismatch, catching
// transcription typos or a token edit that forgets to update a duplicate.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.join(__dirname, '..', 'src', 'app.css');
const indexHtmlPath = path.join(__dirname, '..', 'index.html');
const viteConfigPath = path.join(__dirname, '..', 'vite.config.ts');

const SANS = "system-ui, -apple-system, 'Segoe UI', sans-serif";
const MONO = "ui-monospace, 'SF Mono', 'Roboto Mono', Menlo, Consolas, monospace";

/** @type {Record<string, { light: string; dark: string }>} */
const EXPECTED_COLORS = {
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

// 9 typography roles. Only attributes the spec's table actually gives a
// value for (not "--") are asserted for a role.
const EXPECTED_TYPOGRAPHY = {
  eyebrow: { fontFamily: SANS, size: '0.625rem', weight: '600', letterSpacing: '0.06em' },
  title: { fontFamily: SANS, size: '1.0625rem', weight: '600' },
  'row-label': { fontFamily: SANS, size: '0.8125rem', weight: '500', tabularNums: true },
  meta: { fontFamily: SANS, size: '0.71875rem', weight: '400', tabularNums: true },
  caption: { fontFamily: SANS, size: '0.65625rem', weight: '400' },
  body: { fontFamily: SANS, size: '0.8125rem', weight: '400', lineHeight: '1.5' },
  'stat-value': { fontFamily: SANS, size: '1.25rem', weight: '700', tabularNums: true },
  'rollup-readout': { fontFamily: MONO, size: '1rem', weight: '600', tabularNums: true },
  'rollup-label': { fontFamily: SANS, size: '0.59375rem', weight: '600', letterSpacing: '0.04em' },
};

// 3 radii (px, not rem -- radii are not part of the font-scaling requirement).
const EXPECTED_RADII = {
  '--radius-xs': '2px',
  '--radius-sm': '6px',
  '--radius-full': '9999px',
};

// 8-step spacing scale plus the two named values.
const EXPECTED_SPACING = {
  '--space-1': '0.125rem',
  '--space-2': '0.25rem',
  '--space-3': '0.375rem',
  '--space-4': '0.5rem',
  '--space-5': '0.625rem',
  '--space-6': '0.875rem',
  '--space-7': '1.25rem',
  '--space-8': '1.75rem',
  '--gutter': '0.875rem',
  '--row-padding': '0.625rem',
};

/** Replace `/* ... *\/` comments with equal-length whitespace so brace
 * indices in the masked string still line up with the original text, and a
 * brace inside a comment can never desync the depth count. */
function maskComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\n]/g, ' '),
  );
}

/** Extract the contents of the first `{ ... }` block whose opening matches
 * `startPattern`, scanning `source` (which must already have comments
 * masked out so a `{`/`}` inside a comment can't be counted). */
function extractBlock(source, startPattern) {
  const startMatch = source.match(startPattern);
  if (!startMatch) {
    throw new Error(`could not find a block matching ${startPattern}`);
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
  throw new Error(`unterminated block for ${startPattern}`);
}

function findValue(block, property) {
  const re = new RegExp(`(?<![\\w-])${property}\\s*:\\s*([^;]+);`);
  const match = block.match(re);
  // Collapse whitespace (declarations may wrap across lines, e.g. a long
  // font-family list) before comparing.
  return match ? match[1].replace(/\s+/g, ' ').trim().toLowerCase() : null;
}

function loadCssBlocks() {
  const raw = readFileSync(cssPath, 'utf8');
  const masked = maskComments(raw);

  // Scope the light-block search to the substring before the first
  // `@media`, so a future reordering of the file can't make it silently
  // match a block inside the dark-mode media query instead.
  const mediaIndex = masked.search(/@media\s*\(prefers-color-scheme:\s*dark\)/);
  const lightSection = mediaIndex === -1 ? masked : masked.slice(0, mediaIndex);

  const rootBlock = extractBlock(lightSection, /:root\s*\{/);
  const darkMediaBlock = extractBlock(masked, /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{/);
  const darkRootBlock = extractBlock(darkMediaBlock, /:root\s*\{/);

  return { rootBlock, darkRootBlock };
}

function checkColors(rootBlock, darkRootBlock, failures) {
  for (const [token, { light, dark }] of Object.entries(EXPECTED_COLORS)) {
    const actualLight = findValue(rootBlock, token);
    const actualDark = findValue(darkRootBlock, token);
    if (actualLight !== light) {
      failures.push(`${token} (light): expected ${light}, got ${actualLight ?? '<missing>'}`);
    }
    if (actualDark !== dark) {
      failures.push(`${token} (dark): expected ${dark}, got ${actualDark ?? '<missing>'}`);
    }
  }
}

function checkTypography(rootBlock, failures) {
  for (const [role, expected] of Object.entries(EXPECTED_TYPOGRAPHY)) {
    const prefix = `--type-${role}`;
    const checks = [
      ['fontFamily', `${prefix}-font-family`],
      ['size', `${prefix}-size`],
      ['weight', `${prefix}-weight`],
      ['lineHeight', `${prefix}-line-height`],
      ['letterSpacing', `${prefix}-letter-spacing`],
    ];
    for (const [key, property] of checks) {
      if (!(key in expected)) continue;
      const actual = findValue(rootBlock, property);
      const expectedValue = expected[key].toLowerCase();
      if (actual !== expectedValue) {
        failures.push(`${property}: expected ${expectedValue}, got ${actual ?? '<missing>'}`);
      }
    }
    if (expected.tabularNums) {
      const property = `${prefix}-font-variant-numeric`;
      const actual = findValue(rootBlock, property);
      if (actual !== 'tabular-nums') {
        failures.push(`${property}: expected tabular-nums, got ${actual ?? '<missing>'}`);
      }
    }
  }
}

function checkFlatTokens(rootBlock, expectedMap, failures) {
  for (const [token, expectedValue] of Object.entries(expectedMap)) {
    const actual = findValue(rootBlock, token);
    if (actual !== expectedValue.toLowerCase()) {
      failures.push(`${token}: expected ${expectedValue}, got ${actual ?? '<missing>'}`);
    }
  }
}

function extractMetaThemeColors(html) {
  const tagRe = /<meta\s+[^>]*name=["']theme-color["'][^>]*>/gi;
  const tags = html.match(tagRe) || [];
  /** @type {Record<string, string>} */
  const result = {};
  for (const tag of tags) {
    const contentMatch = tag.match(/content=["']([^"']+)["']/i);
    const mediaMatch = tag.match(/media=["']\(prefers-color-scheme:\s*(light|dark)\)["']/i);
    if (contentMatch && mediaMatch) {
      result[mediaMatch[1]] = contentMatch[1].trim().toLowerCase();
    }
  }
  return result;
}

function checkIndexHtmlSurface(surfaceLight, surfaceDark, failures) {
  const html = readFileSync(indexHtmlPath, 'utf8');
  const themeColors = extractMetaThemeColors(html);

  if (themeColors.light !== surfaceLight) {
    failures.push(
      `index.html theme-color (light): expected ${surfaceLight} (app.css --surface light), got ${
        themeColors.light ?? '<missing>'
      }`,
    );
  }
  if (themeColors.dark !== surfaceDark) {
    failures.push(
      `index.html theme-color (dark): expected ${surfaceDark} (app.css --surface dark), got ${
        themeColors.dark ?? '<missing>'
      }`,
    );
  }
}

function checkViteConfigSurface(surfaceLight, failures) {
  const config = readFileSync(viteConfigPath, 'utf8');

  const bgMatch = config.match(/background_color:\s*['"]([^'"]+)['"]/);
  const themeMatch = config.match(/theme_color:\s*['"]([^'"]+)['"]/);
  const actualBg = bgMatch ? bgMatch[1].trim().toLowerCase() : null;
  const actualTheme = themeMatch ? themeMatch[1].trim().toLowerCase() : null;

  if (actualBg !== surfaceLight) {
    failures.push(
      `vite.config.ts manifest background_color: expected ${surfaceLight} (app.css --surface light), got ${
        actualBg ?? '<missing>'
      }`,
    );
  }
  if (actualTheme !== surfaceLight) {
    failures.push(
      `vite.config.ts manifest theme_color: expected ${surfaceLight} (app.css --surface light), got ${
        actualTheme ?? '<missing>'
      }`,
    );
  }
}

function main() {
  /** @type {string[]} */
  const failures = [];

  const { rootBlock, darkRootBlock } = loadCssBlocks();

  checkColors(rootBlock, darkRootBlock, failures);
  checkTypography(rootBlock, failures);
  checkFlatTokens(rootBlock, EXPECTED_RADII, failures);
  checkFlatTokens(rootBlock, EXPECTED_SPACING, failures);

  checkIndexHtmlSurface(EXPECTED_COLORS['--surface'].light, EXPECTED_COLORS['--surface'].dark, failures);
  checkViteConfigSurface(EXPECTED_COLORS['--surface'].light, failures);

  if (failures.length > 0) {
    console.error(`Design token verification FAILED (${failures.length} mismatch(es)):`);
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  const colorCount = Object.keys(EXPECTED_COLORS).length * 2;
  const typeCount = Object.keys(EXPECTED_TYPOGRAPHY).length;
  const radiusCount = Object.keys(EXPECTED_RADII).length;
  const spacingCount = Object.keys(EXPECTED_SPACING).length;
  console.log(
    `Design token verification passed: ${colorCount} color hex values, ${typeCount} typography roles, ` +
      `${radiusCount} radii, ${spacingCount} spacing values match src/app.css, and the --surface hex ` +
      `duplicated into index.html and vite.config.ts stays in sync.`,
  );
}

try {
  main();
} catch (error) {
  console.error(`Design token verification ERROR: ${error.message}`);
  process.exit(1);
}

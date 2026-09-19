#!/usr/bin/env node
// Story 1.2 -- Design Token System
//
// This script embeds its own hardcoded transcription of
// spec-1-2-design-token-system.md's frozen token tables (EXPECTED_COLORS /
// EXPECTED_TYPOGRAPHY / EXPECTED_RADII / EXPECTED_SPACING below) and asserts
// that src/app.css's live values match that transcription. That means it
// only catches the two hardcoded copies (this script's constants and
// app.css) drifting apart from each other -- not either one silently
// drifting from the spec document itself, which still needs a human diff
// against the spec on any future edit.
//
// Separately, it guards two files that duplicate a live-parsed app.css
// value rather than re-declaring their own: index.html's `theme-color` meta
// tags (checked against app.css's actual, currently-in-force `--surface`
// light/dark values) and vite.config.ts's manifest `background_color`/
// `theme_color` (checked against app.css's actual `--background` light
// value -- the manifest's splash/install-screen color should match the
// rendered page canvas, not the card/tab-bar surface color). Both are
// compared to what app.css *currently* resolves to, not to this script's
// EXPECTED_COLORS constant, so they stay correct even if EXPECTED_COLORS
// itself were ever out of date.
//
// It also asserts that src/App.svelte's `<style>` block routes every
// declaration through a `var(--...)` token reference rather than a literal
// value, so reverting e.g. `color: var(--text-primary)` to a hardcoded hex
// fails here even though it would pass `svelte-check` silently.
//
// Story 1.3 -- Two-Tab Navigation Shell -- adds `checkTabBarWiring`, the
// same style of check for the new `TabBar.svelte`: its color-ish
// declarations must route through `var(--...)` tokens, and its markup must
// carry `role="tablist"`, two `role="tab"`, and `aria-selected`.
//
// Story 1.4 -- Plan Fetch, Cache & Loading States -- adds
// `checkSkeletonDayRowWiring`, the same color-token-wiring half of that
// check (no ARIA markup requirements apply to this presentational-only
// component) for the new `SkeletonDayRow.svelte`. It also adds
// `checkAppSvelteColorWiring`, a whole-style-block color-property scan (the
// same pattern as checkTabBarWiring/checkSkeletonDayRowWiring) over
// App.svelte -- this story added new selectors (`.skeleton-list`,
// `.plan-error`, `.retry-button`) that the older `checkAppSvelteTokenWiring`
// function doesn't cover (that check is scoped to only `main`/`p` and
// requires *every* declaration, not just color ones, to be a bare
// var(--...) reference, which would misfire on these new rules' non-color
// declarations like `display: flex`). The new scan only flags literal
// values on color-ish properties, so it composes safely with any selector
// this file has or gains later without needing its own selector allowlist.
//
// No test runner (vitest/jest) is installed in this project yet, so this is
// a plain Node script run via `npm run test:tokens` -- it exits non-zero
// (and prints errors) on any mismatch.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.join(__dirname, '..', 'src', 'app.css');
const indexHtmlPath = path.join(__dirname, '..', 'index.html');
const viteConfigPath = path.join(__dirname, '..', 'vite.config.ts');
const appSveltePath = path.join(__dirname, '..', 'src', 'App.svelte');
const tabBarSveltePath = path.join(__dirname, '..', 'src', 'lib', 'components', 'TabBar.svelte');
const skeletonDayRowSveltePath = path.join(
  __dirname,
  '..',
  'src',
  'lib',
  'components',
  'SkeletonDayRow.svelte',
);

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

/** Replace `/* ... *\/` comments with equal-length whitespace so brace/quote
 * indices in the masked string still line up with the original text, and a
 * brace or quote inside a comment can never desync later scanning. */
function maskComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
}

/** Replace the *contents* of single- or double-quoted strings (keeping the
 * quote characters and overall length) with whitespace, so a literal brace
 * inside a string value can't desync brace-depth counting either. Call
 * after `maskComments` so a quote character inside a comment was already
 * blanked and can't be mistaken for the start of a string. */
function maskStrings(source) {
  return source.replace(
    /'[^'\\]*(?:\\.[^'\\]*)*'|"[^"\\]*(?:\\.[^"\\]*)*"/g,
    (str) => str[0] + str.slice(1, -1).replace(/[^\n]/g, ' ') + str[str.length - 1],
  );
}

/** Extract the contents of the first `{ ... }` block whose opening matches
 * `startPattern`. Brace positions are found by scanning `braceMaskSource`
 * (comments AND quoted-string contents already blanked, so a stray `{`/`}`
 * inside either can't desync the depth count), but the returned content --
 * and a same-range slice of the brace mask, for further nested extraction
 * -- are taken from `contentSource`, which only has comments blanked so
 * real string values (e.g. quoted font-family names) survive intact. */
function extractBlock(contentSource, braceMaskSource, startPattern) {
  const startMatch = braceMaskSource.match(startPattern);
  if (!startMatch) {
    throw new Error(`could not find a block matching ${startPattern}`);
  }
  const braceStart = braceMaskSource.indexOf('{', startMatch.index);
  let depth = 0;
  for (let i = braceStart; i < braceMaskSource.length; i++) {
    if (braceMaskSource[i] === '{') depth++;
    if (braceMaskSource[i] === '}') {
      depth--;
      if (depth === 0) {
        return {
          content: contentSource.slice(braceStart + 1, i),
          braceMask: braceMaskSource.slice(braceStart + 1, i),
        };
      }
    }
  }
  throw new Error(`unterminated block for ${startPattern}`);
}

/** CSS allows the same property to be declared more than once in a block;
 * per the cascade the browser uses the *last* one. Match globally and take
 * the last occurrence so this verifier checks the same value a browser
 * would. */
function findValue(block, property) {
  const re = new RegExp(`(?<![\\w-])${property}\\s*:\\s*([^;]+);`, 'g');
  let lastMatch = null;
  let match;
  while ((match = re.exec(block)) !== null) {
    lastMatch = match;
  }
  // Collapse whitespace (declarations may wrap across lines, e.g. a long
  // font-family list) before comparing.
  return lastMatch ? lastMatch[1].replace(/\s+/g, ' ').trim().toLowerCase() : null;
}

function loadCssBlocks() {
  const raw = readFileSync(cssPath, 'utf8');
  const commentMasked = maskComments(raw);
  const braceMask = maskStrings(commentMasked);

  // Scope the light-block search to the substring before the first
  // `@media`, so a future reordering of the file can't make it silently
  // match a block inside the dark-mode media query instead.
  const mediaIndex = braceMask.search(/@media\s*\(prefers-color-scheme:\s*dark\)/);
  const lightContent = mediaIndex === -1 ? commentMasked : commentMasked.slice(0, mediaIndex);
  const lightBraceMask = mediaIndex === -1 ? braceMask : braceMask.slice(0, mediaIndex);

  const { content: rootBlock } = extractBlock(lightContent, lightBraceMask, /:root\s*\{/);

  const darkMedia = extractBlock(
    commentMasked,
    braceMask,
    /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{/,
  );
  const { content: darkRootBlock } = extractBlock(darkMedia.content, darkMedia.braceMask, /:root\s*\{/);

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

/** Checked against app.css's actual, live-parsed `--surface` values (passed
 * in), not against the EXPECTED_COLORS constant -- this only asserts that
 * index.html stays in sync with whatever app.css currently says. */
function checkIndexHtmlSurface(actualSurfaceLight, actualSurfaceDark, failures) {
  const html = readFileSync(indexHtmlPath, 'utf8');
  const themeColors = extractMetaThemeColors(html);

  if (themeColors.light !== actualSurfaceLight) {
    failures.push(
      `index.html theme-color (light): expected ${actualSurfaceLight} (app.css --surface light), got ${
        themeColors.light ?? '<missing>'
      }`,
    );
  }
  if (themeColors.dark !== actualSurfaceDark) {
    failures.push(
      `index.html theme-color (dark): expected ${actualSurfaceDark} (app.css --surface dark), got ${
        themeColors.dark ?? '<missing>'
      }`,
    );
  }
}

/** Checked against app.css's actual, live-parsed `--background` light value
 * (passed in), not against the EXPECTED_COLORS constant. The manifest's
 * `background_color`/`theme_color` (splash/install-screen colors) should
 * match the rendered page canvas (`--background`), not the card/tab-bar
 * `--surface` color. */
function checkViteConfigBackground(actualBackgroundLight, failures) {
  const config = readFileSync(viteConfigPath, 'utf8');

  const bgMatch = config.match(/background_color:\s*['"]([^'"]+)['"]/);
  const themeMatch = config.match(/theme_color:\s*['"]([^'"]+)['"]/);
  const actualBg = bgMatch ? bgMatch[1].trim().toLowerCase() : null;
  const actualTheme = themeMatch ? themeMatch[1].trim().toLowerCase() : null;

  if (actualBg !== actualBackgroundLight) {
    failures.push(
      `vite.config.ts manifest background_color: expected ${actualBackgroundLight} (app.css --background light), got ${
        actualBg ?? '<missing>'
      }`,
    );
  }
  if (actualTheme !== actualBackgroundLight) {
    failures.push(
      `vite.config.ts manifest theme_color: expected ${actualBackgroundLight} (app.css --background light), got ${
        actualTheme ?? '<missing>'
      }`,
    );
  }
}

/** Story 1.4's entire freshness guarantee for `plan.json` depends on it
 * being absent from Workbox's `generateSW` precache manifest -- a fresh
 * review found nothing anywhere asserted that, so a future reintroduction
 * of `json` into `globPatterns` (e.g. a careless merge, or a later story
 * copying the old array literal) would silently resurrect the exact
 * stale-precache bug `planStore.svelte.ts`'s cache-busted fetch exists to
 * avoid, with `npm run check` staying green throughout. This only checks
 * the glob list's own source text for the literal extension, the same
 * shallow-but-effective style as this file's other vite.config.ts checks --
 * it can't see the actual built precache manifest, but a `json` extension
 * in this array is the only way `plan.json` could end up in it. */
function checkViteConfigExcludesPlanJsonFromPrecache(failures) {
  const config = readFileSync(viteConfigPath, 'utf8');

  const globPatternsMatch = config.match(/globPatterns:\s*\[([^\]]*)\]/);
  if (!globPatternsMatch) {
    failures.push('vite.config.ts: no workbox.globPatterns array found');
    return;
  }

  const globPatternsSource = globPatternsMatch[1];
  // The extension list lives inside a single brace-expansion string, e.g.
  // '**/*.{js,css,html,ico,png,svg,webmanifest}' -- pull out its
  // comma-separated contents and check for a bare "json" entry, rather than
  // just searching the whole array text for the substring "json" (which
  // would also, harmlessly but confusingly, match inside an unrelated
  // future pattern like "*.json5" or a path containing "json").
  const braceMatch = globPatternsSource.match(/\{([^}]*)\}/);
  const extensions = braceMatch ? braceMatch[1].split(',').map((ext) => ext.trim()) : [];

  if (extensions.includes('json')) {
    failures.push(
      'vite.config.ts workbox.globPatterns: includes "json" -- this precaches plan.json, ' +
        'silently defeating planStore.svelte.ts\'s cache-busted background-refetch guarantee ' +
        '(see this story\'s Never section and the comment above globPatterns)',
    );
  }
}

const VAR_ONLY_VALUE_RE = /^var\(--[a-zA-Z0-9-]+(?:\s*,\s*[^()]+)?\)$/;

// Story 1.3's `main` rule adds the Android gesture-nav safe-area inset to
// the tab-bar-height token so content never sits under a bar that grew
// taller than --tab-bar-height (see App.svelte). This is still fully
// dynamic (no hardcoded literal being reintroduced) -- both operands are a
// design token and a UA-supplied environment value -- so it's allowed
// alongside a bare var(--...) reference, not treated as the literal value
// this check exists to catch.
const CALC_VAR_ENV_RE =
  /^calc\(\s*var\(--[a-zA-Z0-9-]+\)\s*\+\s*env\([a-zA-Z-]+(?:\s*,\s*[^()]+)?\)\s*\)$/;

function getDeclarations(block) {
  return block
    .split(';')
    .map((decl) => decl.trim())
    .filter(Boolean)
    .map((decl) => {
      const idx = decl.indexOf(':');
      if (idx === -1) return null;
      return { property: decl.slice(0, idx).trim(), value: decl.slice(idx + 1).trim() };
    })
    .filter((decl) => decl !== null);
}

/** src/App.svelte is this story's smoke test that tokens actually apply --
 * assert every declaration on `main` and `p` is a `var(--...)` reference,
 * not a literal, so reverting one to a hardcoded value (which
 * `svelte-check` and the rest of this script wouldn't notice) fails here.
 *
 * Story 1.3 replaced App.svelte's static `<h1>` placeholder with the
 * switchable tab-bar shell (see checkTabBarWiring below for TabBar.svelte's
 * own equivalent check), so `h1` is no longer part of this list. */
function checkAppSvelteTokenWiring(failures) {
  const source = readFileSync(appSveltePath, 'utf8');
  const styleMatch = source.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!styleMatch) {
    failures.push('src/App.svelte: no <style> block found');
    return;
  }

  const commentMasked = maskComments(styleMatch[1]);
  const braceMask = maskStrings(commentMasked);

  for (const selector of ['main', 'p']) {
    let block;
    try {
      ({ content: block } = extractBlock(
        commentMasked,
        braceMask,
        new RegExp(`(?<![\\w.#-])${selector}\\s*\\{`),
      ));
    } catch {
      failures.push(`src/App.svelte <style>: no "${selector} { ... }" rule found`);
      continue;
    }

    const declarations = getDeclarations(block);
    if (declarations.length === 0) {
      failures.push(`src/App.svelte <style> "${selector}" rule: no declarations found`);
      continue;
    }
    for (const { property, value } of declarations) {
      if (!VAR_ONLY_VALUE_RE.test(value) && !CALC_VAR_ENV_RE.test(value)) {
        failures.push(
          `src/App.svelte <style> "${selector} { ${property}: ${value}; }": expected a var(--...) token reference (or a calc() combining one with env(), e.g. main's safe-area padding), found a literal value`,
        );
      }
    }
  }
}

// Color-ish CSS properties that must route through a `var(--...)` token
// reference rather than a literal value. A handful of non-token keywords
// (none/inherit/currentcolor/transparent/initial/unset) are allowed through
// since they carry no color of their own -- they just defer to whatever
// color is already in force.
const COLOR_PROPERTY_RE =
  /^(color|background|background-color|border|border-top|border-right|border-bottom|border-left|border-color|border-top-color|border-right-color|border-bottom-color|border-left-color|outline|outline-color|fill|stroke|box-shadow|text-shadow|caret-color|accent-color|-webkit-tap-highlight-color)$/;
const SAFE_NON_TOKEN_VALUES = new Set([
  'none',
  'inherit',
  'currentcolor',
  'transparent',
  'initial',
  'unset',
]);

// `border: 0;` is the standard shorthand for "no border" (equivalent to
// `none`, not an actual color value) -- used by App.svelte's pre-existing
// `.visually-hidden` utility class, which this story's new whole-block color
// scan (checkAppSvelteColorWiring, below) reaches for the first time. Kept
// separate from the shared `SAFE_NON_TOKEN_VALUES` above (rather than added
// to it) so this exception applies only to that one scan -- a fresh review
// found that adding it to the shared set would also loosen
// `checkTabBarWiring`/`checkSkeletonDayRowWiring`, which have no
// `.visually-hidden`-style rule of their own to justify it.
const APP_SVELTE_SAFE_NON_TOKEN_VALUES = new Set([...SAFE_NON_TOKEN_VALUES, '0']);

/** TabBar.svelte (Story 1.3) is new nav chrome with no prior automated
 * check -- both previous review passes flagged that gap. Asserts its
 * `<style>` block routes every color-ish declaration through `var(--...)`
 * (or one of the safe non-token keywords above), and that its markup has
 * the required ARIA wiring: `role="tablist"`, two `role="tab"`, and
 * `aria-selected`. */
function checkTabBarWiring(failures) {
  const source = readFileSync(tabBarSveltePath, 'utf8');

  const tablistCount = (source.match(/role="tablist"/g) || []).length;
  if (tablistCount < 1) {
    failures.push('src/lib/components/TabBar.svelte: no role="tablist" found');
  }

  // Beyond just counting `role="tab"`/`aria-selected` occurrences anywhere
  // in the file: scope each check to its own button's markup slice (found
  // by its `id="tab-<tab>"`), so a within-file swap between the two
  // buttons -- e.g. Home's `onclick`/`aria-selected`/`aria-controls` ending
  // up on History's button -- is caught. A review found the previous
  // whole-file `source.includes()` checks couldn't distinguish that from a
  // correct file, since the same expected substrings are still present
  // somewhere, just attached to the wrong button.
  for (const tab of ['home', 'history']) {
    const buttonMatch = source.match(new RegExp(`<button[^>]*id="tab-${tab}"[\\s\\S]*?</button>`));
    if (!buttonMatch) {
      failures.push(`src/lib/components/TabBar.svelte: no <button id="tab-${tab}"> found`);
      continue;
    }
    const block = buttonMatch[0];

    if (!block.includes('role="tab"')) {
      failures.push(`src/lib/components/TabBar.svelte: button#tab-${tab} is missing role="tab"`);
    }

    const expectedBindings = {
      onclick: `onclick={() => onSelect('${tab}')}`,
      'aria-selected': `aria-selected={activeTab === '${tab}'}`,
      'aria-controls': `aria-controls="panel-${tab}"`,
    };
    for (const [name, expected] of Object.entries(expectedBindings)) {
      if (!block.includes(expected)) {
        failures.push(
          `src/lib/components/TabBar.svelte: button#tab-${tab} is missing or has a mismatched ${name} (expected ${expected})`,
        );
      }
    }
  }

  const styleMatch = source.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!styleMatch) {
    failures.push('src/lib/components/TabBar.svelte: no <style> block found');
    return;
  }

  const commentMasked = maskComments(styleMatch[1]);

  // Declarations across the whole style block, regardless of which
  // selector's rule they sit in -- selectors here never contain a `;`, so a
  // global "property: value;" scan can't cross a rule boundary and mistake
  // part of a selector for a declaration.
  const declRe = /([a-zA-Z-]+)\s*:\s*([^;{}]+);/g;
  let match;
  while ((match = declRe.exec(commentMasked)) !== null) {
    const property = match[1].trim().toLowerCase();
    if (!COLOR_PROPERTY_RE.test(property)) continue;

    const value = match[2].replace(/\s+/g, ' ').trim().toLowerCase();
    if (value.includes('var(--')) continue;
    if (SAFE_NON_TOKEN_VALUES.has(value)) continue;

    failures.push(
      `src/lib/components/TabBar.svelte <style> "${property}: ${match[2].trim()};": expected a var(--...) token reference (or none/inherit/transparent), found a literal value`,
    );
  }
}

/** Story 1.4's SkeletonDayRow.svelte is a new presentational component with
 * no prior automated check. Same color-token-wiring scan as
 * checkTabBarWiring above (every color-ish declaration in its `<style>`
 * block must route through `var(--...)` or a safe non-token keyword) --
 * this component has no interactive/ARIA markup requirements, so that half
 * of checkTabBarWiring doesn't apply here. */
function checkSkeletonDayRowWiring(failures) {
  const source = readFileSync(skeletonDayRowSveltePath, 'utf8');

  const styleMatch = source.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!styleMatch) {
    failures.push('src/lib/components/SkeletonDayRow.svelte: no <style> block found');
    return;
  }

  const commentMasked = maskComments(styleMatch[1]);

  const declRe = /([a-zA-Z-]+)\s*:\s*([^;{}]+);/g;
  let match;
  while ((match = declRe.exec(commentMasked)) !== null) {
    const property = match[1].trim().toLowerCase();
    if (!COLOR_PROPERTY_RE.test(property)) continue;

    const value = match[2].replace(/\s+/g, ' ').trim().toLowerCase();
    if (value.includes('var(--')) continue;
    if (SAFE_NON_TOKEN_VALUES.has(value)) continue;

    failures.push(
      `src/lib/components/SkeletonDayRow.svelte <style> "${property}: ${match[2].trim()};": expected a var(--...) token reference (or none/inherit/transparent), found a literal value`,
    );
  }
}

/** Whole-style-block color-property scan over App.svelte, same pattern as
 * checkTabBarWiring/checkSkeletonDayRowWiring above. Story 1.4 added
 * `.skeleton-list`, `.plan-error`, and `.retry-button` rules to App.svelte's
 * `<style>` block; `checkAppSvelteTokenWiring` above only ever scoped its
 * strict var-only check to the `main`/`p` selectors, so those new rules'
 * color-ish declarations (e.g. `.retry-button`'s `background`/`color`) had
 * no automated coverage at all. This scan checks every color-ish property
 * in the whole block regardless of which selector it's under, so it
 * automatically covers these and any future selector too. */
function checkAppSvelteColorWiring(failures) {
  const source = readFileSync(appSveltePath, 'utf8');
  const styleMatch = source.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!styleMatch) {
    failures.push('src/App.svelte: no <style> block found');
    return;
  }

  const commentMasked = maskComments(styleMatch[1]);

  const declRe = /([a-zA-Z-]+)\s*:\s*([^;{}]+);/g;
  let match;
  while ((match = declRe.exec(commentMasked)) !== null) {
    const property = match[1].trim().toLowerCase();
    if (!COLOR_PROPERTY_RE.test(property)) continue;

    const value = match[2].replace(/\s+/g, ' ').trim().toLowerCase();
    if (value.includes('var(--')) continue;
    if (APP_SVELTE_SAFE_NON_TOKEN_VALUES.has(value)) continue;

    failures.push(
      `src/App.svelte <style> "${property}: ${match[2].trim()};": expected a var(--...) token reference (or none/inherit/transparent), found a literal value`,
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

  const actualSurfaceLight = findValue(rootBlock, '--surface');
  const actualSurfaceDark = findValue(darkRootBlock, '--surface');
  const actualBackgroundLight = findValue(rootBlock, '--background');

  checkIndexHtmlSurface(actualSurfaceLight, actualSurfaceDark, failures);
  checkViteConfigBackground(actualBackgroundLight, failures);
  checkViteConfigExcludesPlanJsonFromPrecache(failures);

  checkAppSvelteTokenWiring(failures);
  checkAppSvelteColorWiring(failures);
  checkTabBarWiring(failures);
  checkSkeletonDayRowWiring(failures);

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
      `${radiusCount} radii, and ${spacingCount} spacing values in src/app.css match this script's ` +
      `transcription of the spec; index.html and vite.config.ts stay in sync with app.css's live ` +
      `--surface/--background values; vite.config.ts's workbox.globPatterns excludes "json" (plan.json stays ` +
      `out of the service-worker precache); src/App.svelte's <style> block routes only through var(--...) tokens ` +
      `(main/p) and every color-ish declaration in the whole block (including .skeleton-list/.plan-error/` +
      `.retry-button); TabBar.svelte routes its color declarations through tokens and carries the required ` +
      `tab ARIA markup; and SkeletonDayRow.svelte routes its color declarations through tokens.`,
  );
}

try {
  main();
} catch (error) {
  console.error(`Design token verification ERROR: ${error.message}`);
  process.exit(1);
}

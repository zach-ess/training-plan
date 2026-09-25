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
// Story 1.5 -- Day-List Home View -- adds `checkDayRowCardWiring`, the same
// color-token-wiring scan for the new `DayRowCard.svelte`, plus its two
// build-time semantic requirements (EXPERIENCE.md Accessibility Floor /
// Consistency Conventions): a real `<button type="button">` root and an
// `aria-hidden="true"` status chip.
//
// Story 1.6 -- Top-Level Error Boundary -- adds `checkCrashFallbackWiring`,
// the same color-token-wiring scan (no additional ARIA/semantic
// requirements beyond that, mirroring `checkSkeletonDayRowWiring`) for the
// new `CrashFallback.svelte`.
//
// Story 2.1 -- Workout Detail View (read-only) -- adds
// `checkWorkoutDetailWiring`, the same color-token-wiring scan for the two
// new components `WorkoutDetail.svelte`/`WorkoutDetailStat.svelte`, plus
// this story's own real-dialog-semantics requirement (Boundaries):
// `role="dialog"`, `aria-modal="true"`, and an `aria-labelledby` naming the
// title. This story also extracts `scanColorWiring`, a shared helper for
// the identical color-scan loop that had been duplicated across
// `checkTabBarWiring`, `checkSkeletonDayRowWiring`, `checkDayRowCardWiring`,
// `checkCrashFallbackWiring`, and `checkAppSvelteColorWiring` -- all five
// (and the new WorkoutDetail check) now call this one function instead of
// each re-implementing the same scan (Epic 1 retro action item B1).
//
// Story 2.3 -- Edit a Log Entry -- adds `checkWorkoutEditFormWiring`, the
// same color-token-wiring scan for the new `WorkoutEditForm.svelte`, plus its
// own semantic requirements from this story's Boundaries/Code Map: the type
// field renders as a closed `<select>` with an option for each of the five
// presets plus "Other", the "Other" free-text input is gated behind
// `typeSelection === 'Other'`, a failed save renders the same
// `role="alert"`/`.retry-button` write-error UI convention as Mark Complete's
// own, and Save actually writes through `replaceLogEntry(` (AD-9) with the
// "Other" value's case-fold+trim normalization present somewhere in the file.
//
// Story 2.2 -- Mark Complete & Completion Feedback -- adds
// `checkButtonPrimaryWiring`/`checkCompletionCelebrationWiring`, the same
// color-token-wiring scan for the two new components `ButtonPrimary.svelte`
// (the Mark Complete/Incomplete toggle) and `CompletionCelebration.svelte`
// (the bundled Completion Feedback moment), plus each one's own semantic
// requirement: `aria-pressed` on ButtonPrimary's `<button>`, and
// `aria-live="polite"` on CompletionCelebration's announcement. It also
// extends `checkWorkoutDetailWiring` to assert `WorkoutDetail.svelte` itself
// wires the new LogEntry Data Store and components in (`getLogEntry(`/
// `setCompleted(` calls, `<ButtonPrimary`/`<CompletionCelebration` mounts) --
// the same "check the wiring, not just the component" gap
// `checkWorkoutDetailAppWiring` closes for `App.svelte`.
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
const dayRowCardSveltePath = path.join(
  __dirname,
  '..',
  'src',
  'lib',
  'components',
  'DayRowCard.svelte',
);
const crashFallbackSveltePath = path.join(
  __dirname,
  '..',
  'src',
  'lib',
  'components',
  'CrashFallback.svelte',
);
const workoutDetailSveltePath = path.join(
  __dirname,
  '..',
  'src',
  'lib',
  'components',
  'WorkoutDetail.svelte',
);
const workoutDetailStatSveltePath = path.join(
  __dirname,
  '..',
  'src',
  'lib',
  'components',
  'WorkoutDetailStat.svelte',
);
const buttonPrimarySveltePath = path.join(
  __dirname,
  '..',
  'src',
  'lib',
  'components',
  'ButtonPrimary.svelte',
);
const completionCelebrationSveltePath = path.join(
  __dirname,
  '..',
  'src',
  'lib',
  'components',
  'CompletionCelebration.svelte',
);
const workoutEditFormSveltePath = path.join(
  __dirname,
  '..',
  'src',
  'lib',
  'components',
  'WorkoutEditForm.svelte',
);
const rootSveltePath = path.join(__dirname, '..', 'src', 'Root.svelte');
const mainTsPath = path.join(__dirname, '..', 'src', 'main.ts');

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

/** Shared color-token-wiring scan (Story 2.1, Epic 1 retro action item B1):
 * extracted from the identical loop that had been duplicated across
 * `checkTabBarWiring`, `checkSkeletonDayRowWiring`, `checkDayRowCardWiring`,
 * `checkCrashFallbackWiring`, and `checkAppSvelteColorWiring` below -- each
 * of those now calls this instead of re-implementing the same scan.
 *
 * Reads `source`'s whole `<style>` block (regardless of which selector's
 * rule a declaration sits in -- selectors here never contain a `;`, so a
 * global "property: value;" scan can't cross a rule boundary and mistake
 * part of a selector for a declaration) and flags every color-ish
 * declaration whose value isn't a `var(--...)` token reference or one of
 * `safeSet`'s allowed non-token keywords, pushing one failure (prefixed with
 * `label`) per offender into `failures`. */
function scanColorWiring(source, label, safeSet, failures) {
  const styleMatch = source.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!styleMatch) {
    failures.push(`${label}: no <style> block found`);
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
    if (safeSet.has(value)) continue;

    failures.push(
      `${label} <style> "${property}: ${match[2].trim()};": expected a var(--...) token reference (or none/inherit/transparent), found a literal value`,
    );
  }
}

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

  scanColorWiring(source, 'src/lib/components/TabBar.svelte', SAFE_NON_TOKEN_VALUES, failures);
}

/** Story 1.4's SkeletonDayRow.svelte is a new presentational component with
 * no prior automated check. Same color-token-wiring scan as
 * checkTabBarWiring above (every color-ish declaration in its `<style>`
 * block must route through `var(--...)` or a safe non-token keyword) --
 * this component has no interactive/ARIA markup requirements, so that half
 * of checkTabBarWiring doesn't apply here. */
function checkSkeletonDayRowWiring(failures) {
  const source = readFileSync(skeletonDayRowSveltePath, 'utf8');

  scanColorWiring(
    source,
    'src/lib/components/SkeletonDayRow.svelte',
    SAFE_NON_TOKEN_VALUES,
    failures,
  );
}

/** Story 1.5's DayRowCard.svelte is the new per-day row component. Same
 * color-token-wiring scan as checkTabBarWiring/checkSkeletonDayRowWiring
 * above, plus the two build-time semantic requirements EXPERIENCE.md names
 * for this component specifically (Accessibility Floor / Consistency
 * Conventions): a real `<button type="button">` root (never a bare
 * clickable `<div>`) and a status chip carrying `aria-hidden="true"` (the
 * adjacent text label, not the chip, carries the accessible name). */
function checkDayRowCardWiring(failures) {
  const source = readFileSync(dayRowCardSveltePath, 'utf8');

  if (!/<button[^>]*type="button"[^>]*>/.test(source)) {
    failures.push(
      'src/lib/components/DayRowCard.svelte: no <button type="button"> root found -- ' +
        "EXPERIENCE.md requires real focusable button semantics, not a bare clickable <div>",
    );
  }

  if (!source.includes('aria-hidden="true"')) {
    failures.push(
      'src/lib/components/DayRowCard.svelte: no aria-hidden="true" found -- the status chip ' +
        'must be decorative, with the adjacent text label carrying the accessible name',
    );
  }

  // Epic 2 retro finding F6 (2026-09-24): two independent bmad-review lenses
  // each separately flagged that nothing here asserted this row's own
  // `onclick={() => onOpen(date)}` exists -- a regression reverting it to a
  // no-op would break "tap a day row to open Workout Detail" (this file's
  // own header comment calls this "the single UX pattern [Zach] most wants
  // preserved") with every check above still green, since none of them look
  // at the click wiring itself.
  if (!source.includes('onclick={() => onOpen(date)}')) {
    failures.push(
      'src/lib/components/DayRowCard.svelte: no onclick={() => onOpen(date)} found -- tapping a day ' +
        'row must open Workout Detail',
    );
  }

  scanColorWiring(source, 'src/lib/components/DayRowCard.svelte', SAFE_NON_TOKEN_VALUES, failures);
}

/** Story 1.6's CrashFallback.svelte is the new top-level error-boundary
 * fallback component. Same color-token-wiring scan as
 * checkSkeletonDayRowWiring/checkDayRowCardWiring above -- every color-ish
 * declaration in its `<style>` block must route through `var(--...)` or a
 * safe non-token keyword, plus the two build-time semantic requirements the
 * component's own header comment calls load-bearing: a `role="alert"` live
 * region (so a screen-reader user is told about the crash immediately,
 * without needing to already be focused here) and a real
 * `<button type="button">` for Reload -- a fresh-review pass on Story 1.6
 * found neither was asserted here even though the sibling
 * checkDayRowCardWiring already asserts the equivalent for DayRowCard. */
function checkCrashFallbackWiring(failures) {
  const source = readFileSync(crashFallbackSveltePath, 'utf8');

  // A fresh-review pass on Story 1.6 found that checking `source` directly
  // for `role="alert"` is satisfied by this very file's own header comment
  // (which quotes `role="alert"` in prose) even if the real attribute were
  // ever removed from the live markup below -- the same masking problem
  // `maskComments` already solves for `/* ... */` CSS comments, but for
  // `<!-- ... -->` HTML comments instead. Both semantic-markup checks below
  // scan this comment-stripped copy, not `source`, for exactly that reason.
  const markupOnly = source.replace(/<!--[\s\S]*?-->/g, (comment) =>
    comment.replace(/[^\n]/g, ' '),
  );

  if (!markupOnly.includes('role="alert"')) {
    failures.push(
      'src/lib/components/CrashFallback.svelte: no role="alert" found -- the fallback must be an ' +
        'assertive live region so a screen reader announces it without requiring focus',
    );
  }

  if (!/<button[^>]*type="button"[^>]*>/.test(markupOnly)) {
    failures.push(
      'src/lib/components/CrashFallback.svelte: no <button type="button"> found -- the Reload ' +
        'control must be a real, focusable button',
    );
  }

  scanColorWiring(source, 'src/lib/components/CrashFallback.svelte', SAFE_NON_TOKEN_VALUES, failures);
}

/** Story 2.1's WorkoutDetail.svelte (the new drill-down dialog) and its
 * presentational child WorkoutDetailStat.svelte -- same color-token-wiring
 * scan as every other component check above, via the shared
 * `scanColorWiring` helper, plus WorkoutDetail's own real-dialog-semantics
 * requirement from this story's Boundaries: `role="dialog"`,
 * `aria-modal="true"`, and an `aria-labelledby` naming the title, plus a
 * real, focusable `<button type="button" class="back-button">` for Back --
 * the same convention `checkDayRowCardWiring`/`checkCrashFallbackWiring`
 * already apply to their own interactive control. All semantic checks scan
 * a comment-stripped copy, same reasoning as `checkCrashFallbackWiring`
 * above (defensive against any future comment that happens to mention these
 * attribute names, the way `CrashFallback.svelte`'s own header comment
 * genuinely does today). */
function checkWorkoutDetailWiring(failures) {
  const detailSource = readFileSync(workoutDetailSveltePath, 'utf8');
  const statSource = readFileSync(workoutDetailStatSveltePath, 'utf8');

  const markupOnly = detailSource.replace(/<!--[\s\S]*?-->/g, (comment) =>
    comment.replace(/[^\n]/g, ' '),
  );

  if (!markupOnly.includes('role="dialog"')) {
    failures.push(
      'src/lib/components/WorkoutDetail.svelte: no role="dialog" found -- this story\'s Boundaries ' +
        'require real dialog semantics',
    );
  }

  if (!markupOnly.includes('aria-modal="true"')) {
    failures.push(
      'src/lib/components/WorkoutDetail.svelte: no aria-modal="true" found -- this story\'s ' +
        'Boundaries require real dialog semantics',
    );
  }

  const labelledbyMatch = markupOnly.match(/aria-labelledby="([^"]+)"/);
  if (!labelledbyMatch) {
    failures.push(
      'src/lib/components/WorkoutDetail.svelte: no aria-labelledby found -- the dialog must name ' +
        "its title (this story's Boundaries)",
    );
  } else if (!markupOnly.includes(`id="${labelledbyMatch[1]}"`)) {
    failures.push(
      `src/lib/components/WorkoutDetail.svelte: aria-labelledby="${labelledbyMatch[1]}" has no ` +
        `matching id="${labelledbyMatch[1]}" in the file -- the dialog's accessible name would be ` +
        'broken for assistive technology',
    );
  }

  if (!/<button[^>]*type="button"[^>]*class="back-button"[^>]*>/.test(markupOnly)) {
    failures.push(
      'src/lib/components/WorkoutDetail.svelte: no <button type="button" class="back-button"> found -- ' +
        'the Back control must be a real, focusable button (same convention as ' +
        'checkDayRowCardWiring/checkCrashFallbackWiring)',
    );
  }

  // Story 2.2 -- WorkoutDetail is no longer read-only: it must read the
  // real LogEntry (`getLogEntry`), write through `setCompleted`, and mount
  // the new `ButtonPrimary`/`CompletionCelebration` components. Scanned
  // against `markupOnly` for `<ButtonPrimary`/`<CompletionCelebration` (a
  // tag mention, not markup a comment could satisfy) and against
  // `scriptMasked` -- comments stripped via `maskAllComments`, since these
  // calls live in the `<script>` block where this file's own convention is
  // `//` line comments, which a bare HTML-comment strip doesn't touch -- for
  // the two Data Store calls, so a comment like `// getLogEntry(` can't
  // falsely satisfy this check (a fresh-review pass found this scanned raw
  // `detailSource` instead, unlike every sibling check in this function).
  const scriptMasked = maskAllComments(detailSource);
  if (!scriptMasked.includes('getLogEntry(')) {
    failures.push(
      'src/lib/components/WorkoutDetail.svelte: no getLogEntry( call found -- this story requires ' +
        "reading the real LogEntry from the Data Store instead of Story 2.1's hardcoded undefined",
    );
  }
  if (!scriptMasked.includes('setCompleted(')) {
    failures.push(
      'src/lib/components/WorkoutDetail.svelte: no setCompleted( call found -- Mark Complete/Incomplete ' +
        'must write through the Data Store (AD-9)',
    );
  }
  if (!markupOnly.includes('<ButtonPrimary')) {
    failures.push(
      'src/lib/components/WorkoutDetail.svelte: no <ButtonPrimary mount found -- the Mark ' +
        'Complete/Incomplete toggle must be rendered (this story\'s Boundaries)',
    );
  }
  if (!markupOnly.includes('<CompletionCelebration')) {
    failures.push(
      'src/lib/components/WorkoutDetail.svelte: no <CompletionCelebration mount found -- Completion ' +
        'Feedback must fire on a successful Mark Complete write (FR7)',
    );
  }

  // A fresh-review pass on Story 2.2 found nothing asserted that the
  // ButtonPrimary mount's `completed` prop is a real binding to this file's
  // own `isCompleted` -- a regression hardcoding `completed={false}` (or any
  // other literal) would leave every check above still green. Mirrors this
  // file's own established convention for this kind of check (see
  // `checkButtonPrimaryWiring`'s `aria-pressed=\{\s*completed\s*\}` regex
  // below): assert both the markup binding and the `$derived` it depends on.
  if (!/completed=\{\s*isCompleted\s*\}/.test(markupOnly)) {
    failures.push(
      'src/lib/components/WorkoutDetail.svelte: no completed={isCompleted} binding found on the ' +
        '<ButtonPrimary mount -- the toggle state must be bound to isCompleted, not a hardcoded value',
    );
  }
  if (!/isCompleted\s*=\s*\$derived\(\s*dayView\.completed\s*===\s*true\s*\)/.test(scriptMasked)) {
    failures.push(
      'src/lib/components/WorkoutDetail.svelte: no isCompleted = $derived(dayView.completed === true) ' +
        'found -- isCompleted must be derived from dayView.completed, not tracked as separate state',
    );
  }

  // Epic 2 retro finding F6 (2026-09-24): the fresh-review patch that added
  // `disabled={celebrating}` to the <ButtonPrimary> mount (so a focus-trap
  // regression that this app relies on can't disable the button mid-tap
  // sequence) was never mirrored here -- nothing asserted the binding
  // actually exists, unlike the sibling `completed={isCompleted}` check
  // directly above it.
  if (!/disabled=\{\s*celebrating\s*\}/.test(markupOnly)) {
    failures.push(
      'src/lib/components/WorkoutDetail.svelte: no disabled={celebrating} binding found on the ' +
        '<ButtonPrimary mount -- the toggle must be disabled for the duration of the celebration, ' +
        'not tap-able mid-playback (Epic 2 retro, finding F6)',
    );
  }

  // Epic 2 retro finding F6 (2026-09-24): `<CompletionCelebration` presence
  // (checked above) doesn't rule out it being mounted unconditionally --
  // this asserts it's still specifically gated on `{#if celebrating}`, which
  // is itself only ever set true on a successful write that newly turns
  // completion on (this story's Boundaries/UX-DR7), not on every render.
  if (!/\{#if\s+celebrating\s*\}\s*<CompletionCelebration/.test(markupOnly)) {
    failures.push(
      'src/lib/components/WorkoutDetail.svelte: <CompletionCelebration is not gated behind ' +
        '{#if celebrating} -- Completion Feedback must fire only on a successful, newly-completing ' +
        'write, never unconditionally (Epic 2 retro, finding F6)',
    );
  }

  // A fresh-review pass on Story 2.2 found that this check was extended for
  // ButtonPrimary/CompletionCelebration presence but never for the new
  // write-error/Retry UI -- nothing here asserted a role="alert" write-error
  // block or .retry-button markup existed at all, so a regression removing
  // that UI would go undetected.
  if (!markupOnly.includes('role="alert"')) {
    failures.push(
      'src/lib/components/WorkoutDetail.svelte: no role="alert" found -- the write-error/Retry UI ' +
        'must be an assertive live region so a screen reader announces a failed write without ' +
        'requiring focus',
    );
  }
  if (!markupOnly.includes('class="retry-button"')) {
    failures.push(
      'src/lib/components/WorkoutDetail.svelte: no class="retry-button" found -- a failed write must ' +
        'render a Retry control',
    );
  }

  scanColorWiring(
    detailSource,
    'src/lib/components/WorkoutDetail.svelte',
    SAFE_NON_TOKEN_VALUES,
    failures,
  );
  scanColorWiring(
    statSource,
    'src/lib/components/WorkoutDetailStat.svelte',
    SAFE_NON_TOKEN_VALUES,
    failures,
  );
}

/** Story 2.2's ButtonPrimary.svelte -- the new Mark Complete/Mark Incomplete
 * toggle. Same color-token-wiring scan as every other component check above,
 * plus semantic requirements this function verifies: a real
 * `<button type="button">` root, an `aria-pressed={completed}` binding
 * (UX-DR10's toggle-state exposure) -- not merely the attribute's name
 * present somewhere, which a hardcoded `aria-pressed="false"` would also
 * satisfy -- and, since the Epic 2 retro (2026-09-24, finding F6), that
 * `onclick` is actually forwarded to the underlying `<button>` via the
 * `{onclick}` shorthand. This function does *not* verify the 48dp minimum
 * tap-target size; that remains unchecked here. Scanned against a
 * comment-stripped copy, same convention as
 * `checkCrashFallbackWiring`/`checkWorkoutDetailWiring` above. */
function checkButtonPrimaryWiring(failures) {
  const source = readFileSync(buttonPrimarySveltePath, 'utf8');
  // `maskAllComments`, not just an HTML-comment strip: this file's own
  // `<script>` block has a `//` line comment that literally reads
  // `` `<button>` `` in prose (documenting `bind:this`'s behavior) -- an
  // HTML-only strip leaves that comment intact, so the button-tag regexes
  // below would match it instead of the real markup tag further down the
  // file. Caught live while adding the {onclick}-forwarding check below:
  // an HTML-only strip made that check report a false failure, matching
  // against that comment's bare "<button>" instead of the real tag.
  const markupOnly = maskAllComments(source);

  if (!/<button[^>]*type="button"[^>]*>/.test(markupOnly)) {
    failures.push(
      'src/lib/components/ButtonPrimary.svelte: no <button type="button"> found -- the toggle must ' +
        'be a real, focusable button',
    );
  }

  if (!/aria-pressed=\{\s*completed\s*\}/.test(markupOnly)) {
    failures.push(
      'src/lib/components/ButtonPrimary.svelte: no aria-pressed={completed} binding found -- the ' +
        'toggle state must be bound to the completed prop, not merely present as a hardcoded ' +
        "attribute (UX-DR10, this story's Boundaries)",
    );
  }

  const buttonTagMatch = markupOnly.match(/<button[^>]*>/);
  if (buttonTagMatch && !/\{\s*onclick\s*\}/.test(buttonTagMatch[0])) {
    failures.push(
      'src/lib/components/ButtonPrimary.svelte: the <button> never forwards {onclick} -- taps would ' +
        "silently do nothing regardless of what the parent passes as this component's onclick prop " +
        '(Epic 2 retro, finding F6)',
    );
  }

  scanColorWiring(source, 'src/lib/components/ButtonPrimary.svelte', SAFE_NON_TOKEN_VALUES, failures);
}

/** Story 2.2's CompletionCelebration.svelte -- the bundled Completion
 * Feedback moment. Same color-token-wiring scan as every other component
 * check above, plus its own semantic requirement (Code Map / UX-DR7): an
 * `aria-live="polite"` announcement. Scanned against a comment-stripped
 * copy, same convention as the checks above. */
function checkCompletionCelebrationWiring(failures) {
  const source = readFileSync(completionCelebrationSveltePath, 'utf8');
  const markupOnly = source.replace(/<!--[\s\S]*?-->/g, (comment) =>
    comment.replace(/[^\n]/g, ' '),
  );

  if (!markupOnly.includes('aria-live="polite"')) {
    failures.push(
      'src/lib/components/CompletionCelebration.svelte: no aria-live="polite" found -- Completion ' +
        'Feedback must announce itself to a screen reader (UX-DR7)',
    );
  }

  scanColorWiring(
    source,
    'src/lib/components/CompletionCelebration.svelte',
    SAFE_NON_TOKEN_VALUES,
    failures,
  );
}

/** Story 2.3's WorkoutEditForm.svelte -- the Edit form `WorkoutDetail` swaps
 * in for its own view-mode markup. Same color-token-wiring scan as every
 * other component check above, plus this story's own semantic/behavioral
 * requirements (Boundaries/Code Map): a closed `<select>` dropdown carrying
 * an `<option>` for each of the five presets plus "Other" (not a free-text
 * input by default), the "Other" free-text reveal gated behind
 * `typeSelection === 'Other'`, the same `role="alert"`/`.retry-button`
 * write-error convention Mark Complete's own write path uses, a real
 * `replaceLogEntry(` write call (AD-9, not some other write path), and the
 * "Other" value's case-fold+trim normalization actually present in the
 * script. Scanned against a comment-stripped copy, same convention as
 * `checkCrashFallbackWiring`/`checkWorkoutDetailWiring` above -- this file's
 * own header comment quotes several of these same substrings in prose (e.g.
 * "case-fold + trim"), so an HTML/JS-comment-blind `source.includes()` check
 * here would be satisfied by that comment alone even if the real code were
 * ever reverted. */
function checkWorkoutEditFormWiring(failures) {
  const source = readFileSync(workoutEditFormSveltePath, 'utf8');
  const markupOnly = source.replace(/<!--[\s\S]*?-->/g, (comment) =>
    comment.replace(/[^\n]/g, ' '),
  );
  const scriptMasked = maskAllComments(source);

  if (!/<select[^>]*>/.test(markupOnly)) {
    failures.push(
      'src/lib/components/WorkoutEditForm.svelte: no <select> found -- the type field must be a ' +
        "closed dropdown, not a free-text input (this story's Boundaries)",
    );
  }

  // The five presets are rendered via an `{#each}` over a TYPE_PRESETS-style
  // array rather than five literal `<option>` tags, so this checks for the
  // exact literal preset list in the script (in this order) plus a literal
  // `<option value="Other">` in the markup, rather than searching for each
  // preset name as its own rendered `<option>` tag.
  if (!/\[\s*'Run'\s*,\s*'Bike'\s*,\s*'Lift'\s*,\s*'Mobility'\s*,\s*'Stretch'\s*\]/.test(scriptMasked)) {
    failures.push(
      'src/lib/components/WorkoutEditForm.svelte: no [\'Run\', \'Bike\', \'Lift\', \'Mobility\', ' +
        '\'Stretch\'] preset list found -- the type dropdown must offer exactly this closed set (FR3, ' +
        'confirmed with Zach 2026-09-17)',
    );
  }
  if (!/<option[^>]*value="Other"[^>]*>/.test(markupOnly)) {
    failures.push(
      'src/lib/components/WorkoutEditForm.svelte: no <option value="Other"> found in the type dropdown',
    );
  }

  if (!/\{#if\s+typeSelection\s*===\s*'Other'\s*\}/.test(markupOnly)) {
    failures.push(
      'src/lib/components/WorkoutEditForm.svelte: the "Other" free-text input is not gated behind ' +
        "{#if typeSelection === 'Other'} -- it must only reveal when Other is selected (FR3, UX-DR15)",
    );
  }

  if (!markupOnly.includes('role="alert"')) {
    failures.push(
      'src/lib/components/WorkoutEditForm.svelte: no role="alert" found -- a failed save must be an ' +
        'assertive live region, mirroring Mark Complete\'s own write-error pattern (this story\'s ' +
        'Boundaries)',
    );
  }
  if (!markupOnly.includes('class="retry-button"')) {
    failures.push(
      'src/lib/components/WorkoutEditForm.svelte: no class="retry-button" found -- a failed save must ' +
        'render a Retry control',
    );
  }

  if (!scriptMasked.includes('replaceLogEntry(')) {
    failures.push(
      'src/lib/components/WorkoutEditForm.svelte: no replaceLogEntry( call found -- Save must write ' +
        "through AD-9's full-overwrite operation, not setCompleted or some other write path",
    );
  }

  if (!/\.trim\(\)\.toLowerCase\(\)/.test(scriptMasked)) {
    failures.push(
      'src/lib/components/WorkoutEditForm.svelte: no .trim().toLowerCase() found -- the "Other" ' +
        'free-text value must be case-folded and trimmed before write (FR3, UX-DR15)',
    );
  }

  scanColorWiring(source, 'src/lib/components/WorkoutEditForm.svelte', SAFE_NON_TOKEN_VALUES, failures);
}

/** Blanks `<!-- -->`, `/* *\/`, and `//` line comments out of a JS/Svelte
 * source, keeping everything else (including quoted-string contents and any
 * markup text) at its original offsets -- the same "check a comment-stripped
 * copy" convention `checkCrashFallbackWiring`/`checkWorkoutDetailWiring`
 * already use for HTML comments, extended to also cover the `//`/`/* *\/`
 * script comments a `<script>` block can contain, which those two never
 * needed to mask.
 *
 * Deliberately does *not* also run `maskStrings`: that helper's quote-pairing
 * assumes CSS-only content (the only thing it's ever been applied to
 * elsewhere in this file) and misfires on this component's plain markup
 * text, which routinely contains unpaired apostrophes (e.g. "Couldn't load
 * your plan") that aren't string delimiters at all -- pairing one of those
 * with an unrelated later quote would blank large, unrelated stretches of
 * real code. Comment-stripping alone is what this check actually needs. */
function maskAllComments(source) {
  const htmlMasked = source.replace(/<!--[\s\S]*?-->/g, (comment) =>
    comment.replace(/[^\n]/g, ' '),
  );
  const blockMasked = maskComments(htmlMasked);
  return blockMasked.replace(/\/\/[^\n]*/g, (comment) => ' '.repeat(comment.length));
}

/** Extracts the source text of the named function's own body (the text
 * between its outermost `{`/`}`, braces excluded) via brace-depth counting --
 * the same general technique `extractBlock` above already uses for CSS
 * blocks. Depth is counted over `maskAllComments(source)` so a brace inside a
 * comment can't desync it, mirroring `extractBlock`'s braceMaskSource/
 * contentSource split; the returned slice comes from the real `source`, not
 * the masked copy, so the caller sees the function's actual code. (No
 * `maskStrings` pass here either, for the same reason -- and `handleSelect`
 * has no string literals containing a brace to guard against anyway.)
 * Returns `null` if no `function <name>(...) {` is found or the brace never
 * closes. */
function extractFunctionBody(source, functionName) {
  const masked = maskAllComments(source);
  const startMatch = masked.match(new RegExp(`function\\s+${functionName}\\s*\\([^)]*\\)[^{]*\\{`));
  if (!startMatch) return null;

  const braceStart = masked.indexOf('{', startMatch.index);
  let depth = 0;
  for (let i = braceStart; i < masked.length; i++) {
    if (masked[i] === '{') depth++;
    if (masked[i] === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(braceStart + 1, i);
      }
    }
  }
  return null;
}

/** A fresh-review pass on Story 2.1 found that `checkWorkoutDetailWiring`
 * above only ever scans `WorkoutDetail.svelte`/`WorkoutDetailStat.svelte`'s
 * own markup -- nothing checks that `App.svelte` actually wires
 * `DayRowCard`'s `onOpen` through to mounting `WorkoutDetail`, the same class
 * of gap `checkRootWiring` below was added to close for Story 1.6's
 * error-boundary wiring. Asserts `src/App.svelte` contains the `selectedDate`
 * state, an `onOpen=` prop pass, and the conditional `WorkoutDetail` mount.
 *
 * A second, fresh-session review pass (2026-09-22) found the three checks
 * below too weak on their own: they're whole-file `source.includes(...)`
 * scans, so (a) a comment merely mentioning these substrings satisfies them
 * with no real wiring present, and (b) they can't tell *which* code path a
 * substring sits in -- concretely, that review demonstrated that deleting
 * the tab-switch-close fix's `handleCloseDetail()` call from `handleSelect`
 * (this story's Spec Change Log, 2026-09-22) still left this whole function
 * green, since `selectedDate`/`onOpen=`/`<WorkoutDetail` are all still
 * present elsewhere in the file. The three checks are now run against
 * `maskAllComments(source)` instead of raw `source` (closing gap (a)), and a
 * fourth, scoped check is added on top -- mirroring `checkTabBarWiring`'s
 * own "extract the specific function/element's own source slice, then check
 * properties within that slice" technique -- that extracts `handleSelect`'s
 * own body via `extractFunctionBody` and asserts it actually calls
 * `handleCloseDetail()`, so that specific regression (and any future one
 * that guts `handleSelect`'s close-and-restore-focus behavior) is caught
 * directly instead of relying on unrelated code elsewhere in the file to
 * keep the whole-file checks green. */
function checkWorkoutDetailAppWiring(failures) {
  const source = readFileSync(appSveltePath, 'utf8');
  const masked = maskAllComments(source);

  if (!masked.includes('selectedDate')) {
    failures.push(
      'src/App.svelte: no selectedDate found -- WorkoutDetail must be driven by a selectedDate ' +
        "state (this story's Code Map)",
    );
  }

  if (!masked.includes('onOpen=')) {
    failures.push(
      'src/App.svelte: no onOpen= found -- DayRowCard must be wired with an onOpen prop that opens ' +
        'WorkoutDetail',
    );
  }

  if (!masked.includes('<WorkoutDetail')) {
    failures.push(
      'src/App.svelte: no <WorkoutDetail mount found -- selectedDate must conditionally mount the ' +
        'WorkoutDetail dialog',
    );
  }

  const handleSelectBody = extractFunctionBody(source, 'handleSelect');
  if (handleSelectBody === null) {
    failures.push(
      'src/App.svelte: no function handleSelect(...) { ... } found -- expected the tab-switch ' +
        'handler wired to TabBar\'s onSelect',
    );
  } else {
    const handleSelectMasked = maskAllComments(handleSelectBody);
    // Matches `handleCloseDetail(` rather than the exact no-arg
    // `handleCloseDetail()` -- the Epic 2 retro's F1 fix (2026-09-24) added
    // a `{ skipFocusRestore: true }` argument here (closing/focus-restore
    // steps must not target the tab being switched *away* from), so an
    // exact-arity match would itself have flagged that legitimate fix as a
    // regression. The open paren alone is enough to catch the actual
    // regression this check exists for: `handleSelect` not calling
    // `handleCloseDetail` at all.
    if (!handleSelectMasked.includes('handleCloseDetail(')) {
      failures.push(
        'src/App.svelte: handleSelect(...) never calls handleCloseDetail(...) -- a tab switch must ' +
          'close any open WorkoutDetail through the same close-and-focus logic as Back/scrim/Escape ' +
          '(Spec Change Log, 2026-09-22), not a bare `selectedDate = null` that silently drops focus',
      );
    }

    // Epic 2 retro finding F1 (2026-09-24): a tab switch closes
    // WorkoutDetail via `handleCloseDetail({ skipFocusRestore: true })`
    // because by the time that call runs, `activeTab` above has already
    // flipped -- Home's row (what `handleCloseDetail` would otherwise
    // refocus) is already `hidden`, so `.focus()` on it silently no-ops and
    // its own `panel-home` fallback is never reached either, dropping focus
    // to `<body>` with no error. `handleSelect` must restore focus into the
    // panel actually being switched to instead. Scoped to `handleSelect`'s
    // own body (not a whole-file scan) for the same "which code path" reason
    // as the check above.
    if (!handleSelectMasked.includes('skipFocusRestore')) {
      failures.push(
        'src/App.svelte: handleSelect(...) calls handleCloseDetail(...) without skipFocusRestore -- ' +
          'a tab switch must not let handleCloseDetail try to refocus the Home row it is switching ' +
          'away from (Epic 2 retro, finding F1)',
      );
    }
    if (!handleSelectMasked.includes('panel-${tab}')) {
      failures.push(
        'src/App.svelte: handleSelect(...) never focuses panel-${tab} -- a tab switch that closes ' +
          'WorkoutDetail must restore focus into the tab being switched to, or focus silently drops ' +
          'to <body> (Epic 2 retro, finding F1)',
      );
    }
  }
}

/** A fresh-review pass on Story 1.6 found that nothing in this file's other
 * checks (or `svelte-check`) would notice if the actual error-boundary
 * wiring regressed -- e.g. `main.ts` reverting to `mount(App, ...)`, or
 * `Root.svelte` losing its `<svelte:boundary>`/`failed` snippet or either
 * `window` listener -- since `checkCrashFallbackWiring` only ever looks at
 * `CrashFallback.svelte` itself, not at what actually renders it. This is a
 * source-text presence scan, the same convention every other check in this
 * file already uses (no test runner exists in this project), just aimed at
 * the wiring instead of the component. */
function checkRootWiring(failures) {
  const mainSource = readFileSync(mainTsPath, 'utf8');
  if (!mainSource.includes('mount(Root')) {
    failures.push(
      'src/main.ts: no mount(Root, ...) call found -- the app must mount Root.svelte (the error ' +
        'boundary), not App.svelte directly',
    );
  }

  const rootSource = readFileSync(rootSveltePath, 'utf8');
  const requiredSnippets = [
    ['<svelte:boundary', 'a <svelte:boundary> wrapping App'],
    ['{#snippet failed', 'a failed snippet rendering the fallback on a render/effect exception'],
    ["addEventListener('error'", "a window 'error' listener for exceptions the boundary can't see"],
    [
      "addEventListener('unhandledrejection'",
      "a window 'unhandledrejection' listener for unhandled promise rejections",
    ],
  ];
  for (const [needle, description] of requiredSnippets) {
    if (!rootSource.includes(needle)) {
      failures.push(`src/Root.svelte: missing ${description} (expected to find "${needle}")`);
    }
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
  scanColorWiring(source, 'src/App.svelte', APP_SVELTE_SAFE_NON_TOKEN_VALUES, failures);
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
  checkDayRowCardWiring(failures);
  checkCrashFallbackWiring(failures);
  checkWorkoutDetailWiring(failures);
  checkWorkoutDetailAppWiring(failures);
  checkButtonPrimaryWiring(failures);
  checkCompletionCelebrationWiring(failures);
  checkWorkoutEditFormWiring(failures);
  checkRootWiring(failures);

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
      `.retry-button/.day-list); TabBar.svelte routes its color declarations through tokens and carries the ` +
      `required tab ARIA markup; SkeletonDayRow.svelte routes its color declarations through tokens; and ` +
      `DayRowCard.svelte routes its color declarations through tokens and carries a real <button type="button"> ` +
      `root plus an aria-hidden status chip; and CrashFallback.svelte routes its color declarations through ` +
      `tokens and carries role="alert" plus a real <button type="button"> Reload control; and ` +
      `WorkoutDetail.svelte/WorkoutDetailStat.svelte route their color declarations through tokens and ` +
      `WorkoutDetail carries role="dialog", aria-modal="true", aria-labelledby, and a real ` +
      `<button type="button" class="back-button">, plus a role="alert" write-error live region and a ` +
      `.retry-button Retry control; and src/App.svelte wires WorkoutDetail to the day list ` +
      `(selectedDate, onOpen=, <WorkoutDetail mount) and handleSelect closes it via handleCloseDetail() on a ` +
      `tab switch; and WorkoutDetail.svelte wires the Story 2.2 LogEntry Data Store (getLogEntry(/` +
      `setCompleted() calls) and mounts <ButtonPrimary/<CompletionCelebration; and ButtonPrimary.svelte routes ` +
      `its color declarations through tokens and carries a real <button type="button"> plus aria-pressed; and ` +
      `CompletionCelebration.svelte routes its color declarations through tokens and carries an ` +
      `aria-live="polite" announcement; and WorkoutEditForm.svelte routes its color declarations ` +
      `through tokens and carries a closed <select> type dropdown (five presets plus Other), an ` +
      `Other-gated free-text reveal, a role="alert"/.retry-button write-error UI, a replaceLogEntry( ` +
      `write call, and case-fold+trim normalization of the Other value; and main.ts/Root.svelte still ` +
      `wire the error boundary itself (mount(Root, ...), <svelte:boundary>, the failed snippet, and ` +
      `both window listeners).`,
  );
}

try {
  main();
} catch (error) {
  console.error(`Design token verification ERROR: ${error.message}`);
  process.exit(1);
}

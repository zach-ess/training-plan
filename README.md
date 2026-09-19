# Training Journal

Installable, offline-capable PWA shell for Zach's training plan viewer. Stories 1.1
(scaffold) and 1.2 (design tokens) are done -- no Day-List rendering or navigation
yet (those land in Stories 1.3-1.6).

## Stack

- Vite `^8.0`
- Svelte `^5.x` (runes)
- `vite-plugin-pwa` `^1.3.0`
- `@sveltejs/vite-plugin-svelte` `^7.x`
- TypeScript `^6.x` (pinned below `latest` (7.x) specifically so `svelte-check`'s
  current peer-dependency range, `^5.0.0 || ^6.0.0`, resolves cleanly -- TypeScript 7
  is not yet supported by the Svelte tooling ecosystem)

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Produces a fully static bundle in `dist/` -- no server-side component. Verify locally
with:

```bash
npm run preview
```

## Type checking

```bash
npm run check
```

Runs `svelte-check`, which type-checks `.ts` files *and* the script/template bindings
inside `.svelte` files (a bare `tsc --noEmit` only covers the former), then runs
`test:tokens` (see below) so both checks are covered by one command.

## Design tokens

`src/app.css` is the single source of truth for color, typography, radius, and
spacing -- every token is a CSS custom property on `:root`. Dark mode is
`prefers-color-scheme`-only (no manual toggle, no `data-theme`/class-based
switching, no JS-driven theme logic); the 11 color tokens are overridden for dark
in one `@media (prefers-color-scheme: dark)` block.

```bash
npm run test:tokens
```

Checks `src/app.css`'s token values against the script's own hardcoded transcription
of `spec-1-2-design-token-system.md`'s frozen tables -- this catches the script and
`app.css` drifting apart from each other, not either one drifting from the spec
document itself (still worth an occasional manual diff against the spec). It
separately checks `index.html`'s `theme-color` meta tags and `vite.config.ts`'s
manifest `background_color`/`theme_color` directly against `app.css`'s live
`--surface`/`--background` values, and checks that `src/App.svelte`'s `<style>`
block routes every declaration through a `var(--...)` token instead of a literal.
It also runs as part of `npm run check`.

## Deploy (manual -- no CI/CD, by design)

This app is deployed as a GitHub Pages **project site** at
`https://zach-ess.github.io/training-plan/`, served from the `main` branch of
`https://github.com/zach-ess/training-plan`. Because it's a project site (not a root
user/org site), `vite.config.ts`'s `base` and the PWA manifest's `start_url`/`scope`
are all rooted at `/training-plan/` -- do not change this to `/` unless the deploy
target itself changes to a root site.

Deploy replaces that repo's tracked contents with the freshly built `dist/` output
in place (it does not stand up a new repo or a new Pages site):

```bash
set -euo pipefail

# 1. Build
npm run build

# Guard: fail loudly rather than proceed with a deploy if dist/ is missing
# or empty (e.g. the build step above failed silently). Checked immediately
# after the build, before the target clone is touched at all -- so a bad
# build never risks the destructive steps below.
if [ -z "$(ls -A /path/to/training-plan-app/dist 2>/dev/null)" ]; then
  echo "ERROR: dist/ is missing or empty -- aborting deploy" >&2
  exit 1
fi

# 2. Clone the existing target repo (or, if you already have it checked out
#    elsewhere, cd into it and skip this step)
git clone https://github.com/zach-ess/training-plan.git /tmp/training-plan-deploy
cd /tmp/training-plan-deploy

# 3. Use the PAT for this push only -- set it on the remote, push, then
#    immediately reset the remote back to the plain HTTPS URL so the token
#    does not linger in .git/config. Never commit the PAT itself, and never
#    leave it configured on the remote beyond this one push.
#    The command below also lands in your shell history and briefly in `ps`
#    output since the token is a literal argument. Prefix it with a leading
#    space if your shell has HISTCONTROL/HISTIGNORE set to ignore
#    space-prefixed commands (bash/zsh default `ignorespace`/`ignoreboth`),
#    or delete it from your shell history afterward (e.g. `history -d`).
#    Treat the PAT as burned either way: revoke/rotate it immediately after
#    this push, even if history is cleared.
#    The trap below guarantees the remote gets reset back to the plain HTTPS
#    URL no matter how the script exits from here on -- a successful push, a
#    failed push, or any other error -- so the PAT never lingers in
#    .git/config even on a failure path.
trap 'git remote set-url origin https://github.com/zach-ess/training-plan.git' EXIT
git remote set-url origin "https://<PAT>@github.com/zach-ess/training-plan.git"

# 4. Replace all tracked files with the new build output and push
git rm -rf --ignore-unmatch .
cp -r /path/to/training-plan-app/dist/. .
git add -A
git commit -m "Deploy: rebuild from training-plan-app"
git push origin main

# 5. Nothing to do here -- the trap set in step 3 already reset the remote
#    as this script exits, whether or not the push succeeded.
```

After pushing, verify on an Android phone in Chrome at
`https://zach-ess.github.io/training-plan/`:

- Chrome offers to install the app to the home screen.
- The installed app opens as a standalone PWA (no browser chrome).
- With the device offline, reopening the installed app still shows the app shell
  (served from the service worker's cache) instead of a blank/network-error screen.

## Project layout

```
src/
  lib/
    data/          # localStorage + plan.json fetch/cache (later stories)
    domain/        # pure derived-data functions (later stories)
    components/    # Svelte view components (later stories)
  App.svelte
  main.ts
  vite-env.d.ts    # Vite client type references (import.meta.env, asset imports)
public/
  plan.json        # Plan data, fetched separately from app code
  favicon.svg
  pwa-192x192.png  # PWA manifest icon
  pwa-512x512.png  # PWA manifest icon (also used as the maskable icon)
tsconfig.json
svelte.config.js   # preprocessing config (editor tooling + svelte-check)
.gitignore
vite.config.ts     # vite-plugin-pwa (manifest + service worker) configuration
```

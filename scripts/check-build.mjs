#!/usr/bin/env node
/**
 * Post-build integrity check.
 *
 * `wxt build` exits 0 even when the entrypoint bundles never reach the output
 * directory. WXT only warns (`Could not get stats of ... ENOENT`), prints a
 * "Σ Total size" of a few kB, and reports success — so `yarn zip` happily
 * packages an extension that contains icons, locales and a manifest pointing at
 * a `background.js` that does not exist. Chrome loads it and does nothing.
 *
 * Why it happens: WXT's vite builder calls `removeEmptyDirs()` at the end of a
 * multi-page build. That helper decides a directory is in use by calling
 * `rmdir` and treating `ENOTEMPTY` as "leave it alone". Any filesystem layer
 * that instead treats "remove directory" as a recursive delete makes it wipe
 * `chunks/`, `assets/`, `content-scripts/` and finally the whole output dir —
 * silently, because the throw it relies on never comes.
 *
 * Measured on the machine this was written on (2026-09-18). Same Node process,
 * same `rmdir` call, two paths — this is the whole bug in two lines:
 *
 *   | path                                | result                      |
 *   | ----------------------------------- | --------------------------- |
 *   | C:\Users\...\AppData\Local\Temp\... | raises ENOTEMPTY (correct)  |
 *   | D:\...\008-form-pilot\.output\...   | deletes recursively         |
 *
 * The entire D: volume behaves this way; C: does not. Reproduced with a plain
 * `node -e` (no build, no WXT) and with Python's `os.rmdir`, so it is the
 * volume's delete semantics — not Node, not WXT, and not this project.
 *
 * Ruled out along the way, so nobody repeats the search:
 *   - the agent shell's `node-safe-delete-shim`: the corruption reproduces with
 *     `NODE_OPTIONS=` and the build logging `shimActive=false`;
 *   - the sandbox: identical results with and without `dangerouslyDisableSandbox`;
 *   - WXT itself: `removeEmptyDirs` was instrumented to re-read the directory
 *     immediately before `rmdir`, and it is still non-empty at that moment
 *     (`REMOVED .../chunks (walked=6 atRmdir=6)`).
 *
 * Consequence: on such a volume a correct `wxt build` is not possible, so this
 * check *is* the deliverable — it converts a silent exit-0 broken artifact into
 * a loud exit-1. Build on C: (or in CI, e.g. ubuntu-latest) for a real artifact.
 *
 * This check does not care *why* a file is missing. It asserts that everything
 * the manifest promises is actually on disk, and that the HTML entrypoints can
 * resolve the scripts and styles they reference, so a build that would ship
 * broken fails loudly instead of quietly.
 *
 * Usage: node scripts/check-build.mjs [outDir]   (default .output/chrome-mv3)
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';

/**
 * Resolve the directory that actually holds `manifest.json`.
 *
 * WXT writes to `<outDir>/<browser>-mv<version>/`, so the CLI's `outDir` is one
 * level above the real extension root. Passing that base directory used to end
 * in a bare "no manifest.json in X" — true, but it reads like the build failed
 * rather than like the wrong argument was passed. Fall through to the nested
 * directory when it is the one that has a manifest.
 */
function resolveOutDir(arg) {
  if (existsSync(join(arg, 'manifest.json'))) return arg;
  const nested = join(arg, 'chrome-mv3');
  if (existsSync(join(nested, 'manifest.json'))) return nested;
  return arg;
}

const OUT_DIR = resolveOutDir(process.argv[2] ?? join('.output', 'chrome-mv3'));

const problems = [];
const notes = [];

const fail = (msg) => problems.push(msg);

/** POSIX-style path of a file inside the build, for readable messages. */
const rel = (abs) => relative(process.cwd(), abs).split('\\').join('/');

function fileExists(absPath) {
  try {
    return statSync(absPath).isFile();
  } catch {
    return false;
  }
}

/**
 * Record every file the manifest points at. Extension manifests reference
 * assets by POSIX path relative to the extension root, with a leading slash in
 * some fields and none in others.
 */
function collectManifestRefs(manifest) {
  const refs = [];
  const add = (value, where) => {
    if (typeof value !== 'string' || value.length === 0) return;
    if (value.includes('*')) {
      notes.push(`skipped glob in ${where}: ${value}`);
      return;
    }
    refs.push({ path: value.replace(/^\/+/, ''), where });
  };

  add(manifest.background?.service_worker, 'background.service_worker');
  for (const s of manifest.background?.scripts ?? []) add(s, 'background.scripts[]');

  (manifest.content_scripts ?? []).forEach((cs, i) => {
    for (const js of cs.js ?? []) add(js, `content_scripts[${i}].js[]`);
    for (const css of cs.css ?? []) add(css, `content_scripts[${i}].css[]`);
  });

  add(manifest.action?.default_popup, 'action.default_popup');
  add(manifest.browser_action?.default_popup, 'browser_action.default_popup');
  add(manifest.options_ui?.page, 'options_ui.page');
  add(manifest.options_page, 'options_page');
  add(manifest.devtools_page, 'devtools_page');
  add(manifest.side_panel?.default_path, 'side_panel.default_path');

  for (const [key, value] of Object.entries(manifest.chrome_url_overrides ?? {})) {
    add(value, `chrome_url_overrides.${key}`);
  }

  const icons = manifest.icons ?? {};
  for (const [size, value] of Object.entries(icons)) add(value, `icons.${size}`);
  const actionIcons = manifest.action?.default_icon ?? {};
  if (typeof actionIcons === 'string') add(actionIcons, 'action.default_icon');
  else for (const [size, value] of Object.entries(actionIcons)) add(value, `action.default_icon.${size}`);

  return refs;
}

/**
 * An HTML entrypoint that survived the build can still point at chunks that did
 * not. Only absolute (root-relative) refs are checked; external URLs and
 * relative refs are not our business.
 */
function checkHtmlAssets(htmlPath) {
  const html = readFileSync(htmlPath, 'utf8');
  const refs = [
    ...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi),
    ...html.matchAll(/<link[^>]+href=["']([^"']+)["']/gi),
  ];
  for (const [, ref] of refs) {
    if (!ref.startsWith('/') || ref.startsWith('//')) continue;
    const abs = join(OUT_DIR, ref.slice(1));
    if (!fileExists(abs)) {
      fail(`${rel(htmlPath)} references ${ref}, which is not in the build`);
    }
  }
}

/** Walk the build output, collecting files by extension. */
function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(abs));
    else if (entry.isFile()) found.push(abs);
  }
  return found;
}

/**
 * Verify the manifest localization actually shipped, and shipped complete.
 *
 * This is the one part of the build where a partial result is worse than a
 * missing one. Chrome resolves `__MSG_*__` per locale and does **not** fall
 * back per key: if `_locales/<code>/messages.json` exists but omits a
 * placeholder the manifest references, Chrome refuses to load the extension
 * outright — for every user, not just that locale. And because the file is
 * small and `public/` is copied verbatim, a locale that silently fails to copy
 * looks exactly like a healthy build to every other check in this script.
 *
 * The source of truth for the locale *set* is `public/_locales/`. Comparing the
 * built set against it is what catches a partial copy; comparing each file's
 * keys against the manifest is what catches an incomplete translation.
 */
function checkLocales(manifest) {
  const placeholders = new Set();
  const scan = (value) => {
    for (const m of String(value ?? '').matchAll(/__MSG_(\w+)__/g)) placeholders.add(m[1]);
  };
  scan(manifest.name);
  scan(manifest.description);
  for (const cmd of Object.values(manifest.commands ?? {})) scan(cmd?.description);

  if (placeholders.size === 0) {
    if (manifest.default_locale) {
      fail('manifest sets default_locale but references no __MSG_*__ placeholder');
    }
    return;
  }

  const localesRoot = join(OUT_DIR, '_locales');
  if (!existsSync(localesRoot)) {
    fail(
      `manifest uses __MSG_*__ (${[...placeholders].join(', ')}) but the build has no _locales/`,
    );
    return;
  }

  const built = readdirSync(localesRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const defaultLocale = manifest.default_locale;
  if (!defaultLocale) {
    fail('manifest uses __MSG_*__ but declares no default_locale');
  } else if (!built.includes(defaultLocale)) {
    fail(`default_locale '${defaultLocale}' has no _locales/${defaultLocale}/ directory`);
  }

  for (const code of built) {
    const file = join(localesRoot, code, 'messages.json');
    if (!fileExists(file)) {
      fail(`_locales/${code}/ has no messages.json`);
      continue;
    }
    let messages;
    try {
      messages = JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      fail(`_locales/${code}/messages.json is not valid JSON — ${err.message}`);
      continue;
    }
    const missing = [...placeholders].filter(
      (k) => typeof messages[k]?.message !== 'string' || messages[k].message.trim() === '',
    );
    if (missing.length > 0) {
      fail(
        `_locales/${code}/messages.json is missing ${missing.join(', ')} — ` +
          'Chrome refuses to load the whole extension in this state',
      );
    }
  }

  // A locale that exists in source but not in the build means the copy was
  // partial. Extra built locales are equally suspicious (stale output).
  const sourceRoot = join('public', '_locales');
  if (existsSync(sourceRoot)) {
    const source = readdirSync(sourceRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    const missing = source.filter((c) => !built.includes(c));
    const extra = built.filter((c) => !source.includes(c));
    if (missing.length > 0) {
      fail(`public/_locales/ has ${missing.join(', ')} but the build does not`);
    }
    if (extra.length > 0) {
      fail(`the build has _locales/${extra.join(', _locales/')} which public/_locales/ does not`);
    }
    notes.push(`locales: ${built.length} (${built.join(', ')})`);
  }
}

/**
 * The manifest version must be the one in package.json.
 *
 * WXT copies `version` straight from package.json, so a mismatch means the
 * output was built from a different revision than the one being released. The
 * classic shape of this bug is bumping the version, running `yarn zip` without
 * rebuilding, and uploading an artifact that still advertises the old number —
 * which no other check here would notice, because the stale build is otherwise
 * perfectly healthy. A hardcoded `manifest.version` in `wxt.config.ts` would
 * shadow package.json and produce the same silent disagreement.
 */
function checkVersion(manifest) {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  } catch (err) {
    fail(`could not read package.json to verify the manifest version — ${err.message}`);
    return;
  }

  const expected = pkg.version;
  if (typeof expected !== 'string' || expected === '') {
    fail('package.json declares no version');
    return;
  }

  // Chrome accepts 1-4 dot-separated integers, each 0-65535, no leading zeros.
  // A `1.2.0-beta` or a 5-part version is rejected at upload time, not at build
  // time, so catch it here while the mistake is still cheap.
  const parts = expected.split('.');
  const wellFormed =
    parts.length >= 1 &&
    parts.length <= 4 &&
    parts.every((p) => /^(0|[1-9]\d*)$/.test(p) && Number(p) <= 65535);
  if (!wellFormed) {
    fail(
      `package.json version '${expected}' is not a valid extension version ` +
        '(1-4 dot-separated integers, each 0-65535, no leading zeros)',
    );
  }

  if (manifest.version !== expected) {
    fail(
      `manifest.json advertises version ${JSON.stringify(manifest.version)} but package.json ` +
        `says ${JSON.stringify(expected)} — this output is stale; rebuild before packaging`,
    );
    return;
  }

  notes.push(`version: ${expected}`);
}

// ── Run ──────────────────────────────────────────────────────────────────────

if (!existsSync(OUT_DIR)) {
  console.error(`\n✗ Build check failed: ${rel(OUT_DIR)} does not exist. Run \`wxt build\` first.\n`);
  process.exit(1);
}

const manifestPath = join(OUT_DIR, 'manifest.json');
if (!fileExists(manifestPath)) {
  console.error(`\n✗ Build check failed: no manifest.json in ${rel(OUT_DIR)}.\n`);
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (err) {
  console.error(`\n✗ Build check failed: manifest.json is not valid JSON — ${err.message}\n`);
  process.exit(1);
}

const refs = collectManifestRefs(manifest);
if (refs.length === 0) {
  fail('manifest.json references no files at all — the manifest looks wrong');
}
for (const { path, where } of refs) {
  const abs = join(OUT_DIR, path.split(posix.sep).join(sep));
  if (!fileExists(abs)) fail(`manifest ${where} points at ${path}, which is not in the build`);
}

checkLocales(manifest);
checkVersion(manifest);

const files = walk(OUT_DIR);
const scripts = files.filter((f) => f.endsWith('.js'));
const htmlFiles = files.filter((f) => f.endsWith('.html'));

// A build with no JavaScript cannot be an extension, whatever the manifest says.
if (scripts.length === 0) {
  fail('the build contains no .js files at all');
}
for (const html of htmlFiles) checkHtmlAssets(html);

// ── Report ───────────────────────────────────────────────────────────────────

const totalBytes = files.reduce((sum, f) => {
  try {
    return sum + statSync(f).size;
  } catch {
    return sum;
  }
}, 0);

if (problems.length > 0) {
  console.error('\n✗ Build check failed — the packaged extension would be broken:\n');
  for (const p of problems) console.error(`  • ${p}`);
  console.error(
    `\n  Output: ${rel(OUT_DIR)} (${files.length} files, ${(totalBytes / 1024).toFixed(1)} kB)` +
      '\n  A healthy build is ~3.0 MB and contains background.js, content-scripts/content.js,' +
      '\n  popup.html, dashboard.html and one _locales/<code>/messages.json per shipped language.' +
      '\n\n  If most of those are missing while the command exited 0, the build ran somewhere' +
      '\n  whose filesystem removes non-empty directories instead of failing with ENOTEMPTY' +
      '\n  (WXT relies on that failure to keep its own output). Re-run it in a plain terminal' +
      '\n  or on a normal local disk — the code is fine.\n',
  );
  process.exit(1);
}

console.log(
  `✓ Build check passed: ${files.length} files, ${(totalBytes / 1024 / 1024).toFixed(2)} MB, ` +
    `${scripts.length} scripts, ${htmlFiles.length} HTML entrypoints.`,
);
for (const note of notes) console.log(`  note: ${note}`);

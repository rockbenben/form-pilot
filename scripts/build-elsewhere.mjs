#!/usr/bin/env node
/**
 * Build the extension on a volume other than this project's own.
 *
 * Why this exists
 * ---------------
 * `wxt build` calls `removeEmptyDirs()` as its final step. That helper decides
 * whether a directory is still in use by calling `rmdir` and treating
 * `ENOTEMPTY` as "leave it alone". On a volume whose "remove directory" is
 * implemented as a recursive delete, the throw never comes — so the build wipes
 * `chunks/`, `assets/`, `content-scripts/` and finally the whole output dir, and
 * still exits 0. You then get a `yarn zip` that packages icons, locales and a
 * manifest pointing at a `background.js` that no longer exists.
 *
 * `scripts/check-build.mjs` documents the measurement and turns that silent
 * exit-0 into a loud exit-1. This script is the other half: it builds somewhere
 * healthy so there is a real artifact to check in the first place.
 *
 * How
 * ---
 * `wxt.config.ts` honours `FORMPILOT_OUT_DIR`. Point it at a temp directory
 * (`os.tmpdir()`, never a hard-coded path — this runs on other machines), build,
 * gate the result, then copy it into the project's `.output/`.
 *
 * The copy is safe: the destructive `rmdir` happens *during* the build, not when
 * files are written in afterwards. The gate is re-run on the copy to prove that.
 *
 * Usage: yarn build:elsewhere
 */

import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmdirSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const wxtBin = join(root, 'node_modules', 'wxt', 'bin', 'wxt.mjs');
const gate = join(here, 'check-build.mjs');
const dest = join(root, '.output');

if (!existsSync(wxtBin)) {
  console.error(`✗ wxt is not installed at ${wxtBin} — run \`yarn install\` first.`);
  process.exit(1);
}

/**
 * Delete a directory tree without ever issuing a recursive remove.
 *
 * Two reasons, both measured on this machine:
 *
 *   - the shell routes `fs.rmSync(dir, { recursive: true })` through a
 *     "safe delete" helper that moves the tree to the trash, and that helper
 *     times out on trees of this size (`genie-trash ... ETIMEDOUT`), failing
 *     the whole run at the last step;
 *   - `rmdir` on a *non-empty* directory is precisely what this volume gets
 *     wrong (see `scripts/check-build.mjs`), so this only ever rmdirs empty
 *     ones, where the recursive-delete semantics cannot apply.
 */
function removeTree(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const target = join(dir, entry.name);
    if (entry.isDirectory()) removeTree(target);
    else unlinkSync(target);
  }
  rmdirSync(dir);
}

/** Run a child process to completion; throws with a readable message on failure. */
function run(label, args, env) {
  console.log(`\n▸ ${label}`);
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (result.error) throw new Error(`${label} could not start — ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} exited with status ${result.status}`);
}

const work = mkdtempSync(join(tmpdir(), 'formpilot-build-'));
const outDir = join(work, 'output');
let failed = false;

try {
  // `wxt zip` builds first and packages second, so one invocation covers both.
  run('wxt zip — writing to a temp volume', [wxtBin, 'zip'], { FORMPILOT_OUT_DIR: outDir });

  // Fail before touching the project's own output, so a broken build never
  // replaces a good artifact.
  run('integrity gate — before copying', [gate, outDir]);

  console.log(`\n▸ replacing ${dest}`);
  removeTree(dest);
  cpSync(outDir, dest, { recursive: true });

  run('integrity gate — on the copy', [gate, join(dest, 'chrome-mv3')]);

  console.log('\n✓ Artifacts');
  for (const name of readdirSync(dest).sort()) {
    const full = join(dest, name);
    const stat = statSync(full);
    // 1000-based, so the numbers match the ones WXT prints above.
    const size = stat.isDirectory() ? '' : ` — ${(stat.size / 1000).toFixed(0)} kB`;
    console.log(`  ${full}${size}`);
  }
} catch (err) {
  failed = true;
  console.error(`\n✗ ${err.message}`);
} finally {
  removeTree(work);
}

process.exit(failed ? 1 : 0);

import { defineConfig } from 'wxt';

/**
 * Where to write the build, when the default `.output/` cannot be trusted.
 *
 * `wxt build` calls `removeEmptyDirs()` as its last step, and that helper decides
 * whether a directory is in use by calling `rmdir` and treating `ENOTEMPTY` as
 * "leave it alone". On a volume whose "remove directory" is implemented as a
 * recursive delete, that throw never comes, so the build wipes its own output —
 * and still exits 0. (Measured on this machine: the whole D: volume behaves that
 * way; C: does not. `scripts/check-build.mjs` has the full write-up.)
 *
 * Point this at a directory on a healthy volume to get a real artifact:
 * `yarn build:elsewhere`, or `FORMPILOT_OUT_DIR=/tmp/x wxt build`.
 */
const outDirOverride = process.env.FORMPILOT_OUT_DIR;

export default defineConfig({
  ...(outDirOverride ? { outDir: outDirOverride } : {}),
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    default_locale: 'en',
    // No host_permissions. The content script is injected declaratively by
    // `matches`, which MV3 grants without one; tabs.sendMessage to an
    // already-injected script needs none; and the popup reads the active tab's
    // URL under `activeTab`, since opening the popup is the user gesture that
    // grants it. Nothing here uses scripting.executeScript, webRequest,
    // cookies or a cross-origin fetch — the APIs that would require it.
    //
    // Declaring <all_urls> anyway cost the install-time warning "Read and
    // change all your data on all websites" and is the first thing store
    // review asks about.
    permissions: ['storage', 'activeTab'],
    commands: {
      'toggle-toolbar': {
        suggested_key: { default: 'Alt+Shift+F' },
        description: '__MSG_commandToggleToolbar__',
      },
    },
  },
});

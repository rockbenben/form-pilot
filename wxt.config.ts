import { defineConfig } from 'wxt';

export default defineConfig({
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

import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'FormPilot',
    description: 'One-click resume autofill — remembers every answer across Moka, Workday, BOSS, Greenhouse. 一键投简历，跨站复填，答过的问题不再重复。',
    permissions: ['storage', 'activeTab'],
    host_permissions: ['<all_urls>'],
  },
});

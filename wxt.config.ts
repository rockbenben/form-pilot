import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'FormPilot',
    description: 'Fill forms once, remember forever, auto-fill anywhere. Works on Moka, Workday, Greenhouse, BOSS, Lagou and more. 填一次，处处自动复填。',
    permissions: ['storage', 'activeTab'],
    host_permissions: ['<all_urls>'],
  },
});

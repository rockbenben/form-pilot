import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'FormPilot',
    description: 'FormPilot - 网申自动填写助手',
    permissions: ['storage', 'activeTab'],
    host_permissions: ['<all_urls>'],
  },
});

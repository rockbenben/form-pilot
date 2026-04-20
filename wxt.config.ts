import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'FormPilot',
    description: 'FormPilot - 通用表单填写助手 / General-purpose form-filling assistant',
    permissions: ['storage', 'activeTab'],
    host_permissions: ['<all_urls>'],
  },
});

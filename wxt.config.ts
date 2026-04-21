import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'FormPilot',
    description: 'One-click resume apply across Moka/Workday/Greenhouse + cross-site form memory. 一键投递简历 + 跨站表单复填，填过的问题再也不用重复回答。',
    permissions: ['storage', 'activeTab'],
    host_permissions: ['<all_urls>'],
  },
});

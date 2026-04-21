import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'FormPilot',
    description: '一键投递简历 + 跨站表单复填。填过的问题再也不用重复回答，投 20 份申请只需填 1 次。Moka / Workday / BOSS / 拉勾 / Greenhouse + more.',
    permissions: ['storage', 'activeTab'],
    host_permissions: ['<all_urls>'],
  },
});

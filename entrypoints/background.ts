export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleMessage(message).then(sendResponse);
    return true; // keep channel open for async response
  });
});

async function handleMessage(message: { type: string; [key: string]: unknown }) {
  // Dynamic imports to keep service worker lightweight
  const { getResume, getActiveResumeId } = await import('@/lib/storage/resume-store');
  const { getSettings, updateSettings } = await import('@/lib/storage/settings-store');

  switch (message.type) {
    case 'GET_ACTIVE_RESUME': {
      const id = await getActiveResumeId();
      if (!id) return { ok: true, data: null };
      const resume = await getResume(id);
      return { ok: true, data: resume };
    }
    case 'GET_SETTINGS': {
      const settings = await getSettings();
      return { ok: true, data: settings };
    }
    case 'SAVE_TOOLBAR_POSITION': {
      const position = message.position as { x: number; y: number };
      await updateSettings({ toolbarPosition: position });
      return { ok: true, data: null };
    }
    default:
      return { ok: false, error: `Unknown message type: ${message.type}` };
  }
}

const { dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

function setupAutoUpdater(getWindow) {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', async (info) => {
    const win = typeof getWindow === 'function' ? getWindow() : null;
    const result = await dialog.showMessageBox(win || undefined, {
      type: 'info',
      buttons: ['Download Update', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update Available',
      message: 'A new AL SIRAJ DEVELOPERS update is available.',
      detail: `Version ${info.version || ''} is ready to download from GitHub.`,
    });
    if (result.response === 0) {
      autoUpdater.downloadUpdate().catch((e) => {
        dialog.showErrorBox('Update Download Failed', e.message || String(e));
      });
    }
  });

  autoUpdater.on('update-downloaded', async () => {
    const win = typeof getWindow === 'function' ? getWindow() : null;
    const result = await dialog.showMessageBox(win || undefined, {
      type: 'info',
      buttons: ['Install Now', 'Install On Close'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update Ready',
      message: 'Update downloaded successfully.',
      detail: 'Install now to restart into the latest build.',
    });
    if (result.response === 0) autoUpdater.quitAndInstall(false, true);
  });

  autoUpdater.on('error', (e) => {
    console.warn('[auto-update] error:', e.message || e);
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((e) => {
      console.warn('[auto-update] check failed:', e.message || e);
    });
  }, 8000);

  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 6 * 60 * 60 * 1000);
}

module.exports = { setupAutoUpdater };

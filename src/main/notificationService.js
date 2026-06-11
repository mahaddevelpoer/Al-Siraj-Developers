const { Notification } = require('electron');
const path = require('path');

function showDesktopNotification({ title, body, icon, silent }) {
  try {
    const notif = new Notification({
      title: title || 'AL SIRAJ DEVELOPERS',
      body: body || '',
      icon: icon || path.join(__dirname, '../../public/splash.png'),
      silent: !!silent,
      urgency: 'critical',
    });
    notif.show();
    return { success: true };
  } catch (e) {
    console.error('[notification] Error:', e.message);
    return { error: e.message };
  }
}

module.exports = { showDesktopNotification };

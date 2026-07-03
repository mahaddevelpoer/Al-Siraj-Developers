import successUrl from '../../assets/sounds/success.wav';
import failedUrl from '../../assets/sounds/failed.wav';
import warningUrl from '../../assets/sounds/warning.wav';
import clickUrl from '../../assets/sounds/click.wav';
import notifyUrl from '../../assets/sounds/notify.wav';
import confirmUrl from '../../assets/sounds/confirm.wav';

const SETTINGS_KEY = 'al_siraj_sound_settings_v1';
const DEFAULT_SETTINGS = { enabled: true, volume: 0.22 };
const MIN_GAP_MS = 180;

const soundUrls = {
  success: successUrl,
  failed: failedUrl,
  warning: warningUrl,
  click: clickUrl,
  notify: notifyUrl,
  confirm: confirmUrl,
};

let lastPlayedAt = 0;

export function getSoundSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    return {
      ...DEFAULT_SETTINGS,
      ...(saved && typeof saved === 'object' ? saved : {}),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSoundSettings(patch = {}) {
  const next = {
    ...getSoundSettings(),
    ...patch,
    volume: Math.max(0, Math.min(1, Number(patch.volume ?? getSoundSettings().volume) || 0)),
  };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('al-siraj-sound-settings', { detail: next }));
  } catch {}
  return next;
}

function play(kind) {
  try {
    const settings = getSoundSettings();
    if (!settings.enabled) return;
    const now = Date.now();
    if (now - lastPlayedAt < MIN_GAP_MS) return;
    lastPlayedAt = now;
    const src = soundUrls[kind] || soundUrls.notify;
    const audio = new Audio(src);
    audio.volume = Math.max(0, Math.min(0.45, Number(settings.volume) || DEFAULT_SETTINGS.volume));
    audio.play().catch(() => {});
  } catch {
    // Sound must never block business work.
  }
}

export const playSuccess = () => play('success');
export const playfailed = () => play('failed');
export const playFailed = playfailed;
export const playWarning = () => play('warning');
export const playClick = () => play('click');
export const playNotify = () => play('notify');
export const playConfirm = () => play('confirm');

export function playForToast(type = 'success', message = '') {
  const text = String(message || '');
  if (type === 'error') return playfailed();
  if (type === 'warning') return playWarning();
  if (/receipt|report|pdf|notification|bell/i.test(text)) return playNotify();
  if (/approved|rejected|confirm/i.test(text)) return playConfirm();
  return playSuccess();
}

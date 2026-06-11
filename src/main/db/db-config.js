const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const CONFIG_FILE = path.join(app ? app.getPath('userData') : __dirname, 'db-config.json');

let config = {
  mode: 'local',
  lastSyncAt: null,
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    }
  } catch (e) {
    console.error('Error loading db config:', e.message);
  }
  return config;
}

function saveConfig() {
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('Error saving db config:', e.message);
  }
}

function getMode() {
  return config.mode;
}

function setMode(mode) {
  if (mode !== 'local' && mode !== 'online') throw new Error('Invalid mode: ' + mode);
  config.mode = mode;
  saveConfig();
  return config;
}

function isOnline() {
  return config.mode === 'online';
}

function isLocal() {
  return config.mode === 'local';
}

loadConfig();

module.exports = { getMode, setMode, isOnline, isLocal, loadConfig, saveConfig, getConfig: () => ({ ...config }) };

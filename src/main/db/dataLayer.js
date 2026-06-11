const path = require('path');
const fs = require('fs');

class DataLayer {
  constructor() {
    this._isLocalMachine = null;
    this._dbPath = '';
    this._windowGetter = null;
  }

  init(dbPath, windowGetter) {
    this._dbPath = dbPath;
    this._windowGetter = windowGetter;
  }

  async checkIsLocalMachine() {
    if (this._isLocalMachine !== null) return this._isLocalMachine;
    try {
      if (!this._dbPath) {
        this._isLocalMachine = false;
        return false;
      }
      const globalPath = path.join(this._dbPath, 'Global');
      const allSalesPath = path.join(globalPath, 'All_Sales.xlsx');
      this._isLocalMachine = fs.existsSync(globalPath) && fs.existsSync(allSalesPath);
    } catch {
      this._isLocalMachine = false;
    }
    return this._isLocalMachine;
  }

  async read(localFn, supabaseFn) {
    return await localFn();
  }

  async write(supabaseFn, localFn) {
    return await localFn();
  }

  _sendLocalWarning(err) {
    const warn = '⚠ Local write error: ' + (err && err.message ? err.message : 'Unknown');
    const win = typeof this._windowGetter === 'function' ? this._windowGetter() : this._windowGetter;
    if (win && !win.isDestroyed()) {
      try { win.webContents.send('sync-warning', warn); } catch {}
    }
  }

  resetCache() {
    this._isLocalMachine = null;
  }

  _sendSyncWarning(err) {
    const warn = '⚠ Cloud sync error: ' + (err && err.message ? err.message : 'Unknown');
    const win = typeof this._windowGetter === 'function' ? this._windowGetter() : this._windowGetter;
    if (win && !win.isDestroyed()) {
      try { win.webContents.send('sync-warning', warn); } catch {}
    }
  }
}

const dataLayer = new DataLayer();

module.exports = dataLayer;

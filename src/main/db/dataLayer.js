const path = require('path');
const fs = require('fs');

class DataLayer {
  constructor() {
    this._isLocalMachine = null;
    this._dbPath = '';
    this._windowGetter = null;
    this._preferDbReads = true;
    this._cloudReadTimeoutMs = 900;
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
    if (this._preferDbReads && typeof supabaseFn === 'function') {
      try {
        const cloud = await Promise.race([
          supabaseFn(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Cloud read timeout; using local cache')), this._cloudReadTimeoutMs)),
        ]);
        if (Array.isArray(cloud) && cloud.length === 0 && typeof localFn === 'function') {
          const local = await localFn();
          if (Array.isArray(local) && local.length > 0) return local;
        }
        if (cloud !== undefined && cloud !== null) return cloud;
      } catch (err) {
        if (!String(err?.message || '').includes('timeout')) this._sendSyncWarning(err);
      }
    }
    return await localFn();
  }

  async write(supabaseFn, localFn) {
    if (typeof supabaseFn === 'function') {
      try {
        await supabaseFn();
        return await localFn();
      } catch (err) {
        this._sendSyncWarning(err);
        return await localFn();
      }
    }
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

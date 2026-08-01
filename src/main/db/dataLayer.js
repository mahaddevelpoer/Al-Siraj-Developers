const path = require('path');
const fs = require('fs');

class DataLayer {
  constructor() {
    this._isLocalMachine = null;
    this._dbPath = '';
    this._windowGetter = null;
    this._preferDbReads = false;
    this._cloudReadTimeoutMs = 6000;
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
    let localData = null;
    try {
      if (typeof localFn === 'function') {
        localData = await localFn();
      }
    } catch (_) {}

    const isArray = Array.isArray(localData);
    const hasLocalRows = isArray ? localData.length > 0 : (localData !== null && localData !== undefined && Object.keys(localData || {}).length > 0);

    // If local Excel has data and we don't prefer DB reads, use local data immediately
    if (hasLocalRows && !this._preferDbReads) {
      return localData;
    }

    // If local data is empty/missing (e.g. 2nd PC login) OR _preferDbReads is set, attempt cloud read from Supabase
    if (typeof supabaseFn === 'function') {
      try {
        const cloudData = await Promise.race([
          supabaseFn(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Cloud read timeout')), this._cloudReadTimeoutMs)),
        ]);

        if (cloudData !== undefined && cloudData !== null) {
          const cloudIsArray = Array.isArray(cloudData);
          const hasCloudRows = cloudIsArray ? cloudData.length > 0 : Object.keys(cloudData || {}).length > 0;
          if (hasCloudRows) {
            return cloudData;
          }
        }
      } catch (err) {
        if (!String(err?.message || '').includes('timeout')) this._sendSyncWarning(err);
      }
    }

    return localData || (isArray ? [] : null);
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

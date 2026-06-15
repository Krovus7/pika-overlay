const fs = require('fs');
const path = require('path');

/**
 * Lightweight persistent JSON config store.
 * Reads from and writes to userData/config.json.
 */
class ConfigStore {
    constructor(app, defaults = {}) {
        this._path = path.join(app.getPath('userData'), 'config.json');
        this.data  = { ...defaults };
        try {
            if (fs.existsSync(this._path)) {
                this.data = { ...this.data, ...JSON.parse(fs.readFileSync(this._path, 'utf8')) };
            }
        } catch { /* ignore corrupt config */ }
    }

    get(key)      { return this.data[key]; }
    getAll()      { return this.data; }

    set(key, val) {
        this.data[key] = val;
        this._persist();
    }

    setMany(obj) {
        Object.assign(this.data, obj);
        this._persist();
    }

    _persist() {
        try {
            fs.writeFileSync(this._path, JSON.stringify(this.data, null, 2));
        } catch (e) {
            console.error('[Config] Failed to write config:', e.message);
        }
    }
}

module.exports = ConfigStore;

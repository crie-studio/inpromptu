'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { DEFAULTS, RANGES } = require('./settings-defaults');

class SettingsStore {
  constructor(dir) {
    this.file = path.join(dir, 'settings.json');
    this.values = { ...DEFAULTS };
    this.firstRun = false;
    try {
      // Só as opções que ainda existem (versões antigas tinham outras).
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const key of Object.keys(DEFAULTS)) if (key in saved) this.values[key] = saved[key];
    } catch { this.firstRun = true; }
    if (!this.values.remoteToken) this.values.remoteToken = SettingsStore.newToken();
    this.saveTimer = null;
  }

  static newToken() {
    return crypto.randomBytes(16).toString('hex');
  }

  get() {
    return { ...this.values };
  }

  set(patch) {
    for (const [key, raw] of Object.entries(patch)) {
      if (!(key in DEFAULTS)) continue;
      let value = raw;
      if (RANGES[key]) {
        const [min, max] = RANGES[key];
        value = Math.min(max, Math.max(min, Number(value) || min));
      }
      this.values[key] = value;
    }
    this.scheduleSave();
    return this.get();
  }

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    clearTimeout(this.saveTimer);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.values, null, 2));
    } catch (err) {
      console.error('Falha ao salvar configurações', err);
    }
  }
}

module.exports = { SettingsStore, DEFAULTS };

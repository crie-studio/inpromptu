'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULTS = {
  // Guia
  mode: 'tracking',          // tracking | classic | voice
  speed: 2.5,                // palavras por segundo (clássico / ativado por voz)
  language: 'pt',            // id do modelo de voz (src/models.js)
  micDeviceId: '',
  voiceSensitivity: 50,      // 0..100 (detector de fala, nos modos de voz)
  readingRate: null,         // seu ritmo de leitura (palavras/s), aprendido no rastreamento de voz
  autoAdvance: true,
  countdown: 3,              // segundos de contagem antes de começar (0 = sem contagem)
  showTimer: true,           // cronômetro e tempo restante na barra
  targetMinutes: 0,          // meta de duração (0 = sem meta)
  subtitles: true,           // gerar legendas .srt ao terminar (rastreamento de voz)

  // OBS (obs-websocket)
  obsEnabled: false,
  obsHost: '127.0.0.1',
  obsPort: 4455,
  obsPasswordEnc: '',        // senha cifrada pelo Windows (safeStorage)
  obsRecord: true,           // começar a gravar com a leitura e parar no fim
  obsChapters: true,         // capítulo na gravação a cada página

  // Segunda tela (para quem apresenta)
  extraOutput: false,
  extraDisplayId: null,
  extraMirror: 'horizontal', // none | horizontal | vertical | both

  // Sobreposição
  overlay: 'notch',          // notch | floating | fullscreen
  followMouse: true,         // notch: acompanha o monitor do mouse
  displayId: null,           // notch: monitor fixo quando followMouse = false
  followCursor: false,       // flutuante: janela acompanha o cursor
  glass: false,              // flutuante: efeito vidro (acrílico)
  glassOpacity: 30,          // 0..60
  floatingPos: null,         // {x, y} última posição da janela flutuante

  // Aparência
  width: 400,                // 280..500
  height: 150,               // 100..400
  fontFamily: 'sans',        // sans | serif | mono | dyslexic
  fontSize: 'lg',            // xs | sm | lg | xl
  highlight: 'yellow',       // white | yellow | green | blue | pink | orange

  // Saída / tela cheia
  fullscreenDisplayId: null,
  mirror: 'none',            // none | horizontal | vertical | both
  hideFromCapture: true,
  fsRotate: 'none',          // none | left | right (monitor em pé)
  fsFontSize: 64,            // px numa tela de 1920 de largura
  fsAlign: 'left',           // left | center | justify
  fsColumn: 80,              // largura da coluna de texto (% da tela)
  fsLineHeight: 1.45,
  fsLetterSpacing: 0,        // centésimos de em
  fsWeight: 'medium',        // normal | medium | bold
  fsUppercase: false,
  fsTextColor: '#ffffff',
  fsOutline: 0,              // contorno do texto (px)
  fsAnchor: 30,              // posição da linha de leitura (% da altura)
  fsMarker: 'arrow',         // none | arrow | band
  fsBgColor: '#000000',
  fsBgOpacity: 100,          // 0 = totalmente transparente
  fsClickThrough: false,     // cliques passam para o app de baixo
  fsShowBar: true,
  camDeviceId: '',           // câmera de fundo ('' = nenhuma)
  camMode: 'background',     // background | corner
  camDim: 40,                // escurecer a câmera (%)
  camMirror: true,

  // Remoto
  remoteEnabled: false,
  remotePort: 7373,
  remoteToken: '',
};

const RANGES = {
  speed: [0.5, 8],
  voiceSensitivity: [0, 100],
  readingRate: [1, 6],
  countdown: [0, 10],
  targetMinutes: [0, 180],
  obsPort: [1, 65535],
  glassOpacity: [0, 60],
  width: [280, 500],
  height: [100, 400],
  remotePort: [1024, 65535],
  fsFontSize: [24, 180],
  fsColumn: [30, 100],
  fsLineHeight: [1, 2.4],
  fsLetterSpacing: [0, 20],
  fsOutline: [0, 8],
  fsAnchor: [10, 70],
  fsBgOpacity: [0, 100],
  camDim: [0, 90],
};

class SettingsStore {
  constructor(dir) {
    this.file = path.join(dir, 'settings.json');
    this.values = { ...DEFAULTS };
    try {
      // Só as opções que ainda existem (versões antigas tinham outras).
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const key of Object.keys(DEFAULTS)) if (key in saved) this.values[key] = saved[key];
    } catch { /* primeira execução */ }
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

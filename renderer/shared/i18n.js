// Idiomas da interface. O português é o texto de origem (escrito direto nas telas e nos scripts);
// em inglês, este módulo troca os textos da página ao carregar e também os que os scripts
// escrevem depois (avisos, estados, rótulos), sem tocar no texto do roteiro.
// Funciona no navegador (window.InPromptuI18n) e no Node (require), para o main.js.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./i18n-en.js'));
  else root.InPromptuI18n = factory(root.InPromptuI18nEn);
}(typeof self !== 'undefined' ? self : this, (dict) => {
  'use strict';
  const EN = (dict && dict.text) || {};
  const PATTERNS = (dict && dict.patterns) || [];
  const STORE_KEY = 'inpromptu.uiLanguage';
  const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
  const INLINE = new Set(['B', 'I', 'EM', 'STRONG', 'CODE', 'KBD', 'A', 'SMALL', 'BR', 'U']);
  // Não traduz: código, o texto da pessoa (campos e roteiro) e nomes de teclas (<kbd>P</kbd> não é "P" de pequeno).
  const SKIP = 'script, style, textarea, kbd, [data-i18n="skip"]';
  // Nos campos de texto, só a dica (placeholder) é da interface.
  const SKIP_ATTRS = 'script, style, [data-i18n="skip"]';
  const HAS_WORD = /[A-Za-zÀ-ÿ]/;

  const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

  /** 'pt' ou 'en': a escolha da pessoa, ou o idioma do sistema/navegador ('auto'). */
  function resolve(setting, locale) {
    if (setting === 'pt' || setting === 'en') return setting;
    const nav = typeof navigator !== 'undefined' ? (navigator.languages && navigator.languages[0]) || navigator.language : '';
    return String(locale || nav || 'pt').toLowerCase().startsWith('pt') ? 'pt' : 'en';
  }

  /** Tem tradução (mesmo que igual ao original, como nomes e siglas)? */
  function known(text) {
    const key = norm(text);
    return Object.prototype.hasOwnProperty.call(EN, key) || PATTERNS.some(([re]) => re.test(key));
  }

  /** Tradução de um texto para o idioma pedido (texto de origem em português). */
  function translate(text, lang, vars) {
    let out = text;
    if (lang === 'en' && text) {
      const key = norm(text);
      if (Object.prototype.hasOwnProperty.call(EN, key)) out = EN[key];
      else {
        for (const [re, rep] of PATTERNS) {
          if (re.test(key)) { out = key.replace(re, rep); break; }
        }
      }
    }
    if (vars) out = String(out).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    return out;
  }

  let lang = 'pt';
  const api = { resolve, translate, known, norm, get lang() { return lang; } };
  api.t = (text, vars) => translate(text, lang, vars);

  if (typeof document === 'undefined') return api;

  /* ───────── Na página ───────── */

  function stored() {
    try { return localStorage.getItem(STORE_KEY) || 'auto'; } catch { return 'auto'; }
  }

  /** A tela guarda a escolha (para as outras janelas abrirem já no idioma) e diz se precisa recarregar. */
  api.sync = (setting) => {
    try { localStorage.setItem(STORE_KEY, setting || 'auto'); } catch { /* sem armazenamento */ }
    return resolve(setting) !== lang;
  };

  const skipped = (node) => {
    const el = node.nodeType === 1 ? node : node.parentElement;
    return !el || !!el.closest(SKIP);
  };

  function textNode(node, missing) {
    const raw = node.nodeValue;
    const key = norm(raw);
    if (!key || !HAS_WORD.test(key)) return;
    if (!known(key)) {
      if (missing && !/^[\d\s.,:·%—–-]+$/.test(key)) missing.add(key);
      return;
    }
    const out = translate(key, 'en');
    if (!missing && out !== key) node.nodeValue = raw.replace(key, out);
  }

  function attrs(el, missing) {
    for (const a of ATTRS) {
      const v = el.getAttribute && el.getAttribute(a);
      if (!v || !HAS_WORD.test(v)) continue;
      if (!known(v)) { if (missing) missing.add(norm(v)); continue; }
      const out = translate(v, 'en');
      if (!missing && out !== v) el.setAttribute(a, out);
    }
  }

  /** Texto com marcação no meio (ex.: "Abra <b>Ferramentas</b>…") é traduzido como uma unidade. */
  function mixed(el) {
    let text = false;
    let inline = false;
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && HAS_WORD.test(n.nodeValue)) text = true;
      else if (n.nodeType === 1) {
        if (!INLINE.has(n.tagName)) return false;
        inline = true;
      }
    }
    return text && inline;
  }

  /** Troca um texto com marcação inteiro; diz se conseguiu. */
  function whole(el, missing) {
    const key = norm(el.innerHTML);
    if (!Object.prototype.hasOwnProperty.call(EN, key)) return false;
    if (!missing) el.innerHTML = EN[key];
    return true;
  }

  function visit(el, missing) {
    if (el.nodeType !== 1) return;
    if (el.tagName === 'TEXTAREA' && !el.closest(SKIP_ATTRS)) { attrs(el, missing); return; }
    if (el.matches(SKIP)) return;
    attrs(el, missing);
    if (mixed(el)) {
      if (whole(el, missing)) return;
      if (missing) { missing.add(norm(el.innerHTML)); return; }
    }
    for (const n of [...el.childNodes]) {
      if (n.nodeType === 3) textNode(n, missing);
      else if (n.nodeType === 1) visit(n, missing);
    }
  }

  /** Lista o que ainda não tem tradução (usado por scripts/i18n-check.js). */
  api.missing = (rootEl) => {
    const set = new Set();
    visit(rootEl, set);
    return [...set];
  };

  api.apply = (rootEl) => {
    if (lang === 'en') visit(rootEl);
  };

  lang = resolve(stored());
  if (lang === 'en') {
    document.documentElement.lang = 'en';
    if (document.title) document.title = translate(document.title, 'en');
    if (document.body) visit(document.body);
    // O que os scripts escreverem depois (avisos, estados, rótulos) também é traduzido.
    const observer = new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'characterData') {
          if (!skipped(m.target)) textNode(m.target);
        } else if (m.type === 'attributes') {
          if (!m.target.closest(SKIP_ATTRS)) attrs(m.target);
        } else {
          // Um script trocou o HTML de um texto com marcação (ex.: "texto <b>x</b> texto"): traduz o conjunto.
          if (m.target.nodeType === 1 && !skipped(m.target) && mixed(m.target) && whole(m.target)) continue;
          for (const n of m.addedNodes) {
            if (skipped(n)) continue;
            if (n.nodeType === 3) textNode(n);
            else if (n.nodeType === 1) visit(n);
          }
        }
      }
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  return api;
}));

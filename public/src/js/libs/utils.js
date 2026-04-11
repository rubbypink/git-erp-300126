/**
 * =========================================================================
 * 9TRIP UTILITIES LIBRARY - ES6 MODULE VERSION
 * Tech Lead: 9Trip Team
 * =========================================================================
 */
// =====================================================================
// 1. CORE IMPORTS (Bắt buộc load trước để chạy App & Login)
// =====================================================================
import Swal from 'sweetalert2';
window.Swal = Swal; // Expose globally for legacy plain scripts (utils.js, logA, etc.)

import L from '@js/common/logger.js';
import SYS from '@js/libs/sys_helper.js';
import UI_DASH from '@js/common/ui_dashboard.js';
import UI_MANAGER from '@js/modules/core/UI_Manager.js';
import '@js/components/custom_tag.js';
window.UI_DASH = UI_DASH;
window.SYS = SYS;
window.L = L;

// --- LOG FUNCTIONS ---
function warn(prefix, msg, data) {
  if (typeof LOG_CFG !== 'undefined' && LOG_CFG.DEBUG_MODE) {
    console.warn(`%c[${prefix}] ⚠️ ${msg}`, 'color:orange; font-weight:bold;', data || '');
    if (typeof L !== 'undefined' && L._) {
      L._(`%c[${prefix}] ⚠️ ${msg}`, data || '', 'warning');
    }
  }
}

// --- DATA FUNCTIONS ---
async function resolveDisplayValue(collection, value, targetField = 'name') {
  if (!value) return '';
  try {
    if (typeof A === 'undefined' || typeof A.DB === 'undefined') return value;
    if (value) {
      const data = await A.DB.local.get(collection, value);
      if (data && data[targetField]) return data[targetField];
    }
    const all = await DB_MANAGER.local.getAllAsObject(collection);
    const found = Object.values(all || {}).map((item) => {
      return { id: item.id || item.uid || item.value, name: item.name || item.displayName || item.full_name || item.user_name || item.title || item.full_name || String(item.id) };
    });
    return found;
  } catch (e) {
    console.warn(`[resolveDisplayValue] Error resolving ${value} in ${collection}:`, e);
    return value;
  }
}

function extractFirstItem(items) {
  if (!items || !Array.isArray(items) || items.length === 0) return null;
  return items[0];
}

function normalizeList(list) {
  if (!list) return [];
  if (Array.isArray(list)) return list;
  if (typeof list === 'object' && list !== null) {
    return Object.entries(list).map(([key, value]) => {
      if (typeof value === 'object' && Object.values(value).length > 0) {
        return Object.values(value);
      }
      return { id: key, name: value };
    });
  }
  if (typeof list === 'string') {
    const parts = list.split('.');
    let current = window;
    for (const part of parts) {
      if (current && current[part] !== undefined) current = current[part];
      else {
        current = null;
        break;
      }
    }
    return current;
  }
  return [];
}

function removeVietnameseTones(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function getMany(spec, optOrRoot = {}) {
  const out = {};
  if (!spec) return out;
  const { root = document } = optOrRoot.nodeType === 1 ? { root: optOrRoot } : optOrRoot;

  if (Array.isArray(spec)) {
    spec.forEach((id) => (out[id] = getVal(id, root)));
    return out;
  }

  for (const [key, conf0] of Object.entries(spec)) {
    if (typeof conf0 === 'string') {
      out[key] = getVal(conf0, root);
      continue;
    }

    const { id, sel, selector, mode = 'val', fallback = '', opt: localOpt = {} } = conf0 || {};
    const targetSel = id || sel || selector;

    if (!targetSel) {
      out[key] = fallback;
      continue;
    }

    if (mode === 'vals') out[key] = getVals(targetSel, { root, ...localOpt });
    else out[key] = getVal(targetSel, root, { fallback, ...localOpt });
  }
  return out;
}

function setMany(spec, data, optOrRoot = {}) {
  if (!spec || !data) return 0;
  const { root = document } = optOrRoot.nodeType === 1 ? { root: optOrRoot } : optOrRoot;
  let count = 0;

  if (Array.isArray(spec)) {
    spec.forEach((id, i) => {
      let val = Array.isArray(data) ? data[i] : typeof data === 'object' ? data[id] : data;
      if (setVal(id, val, root)) count++;
    });
    return count;
  }

  for (const [key, conf0] of Object.entries(spec)) {
    const val = data[key];
    if (val === undefined) continue;

    if (typeof conf0 === 'string') {
      if (setVal(conf0, val, root)) count++;
      continue;
    }

    const { id, sel, selector, mode = 'val' } = conf0 || {};
    const targetSel = id || sel || selector;

    if (mode === 'vals') {
      const n = setVals(targetSel, Array.isArray(val) ? val : [val], { root });
      if (n > 0) count++;
    } else {
      if (setVal(targetSel, val, root)) count++;
    }
  }
  return count;
}

// --- DATE FUNCTIONS ---
function getDateRange(textInput) {
  if (!textInput) return null;

  const text = textInput.toLowerCase().trim();
  const now = new Date();
  const y = now.getFullYear(),
    m = now.getMonth(),
    d = now.getDate();

  const isPast = /qua|trước|ngoái|yesterday|last/.test(text);
  const isNext = /mai|tới|sau|tomorrow|next/.test(text);
  const isThis = /nay|này|this|current/.test(text);
  const offset = isPast ? -1 : isNext ? 1 : 0;

  const num = parseInt(text.match(/\d+/)?.[0] || 0);

  const units = [
    {
      keys: ['tháng', 'month'],
      calc: () => {
        const targetM = num ? num : m + offset;
        return [new Date(y, targetM, 1), new Date(y, targetM + 1, 0)];
      },
    },
    {
      keys: ['quý', 'quarter'],
      calc: () => {
        const currentQ = Math.floor(m / 3) + 1;
        const q = num ? num : currentQ + offset;
        return [new Date(y, (q - 1) * 3, 1), new Date(y, q * 3, 0)];
      },
    },
    {
      keys: ['tuần', 'week'],
      calc: () => {
        const day = now.getDay();
        const diffToMon = (day === 0 ? -6 : 1) - day;
        const start = new Date(y, m, d + diffToMon + offset * 7);
        return [start, new Date(y, m, start.getDate() + 6)];
      },
    },
    {
      keys: ['năm', 'year'],
      calc: () => [new Date(y + offset, 0, 1), new Date(y + offset, 11, 31)],
    },
    {
      keys: ['qua', 'mai', 'nay', 'yesterday', 'tomorrow', 'today'],
      calc: () => [new Date(y, m, d + offset), new Date(y, m, d + offset)],
    },
  ];

  if (text.includes('all')) return { start: new Date(2024, 0, 1, 0, 0, 0), end: new Date(2028, 11, 31, 23, 59, 59) };
  if (text.includes('tùy chọn') || text.includes('-1')) return null;

  const unit = units.find((u) => u.keys.some((k) => text.includes(k)));
  let [start, end] = unit ? unit.calc() : [new Date(y, m, d), new Date(y, m, d)];

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function isDateInRange(dateCheck, range) {
  if (!dateCheck || !range) return false;

  let target = dateCheck;

  if (typeof dateCheck.toDate === 'function') {
    target = dateCheck.toDate();
  } else if (!(dateCheck instanceof Date)) {
    target = new Date(dateCheck);
  }

  return target.getTime() >= range.start.getTime() && target.getTime() <= range.end.getTime();
}

function parseDateVal(input) {
  if (!input) return 0;
  if (input instanceof Date) return input.getTime();
  const str = String(input).trim();
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) return new Date(parts[2], parts[1] - 1, parts[0]).getTime();
  }
  if (str.includes('-')) {
    const parts = str.split('-');
    if (parts.length === 3) return new Date(parts[0], parts[1] - 1, parts[2]).getTime();
  }
  return new Date(str).getTime() || 0;
}

function formatDateForInput(d, inputType = '') {
  if (!d) return '';
  if (typeof d === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    d = new Date(d);
  }

  if (!(d instanceof Date) || isNaN(d.getTime())) {
    warn('formatDateForInput', 'Invalid Date object:', d);
    return '';
  }

  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());

  if (inputType === 'datetime-local') {
    const hh = pad2(d.getHours());
    const mm = pad2(d.getMinutes());
    return `${y}-${m}-${day}T${hh}:${mm}`;
  }

  return `${y}-${m}-${day}`;
}

function formatDateISO(d) {
  return formatDateForInput(d, 'date');
}

function parseInputDate(s, inputType = '') {
  if (!s) return null;
  try {
    if (inputType === 'date') {
      const [y, m, d] = s.split('-').map(Number);
      return y && m && d ? new Date(y, m - 1, d) : null;
    }
    if (inputType === 'datetime-local') {
      const [datePart, timePart] = s.split('T');
      if (!datePart || !timePart) return null;
      const [y, m, d] = datePart.split('-').map(Number);
      const [hh, mm] = timePart.split(':').map(Number);
      return y && m && d ? new Date(y, m - 1, d, hh || 0, mm || 0) : null;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  } catch (e) {
    warn('parseInputDate', `Lỗi parse ngày "${s}"`, e);
    return null;
  }
}

function formatDateVN(dateInput) {
  try {
    if (!dateInput) return '';

    let date;
    let target = dateInput;

    if (typeof target === 'string' && /^\d+$/.test(target.trim())) {
      target = Number(target.trim());
    }

    if (target && typeof target === 'object' && target.seconds) {
      date = new Date(target.seconds * 1000);
    } else if (typeof target === 'number') {
      if (target > 1000000000000) {
        date = new Date(target);
      } else {
        date = new Date((target - 25569) * 86400 * 1000);
      }
    } else {
      date = new Date(target);
    }

    if (isNaN(date.getTime())) return '';

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const config = typeof window.A !== 'undefined' && window.A.getConfig ? window.A.getConfig('intl') : {};

    return new Intl.DateTimeFormat('vi-VN', config.dateOptions).format(date) || `${day}/${month}/${year}`;
  } catch (error) {
    if (typeof ErrorLogger !== 'undefined') {
      ErrorLogger.log(error, 'formatDateVN', { data: dateInput });
    }
    return '';
  }
}

// --- FORMAT FUNCTIONS ---
function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatPhone(p) {
  let s = String(p).trim();
  if (s && s.startsWith("'")) return s.replace(/'/g, '');
  return s;
}

function formatNumber(n) {
  if (n === '' || n === null || n === undefined) return '';
  n = String(n).replace(/[^0-9.-]/g, '');
  const num = Number(n);
  if (isNaN(num)) {
    warn('formatNumber', 'Giá trị không phải số:', n);
    return '0';
  }
  const config = typeof window.A !== 'undefined' && window.A.getConfig ? window.A.getConfig('intl') : {};
  return new Intl.NumberFormat(config.locale, config.numberOptions).format(num);
}

function formatMoney(n) {
  if (n === '' || n === null || n === undefined) return '';
  const num = Number(n);
  if (isNaN(num)) {
    warn('formatMoney', 'Giá trị không phải số:', n);
    return '0';
  }
  const config = typeof window.A !== 'undefined' && window.A.getConfig ? window.A.getConfig('intl') : {};
  return new Intl.NumberFormat(config.locale, config.currencyOptions).format(num);
}

function escapeHtml(s) {
  const map = {
    '&': '&' + 'amp;',
    '<': '&' + 'lt;',
    '>': '&' + 'gt;',
    '"': '&' + 'quot;',
    "'": '&' + '#39;',
  };
  return String(s ?? '').replace(/[&<>"']/g, (m) => map[m]);
}

// --- DOM FUNCTIONS ---
function resolveEls(target, root) {
  try {
    if (target === null || target === undefined) return [];
    if (target.nodeType === 1) return [target];
    if (Array.isArray(target) || (typeof NodeList !== 'undefined' && target instanceof NodeList) || (typeof HTMLCollection !== 'undefined' && target instanceof HTMLCollection)) {
      return Array.from(target).filter((el) => el && el.nodeType === 1);
    }
    if (typeof target !== 'string') return [];

    const str = target.trim();
    if (!str) return [];

    let safeRoot = document;
    if (root && root.nodeType === 1) safeRoot = root;

    const isSimpleId = safeRoot === document && /^[a-zA-Z0-9_-]+$/.test(str);
    if (isSimpleId) {
      const el = document.getElementById(str);
      return el ? [el] : [];
    }

    return Array.from(safeRoot.querySelectorAll(str));
  } catch (e) {
    if (typeof L !== 'undefined' && typeof L.log === 'function') L.log(`[DOM] resolveEls lỗi: ${target}`, e);
    else console.warn(`[DOM] resolveEls crash:`, e);
    return [];
  }
}

function $(sel, root = document) {
  const els = resolveEls(sel, root);
  return els.length > 0 ? els[0] : null;
}

function $$(sel, root = document) {
  return resolveEls(sel, root);
}

function getE(input) {
  if (!input) return null;
  if (input.nodeType === 1) return input;
  if (typeof input === 'string') return document.getElementById(input);
  if (typeof L !== 'undefined' && L._) L._('[DOM] getE: Invalid input type', input);
  return null;
}

function getFromEl(el, opt = {}) {
  if (!el) return opt.fallback ?? '';

  try {
    const { trim = true } = opt;
    let val = '';
    const classList = el.classList;
    const tagName = el.tagName;

    if (el.type === 'checkbox') {
      val = el.checked;
    } else if (tagName === 'SELECT' && el.multiple) {
      val = Array.from(el.selectedOptions).map((o) => o.value);
    } else if (classList.contains('number') || el.type === 'number') {
      return getNum(el);
    } else if (classList.contains('phone_number') || el.type === 'tel' || el.dataset.field === 'phone' || el.dataset.field === 'customer_phone') {
      let rawVal = el.value || '';
      val = typeof rawVal === 'string' ? rawVal.replace(/[^0-9]/g, '') : '';
      return val;
    } else if ('value' in el) {
      val = el.value;
    } else {
      val = el.textContent || el.innerText || '';
    }

    if (val === null || val === undefined) val = '';
    if (typeof val === 'string' && trim) val = val.trim();

    return val;
  } catch (e) {
    if (typeof L !== 'undefined' && typeof L.log === 'function') L.log(`[DOM] getFromEl lỗi ID: ${el.id}`, e);
    else console.error(e);
    return opt.fallback ?? '';
  }
}

function setToEl(el, value) {
  if (!el) return false;

  try {
    let vRaw = value;
    if (vRaw === null || vRaw === undefined) vRaw = '';

    if (vRaw instanceof Date) {
      const yyyy = vRaw.getFullYear();
      const mm = String(vRaw.getMonth() + 1).padStart(2, '0');
      const dd = String(vRaw.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      if (el.type === 'datetime-local') {
        const hh = String(vRaw.getHours()).padStart(2, '0');
        const min = String(vRaw.getMinutes()).padStart(2, '0');
        vRaw = `${dateStr}T${hh}:${min}`;
      } else {
        vRaw = dateStr;
      }
    }

    const classList = el.classList;
    if (el.dataset && !el.dataset.initial) el.dataset.initial = String(vRaw);

    if (classList.contains('number') || el.type === 'number') {
      let rawNum = 0;
      if (vRaw !== '' && vRaw !== null && vRaw !== undefined) {
        rawNum = String(vRaw).replace(/[^0-9]/g, '');
        rawNum = Number(rawNum);
        if (isNaN(rawNum)) rawNum = 0;
      }
      if (el.dataset && !el.dataset.initial) el.dataset.initial = String(rawNum);
      el.dataset.val = rawNum;
      if (el.type === 'number') {
        el.value = rawNum;
      } else {
        el.value = typeof formatNumber === 'function' ? formatNumber(rawNum) : new Intl.NumberFormat('vi-VN').format(rawNum);
      }
      return true;
    }

    if (classList.contains('phone_number') || el.type === 'tel' || el.dataset.field === 'phone' || el.dataset.field === 'customer_phone') {
      const cleanVal = String(vRaw).replace(/[^0-9]/g, '');
      el.dataset.val = cleanVal;
      el.value = typeof formatPhone === 'function' ? formatPhone(cleanVal) : cleanVal;
      return true;
    }

    if (el.type === 'checkbox') {
      el.checked = vRaw === true || String(vRaw).toLowerCase() === 'true' || vRaw == 1;
      return true;
    }
    if (el.type === 'radio') {
      el.checked = String(el.value) === String(vRaw);
      return true;
    }
    if (el.tagName === 'SELECT' && el.multiple) {
      const list = Array.isArray(vRaw) ? vRaw.map(String) : [String(vRaw)];
      Array.from(el.options).forEach((o) => (o.selected = list.includes(o.value)));
      return true;
    }

    if ('value' in el) {
      el.value = String(vRaw);
      if (typeof vRaw !== 'object') el.dataset.val = String(vRaw);
      return true;
    } else {
      el.value = String(vRaw);
      el.textContent = String(vRaw);
    }

    return true;
  } catch (err) {
    if (typeof L !== 'undefined' && typeof L.log === 'function') L.log(`[DOM] setToEl lỗi`, err);
    else console.error(err);
    return false;
  }
}

function getVal(id, root = document, opt = {}) {
  try {
    const el = $(id, root);
    if (el) return getFromEl(el, opt);
    if (typeof id === 'number') return id;
    return opt.fallback ?? '';
  } catch (err) {
    if (typeof L !== 'undefined' && typeof L._ === 'function') L._(`[DOM] getVal lỗi`, 'danger');
    return opt.fallback ?? '';
  }
}

function setVal(id, value, root = document) {
  try {
    const el = $(id, root);
    if (!el) {
      if (typeof L !== 'undefined' && L._) L._(`[DOM] setVal: Không tìm thấy ID "${id}"`, 'warning');
      return false;
    }
    return setToEl(el, value);
  } catch (e) {
    if (typeof L !== 'undefined' && typeof L._ === 'function') L._(`[DOM] setVal lỗi ${e.message}`);
    return false;
  }
}

function setNum(idOrEl, val, root = document) {
  try {
    const el = $(idOrEl, root);
    if (!el) return;

    let rawNum = 0;
    if (val !== '' && val !== null && val !== undefined) {
      rawNum = String(val).replace(/[^0-9]/g, '');
      rawNum = Number(rawNum);
      if (isNaN(rawNum)) rawNum = 0;
    }
    if (el.dataset && !el.dataset.initial) el.dataset.initial = String(rawNum);
    el.dataset.val = rawNum;
    if (el.type === 'number') {
      el.value = rawNum;
    } else {
      el.value = formatNumber(rawNum);
    }
  } catch (e) {
    if (typeof Opps === 'function') Opps(`[DOM] setNum lỗi`, 'danger');
  }
}

function getNum(target, root = document) {
  try {
    if (typeof target === 'number') return target;
    var el = null;
    if (target && target.nodeType === 1) el = target;
    else el = $(target, root);
    let rawVal = el ? el.dataset.val || el.value || el.textContent : String(target);

    if (!rawVal) return 0;

    let cleanStr = String(rawVal).trim();
    const lastDotIdx = cleanStr.lastIndexOf('.');
    const lastCommaIdx = cleanStr.lastIndexOf(',');
    const hasBoth = lastCommaIdx !== -1 && lastDotIdx !== -1;
    const lastCharIsDigit = /\d$/.test(cleanStr);
    const distToLastComma = cleanStr.length - lastCommaIdx - 1;
    const distToLastDot = cleanStr.length - lastDotIdx - 1;
    const isCommaDecimal = lastCommaIdx !== -1 && (distToLastComma === 1 || distToLastComma === 2) && lastCharIsDigit;
    const isDotDecimal = lastDotIdx !== -1 && (distToLastDot === 1 || distToLastDot === 2) && lastCharIsDigit;

    if (hasBoth || isCommaDecimal || isDotDecimal) {
      let tempStr = cleanStr;
      if (hasBoth) {
        if (lastCommaIdx > lastDotIdx) {
          tempStr = tempStr.replace(/\./g, '').replace(',', '.');
        } else {
          tempStr = tempStr.replace(/,/g, '');
        }
      } else if (isCommaDecimal) {
        tempStr = tempStr.replace(/\./g, '').replace(',', '.');
      } else if (isDotDecimal) {
        if (tempStr.split('.').length > 2) {
          const parts = tempStr.split('.');
          const lastPart = parts.pop();
          tempStr = parts.join('') + '.' + lastPart;
        }
      }

      let num = parseFloat(tempStr);
      if (!isNaN(num)) return Math.round(num);
    }

    if (cleanStr.includes(',') && cleanStr.includes('.')) {
      cleanStr = cleanStr.replace(/\./g, '').replace(',', '.');
    } else if (cleanStr.includes(',')) {
      cleanStr = cleanStr.replace(',', '.');
    } else if (cleanStr.split('.').length > 2) {
      cleanStr = cleanStr.replace(/\./g, '');
    }

    const num = parseFloat(cleanStr);
    return isNaN(num) ? 0 : num;
  } catch (e) {
    return 0;
  }
}

function getVals(target, optOrRoot = {}) {
  try {
    const { root = document, silent = false, ...rest } = optOrRoot.nodeType === 1 ? { root: optOrRoot } : optOrRoot;
    const els = resolveEls(target, root);
    if (!els.length) return [target];
    return els.map((el) => getFromEl(el, rest));
  } catch (e) {
    return [];
  }
}

function setVals(target, values, optOrRoot = {}) {
  try {
    const { root = document, keepMissing = false } = optOrRoot.nodeType === 1 ? { root: optOrRoot } : optOrRoot;
    const els = resolveEls(target, root);
    if (!els.length) return 0;

    let count = 0;
    if (!Array.isArray(values)) {
      for (const el of els) {
        if (setToEl(el, values)) count++;
      }
    } else {
      els.forEach((el, i) => {
        if (keepMissing && i >= values.length) return;
        if (setToEl(el, values[i])) count++;
      });
    }
    return count;
  } catch (e) {
    return 0;
  }
}

// --- UI FUNCTIONS ---
function setText(idOrEl, text = '') {
  const els = resolveEls(idOrEl);
  const el = Array.isArray(els) ? els[0] : els;
  if (!el) {
    warn('setText', `Element "${idOrEl}" not found`);
    return false;
  }
  el.textContent = String(text ?? '');
  return true;
}

function setHTML(idOrEl, html = '') {
  const els = resolveEls(idOrEl);
  const el = Array.isArray(els) ? els[0] : els;
  if (!el) {
    warn('setHTML', `Element "${idOrEl}" not found`);
    return false;
  }
  el.innerHTML = String(html ?? '');
  return true;
}

function setDisplay(idOrEl, on = true) {
  return setClass(idOrEl, 'd-none', !on) > 0;
}

function disable(idOrEl, on = true) {
  const els = resolveEls(idOrEl);
  const el = Array.isArray(els) ? els[0] : els;
  if (!el) {
    warn('disable', `Element "${idOrEl}" not found`);
    return false;
  }
  el.disabled = !!on;
  return true;
}

function setClass(target, className, on = true, rootOrOpt = {}) {
  const opt = rootOrOpt.nodeType === 1 ? { root: rootOrOpt } : rootOrOpt || {};
  const els = resolveEls(target, opt.root || document);
  if (!els.length) return 0;

  const classes = Array.isArray(className) ? className : String(className).split(/\s+/).filter(Boolean);
  els.forEach((el) => classes.forEach((c) => el.classList.toggle(c, !!on)));
  return els.length;
}

function setStyle(target, styles, rootOrOpt = {}) {
  const opt = rootOrOpt.nodeType === 1 ? { root: rootOrOpt } : rootOrOpt || {};
  const els = resolveEls(target, opt.root || document);
  if (!els.length) {
    warn('setStyle', `Target not found:`, target);
    return 0;
  }

  els.forEach((el) => {
    if (typeof styles === 'string') {
      el.style.cssText += styles.endsWith(';') ? styles : styles + ';';
    } else if (styles && typeof styles === 'object') {
      for (const [k, v] of Object.entries(styles)) {
        if (v === null || v === '' || v === undefined) el.style.removeProperty(k);
        else {
          if (k.includes('-')) el.style.setProperty(k, String(v));
          else el.style[k] = String(v);
        }
      }
    }
  });
  return els.length;
}

function fillSelect(elmId, dataList, defaultText = 'Chọn...') {
  const el = getE(elmId);
  if (!el) {
    warn('fillSelect', `Select ID "${elmId}" not found`);
    return;
  }

  let html = `<option value="" selected disabled>${defaultText}</option>`;
  const normalized = normalizeList(dataList);

  if (Array.isArray(normalized)) {
    html += normalized
      .map((item) => {
        const val = typeof item === 'object' && item !== null ? item.id : item;
        const txt = typeof item === 'object' && item !== null ? item.name || item.id : item;
        const translatedTxt = typeof A !== 'undefined' && A.Lang && A.Lang.t ? A.Lang.t(txt) : txt;
        return `<option value="${val}">${translatedTxt}</option>`;
      })
      .join('');
  } else {
    warn('fillSelect', `Data for "${elmId}" is not array`, dataList);
  }
  el.innerHTML = html;
}

function setDataList(elmId, dataArray) {
  const el = getE(elmId);
  if (!el) {
    warn('setDataList', `DataList ID "${elmId}" not found`);
    return;
  }

  const normalized = normalizeList(dataArray);
  if (!Array.isArray(normalized)) {
    warn('setDataList', `Data for "${elmId}" is not array`);
    el.innerHTML = '';
    return;
  }
  const uniqueData = [...new Set(normalized.map((item) => (typeof item === 'object' && item !== null ? item.name || item.id : item)).filter((item) => item && String(item).trim() !== ''))];
  el.innerHTML = uniqueData.map((item) => `<option value="${item}">`).join('');
}

// =========================================================================
// ✅ NAMESPACE EXPORTS
// =========================================================================

export const Data = {
  resolveDisplayValue,
  extractFirstItem,
  normalizeList,
  removeVietnameseTones,
  getMany,
  setMany,
};

export const DateUtils = {
  getDateRange,
  isDateInRange,
  parseDateVal,
  formatDateForInput,
  formatDateISO,
  parseInputDate,
  formatDateVN,
};

export const Format = {
  pad2,
  formatPhone,
  formatNumber,
  formatMoney,
  escapeHtml,
};

export const DOM = {
  resolveEls,
  $,
  $$,
  getE,
  getFromEl,
  setToEl,
  getVal,
  setVal,
  setNum,
  getNum,
  getVals,
  setVals,
};

export const UI = {
  setText,
  setHTML,
  setDisplay,
  disable,
  setClass,
  setStyle,
  fillSelect,
  setDataList,
};

export const Log = {
  warn,
};

// =========================================================================
// ✅ BACKWARD COMPATIBILITY (WINDOW ASSIGNMENT)
// =========================================================================

const allUtils = {
  ...Data,
  ...DateUtils,
  ...Format,
  ...DOM,
  ...UI,
  ...Log,
};

Object.entries(allUtils).forEach(([name, fn]) => {
  window[name] = fn;
});

export default {
  Data,
  Date: DateUtils,
  Format,
  DOM,
  UI,
  Log,
};

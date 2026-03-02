/**
 * =========================================================================
 * 9TRIP UTILITIES LIBRARY V2 - ES6 MODULE VERSION
 * "Clean Date" - Tập trung xử lý ngày tháng gọn gàng (YYYY-MM-DD).
 * 
 * Phiên bản cấu trúc: ES6 Module (import/export)
 * Tổ chức: DataController + Utils Objects
 * =========================================================================
 */

// =========================================================================
// 1. GLOBAL CONFIGURATION & CONSTANTS
// =========================================================================

const ERROR_CONFIG = {
  ENABLE_LOGGING: true,
  LOG_TO_STORAGE: true,
  MAX_STORED_ERRORS: 100,
  ERROR_TIMEOUT_MS: 5000,
  STORAGE_KEY: 'app_errors_log',
  CONTEXTS: {}
};

const LOG_CFG = {
  ENABLE: true,
  MAX_UI_LINES: 100,
  STORAGE_PREFIX: 'app_logs_'
};

const HEADER_DICT = [
  { k: 'startdate', t: 'Ngày Đi' }, { k: 'enddate', t: 'Ngày Về' }, { k: 'bookingid', t: 'Mã BK' },
  { k: 'bookingdate', t: 'Ngày Đặt' }, { k: 'createdat', t: 'Ngày Tạo' },
  { k: 'lastupdated', t: 'Ngày Cập Nhật' }, { k: 'paymentdue', t: 'Hạn TT' },
  { k: 'paymenttype', t: 'Loại TT' }, { k: 'surcharge', t: 'Phụ Thu' }, { k: 'sur', t: 'Phụ Thu' },
  { k: 'discount', t: 'Giảm Giá' }, { k: 'dis', t: 'Giảm Giá' },
  { k: 'deposit', t: 'Đặt Cọc' }, { k: 'paidamount', t: 'Đã Trả' }, { k: 'balanceamount', t: 'Còn Lại' },
  { k: 'totalspent', t: 'Tổng Chi Tiêu' }, { k: 'totalamount', t: 'Tổng Tiền' }, { k: 'totalsales', t: 'Tổng BK' }, { k: 'totalcost', t: 'Tổng Chi Phí' }, { k: 'total', t: 'Thành Tiền' },
  { k: 'childprice', t: 'Giá TE' }, { k: 'price', t: 'Giá Tiền' }, { k: 'rate', t: 'Giá Tiền' }, { k: 'cost', t: 'Đơn Giá' },
  { k: 'confirmcode', t: 'Mã Xác Nhận' }, { k: 'customerid', t: 'Mã KH' }, { k: 'customerphone', t: 'SDT Khách' }, { k: 'customername', t: 'Tên Khách' },
  { k: 'customer', t: 'Khách Hàng' }, { k: 'servicetype', t: 'Loại DV' }, { k: 'service', t: 'Dịch Vụ' },
  { k: 'address', t: 'Địa Chỉ' }, { k: 'staff', t: 'Nhân Viên' },
  { k: 'source', t: 'Nguồn' }, { k: 'note', t: 'Ghi Chú' },
  { k: 'status', t: 'Trạng Thái' }, { k: 'fullname', t: 'Họ Tên' },
  { k: 'dob', t: 'Ngày Sinh' }, { k: 'cccd_date', t: 'Ngày Cấp' }, { k: 'idcard', t: 'Số CCCD' }, { k: 'idcarddate', t: 'Ngày Cấp CCCD' },
  { k: 'hotel', t: 'Khách Sạn' }, { k: 'room', t: 'Loại Phòng' },
  { k: 'night', t: 'Đêm' }, { k: 'adult', t: 'Người Lớn' },
  { k: 'child', t: 'Trẻ Em' }, { k: 'children', t: 'Trẻ Em' }, { k: 'quantity', t: 'SL' },
  { k: 'phone', t: 'Số ĐT' }, { k: 'email', t: 'Email' },
  { k: 'checkin', t: 'Ngày Đi' },
  { k: 'checkout', t: 'Ngày Về' },
  { k: 'paymentmethod', t: 'HTTT' }, { k: 'refcode', t: 'Mã Xác Nhận' },
  { k: 'supplierid', t: 'Nhà CC' }, { k: 'supplier', t: 'Nhà CC' }, { k: 'debtbalance', t: 'Phải Trả NCC' },
];

// Library Load Status Cache
const _LibraryLoadStatus = {
  xlsx: {
    urls: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/2.8.0/xlsx.full.min.js',
    loaded: false,
    promise: null,
    check: () => typeof window.XLSX !== 'undefined'
  },
  jspdf: {
    urls: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    loaded: false,
    promise: null,
    check: () => typeof window.jspdf !== 'undefined'
  },
  autotable: {
    urls: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js',
    loaded: false,
    promise: null,
    check: () => {
      if (typeof window.jspdf === 'undefined') return false;
      const doc = new window.jspdf.jsPDF();
      return typeof doc.autoTable === 'function';
    }
  },
  pdfjs: {
    urls: [
      "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js"
    ],
    loaded: false,
    promise: null,
    check: () => typeof window.pdfjsLib !== 'undefined'
  },
  html2pdf: {
    urls: 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
    loaded: false,
    promise: null,
    check: () => typeof window.html2pdf !== 'undefined'
  }
};

// Server Config Cache
let _GAS_SECRETS = null;

// =========================================================================
// 2. ERROR LOGGER - Centralized Error Logging Module
// =========================================================================

const ErrorLogger = {
  stack: [],

  log(error, context = 'UNKNOWN', meta = {}) {
    if (!ERROR_CONFIG.ENABLE_LOGGING) return;

    const errorEntry = {
      id: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      context: context,
      message: error?.message || String(error),
      stack: error?.stack || 'No stack trace',
      severity: meta.severity || 'error',
      data: meta.data || null,
      userAgent: navigator.userAgent
    };

    this.stack.push(errorEntry);
    if (this.stack.length > ERROR_CONFIG.MAX_STORED_ERRORS) {
      this.stack.shift();
    }

    ERROR_CONFIG.CONTEXTS[context] = (ERROR_CONFIG.CONTEXTS[context] || 0) + 1;

    if (ERROR_CONFIG.LOG_TO_STORAGE) {
      this._saveToStorage(errorEntry);
    }

    if (typeof log === 'function') {
      log(`[${context}] ${errorEntry.message}`, errorEntry.severity);
    } else {
      console.error(`[${context}] ❌`, errorEntry.message, error);
    }

    return errorEntry.id;
  },

  _saveToStorage(errorEntry) {
    try {
      let stored = JSON.parse(localStorage.getItem(ERROR_CONFIG.STORAGE_KEY) || '[]');
      stored.push(errorEntry);
      if (stored.length > ERROR_CONFIG.MAX_STORED_ERRORS) {
        stored = stored.slice(-ERROR_CONFIG.MAX_STORED_ERRORS);
      }
      localStorage.setItem(ERROR_CONFIG.STORAGE_KEY, JSON.stringify(stored));
    } catch (e) {
      console.warn('⚠️ Cannot save error to localStorage', e);
    }
  },

  getAll() {
    return [...this.stack];
  },

  getByContext(context) {
    return this.stack.filter(e => e.context === context);
  },

  clear() {
    this.stack = [];
    ERROR_CONFIG.CONTEXTS = {};
    try {
      localStorage.removeItem(ERROR_CONFIG.STORAGE_KEY);
    } catch (e) {
      console.warn('⚠️ Cannot clear localStorage', e);
    }
  },
  export() {
    return {
      exported: new Date().toISOString(),
      errors: this.stack,
      summary: ERROR_CONFIG.CONTEXTS
    };
  }
};

// =========================================================================
// 3. ROW STYLER - CSS Class Generation Module
// =========================================================================

const RowStyler = {
  KEYWORDS: {
    STATUS: ['trạng thái', 'thanh toán', 'tình trạng', 'status'],
    DATE: ['ngày đi', 'check-in', 'ngày đến']
  },

  getClass(row, indices) {
    let classes = [];

    if (indices.statusIdx !== -1) {
      const status = String(row[indices.statusIdx]).toLowerCase();
      if (status.includes('chưa') || status.includes('nợ') || status.includes('đặt lịch')) {
        return 'table-danger';
      }
      if (status.includes('cọc')) {
        classes.push('table-warning');
      }
      if (status.includes('hủy')) {
        classes.push('table-dark');
      }
    }

    if (indices.dateIdx !== -1 && classes.length === 0) {
      const dateVal = row[indices.dateIdx];
      const rowDate = typeof parseDateVN === 'function' ? parseDateVN(dateVal) : new Date(dateVal);

      if (rowDate && !isNaN(rowDate)) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((rowDate - today) / (86400000));

        if (diffDays >= 0 && diffDays <= 3) {
          return 'table-danger';
        } else if (diffDays < 0) {
          return 'table-warning text-muted';
        } else {
          return 'table-info text-muted';
        }
      }
    }

    return classes.join(' ');
  }
};

// =========================================================================
// 4. HELPER FUNCTIONS
// =========================================================================

const pad2 = (n) => String(n).padStart(2, '0');

const warn = (prefix, msg, data) => {
  if (LOG_CFG.ENABLE && typeof log === 'function') {
    log(`%c[${prefix}] ⚠️ ${msg}`, data || '', 'warning');
  } else if (LOG_CFG.ENABLE) {
    console.warn(`[${prefix}] ⚠️ ${msg}`, data || '');
  }
};

// =========================================================================
// 5. DATA CONTROLLER - Xử lý dữ liệu (Get, Set, Format)
// =========================================================================

export const DataController = {
  // ─── DOM RESOLUTION ───
  resolveEls(target, root = document) {
    try {
      if (target === null || target === undefined) return [];

      if (target.nodeType === 1) return [target];

      if (Array.isArray(target) || (typeof NodeList !== 'undefined' && target instanceof NodeList) || (typeof HTMLCollection !== 'undefined' && target instanceof HTMLCollection)) {
        return Array.from(target).filter(el => el && el.nodeType === 1);
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
      if (typeof logError === 'function') logError(`[DOM] resolveEls lỗi: ${target}`, e);
      else console.warn(`[DOM] resolveEls crash:`, e);
      return [];
    }
  },

  $(sel, root = document) {
    const els = this.resolveEls(sel, root);
    return els.length > 0 ? els[0] : null;
  },

  $$(sel, root = document) {
    return this.resolveEls(sel, root);
  },

  getE(input) {
    if (!input) return null;
    if (input.nodeType === 1) return input;
    if (typeof input === 'string') return document.getElementById(input);
    if (typeof log === 'function') log('[DOM] getE: Invalid input type', input);
    return null;
  },

  // ─── VALUE EXTRACTION FROM ELEMENT ───
  getFromEl(el, opt = {}) {
    if (!el) return opt.fallback ?? '';

    try {
      const { trim = true } = opt;
      let val = '';
      const classList = el.classList;
      const tagName = el.tagName;

      if (el.type === 'checkbox') {
        val = el.checked;
      } else if (tagName === 'SELECT' && el.multiple) {
        val = Array.from(el.selectedOptions).map(o => o.value);
      } else if (classList.contains('number') || classList.contains('number-only') || el.type === 'number') {
        const rawVal = (el.dataset.val !== undefined && el.dataset.val !== "") ? el.dataset.val : el.value;
        val = String(rawVal || '').replace(/[^0-9]/g, "");
        return val === '' ? 0 : Number(val);
      } else if (classList.contains('phone_number') || el.type === 'tel') {
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
      if (typeof logError === 'function') logError(`[DOM] getFromEl lỗi ID: ${el.id}`, e);
      else console.error(e);
      return opt.fallback ?? '';
    }
  },

  // ─── VALUE ASSIGNMENT TO ELEMENT ───
  setToEl(el, value) {
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

      if (classList.contains('number') || classList.contains('number-only') || el.type === 'number') {
        this.setNum(el, vRaw);
        return true;
      }

      if (classList.contains('phone_number') || el.type === 'tel') {
        const cleanVal = String(vRaw).replace(/[^0-9]/g, '');
        el.dataset.val = cleanVal;
        el.value = (typeof formatPhone === 'function') ? formatPhone(cleanVal) : cleanVal;
        return true;
      }

      if (el.type === 'checkbox') {
        el.checked = (vRaw === true || String(vRaw).toLowerCase() === 'true' || vRaw == 1);
        return true;
      }
      if (el.type === 'radio') {
        el.checked = (String(el.value) === String(vRaw));
        return true;
      }
      if (el.tagName === 'SELECT' && el.multiple) {
        const list = Array.isArray(vRaw) ? vRaw.map(String) : [String(vRaw)];
        Array.from(el.options).forEach(o => o.selected = list.includes(o.value));
        return true;
      }

      if ('value' in el) {
        el.value = String(vRaw);
        if (typeof vRaw !== 'object') el.dataset.value = String(vRaw);
        return true;
      }

      el.textContent = String(vRaw);
      return true;
    } catch (err) {
      if (typeof logError === 'function') logError(`[DOM] setToEl lỗi`, err);
      else console.error(err);
      return false;
    }
  },

  // ─── MAIN GET/SET FUNCTIONS ───
  getVal(id, root = document, opt = {}) {
    try {
      const el = this.$(id, root);
      if (el) return this.getFromEl(el, opt);

      if (typeof id === 'number') {
        return id;
      }

      return opt.fallback ?? '';
    } catch (err) {
      if (typeof logError === 'function') logError(`[DOM] getVal lỗi`, 'danger');
      return opt.fallback ?? '';
    }
  },

  setVal(id, value, root = document) {
    try {
      const el = this.$(id, root);
      if (!el) {
        if (typeof logError === 'function') logError(`[DOM] setVal: Không tìm thấy ID "${id}"`, 'warning');
        else console.warn(`[DOM] setVal missing: ${id}`);
        return false;
      }
      return this.setToEl(el, value);
    } catch (e) {
      if (typeof logError === 'function') logError(`[DOM] setVal lỗi`, e);
      return false;
    }
  },

  // ─── NUMERIC SPECIALISTS ───
  setNum(idOrEl, val) {
    try {
      const el = this.getE(idOrEl);
      if (!el) return;

      let rawNum = 0;
      if (val !== "" && val !== null && val !== undefined) {
        rawNum = Number(val);
        if (isNaN(rawNum)) rawNum = 0;
      }

      el.dataset.val = rawNum;

      if (el.type === 'number') {
        el.value = rawNum;
      } else {
        el.value = (typeof formatMoney === 'function') ? formatMoney(rawNum) : new Intl.NumberFormat('vi-VN').format(rawNum);
      }
    } catch (e) {
      if (typeof logError === 'function') logError(`[DOM] setNum lỗi`, 'danger');
    }
  },

  getNum(target) {
    try {
      if (typeof target === 'number') return target;

      if (target === null || target === undefined) return 0;

      let rawVal = '';
      let el = this.getE(target);

      if (el) {
        if (el.dataset.val !== undefined && el.dataset.val !== "" && el.dataset.val !== "NaN") {
          return parseFloat(el.dataset.val);
        }
        rawVal = ('value' in el) ? el.value : el.textContent;
      } else {
        rawVal = String(target);
      }

      const cleanStr = rawVal.replace(/[^0-9.-]/g, '');

      if (cleanStr === '' || cleanStr === '-') return 0;

      const num = parseFloat(cleanStr);

      return isNaN(num) ? 0 : num;
    } catch (e) {
      if (typeof logError === 'function') logError(`[DOM] getNum crash`, 'danger');
      return 0;
    }
  },

  /**
   * Parse raw formatted number string to pure number
   * @param {string|number} val - Formatted number (e.g., "1,500,000")
   * @returns {number} - Pure number (1500000)
   */
  getRawVal(val) {
    if (!val) return 0;
    return Number(String(val).replace(/[^0-9-]/g, '')) || 0;
  },

  // ─── BATCH OPERATORS ───
  getVals(target, optOrRoot = {}) {
    try {
      const { root = document, silent = false, ...rest } = (optOrRoot.nodeType === 1 ? { root: optOrRoot } : optOrRoot);
      const els = this.resolveEls(target, root);
      if (!els.length) {
        return [target];
      }
      return els.map(el => this.getFromEl(el, rest));
    } catch (e) {
      return [];
    }
  },

  setVals(target, values, optOrRoot = {}) {
    try {
      const { root = document, keepMissing = false } = (optOrRoot.nodeType === 1 ? { root: optOrRoot } : optOrRoot);
      const els = this.resolveEls(target, root);
      if (!els.length) return 0;

      let count = 0;

      if (!Array.isArray(values)) {
        for (const el of els) {
          if (this.setToEl(el, values)) count++;
        }
      } else {
        els.forEach((el, i) => {
          if (keepMissing && i >= values.length) return;
          if (this.setToEl(el, values[i])) count++;
        });
      }

      return count;
    } catch (e) {
      return 0;
    }
  },

  getMany(spec, optOrRoot = {}) {
    const out = {};
    if (!spec) return out;
    const { root = document } = (optOrRoot.nodeType === 1 ? { root: optOrRoot } : optOrRoot);

    if (Array.isArray(spec)) {
      spec.forEach(id => out[id] = this.getVal(id, root));
      return out;
    }

    for (const [key, conf0] of Object.entries(spec)) {
      if (typeof conf0 === 'string') {
        out[key] = this.getVal(conf0, root);
        continue;
      }

      const { id, sel, selector, mode = 'val', fallback = '', opt: localOpt = {} } = conf0 || {};
      const targetSel = id || sel || selector;

      if (!targetSel) {
        out[key] = fallback;
        continue;
      }

      if (mode === 'vals') out[key] = this.getVals(targetSel, { root, ...localOpt });
      else out[key] = this.getVal(targetSel, root, { fallback, ...localOpt });
    }
    return out;
  },

  setMany(spec, data, optOrRoot = {}) {
    if (!spec || !data) return 0;
    const { root = document } = (optOrRoot.nodeType === 1 ? { root: optOrRoot } : optOrRoot);
    let count = 0;

    if (Array.isArray(spec)) {
      spec.forEach((id, i) => {
        let val = Array.isArray(data) ? data[i] : (typeof data === 'object' ? data[id] : data);
        if (this.setVal(id, val, root)) count++;
      });
      return count;
    }

    for (const [key, conf0] of Object.entries(spec)) {
      const val = data[key];
      if (val === undefined) continue;

      if (typeof conf0 === 'string') {
        if (this.setVal(conf0, val, root)) count++;
        continue;
      }

      const { id, sel, selector, mode = 'val' } = conf0 || {};
      const targetSel = id || sel || selector;

      if (mode === 'vals') {
        const n = this.setVals(targetSel, Array.isArray(val) ? val : [val], { root });
        if (n > 0) count++;
      } else {
        if (this.setVal(targetSel, val, root)) count++;
      }
    }
    return count;
  },

  // ─── TABLE DATA EXTRACTION ───
  async getTableData(tableId) {
    try {
      const table = document.getElementById(tableId);
      if (!table) throw new Error(`Table với ID ${tableId} không tồn tại.`);

      const rows = table.querySelectorAll('tbody tr');
      const dataResult = [];

      rows.forEach((row) => {
        const rowData = {};
        const inputs = row.querySelectorAll('[data-field]');

        let hasData = false;
        inputs.forEach(input => {
          const fieldName = input.dataset.field;
          if (!fieldName) return;

          let value = this.getVal(input);

          rowData[fieldName] = value;

          if (value !== '' && value !== 0 && value !== false) {
            hasData = true;
          }
        });

        if (hasData) {
          dataResult.push(rowData);
          if (typeof log === 'function') log(Object.entries(rowData));
        }
      });

      return dataResult;
    } catch (error) {
      console.error("Lỗi tại DataController.getTableData:", error);
      return [];
    }
  },

  // ─── FORMATTING FUNCTIONS ───
  formatDateForInput(d, inputType = '') {
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
  },

  formatDateISO(d) {
    return this.formatDateForInput(d, 'date');
  },

  parseInputDate(s, inputType = '') {
    if (!s) return null;
    try {
      if (inputType === 'date') {
        const [y, m, d] = s.split('-').map(Number);
        return (y && m && d) ? new Date(y, m - 1, d) : null;
      }
      if (inputType === 'datetime-local') {
        const [datePart, timePart] = s.split('T');
        if (!datePart || !timePart) return null;
        const [y, m, d] = datePart.split('-').map(Number);
        const [hh, mm] = timePart.split(':').map(Number);
        return (y && m && d) ? new Date(y, m - 1, d, hh || 0, mm || 0) : null;
      }
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    } catch (e) {
      warn('parseInputDate', `Lỗi parse ngày "${s}"`, e);
      return null;
    }
  },

  formatPhone(p) {
    let s = String(p).trim();
    if (s && !s.startsWith("'")) return "'" + s;
    return s;
  },

  formatMoney(n) {
    if (n === "" || n === null || n === undefined) return "";
    const num = Number(n);
    if (isNaN(num)) {
      warn('formatMoney', 'Giá trị không phải số:', n);
      return "0";
    }
    return new Intl.NumberFormat('vi-VN').format(num);
  },

  formatDateVN(dateStr) {
    if (!dateStr || typeof dateStr !== 'string' || dateStr.length < 10) return dateStr;
    try {
      const cleanDate = dateStr.split('T')[0];
      const [y, m, d] = cleanDate.split('-');
      return (y && m && d) ? `${d}/${m}/${y}` : dateStr;
    } catch (e) {
      warn('formatDateVN', 'Lỗi format VN:', dateStr);
      return dateStr;
    }
  },

  escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  },

  // ─── ROW HELPERS ───
  extractFirstItem(items) {
    if (!items || !Array.isArray(items) || items.length === 0) return null;
    return items[0];
  },

  getRowValue(row, fieldOrIndex) {
    if (!row) return null;
    if (typeof row === 'object' && !Array.isArray(row)) {
      return row[fieldOrIndex];
    }
    return row[fieldOrIndex];
  },

  setRowValue(row, fieldOrIndex, value) {
    if (!row) return row;
    row[fieldOrIndex] = value;
    return row;
  },

  translateHeaderName(rawName) {
    if (!rawName) return "";
    let key = String(rawName).toLowerCase().replace(/[_\-\s]/g, '');
    if (key.endsWith('s')) key = key.slice(0, -1);

    for (const item of HEADER_DICT) {
      let dictKey = item.k.replace(/[_\-\s]/g, '');
      if (dictKey.endsWith('s')) dictKey = dictKey.slice(0, -1);

      if (key.includes(dictKey)) return item.t;
    }
    return rawName.replace(/[_-]/g, ' ').toUpperCase();
  }
};

// =========================================================================
// 6. UTILS - Các hàm tiện ích còn lại
// =========================================================================

export const Utils = {
  // ─── DOM DISPLAY ───
  setText(idOrEl, text = '') {
    const el = DataController.resolveEls(idOrEl)[0];
    if (!el) {
      warn('setText', `Element "${idOrEl}" not found`);
      return false;
    }
    el.textContent = String(text ?? '');
    return true;
  },

  setHTML(idOrEl, html = '') {
    const el = DataController.resolveEls(idOrEl)[0];
    if (!el) {
      warn('setHTML', `Element "${idOrEl}" not found`);
      return false;
    }
    el.innerHTML = String(html ?? '');
    return true;
  },

  setDisplay(idOrEl, on = true) {
    return this.setClass(idOrEl, 'd-none', !on) > 0;
  },

  disable(idOrEl, on = true) {
    const el = DataController.resolveEls(idOrEl)[0];
    if (!el) {
      warn('disable', `Element "${idOrEl}" not found`);
      return false;
    }
    el.disabled = !!on;
    return true;
  },

  setClass(target, className, on = true, rootOrOpt = {}) {
    const opt = (rootOrOpt.nodeType === 1) ? { root: rootOrOpt } : (rootOrOpt || {});
    const els = DataController.resolveEls(target, opt.root || document);
    if (!els.length) return 0;

    const classes = Array.isArray(className) ? className : String(className).split(/\s+/).filter(Boolean);
    els.forEach(el => classes.forEach(c => el.classList.toggle(c, !!on)));
    return els.length;
  },

  setStyle(target, styles, rootOrOpt = {}) {
    const opt = (rootOrOpt.nodeType === 1) ? { root: rootOrOpt } : (rootOrOpt || {});
    const els = DataController.resolveEls(target, opt.root || document);
    if (!els.length) {
      warn('setStyle', `Target not found:`, target);
      return 0;
    }

    els.forEach(el => {
      if (typeof styles === 'string') {
        el.style.cssText += styles.endsWith(';') ? styles : (styles + ';');
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
  },

  // ─── UI STATE ───
  showLoading(show, text = "Loading...") {
    let el = DataController.getE('loading-overlay');
    if (!el) {
      if (!show) return;
      el = document.createElement('div');
      el.id = 'loading-overlay';
      el.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.8);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;";
      el.innerHTML = `<div class="spinner-border text-warning" role="status" style="width: 2.5rem; height: 2.5rem;"></div><div id="loading-text" class="mt-3 fw-bold text-primary small">${text}</div>`;
      document.body.appendChild(el);
    }
    const textEl = DataController.getE('loading-text');
    if (textEl) textEl.innerText = text;
    el.style.display = show ? 'flex' : 'none';
  },

  setBtnLoading(btnSelector, isLoading, loadingText = "Đang lưu...") {
    const btn = (typeof btnSelector === 'string') ? DataController.getE(btnSelector) : btnSelector;
    if (!btn) {
      warn('setBtnLoading', `Button not found:`, btnSelector);
      return;
    }

    if (isLoading) {
      if (!btn.dataset.original) btn.dataset.original = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm text-danger me-2" role="status" aria-hidden="true"></span>${loadingText}`;
    } else {
      btn.disabled = false;
      if (btn.dataset.original) btn.innerHTML = btn.dataset.original;
    }
  },

  // ─── SELECT & DATALIST ───
  fillSelect(elmId, dataList, defaultText = "Chọn...") {
    const el = DataController.getE(elmId);
    if (!el) {
      warn('fillSelect', `Select ID "${elmId}" not found`);
      return;
    }

    let html = `<option value="" selected disabled>${defaultText}</option>`;
    if (Array.isArray(dataList)) {
      html += dataList.map(item => {
        const val = (typeof item === 'object' && item !== null) ? item.value : item;
        const txt = (typeof item === 'object' && item !== null) ? item.text : item;
        return `<option value="${val}">${txt}</option>`;
      }).join('');
    } else {
      warn('fillSelect', `Data for "${elmId}" is not array`, dataList);
    }
    el.innerHTML = html;
  },

  setDataList(elmId, dataArray) {
    const el = DataController.getE(elmId);
    if (!el) {
      warn('setDataList', `DataList ID "${elmId}" not found`);
      return;
    }

    if (!Array.isArray(dataArray)) {
      warn('setDataList', `Data for "${elmId}" is not array`);
      el.innerHTML = '';
      return;
    }
    const uniqueData = [...new Set(dataArray.filter(Boolean))];
    el.innerHTML = uniqueData.map(item => `<option value="${item}">`).join('');
  },

  // ─── EVENTS & ASYNC ───
  debounce(fn, ms = 300) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  },

  onEvent(target, eventNames, handler, options = {}) {
    const isLazy = (options === true);
    const delegateSelector = isLazy ? target : (options.delegate || null);

    let els = [];

    if (isLazy) {
      els = [document];
    } else {
      try {
        if (!target) {
          console.warn('onEvent', `Target null for "${eventNames}"`);
          return () => { };
        }
        if (typeof target === 'string') els = document.querySelectorAll(target);
        else if (target.nodeType) els = [target];
        else if (target.length) els = target;
      } catch (err) {
        console.error("onEvent Selector error: " + err);
        return () => { };
      }
    }

    if (!els.length) return () => { };

    const events = eventNames.split(' ').filter(e => e.trim());
    const { delegate, ...nativeOpts } = (typeof options === 'object' ? options : {});

    const finalHandler = (e) => {
      if (delegateSelector) {
        const matched = e.target.closest(delegateSelector);

        if (matched && e.currentTarget.contains(matched)) {
          handler.call(matched, e, matched);
        }
      } else {
        handler.call(e.currentTarget, e, e.currentTarget);
      }
    };

    Array.from(els).forEach(el => events.forEach(evt => el.addEventListener(evt, finalHandler, nativeOpts)));

    return () => {
      Array.from(els).forEach(el => events.forEach(evt => el.removeEventListener(evt, finalHandler, nativeOpts)));
    };
  },

  // ─── SERVER COMMUNICATION ───
  async _callServer(funcName, ...args) {
    const reqId = `CS_${Date.now().toString().slice(-6)}`;

    const dbg = (msg, data) => {
      if (LOG_CFG.ENABLE) console.log(msg, data || '');
    };

    dbg(`[${reqId}] 🚀 CALL -> ${funcName}`, args);

    try {
      if (!_GAS_SECRETS) {
        const docSnap = await A.DB.db.collection('app_config').doc('app_secrets').get();
        if (!docSnap.exists) throw new Error("Missing app_secrets");
        _GAS_SECRETS = docSnap.data();
      }
      if (funcName.endsWith('API')) {
        funcName = funcName.slice(0, -3);
      }

      const finalPayload = args.length === 1 ? args[0] : args;
      const requestBody = {
        api_key: _GAS_SECRETS.gas_app_secret,
        mode: (typeof CURRENT_USER !== 'undefined' && CURRENT_USER?.role) ? CURRENT_USER.role : 'guest',
        action: funcName,
        payload: finalPayload
      };

      const response = await fetch(_GAS_SECRETS.gas_app_url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

      const res = await response.json();

      return res;
    } catch (err) {
      const errMsg = err.message || String(err);
      dbg(`❌ [${reqId}] CALL ERROR: ${errMsg}`);
      throw err;
    } finally {
      dbg(`[${reqId}] ✅ CALL COMPLETE: ${funcName}`);
    }
  },

  async requestAPI(funcName, ...args) {
    this.showLoading(true, "Đang xử lý...");

    try {
      const res = await this._callServer(funcName, ...args);

      if (res === undefined || res === null) {
        if (typeof log === 'function') log("Server đã chạy xong ko trả kết quả: ", funcName);
        return null;
      }

      let isSuccess = false;
      if ('success' in res) isSuccess = res.success === true;
      else if ('status' in res) isSuccess = (res.status === true || res.status === 200);
      else return res;

      if (res.message && typeof logA === 'function') logA(res.message, 'success');

      if (isSuccess) {
        const { success, status, message, code, error, ...payload } = res;

        if (payload.data === undefined) payload.data = {};

        return payload;
      } else {
        if (res.status || res.error) {
          if (typeof log === 'function') log(`❌ API Error [${res.code || 'UNKNOWN'}]:`, res.error || res.message, 'error');
        }
        return null;
      }
    } catch (err) {
      const errMsg = err.message || String(err);
      if (typeof logError === 'function') logError(errMsg, err);
      return null;
    } finally {
      this.showLoading(false);
    }
  },

  // ─── LOGGING ───
  log(msg, arg2, arg3) {
    if (!LOG_CFG.ENABLE) return;

    const validTypes = ['info', 'success', 'warning', 'error'];
    let type = 'info';
    let dataDisplay = '';
    let rawData = null;

    if (typeof arg2 === 'string' && validTypes.includes(arg2)) {
      type = arg2;
    } else if (arg2 !== undefined) {
      if (typeof arg2 === 'object') {
        rawData = arg2;
        try {
          dataDisplay = ` <span class="fw-bold text-secondary">[${JSON.stringify(arg2)}...]</span>`;
        } catch (e) {
          dataDisplay = ` [Obj]`;
        }
      } else {
        rawData = arg2;
        dataDisplay = ` <span class="fw-bold">${arg2}</span>`;
      }

      if (typeof arg3 === 'string' && validTypes.includes(arg3)) type = arg3;
    }

    const colorStyle = type === 'error' ? 'red' : (type === 'success' ? 'yellow' : 'white');
    console.log(`%c[${type.toUpperCase()}] ${msg}`, `color:${colorStyle}`, rawData || '');

    const timestamp = new Date().toLocaleTimeString('vi-VN', { hour12: false });
    const logEntry = {
      time: timestamp,
      type: type,
      msg: msg,
      htmlExtra: dataDisplay
    };

    this._saveLogToStorage(logEntry);

    const ul = document.getElementById('log-list');

    if (ul) {
      const li = this._createLogElement(logEntry);
      ul.insertBefore(li, ul.firstChild);

      if (ul.childElementCount > LOG_CFG.MAX_UI_LINES) {
        ul.removeChild(ul.lastElementChild);
      }
    }
  },

  _createLogElement(entry) {
    const iconMap = { success: '✔', warning: '⚠', error: '✘', info: '•' };
    const colorMap = { success: 'text-success', warning: 'text-warning', error: 'text-danger fw-bold', info: 'text-dark' };

    const li = document.createElement('li');
    li.className = `list-group-item py-1 small ${colorMap[entry.type] || 'text-dark'}`;
    li.style.fontSize = '0.8rem';

    li.innerHTML = `<span class="text-muted me-1">${entry.time}</span> <strong>${iconMap[entry.type] || '•'}</strong> ${entry.msg}${entry.htmlExtra || ''}`;
    return li;
  },

  _saveLogToStorage(entry) {
    try {
      const todayKey = this._getLogKey();

      const existingData = localStorage.getItem(todayKey);
      let logs = existingData ? JSON.parse(existingData) : [];

      logs.unshift(entry);

      if (logs.length > 500) logs.length = 500;

      localStorage.setItem(todayKey, JSON.stringify(logs));
    } catch (e) {
      console.warn("Local Storage Full or Error:", e);
      try {
        const prefix = LOG_CFG.STORAGE_PREFIX;
        for (let key in localStorage) {
          if (key.startsWith(prefix)) {
            localStorage.removeItem(key);
          }
        }
        console.log("✅ Đã xóa tất cả log trong localStorage");
      } catch (clearErr) {
        console.error("Lỗi khi xóa localStorage:", clearErr);
      }
    }
  },

  _getLogKey() {
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return LOG_CFG.STORAGE_PREFIX + dateStr;
  },

  restoreLogsFromStorage() {
    const ul = DataController.getE("log-list");
    if (!ul) return;

    if (ul.dataset.restored === "true") return;

    const todayKey = this._getLogKey();
    const raw = localStorage.getItem(todayKey);

    if (raw) {
      const logs = JSON.parse(raw);
      const logsToShow = logs.slice(0, LOG_CFG.MAX_UI_LINES);

      const fragment = document.createDocumentFragment();

      logsToShow.forEach(entry => {
        const li = this._createLogElement(entry);
        fragment.appendChild(li);
      });
      const divider = document.createElement('li');
      divider.className = 'list-group-item text-center fw-bold text-info small';
      divider.style.fontSize = '1rem';
      divider.textContent = '-------------------- LOG MỚI ----------------------';
      fragment.appendChild(divider);

      ul.appendChild(fragment);
    }
    ul.dataset.restored = "true";
  },

  clearLog() {
    try {
      const prefix = LOG_CFG.STORAGE_PREFIX;
      for (let key in localStorage) {
        if (key.startsWith(prefix)) {
          localStorage.removeItem(key);
        }
      }
      const ul = DataController.getE('log-list');
      if (ul) ul.innerHTML = '';
      this.log('✅ Đã xóa tất cả log trong localStorage', 'info');
    } catch (e) {
      console.error("Lỗi khi xóa log:", e);
    }
  },

  logA(message, type = 'info', callback = null, ...args) {
    if (typeof this.log === 'function') this.log(message, type);

    const BG_CLASSES = ['bg-primary', 'bg-success', 'bg-danger', 'bg-warning', 'bg-info', 'bg-dark', 'bg-light', 'bg-white'];

    const configMap = {
      info: { icon: 'fa-circle-info', color: 'text-primary', title: 'Thông báo', titleClass: ['bg-primary', 'text-white', 'fw-bold'] },
      success: { icon: 'fa-circle-check', color: 'text-success', title: 'Thành công', titleClass: 'bg-success' },
      error: { icon: 'fa-circle-xmark', color: 'text-danger', title: 'Lỗi', titleClass: 'bg-danger' },
      danger: { icon: 'fa-circle-xmark', color: 'text-danger', title: 'Nguy hiểm', titleClass: 'bg-danger' },
      warning: { icon: 'fa-triangle-exclamation', color: 'text-warning', title: 'Cảnh báo', titleClass: 'bg-warning' }
    };

    const cfg = configMap[type] || configMap['info'];
    const safeMsg = DataController.escapeHtml(message).replace(/\n/g, '<br>');

    if (callback) {
      const headerEl = DataController.getE('custom-overlay-header');
      if (headerEl) {
        headerEl.classList.remove(...BG_CLASSES);
        headerEl.classList.add(cfg.titleClass);
      }

      const uid = Date.now();
      const html = `
        <div class="text-center p-3">
          <div class="mb-3 ${cfg.color}"><i class="fa-solid ${cfg.icon} fa-4x animate__animated animate__bounceIn"></i></div>
          <h5 class="fw-bold ${cfg.color} text-uppercase">${cfg.title}</h5>
          <p class="text-secondary fs-6 my-2">${safeMsg}</p>
          <div class="d-flex justify-content-center gap-2 m-4">
              <button id="btn-ok-${uid}" class="btn btn-info w-50">OK</button>
              <button id="btn-cancel-${uid}" class="btn btn-secondary w-50">Cancel</button>                    
          </div>
        </div>`;

      return new Promise(resolve => {
        if (this.showOverlay('9 Trip Phu Quoc @2026', html)) {
          const btnOk = DataController.getE(`btn-ok-${uid}`);
          const btnCancel = DataController.getE(`btn-cancel-${uid}`);
          const close = (res) => {
            this.closeOverlay();
            if (res && typeof callback === 'function') callback(...args);
            resolve(res);
          };
          if (btnOk) {
            btnOk.focus();
            btnOk.onclick = () => close(true);
          }
          if (btnCancel) btnCancel.onclick = () => close(false);
        } else {
          alert(message);
          if (typeof callback === 'function') callback(...args);
          resolve(true);
        }
      });
    } else {
      const toastE = DataController.getE('liveToast');
      if (!toastE) {
        warn('logA', 'Toast element not found');
        return;
      }
      const header = DataController.$('.toast-header');
      if (header) {
        header.classList.remove(...BG_CLASSES);
        this.setClass(header, cfg.titleClass);
      }
      const body = DataController.getE('toast-body');
      const html = `<div class="mb-2 ${cfg.color}"><i class="fa-solid ${cfg.icon} fa-2x animate__animated animate__bounceIn"></i></div>
                  <span class="text-secondary text-wrap fs-6 my-2">${safeMsg}</span>`;
      body.innerHTML = html;
      const toastBootstrap = bootstrap.Toast.getOrCreateInstance(toastE);

      toastBootstrap.show();
    }
  },

  logError(p1, p2) {
    if (typeof p1 === 'string' && !p2) {
      this.log(`ℹ️ [ERROR]: ${p1}`, "error");
      return;
    }
    let msg = "";
    let e = null;

    if (typeof p1 === 'string') {
      msg = p1;
      e = p2;
    } else {
      e = p1;
      if (typeof p2 === 'string') {
        msg = p2;
      }
    }

    msg = msg ? String(msg) : "Lỗi không xác định";

    let errorDetail = "";
    if (e) {
      if (e instanceof Error) {
        errorDetail = `\n[Name]: ${e.name}\n[Message]: ${e.message}\n[Stack]: ${e.stack}`;
      } else if (typeof e === 'object') {
        try {
          errorDetail = JSON.stringify(e);
        } catch (err) {
          errorDetail = String(e);
        }
      } else {
        errorDetail = String(e);
      }
    }

    const timestamp = new Date().toLocaleString("vi-VN");
    const finalLog = `[${timestamp}] ❌ ERROR: ${msg} ${errorDetail}`;

    console.error(finalLog);
    this.logA(finalLog);
  },

  showOverlay(title = '', htmlContent = '') {
    const elOverlay = DataController.getE('custom-overlay');
    const elTitle = DataController.getE('overlay-title');
    const elBody = DataController.getE('overlay-body');
    if (!elOverlay || !elBody) {
      warn('showOverlay', 'Overlay elements missing');
      return false;
    }

    if (elTitle) elTitle.textContent = title;
    elBody.innerHTML = htmlContent;
    elOverlay.style.display = 'block';
    return true;
  },

  closeOverlay() {
    const el = DataController.getE('custom-overlay');
    if (el) el.style.display = 'none';
  },

  logA(msg, isSuccess = true) {
    this.logA(msg, isSuccess ? 'success' : 'error');
  },

  toggleFullScreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.log(`Lỗi khi bật Fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  },

  // ─── ROLE-BASED EXECUTION ───
  runFnByRole(baseFuncName, ...args) {
    let targetFuncName;
    if (typeof CURRENT_USER === 'undefined' || !CURRENT_USER.role) {
      this.logError("❌ [runFnByRole] Không tìm thấy thông tin Role (CURRENT_USER chưa init).");
      targetFuncName = baseFuncName;
    } else {
      const rawRole = CURRENT_USER.role;
      const roleSuffix = rawRole.charAt(0).toUpperCase() + rawRole.slice(1).toLowerCase();
      targetFuncName = `${baseFuncName}_${roleSuffix}`;
      this.log(`🔍 [AutoRun] Tìm hàm theo Role: ${targetFuncName}`);
    }

    if (typeof window[targetFuncName] === 'function') {
      this.log(`🚀 [AutoRun] Đang chạy hàm: ${targetFuncName}(...)`);
      try {
        return window[targetFuncName](...args);
      } catch (err) {
        this.logError(`❌ [AutoRun] Hàm ${targetFuncName} bị lỗi khi chạy:`, err);
      }
    } else {
      warn(`⚠️ [AutoRun] Không tìm thấy hàm riêng: ${targetFuncName}.`);

      if (typeof window[baseFuncName] === 'function') {
        this.log(`↪️ [Fallback] Chạy hàm gốc mặc định: ${baseFuncName}(...)`);
        return window[baseFuncName](...args);
      }
    }
  },

  // ─── LIBRARY LOADING ───
  async loadLibraryAsync(libName) {
    const libConfig = _LibraryLoadStatus[libName];
    if (!libConfig) {
      this.logError(`❌ loadLibraryAsync: Unknown library [${libName}]`);
      return false;
    }

    if (libConfig.loaded === true) {
      return true;
    }

    if (libConfig.promise instanceof Promise) {
      return await libConfig.promise;
    }

    const promise = (async () => {
      try {
        if (libConfig.check()) {
          this.log(`✅ Library [${libName}] already loaded`, 'success');
          return true;
        }

        const urlsToLoad = Array.isArray(libConfig.urls)
          ? libConfig.urls
          : [libConfig.urls];

        this.log(`📥 Loading library [${libName}] (${urlsToLoad.length} file${urlsToLoad.length > 1 ? 's' : ''})...`, 'info');

        const loadPromises = urlsToLoad.map(url => {
          return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = url;
            script.async = true;

            script.onload = () => {
              this.log(`✅ Loaded: ${url.split('/').pop()}`, 'success');
              resolve(true);
            };

            script.onerror = () => {
              this.logError(`❌ Failed to load: ${url}`);
              resolve(false);
            };

            document.head.appendChild(script);
          });
        });

        const results = await Promise.all(loadPromises);

        const allSuccess = results.every(r => r === true);

        if (allSuccess && libConfig.check()) {
          this.log(`✅ Library [${libName}] loaded successfully`, 'success');
          return true;
        } else {
          this.logError(`❌ Library [${libName}] loaded but check failed`);
          return false;
        }
      } catch (err) {
        this.logError(`❌ Error loading library [${libName}]:`, err);
        return false;
      }
    })();

    libConfig.promise = promise;

    const result = await promise;
    libConfig.loaded = result;
    libConfig.promise = null;
    return result;
  },

  preloadExportLibraries() {
    Promise.all([
      this.loadLibraryAsync('xlsx'),
      this.loadLibraryAsync('jspdf'),
      this.loadLibraryAsync('autotable')
    ]).then(() => {
      this.log('📦 All export libraries pre-loaded', 'success');
    });
  },

  // ─── DATA EXPORT ───
  downloadTableData_Csv(tableId, fileName = 'table_data.csv') {
    const table = DataController.getE(tableId);
    if (!table) {
      this.logError(`❌ Table with ID "${tableId}" not found.`);
      return;
    }
    let csvContent = '';
    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
      const cols = row.querySelectorAll('th, td');
      const rowData = Array.from(cols).map(col => `"${col.innerText.replace(/"/g, '""')}"`).join(',');
      csvContent += rowData + '\n';
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  async downloadTableData(exportData, type = 'pdf', fileName = 'export_data', viewText = 'Dữ liệu xuất file') {
    try {
      if (type === 'excel') {
        const isXlsxReady = await this.loadLibraryAsync('xlsx');
        if (!isXlsxReady) {
          throw new Error("❌ Không thể tải thư viện XLSX. Vui lòng kiểm tra kết nối internet.");
        }

        this.showLoading(true, "Đang tạo file Excel...");
        const wb = window.XLSX.utils.book_new();
        const ws = window.XLSX.utils.json_to_sheet(exportData);
        const wscols = Object.keys(exportData[0] || {}).map(() => ({ wch: 15 }));
        ws['!cols'] = wscols;
        window.XLSX.utils.book_append_sheet(wb, ws, "Data");
        window.XLSX.writeFile(wb, `${fileName}.xlsx`);
        this.showLoading(false);
      } else {
        const isJspdfReady = await this.loadLibraryAsync('jspdf');
        if (!isJspdfReady) {
          throw new Error("❌ Không thể tải thư viện jsPDF. Vui lòng kiểm tra kết nối internet.");
        }

        const isAutotableReady = await this.loadLibraryAsync('autotable');
        if (!isAutotableReady) {
          throw new Error("❌ Không thể tải plugin autoTable. Vui lòng kiểm tra kết nối internet.");
        }

        this.showLoading(true, "Đang tạo file PDF...");

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape' });

        doc.setFont('arial', 'normal');

        const headers = [Object.keys(exportData[0] || {})];
        const body = exportData.map(obj => Object.values(obj));
        doc.setFontSize(10);
        doc.text(`BÁO CÁO: ${viewText}`, 14, 15);
        doc.text(`Ngày xuất: ${new Date().toLocaleString('vi-VN')}`, 14, 20);
        doc.autoTable({
          head: headers,
          body: body,
          startY: 25,
          theme: 'grid',
          styles: {
            font: 'arial',
            fontSize: 8,
            cellPadding: 2,
            overflow: 'linebreak'
          },
          headStyles: {
            fillColor: [44, 62, 80],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            font: 'arial'
          },
          margin: { left: 10, right: 10 }
        });
        doc.save(`${fileName}.pdf`);
        this.showLoading(false);
      }
      if (typeof this.logA === 'function') this.logA("Đã xuất file thành công!", true);
    } catch (err) {
      this.showLoading(false);
      this.logError(err);
      alert("Lỗi khi xuất file: " + err.message);
    }
  },

  // ─── RESOURCE LOADING ───
  getHtmlContent(url) {
    return new Promise((resolve, reject) => {
      let finalSourcePath = url;

      if (url.endsWith('.html') && !url.includes('/')) {
        finalSourcePath = './src/components/' + url;
      }
      fetch(finalSourcePath)
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.text();
        })
        .then(html => {
          this.log(`✅ HTML content loaded from: ${finalSourcePath}`, 'success');
          resolve(html);
        })
        .catch(err => {
          this.logError(`❌ Failed to load HTML content from: ${finalSourcePath}`, err);
          reject(err);
        });
    });
  },

  async loadJSFile(filePath, targetIdorEl = null) {
    if (!targetIdorEl) {
      targetIdorEl = document.body;
    } else if (typeof targetIdorEl === 'string') {
      const el = DataController.getE(targetIdorEl);
      if (el) targetIdorEl = el;
      else {
        this.logError(`❌ Target element not found for loadJSFile: ${targetIdorEl}`);
        return Promise.reject(new Error(`Target element not found: ${targetIdorEl}`));
      }
    }
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = filePath;
      targetIdorEl.appendChild(s);
      s.onload = () => {
        this.log(`✅ JS File loaded: ${filePath}`);
        resolve();
      };
      s.onerror = () => {
        this.logError(`❌ Failed to load JS file: ${filePath}`);
        reject(new Error(`Failed to load JS file: ${filePath}`));
      };
    });
  },

  async loadJSForRole(userRole, baseFilePath = './src/js/') {
    if (!userRole) {
      this.log('⚠ loadJSForRole: No user role provided', 'warning');
      return Promise.resolve();
    }

    const fileNames = JS_MANIFEST[userRole] || [];
    if (fileNames.length === 0) {
      this.log(`⚠ loadJSForRole: No files found for role [${userRole}]`, 'warning');
      return Promise.resolve();
    }

    const loadPromises = fileNames.map(fname => {
      const path = baseFilePath + fname;
      return this.loadJSFile(path).catch(err => {
        this.logError(`❌ Error loading JS for role ${userRole}, file ${fname}:`, err);
        return null;
      });
    });

    try {
      await Promise.all(loadPromises);
      this.log(`✅ All JS files loaded for role [${userRole}]`, 'success');
      return true;
    } catch (err) {
      this.logError(`❌ Error in loadJSForRole:`, err);
      return false;
    }
  },

  reloadPage(url) {
    if (!url) {
      A.DB.stopNotificationsListener(); // Hủy tất cả subscription trước khi reload
      window.location.reload();
    } else {
      window.location.href = url;
    }
  }
};

// =========================================================================
// 7. EXPORTS
// =========================================================================

export { ErrorLogger, RowStyler, HEADER_DICT, ERROR_CONFIG, LOG_CFG };

// Default export for convenience
export default {
  DataController,
  Utils,
  ErrorLogger,
  RowStyler,
  HEADER_DICT,
  ERROR_CONFIG,
  LOG_CFG
};

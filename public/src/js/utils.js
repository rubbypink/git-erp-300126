/**
 * =========================================================================
 * 9TRIP UTILITIES LIBRARY - DATE OPTIMIZED VERSION
 * "Clean Date" - Tập trung xử lý ngày tháng gọn gàng (YYYY-MM-DD).
 * =========================================================================
 */
/**
 * =========================================================================
 * ERROR HANDLER UTILITY - Global Error Management
 * Purpose: Prevents errors from crashing the application
 * =========================================================================
 *
 * Features:
 * - Safe function wrappers (async/sync)
 * - Safe DOM operations
 * - Safe API calls
 * - Centralized error logging
 * - Error recovery patterns
 *
 * Load Order: EARLY (after utils.js and before main.js)
 */

/**
 * =========================================================================
 * 1. GLOBAL ERROR CONFIGURATION
 * =========================================================================
 */
const ERROR_CONFIG = {
  ENABLE_LOGGING: true,
  LOG_TO_STORAGE: true,
  MAX_STORED_ERRORS: 100,
  ERROR_TIMEOUT_MS: 5000,
  STORAGE_KEY: 'app_errors_log',
  CONTEXTS: {}, // Track error contexts {functionName: count}
};

/**
 * =========================================================================
 * 2. ERROR LOGGER - Centralized Error Logging
 * =========================================================================
 */
const ErrorLogger = {
  stack: [],

  /**
   * Log error with context and metadata
   * @param {Error|string} error - Error object or message
   * @param {string} context - Where error occurred (function/module name)
   * @param {object} meta - Additional metadata {severity, data}
   */
  log: function (error, context = 'UNKNOWN', meta = {}) {
    if (!ERROR_CONFIG.ENABLE_LOGGING) return;

    const errorEntry = {
      id: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      context: context,
      message: error?.message || String(error),
      stack: error?.stack || 'No stack trace',
      severity: meta.severity || 'error',
      data: meta.data || null,
      userAgent: navigator.userAgent,
    };

    // Add to memory stack
    this.stack.push(errorEntry);
    if (this.stack.length > ERROR_CONFIG.MAX_STORED_ERRORS) {
      this.stack.shift();
    }

    // Count errors by context
    ERROR_CONFIG.CONTEXTS[context] = (ERROR_CONFIG.CONTEXTS[context] || 0) + 1;

    // Log to storage
    if (ERROR_CONFIG.LOG_TO_STORAGE) {
      this._saveToStorage(errorEntry);
    }

    // Log to console (DEV only)
    if (typeof log === 'function') {
      log(`[${context}] ${errorEntry.message}`, errorEntry.severity);
    } else {
      console.error(`[${context}] ❌`, errorEntry.message, error);
    }

    return errorEntry.id;
  },

  /**
   * Save error to localStorage for later analysis
   */
  _saveToStorage: function (errorEntry) {
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

  /**
   * Get all logged errors from memory
   */
  getAll: function () {
    return [...this.stack];
  },

  /**
   * Get errors by context
   */
  getByContext: function (context) {
    return this.stack.filter((e) => e.context === context);
  },

  /**
   * Clear error log
   */
  clear: function () {
    this.stack = [];
    ERROR_CONFIG.CONTEXTS = {};
    try {
      localStorage.removeItem(ERROR_CONFIG.STORAGE_KEY);
    } catch (e) {
      console.warn('⚠️ Cannot clear localStorage', e);
    }
  },

  /**
   * Export errors as JSON
   */
  export: function () {
    return {
      exported: new Date().toISOString(),
      errors: this.stack,
      summary: ERROR_CONFIG.CONTEXTS,
    };
  },
};

const LOG_CFG = {
  ENABLE: true,
  MAX_UI_LINES: 100, // Chỉ hiển thị tối đa 100 dòng trên màn hình
  STORAGE_PREFIX: 'app_logs_',
};

// =========================================================================
// ✅ NEW: OBJECT-ARRAY CONVERSION HELPERS
// =========================================================================

/**
 * Convert array of objects to simple object format
 * Useful for form handling: Convert [{ id, name, phone }] → { id, name, phone }
 */
function extractFirstItem(items) {
  if (!items || !Array.isArray(items) || items.length === 0) return null;
  return items[0];
}

const warn = (prefix, msg, data) => {
  if (LOG_CFG.DEBUG_MODE) {
    console.warn(`%c[${prefix}] ⚠️ ${msg}`, 'color:orange; font-weight:bold;', data || '');
    log(`%c[${prefix}] ⚠️ ${msg}`, data || '', 'warning');
  }
};

/**
 * MODULE: RowStyler
 * Nhiệm vụ: Trả về CSS Class cho dòng dựa trên dữ liệu
 */
const RowStyler = {
  // Config các từ khóa để nhận diện cột (Mapping theo Tiếng Việt đã dịch)
  KEYWORDS: {
    STATUS: ['trạng thái', 'thanh toán', 'tình trạng', 'status'],
    DATE: ['ngày đi', 'check-in', 'ngày đến'],
  },

  /**
   * Hàm main quyết định class cho dòng
   * @param {Array} row - Dữ liệu 1 dòng
   * @param {Object} indices - Object chứa index các cột quan trọng { statusIdx, dateIdx }
   */
  getClass: function (row, indices) {
    let classes = [];

    // 1. LOGIC THEO TRẠNG THÁI THANH TOÁN
    if (indices.statusIdx !== -1) {
      const status = String(row[indices.statusIdx]).toLowerCase();
      if (status.includes('chưa') || status.includes('nợ') || status.includes('đặt lịch')) {
        return 'table-danger'; // Ưu tiên cao nhất: Đỏ (Chưa trả tiền)
      }
      if (status.includes('cọc')) {
        classes.push('table-warning');
      }
      if (status.includes('hủy')) {
        classes.push('table-dark');
      }
    }

    // 2. LOGIC THEO NGÀY (Chỉ chạy nếu chưa bị set màu đỏ)
    if (indices.dateIdx !== -1 && classes.length === 0) {
      const dateVal = row[indices.dateIdx];
      // Giả định dateVal là string chuẩn hoặc Date object. Cần parse nếu là string VN.
      // Ở đây dùng helper parseDateVN (đã có trong hệ thống của bạn) hoặc new Date()
      const rowDate = typeof parseDateVN === 'function' ? parseDateVN(dateVal) : new Date(dateVal);

      if (rowDate && !isNaN(rowDate)) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((rowDate - today) / 86400000);

        if (diffDays >= 0 && diffDays <= 3) {
          return 'table-danger'; // Sắp đi trong 3 ngày: đỏ
        } else if (diffDays < 0) {
          return 'table-warning text-muted';
        } else return 'table-info text-muted';
      }
    }

    return classes.join(' ');
  },
};

const HEADER_DICT = [
  { k: 'startdate', t: 'Ngày Đi' },
  { k: 'enddate', t: 'Ngày Về' },
  { k: 'bookingid', t: 'Mã BK' },
  { k: 'bookingdate', t: 'Ngày Đặt' },
  { k: 'createdat', t: 'Ngày Tạo' },
  { k: 'lastupdated', t: 'Ngày Cập Nhật' },
  { k: 'paymentdue', t: 'Hạn TT' },
  { k: 'paymenttype', t: 'Loại TT' },
  { k: 'surcharge', t: 'Phụ Thu' },
  { k: 'sur', t: 'Phụ Thu' },
  { k: 'discount', t: 'Giảm Giá' },
  { k: 'dis', t: 'Giảm Giá' },
  { k: 'deposit', t: 'Đặt Cọc' },
  { k: 'paidamount', t: 'Đã Trả' },
  { k: 'balanceamount', t: 'Còn Lại' },
  { k: 'totalspent', t: 'Tổng Chi Tiêu' },
  { k: 'totalamount', t: 'Tổng Tiền' },
  { k: 'totalsales', t: 'Tổng BK' },
  { k: 'totalcost', t: 'Tổng Chi Phí' },
  { k: 'total', t: 'Thành Tiền' },
  { k: 'childprice', t: 'Giá TE' },
  { k: 'price', t: 'Giá Tiền' },
  { k: 'rate', t: 'Giá Tiền' },
  { k: 'cost', t: 'Đơn Giá' },
  { k: 'confirmcode', t: 'Mã Xác Nhận' },
  { k: 'customerid', t: 'Mã KH' },
  { k: 'customerphone', t: 'SDT Khách' },
  { k: 'customername', t: 'Tên Khách' },
  { k: 'customer', t: 'Khách Hàng' },
  { k: 'servicetype', t: 'Loại DV' },
  { k: 'service', t: 'Dịch Vụ' },
  { k: 'address', t: 'Địa Chỉ' },
  { k: 'staff', t: 'Nhân Viên' },
  { k: 'source', t: 'Nguồn' },
  { k: 'note', t: 'Ghi Chú' },
  { k: 'status', t: 'Trạng Thái' },
  { k: 'fullname', t: 'Họ Tên' },
  { k: 'dob', t: 'Ngày Sinh' },
  { k: 'cccd_date', t: 'Ngày Cấp' },
  { k: 'idcard', t: 'Số CCCD' },
  { k: 'idcarddate', t: 'Ngày Cấp CCCD' },
  { k: 'hotel', t: 'Khách Sạn' },
  { k: 'room', t: 'Loại Phòng' },
  { k: 'night', t: 'Đêm' },
  { k: 'adult', t: 'Người Lớn' },
  { k: 'child', t: 'Trẻ Em' },
  { k: 'children', t: 'Trẻ Em' },
  { k: 'quantity', t: 'SL' },
  { k: 'phone', t: 'Số ĐT' },
  { k: 'email', t: 'Email' },
  // 1. Nhóm Ngày tháng (Cụ thể trước)
  { k: 'checkin', t: 'Ngày Đi' },
  { k: 'checkout', t: 'Ngày Về' },
  { k: 'paymentmethod', t: 'HTTT' },
  { k: 'refcode', t: 'Mã Xác Nhận' },
  { k: 'supplierid', t: 'Nhà CC' },
  { k: 'supplier', t: 'Nhà CC' },
  { k: 'debtbalance', t: 'Phải Trả NCC' },
];

function translateHeaderName(rawName) {
  if (!rawName) return '';
  let key = String(rawName)
    .toLowerCase()
    .replace(/[_\-\s]/g, '');
  // ✅ Loại bỏ chữ 's' ở cuối nếu có (plural -> singular)
  if (key.endsWith('s')) key = key.slice(0, -1);

  for (const item of HEADER_DICT) {
    let dictKey = item.k.replace(/[_\-\s]/g, '');
    // ✅ Cũng loại bỏ 's' ở cuối từ dictionary
    if (dictKey.endsWith('s')) dictKey = dictKey.slice(0, -1);

    if (key.includes(dictKey)) return item.t;
  }
  return rawName.replace(/[_-]/g, ' ').toUpperCase();
}

/* =========================
 * 3. FORMATTING UTILITIES (ĐÃ TỐI ƯU NGÀY THÁNG)
 * ========================= */

/**
 * 9 TRIP ERP HELPER: SMART DATE PARSER
 * Chức năng: Nhận diện ngôn ngữ tự nhiên để trả về khoảng thời gian
 * @param {string} textInput - "Tháng 1", "Tuần trước", "Quý 3", "Hôm qua"...
 */
function getDateRange(textInput) {
  if (!textInput) return null;

  // 1. Chuẩn hóa đầu vào: chữ thường, bỏ khoảng trắng thừa
  const text = textInput.toLowerCase().trim();
  const now = new Date();

  // Mặc định start, end là hôm nay
  let start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let end = new Date(start);

  // Helper: Lấy số từ chuỗi (VD: "Tháng 12" -> 12)
  const getNum = () => parseInt(text.match(/\d+/)?.[0] || 0);

  // --- LOGIC XỬ LÝ ---

  // A. NHÓM NGÀY (Hôm qua, Hôm nay, Ngày mai)
  if (text.includes('qua')) {
    // Hôm qua
    start.setDate(now.getDate() - 1);
    end.setDate(now.getDate() - 1);
  } else if (text.includes('mai')) {
    // Ngày mai
    start.setDate(now.getDate() + 1);
    end.setDate(now.getDate() + 1);
  }
  // B. NHÓM THÁNG (Tháng 1 -> 12)
  else if (text.startsWith('tháng')) {
    const month = getNum() - 1; // JS tính tháng từ 0
    start = new Date(now.getFullYear(), month, 1);
    end = new Date(now.getFullYear(), month + 1, 0); // Ngày cuối tháng
  }
  // C. NHÓM QUÝ (Quý 1 -> 4)
  else if (text.startsWith('quý')) {
    const q = getNum();
    const startMonth = (q - 1) * 3;
    start = new Date(now.getFullYear(), startMonth, 1);
    end = new Date(now.getFullYear(), startMonth + 3, 0);
  }
  // D. NHÓM TUẦN (Tuần này, Tuần trước, Tuần tới)
  else if (text.includes('tuần')) {
    const day = now.getDay(); // 0 (CN) -> 6 (T7)
    const diffToMon = (day === 0 ? -6 : 1) - day; // Tìm thứ 2

    // Xác định offset tuần
    let weekOffset = 0;
    if (text.includes('trước') || text.includes('ngoái')) weekOffset = -7;
    if (text.includes('tới') || text.includes('sau')) weekOffset = 7;

    start.setDate(now.getDate() + diffToMon + weekOffset); // Thứ 2
    end = new Date(start);
    end.setDate(start.getDate() + 6); // Chủ nhật
  }
  // E. NHÓM NĂM (Năm nay, Năm ngoái, Năm tới)
  else if (text.includes('năm')) {
    let year = now.getFullYear();
    if (text.includes('trước') || text.includes('ngoái')) year -= 1;
    if (text.includes('tới') || text.includes('sau')) year += 1;

    start = new Date(year, 0, 1);
    end = new Date(year, 11, 31);
  }

  // F. CHỐT HẠ: Ép giờ cho đúng chuẩn Database (00:00:00 -> 23:59:59)
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}
/**
 * 9 TRIP ERP HELPER: DATE CHECKER
 * Chức năng: Kiểm tra 1 ngày có nằm trong khoảng Start-End không
 * @param {Date|Object|string} dateCheck - Ngày cần kiểm tra (nhận cả Timestamp Firebase)
 * @param {Object} range - { start: Date, end: Date } lấy từ hàm getDateRange
 */
const isDateInRange = (dateCheck, range) => {
  if (!dateCheck || !range) return false;

  let target = dateCheck;

  // 1. Xử lý Firebase Timestamp (có thuộc tính .toDate())
  if (typeof dateCheck.toDate === 'function') {
    target = dateCheck.toDate();
  }
  // 2. Xử lý chuỗi (String) hoặc Timestamp số
  else if (!(dateCheck instanceof Date)) {
    target = new Date(dateCheck);
  }

  // 3. So sánh (Dùng getTime để chính xác tuyệt đối từng milisecond)
  return target.getTime() >= range.start.getTime() && target.getTime() <= range.end.getTime();
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

// ✅ UPDATED: Hàm này giờ mặc định trả về YYYY-MM-DD
function formatDateForInput(d, inputType = '') {
  if (!d) return '';
  // Nếu d là chuỗi, thử convert sang Date
  if (typeof d === 'string') {
    // Nếu chuỗi đã chuẩn YYYY-MM-DD thì trả về luôn để tránh lỗi múi giờ
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

  // Chỉ lấy giờ phút nếu input yêu cầu datetime-local
  if (inputType === 'datetime-local') {
    const hh = pad2(d.getHours());
    const mm = pad2(d.getMinutes());
    return `${y}-${m}-${day}T${hh}:${mm}`;
  }

  // Mặc định trả về YYYY-MM-DD (Bỏ giờ phút giây)
  return `${y}-${m}-${day}`;
}

// ✅ NEW: Hàm chuyên dùng để chuẩn hóa dữ liệu trước khi gửi lên Firebase
function formatDateISO(d) {
  return formatDateForInput(d, 'date'); // Luôn trả về YYYY-MM-DD
}

function parseInputDate(s, inputType = '') {
  if (!s) return null;
  try {
    // Nếu input chỉ là ngày, set giờ về 00:00:00
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

// --- C. CHUẨN HÓA DỮ LIỆU ---
// Ép SĐT về dạng Text có ' ở đầu
function formatPhone(p) {
  let s = String(p).trim();
  if (s && !s.startsWith("'")) return "'" + s;
  return s;
}

function formatMoney(n) {
  if (n === '' || n === null || n === undefined) return '';
  const num = Number(n);
  if (isNaN(num)) {
    warn('formatMoney', 'Giá trị không phải số:', n);
    return '0';
  }
  return new Intl.NumberFormat('vi-VN').format(num);
}

function formatDateVN(dateStr) {
  if (!dateStr || typeof dateStr !== 'string' || dateStr.length < 10) return dateStr;
  try {
    // Cắt bỏ phần giờ nếu có (VD: 2024-01-01T12:00 -> 2024-01-01)
    const cleanDate = dateStr.split('T')[0];
    const [y, m, d] = cleanDate.split('-');
    return y && m && d ? `${d}/${m}/${y}` : dateStr;
  } catch (e) {
    warn('formatDateVN', 'Lỗi format VN:', dateStr);
    return dateStr;
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]
  );
}

/* =========================
 * 4. UI MANIPULATION
 * ========================= */

function setText(idOrEl, text = '') {
  const el = resolveEls(idOrEl);
  if (!el) {
    warn('setText', `Element "${idOrEl}" not found`);
    return false;
  }
  el.textContent = String(text ?? '');

  return true;
}

function setHTML(idOrEl, html = '') {
  const el = resolveEls(idOrEl);
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
  const el = resolveEls(idOrEl);
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

  const classes = Array.isArray(className)
    ? className
    : String(className).split(/\s+/).filter(Boolean);
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

/**
 * 9 TRIP ERP HELPER: ELASTIC ELEMENT
 * Chức năng: Ép element co lại để luôn nằm trong Viewport, tự sinh scroll nội bộ.
 * @param {string|HTMLElement} target - ID hoặc Element cần xử lý
 * @param {number} padding - Khoảng cách an toàn đáy (mặc định 20px cho Mobile)
 */
const fitToViewport = (target, padding = 20) => {
  try {
    const el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el) return;

    // --- BƯỚC 1: FIT SIZE (Giữ nguyên logic Resize tối ưu) ---
    const vH = window.innerHeight || document.documentElement.clientHeight;
    const vW = window.innerWidth || document.documentElement.clientWidth;

    // Reset để đo kích thước thực
    el.style.maxHeight = 'none';
    el.style.maxWidth = 'none';

    // Lấy kích thước hiện tại
    let rect = el.getBoundingClientRect();

    // Xử lý quá khổ chiều cao
    if (rect.height > vH - padding * 2) {
      el.style.maxHeight = `${vH - padding * 2}px`;
      el.style.overflowY = 'auto';
    }

    // Xử lý quá khổ chiều rộng
    if (rect.width > vW - padding * 2) {
      el.style.maxWidth = `${vW - padding * 2}px`;
      el.style.overflowX = 'auto';
    }

    // Đo lại sau khi resize
    rect = el.getBoundingClientRect();

    // --- BƯỚC 2: TÍNH TOÁN ĐỘ LỆCH (DELTA CALCULATION) ---

    let deltaX = 0;
    let deltaY = 0;

    // Kiểm tra trục dọc (Y)
    if (rect.top < padding) {
      // Lệch lên trên -> Cần dịch xuống
      deltaY = padding - rect.top;
    } else if (rect.bottom > vH - padding) {
      // Lệch xuống dưới -> Cần dịch lên (số âm)
      deltaY = vH - padding - rect.bottom;
    }

    // Kiểm tra trục ngang (X)
    if (rect.left < padding) {
      // Lệch sang trái -> Cần dịch phải
      deltaX = padding - rect.left;
    } else if (rect.right > vW - padding) {
      // Lệch sang phải -> Cần dịch trái
      deltaX = vW - padding - rect.right;
    }

    // Nếu không lệch gì cả thì thoát
    if (deltaX === 0 && deltaY === 0) return;

    console.log(`9 Trip UI: Điều chỉnh vị trí element. X: ${deltaX}, Y: ${deltaY}`);

    // --- BƯỚC 3: DI CHUYỂN ELEMENT (APPLY MOVEMENT) ---

    const computedStyle = window.getComputedStyle(el);
    const position = computedStyle.position;

    if (position === 'fixed' || position === 'absolute') {
      // Trường hợp 1: Element có định vị (Modal, Tooltip, Dropdown)
      // Ta cộng độ lệch vào tọa độ hiện tại

      // Lấy giá trị top/left hiện tại (lưu ý trường hợp 'auto')
      const currentTop = parseFloat(computedStyle.top) || 0;
      const currentLeft = parseFloat(computedStyle.left) || 0;

      el.style.top = `${currentTop + deltaY}px`;
      el.style.left = `${currentLeft + deltaX}px`;

      // Xóa bottom/right để tránh xung đột CSS
      el.style.bottom = 'auto';
      el.style.right = 'auto';
    } else {
      // Trường hợp 2: Element tĩnh (Static)
      // Dùng Transform để dịch chuyển hình ảnh mà không làm vỡ layout xung quanh
      // Lưu ý: Cách này chỉ dịch chuyển hình ảnh hiển thị (Visual), vị trí DOM vẫn giữ nguyên.

      // Lấy giá trị transform hiện tại (nếu có)
      const currentTransform = new WebKitCSSMatrix(computedStyle.transform);
      const currentX = currentTransform.m41;
      const currentY = currentTransform.m42;

      el.style.transform = `translate3d(${currentX + deltaX}px, ${currentY + deltaY}px, 0)`;
    }
  } catch (error) {
    console.error('9 Trip Critical Error [moveElementIntoView]:', error);
  }
};

window.fitToViewport = fitToViewport; // Export ra toàn cục để tiện sử dụng

/* =================================================================
 * DOM HELPERS V3: FINAL & FLEXIBLE
 * Tech Lead: 9Trip Team
 * Tính năng: Fail-safe, Smart Parsing, Phone Handling
 * ================================================================= */

/**
 * 1. RESOLVE ELS: Tìm kiếm phần tử an toàn
 */
function resolveEls(target, root) {
  try {
    // A. Fail-fast
    if (target === null || target === undefined) return [];

    // B. Element thật -> Return luôn
    if (target.nodeType === 1) return [target];

    // C. List (NodeList, Array)
    if (
      Array.isArray(target) ||
      (typeof NodeList !== 'undefined' && target instanceof NodeList) ||
      (typeof HTMLCollection !== 'undefined' && target instanceof HTMLCollection)
    ) {
      return Array.from(target).filter((el) => el && el.nodeType === 1);
    }

    // D. String Selector
    if (typeof target !== 'string') return []; // Trả về rỗng để hàm getVal xử lý tiếp fallback

    const str = target.trim();
    if (!str) return [];

    // Root context
    let safeRoot = document;
    if (root && root.nodeType === 1) safeRoot = root;

    // Logic ID nhanh
    const isSimpleId = safeRoot === document && /^[a-zA-Z0-9_-]+$/.test(str);
    if (isSimpleId) {
      const el = document.getElementById(str);
      return el ? [el] : [];
    }

    // Query Selector
    return Array.from(safeRoot.querySelectorAll(str));
  } catch (e) {
    // Fallback log
    if (typeof logError === 'function') logError(`[DOM] resolveEls lỗi: ${target}`, e);
    else console.warn(`[DOM] resolveEls crash:`, e);
    return [];
  }
}

// Alias ngắn gọn
function $(sel, root = document) {
  const els = resolveEls(sel, root);
  return els.length > 0 ? els[0] : null;
}

function $$(sel, root = document) {
  return resolveEls(sel, root);
}

// Hàm getE: Wrapper an toàn cho getElementById
function getE(input) {
  if (!input) return null;
  if (input.nodeType === 1) return input;
  if (typeof input === 'string') return document.getElementById(input);
  log('[DOM] getE: Invalid input type', input);
  return null;
}

/**
 * 2. GET FROM EL: Trích xuất dữ liệu từ Element
 */
function getFromEl(el, opt = {}) {
  if (!el) return opt.fallback ?? '';

  try {
    const { trim = true } = opt;
    let val = '';
    const classList = el.classList;
    const tagName = el.tagName;

    // --- CASE 1: CHECKBOX ---
    if (el.type === 'checkbox') {
      val = el.checked;
    }
    // --- CASE 2: MULTI SELECT ---
    else if (tagName === 'SELECT' && el.multiple) {
      val = Array.from(el.selectedOptions).map((o) => o.value);
    }
    // --- CASE 3: NUMBER (Ưu tiên dataset.val) ---
    else if (
      classList.contains('number') ||
      classList.contains('number-only') ||
      el.type === 'number'
    ) {
      // Lấy từ dataset (nguồn gốc) hoặc value (hiển thị)
      const rawVal =
        el.dataset.val !== undefined && el.dataset.val !== '' ? el.dataset.val : el.value;
      // Chỉ lấy số (0-9) để đảm bảo logic cũ không bị sai lệch
      val = String(rawVal || '').replace(/[^0-9]/g, '');
      return val === '' ? 0 : Number(val);
    }
    // --- CASE 4: PHONE NUMBER (New: Chỉ lấy số sạch) ---
    else if (classList.contains('phone_number') || el.type === 'tel') {
      let rawVal = el.value || '';
      // Loại bỏ dấu chấm, phẩy, gạch ngang, chỉ giữ số để lưu DB
      val = typeof rawVal === 'string' ? rawVal.replace(/[^0-9]/g, '') : '';
      return val;
    }
    // --- CASE 5: DEFAULT ---
    else if ('value' in el) {
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
}

/**
 * 3. SET TO EL: Gán dữ liệu vào Element
 */
function setToEl(el, value) {
  if (!el) return false;

  try {
    let vRaw = value;
    if (vRaw === null || vRaw === undefined) vRaw = '';

    // Xử lý Date -> YYYY-MM-DD
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
    if (el.dataset && !el.dataset.initial) el.dataset.initial = String(vRaw); // Lưu giá trị gốc để có thể reset sau này nếu cần

    // --- CASE A: NUMBER (Trigger setNum) ---
    if (classList.contains('number') || classList.contains('number-only') || el.type === 'number') {
      setNum(el, vRaw);
      return true;
    }

    // --- CASE B: PHONE NUMBER (Format hiển thị) ---
    if (classList.contains('phone_number') || el.type === 'tel') {
      const cleanVal = String(vRaw).replace(/[^0-9]/g, '');
      el.dataset.val = cleanVal; // Lưu số sạch
      // Hiển thị số đẹp
      el.value = typeof formatPhone === 'function' ? formatPhone(cleanVal) : cleanVal;
      return true;
    }

    // --- CASE C: CHECKBOX/RADIO/SELECT ---
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

    // --- CASE D: STANDARD ---
    if ('value' in el) {
      el.value = String(vRaw);
      if (typeof vRaw !== 'object') el.dataset.val = String(vRaw);
      return true;
    } else {
      el.value = String(vRaw);
      el.textContent = String(vRaw);
    }

    // el.textContent = String(vRaw); thử chuyển vào case D để tránh trường hợp value="" nhưng vẫn muốn set textContent
    return true;
  } catch (err) {
    if (typeof logError === 'function') logError(`[DOM] setToEl lỗi`, err);
    else console.error(err);
    return false;
  }
}

// --- MAIN WRAPPERS ---

/**
 * getVal: Đa năng
 * - Nếu id tìm thấy Element -> Trả về Value của Element
 * - Nếu id KHÔNG phải Element (biến, text...) -> Trả về chính nó (Value)
 */
function getVal(id, root = document, opt = {}) {
  try {
    // 1. Thử tìm Element
    const el = $(id, root);
    if (el) return getFromEl(el, opt);

    // 2. Xử lý khi input KHÔNG phải Element
    // Chỉ trả về tham số nếu nó có dữ liệu thực sự (String/Number)
    // Để tránh việc getVal("tên_biến_sai") lại trả về chuỗi "tên_biến_sai"
    if (typeof id === 'number') {
      return id;
    }

    return opt.fallback ?? '';
  } catch (err) {
    if (typeof logError === 'function') logError(`[DOM] getVal lỗi`, 'danger');
    return opt.fallback ?? '';
  }
}
function setVal(id, value, root = document) {
  try {
    const el = $(id, root);
    if (!el) {
      // Không tìm thấy element để set -> Log warning nhẹ
      if (typeof logError === 'function')
        logError(`[DOM] setVal: Không tìm thấy ID "${id}"`, 'warning');
      else console.warn(`[DOM] setVal missing: ${id}`);
      return false;
    }
    return setToEl(el, value);
  } catch (e) {
    if (typeof logError === 'function') logError(`[DOM] setVal lỗi`, e);
    return false;
  }
}

// --- NUMERIC SPECIALISTS ---

/**
 * setNum: An toàn tuyệt đối
 * (Giữ nguyên logic V3 vì đã tốt)
 */
function setNum(idOrEl, val) {
  try {
    const el = getE(idOrEl);
    if (!el) return;

    let rawNum = 0;
    if (val !== '' && val !== null && val !== undefined) {
      rawNum = Number(val);
      if (isNaN(rawNum)) rawNum = 0;
    }

    // SSOT: Lưu số gốc
    el.dataset.val = rawNum;

    // UI: Hiển thị đẹp
    if (el.type === 'number') {
      el.value = rawNum;
    } else {
      el.value =
        typeof formatMoney === 'function'
          ? formatMoney(rawNum)
          : new Intl.NumberFormat('vi-VN').format(rawNum);
    }
  } catch (e) {
    if (typeof logError === 'function') logError(`[DOM] setNum lỗi`, 'danger');
  }
}

/**
 * getNum: "STRICT NUMBER" - Luôn trả về dữ liệu kiểu SỐ
 * --------------------------------------------------------
 * 1. Input là Number -> Return luôn.
 * 2. Input là ID Element -> Lấy dataset.val/value -> Parse ra số.
 * 3. Input là String số ("100,000") -> Parse ra số (100000).
 * 4. Input là String rác ("abc", "undefined") -> Return 0 (Tránh lỗi so sánh).
 */
function getNum(target) {
  try {
    // 1. Fast Return: Nếu đã là số thì trả về ngay
    if (typeof target === 'number') return target;

    // 2. Null/Undefined check
    if (target === null || target === undefined) return 0;

    let rawVal = '';

    // 3. Thử tìm Element
    // Lưu ý: getE trả về null nếu không tìm thấy ID
    let el = getE(target);

    if (el) {
      // --- TRƯỜNG HỢP LÀ ELEMENT ---
      // Ưu tiên 1: Dataset (SSOT)
      if (el.dataset.val !== undefined && el.dataset.val !== '' && el.dataset.val !== 'NaN') {
        const val =
          el.dataset.val !== undefined && el.dataset.val !== '' ? el.dataset.val : el.value;
        // Chỉ lấy số (0-9) để đảm bảo logic cũ không bị sai lệch
        rawVal = String(val || '').replace(/[^0-9]/g, '');
        return rawVal === '' ? 0 : Number(rawVal);
      }
      // Ưu tiên 2: Value hiển thị
      rawVal = 'value' in el ? el.value : el.textContent;
    } else {
      // --- TRƯỜNG HỢP KHÔNG PHẢI ELEMENT ---
      // Đây là chỗ bạn cần tối ưu: Coi tham số truyền vào chính là giá trị thô
      rawVal = String(target);
    }

    // 4. Clean & Parse (Trái tim của hàm xử lý)
    // Chỉ giữ lại: Số (0-9), Dấu chấm (.), Dấu trừ (-)
    // Loại bỏ: Dấu phẩy, chữ cái, khoảng trắng...
    const cleanStr = rawVal.replace(/[^0-9.-]/g, '');

    // Nếu chuỗi rỗng sau khi clean (VD: input là "abc") -> 0
    if (cleanStr === '' || cleanStr === '-') return 0;

    const num = parseFloat(cleanStr);

    // Kiểm tra NaN (Not a Number) lần cuối
    return isNaN(num) ? 0 : num;
  } catch (e) {
    if (typeof logError === 'function') logError(`[DOM] getNum crash`, 'danger');
    return 0; // Luôn return 0 khi lỗi hệ thống
  }
}
// --- BATCH OPERATORS ---

function getVals(target, optOrRoot = {}) {
  try {
    const {
      root = document,
      silent = false,
      ...rest
    } = optOrRoot.nodeType === 1 ? { root: optOrRoot } : optOrRoot;
    const els = resolveEls(target, root);
    // Nếu target là biến (không tìm thấy element) -> Trả về mảng chứa biến đó (Consistent with getVal)
    if (!els.length) {
      return [target];
    }
    return els.map((el) => getFromEl(el, rest));
  } catch (e) {
    return [];
  }
}

function setVals(target, values, optOrRoot = {}) {
  try {
    const { root = document, keepMissing = false } =
      optOrRoot.nodeType === 1 ? { root: optOrRoot } : optOrRoot;
    const els = resolveEls(target, root);
    if (!els.length) return 0;

    let count = 0;

    // OPTIMIZATION: Tách logic Single Value & Array
    if (!Array.isArray(values)) {
      // Case 1: Single Value -> Set cho tất cả target giống nhau
      for (const el of els) {
        if (setToEl(el, values)) count++;
      }
    } else {
      // Case 2: Array Values -> Map theo index 1-1
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

/**
 * Helper: Trích xuất dữ liệu từ Table Form dựa trên dataset
 * @param {string} tableId - ID của table cần lấy dữ liệu
 * @returns {Array} - Mảng các object đã được map với Firestore field
 */
async function getTableData(tableId) {
  try {
    const table = document.getElementById(tableId);
    if (!table) throw new Error(`Table với ID ${tableId} không tồn tại.`);

    // Lấy tất cả các hàng trong tbody để tránh lấy header
    const rows = table.querySelectorAll('tbody tr');
    const dataResult = [];

    rows.forEach((row, index) => {
      const rowData = {};
      // Tìm tất cả phần tử có data-field bên trong hàng
      const inputs = row.querySelectorAll('[data-field]');

      let hasData = false;
      inputs.forEach((input) => {
        const fieldName = input.dataset.field; // Lấy tên field từ data-field
        if (!fieldName) return;

        let value = getVal(input); // Sử dụng hàm getVal để lấy giá trị đúng định dạng

        rowData[fieldName] = value;

        // Kiểm tra xem hàng có dữ liệu không (tránh lưu hàng trống)
        if (value !== '' && value !== 0 && value !== false) {
          hasData = true;
        }
      });

      if (hasData) {
        dataResult.push(rowData);
        log(Object.entries(rowData));
      }
    });

    return dataResult;
  } catch (error) {
    console.error('Lỗi tại Utils.getTableData:', error);
    return [];
  }
}

function showLoading(show, text = 'Loading...') {
  let el = getE('loading-overlay');
  if (!el) {
    if (!show) return;
    el = document.createElement('div');
    el.id = 'loading-overlay';
    el.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.8);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;';
    el.innerHTML = `<div class="spinner-border text-warning" role="status" style="width: 2.5rem; height: 2.5rem;"></div><div id="loading-text" class="mt-3 fw-bold text-primary small">${text}</div>`;
    document.body.appendChild(el);
  }
  const textEl = getE('loading-text');
  if (textEl) textEl.innerText = text;
  el.style.display = show ? 'flex' : 'none';
}

function setBtnLoading(btnSelector, isLoading, loadingText = 'Đang lưu...') {
  const btn = typeof btnSelector === 'string' ? getE(btnSelector) : btnSelector;
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
}

function fillSelect(elmId, dataList, defaultText = 'Chọn...') {
  const el = getE(elmId);
  if (!el) {
    warn('fillSelect', `Select ID "${elmId}" not found`);
    return;
  }

  let html = `<option value="" selected disabled>${defaultText}</option>`;
  if (Array.isArray(dataList)) {
    html += dataList
      .map((item) => {
        const val = typeof item === 'object' && item !== null ? item.value : item;
        const txt = typeof item === 'object' && item !== null ? item.text : item;
        return `<option value="${val}">${txt}</option>`;
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

  if (!Array.isArray(dataArray)) {
    warn('setDataList', `Data for "${elmId}" is not array`);
    el.innerHTML = '';
    return;
  }
  const uniqueData = [...new Set(dataArray.filter(Boolean))];
  el.innerHTML = uniqueData.map((item) => `<option value="${item}">`).join('');
}

/* =========================
 * 6. EVENTS & ASYNC
 * ========================= */

function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Hàm gán sự kiện đa năng (Hỗ trợ cả trực tiếp và ủy quyền/lazy load)
 * @param {string|Element|NodeList} target - Selector hoặc Element đích
 * @param {string} eventNames - Tên sự kiện (vd: 'click change')
 * @param {Function} handler - Hàm xử lý
 * @param {Object|boolean} options - Option chuẩn HOẶC true để bật Lazy Delegation
 */
// function onEvent(target, eventNames, handler, options = {}) {
//   // 1. CHUẨN HÓA THAM SỐ (Hỗ trợ tham số thứ 4 là boolean)
//   // Nếu options === true -> Bật chế độ Lazy Delegation (Gán vào document)
//   const isLazy = (options === true);

//   // Xác định Selector dùng để Delegate
//   // - Nếu Lazy: target chính là selector cần tìm (vd: '.btn-save')
//   // - Nếu Cách cũ: Lấy từ options.delegate (nếu có)
//   const delegateSelector = isLazy ? target : (options.delegate || null);

//   let els = [];

//   // 2. XÁC ĐỊNH PHẦN TỬ ĐỂ GẮN SỰ KIỆN (ATTACH TARGET)
//   if (isLazy) {
//     // CASE A: Lazy Load -> Luôn gắn vào document (Không bao giờ null)
//     els = [document];
//   } else {
//     // CASE B: Cách cũ -> Gắn trực tiếp vào target
//     try {
//       if (!target) {
//         // Chỉ warn nếu không phải Lazy mode
//         console.warn('onEvent', `Target null for "${eventNames}"`);
//         return () => { };
//       }
//       if (typeof target === 'string') els = document.querySelectorAll(target);
//       else if (target.nodeType) els = [target];
//       else if (target.length) els = target;
//     } catch (err) {
//       console.error("onEvent Selector error: " + err);
//       return () => { };
//     }
//   }

//   if (!els.length) return () => { };

//   // 3. XỬ LÝ OPTIONS
//   const events = eventNames.split(' ').filter(e => e.trim());
//   // Nếu isLazy = true thì nativeOpts rỗng, ngược lại lấy từ options
//   const { delegate, ...nativeOpts } = (typeof options === 'object' ? options : {});

//   // 4. MAIN HANDLER (Logic xử lý sự kiện)
//   const finalHandler = (e) => {
//     try {
//       if (delegateSelector) {
//         let matched = null;

//         // Xử lý an toàn cho closest: Chỉ dùng nếu là string
//         if (typeof delegateSelector === 'string') {
//           matched = e.target.closest(delegateSelector);
//         }
//         // Nếu truyền vào là 1 Element object, kiểm tra xem click có nằm trong nó không
//         else if (delegateSelector.nodeType && delegateSelector.contains(e.target)) {
//           matched = delegateSelector;
//         }

//         // Thực thi handler nếu khớp
//         if (matched && e.currentTarget.contains(matched)) {
//           handler.call(matched, e, matched);
//         }
//       } else {
//         handler.call(e.currentTarget, e, e.currentTarget);
//       }
//     } catch (handlerErr) {
//       // Rule số 7: Centralized logging
//       if (typeof ErrorLogger !== 'undefined') {
//         ErrorLogger.log(handlerErr, 'onEvent_Handler', { data: { eventNames, target } });
//       } else {
//         console.error("onEvent Handler Error:", handlerErr);
//       }
//     }
//   };

//   // 5. ATTACH LISTENER
//   Array.from(els).forEach(el => events.forEach(evt => el.addEventListener(evt, finalHandler, nativeOpts)));

//   // Return Cleaner Function (Để remove event nếu cần)
//   return () => {
//     Array.from(els).forEach(el => events.forEach(evt => el.removeEventListener(evt, finalHandler, nativeOpts)));
//   };
// }

// function trigger(selector, eventName) {
//   const el = $(selector);
//   if (el) el.dispatchEvent(new Event(eventName));
// }

// Cache cấu hình để không phải gọi Firestore nhiều lần
let _GAS_SECRETS = null;

async function _callServer(funcName, ...args) {
  const reqId = `CS_${Date.now().toString().slice(-6)}`;

  // Debug log
  const dbg = (msg, data) => {
    if (typeof LOG_CFG !== 'undefined' && LOG_CFG.ENABLE) console.log(msg, data || '');
  };

  dbg(`[${reqId}] 🚀 CALL -> ${funcName}`, args);

  try {
    // 1. Tải Config (Singleton)
    if (!_GAS_SECRETS) {
      const docSnap = await A.DB.db.collection('app_config').doc('app_secrets').get();
      if (!docSnap.exists) throw new Error('Missing app_secrets');
      _GAS_SECRETS = docSnap.data();
    }
    if (funcName.endsWith('API')) {
      funcName = funcName.slice(0, -3);
    }

    // 2. Chuẩn bị Payload
    const finalPayload = args.length === 1 ? args[0] : args;
    const requestBody = {
      api_key: _GAS_SECRETS.gas_app_secret,
      mode: typeof CURRENT_USER !== 'undefined' && CURRENT_USER?.role ? CURRENT_USER.role : 'guest',
      action: funcName,
      payload: finalPayload,
    };

    // 3. Gọi Fetch
    const response = await fetch(_GAS_SECRETS.gas_app_url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(requestBody),
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
}

/**
 * CORE HELPER: Gọi Server và Tự động xử lý kết quả (Phiên bản "Nồi đồng cối đá")
 * Hỗ trợ đa dạng format trả về từ server
 */
async function requestAPI(funcName, ...args) {
  showLoading(true, 'Đang xử lý...');

  try {
    const res = await _callServer(funcName, ...args);

    // 1. Trường hợp Server trả về void (undefined) hoặc null
    if (res === undefined || res === null) {
      log('Server đã chạy xong ko trả kết quả: ', funcName);
      return null;
    }
    // 2. Chuẩn hóa logic Success/Fail
    let isSuccess = false;
    if ('success' in res) isSuccess = res.success === true;
    else if ('status' in res) isSuccess = res.status === true || res.status === 200;
    else return res; // Data thô -> Trả về luôn

    // 3. Hiển thị thông báo (nếu có)
    if (res.message) logA(res.message, isSuccess ? 'success' : 'warning');

    // 4. LOGIC TRẢ VỀ DỮ LIỆU (TỐI ƯU MỚI)
    if (isSuccess) {
      // Kỹ thuật: Object Destructuring & Rest Syntax
      // Tách các biến kỹ thuật ra (unused), phần còn lại (payload) chính là thứ ta cần
      const { success, status, code, error, ...payload } = res;

      // payload lúc này chứa: { data: ..., ...extras }

      // Đảm bảo luôn có data (để tránh lỗi undefined khi truy cập)
      if (payload.data === undefined) payload.data = {};

      return payload;
    } else {
      // Xử lý lỗi (Log & Return null)
      if (res.status !== 200 || res.error) {
        log(`❌ API Error [${res.status || 'UNKNOWN'}]:`, res.error || res.message, 'error');
      }
      return null;
    }
  } catch (err) {
    const errMsg = err.message || String(err);
    logError(errMsg, err);
    return null;
  } finally {
    showLoading(false);
  }
}

/* =========================
 * 7. LOGGING & ALERTS
 * ========================= */

function log(msg, arg2, arg3) {
  if (!LOG_CFG.ENABLE) return;

  // 1. Xử lý tham số đầu vào (Logic của bạn)
  const validTypes = ['info', 'success', 'warning', 'error'];
  let type = 'info';
  let dataDisplay = '';
  let rawData = null; // Biến này để lưu vào Storage cho sạch

  if (typeof arg2 === 'string' && validTypes.includes(arg2)) {
    type = arg2;
  } else if (arg2 !== undefined) {
    if (typeof arg2 === 'object') {
      rawData = arg2; // Lưu object gốc
      try {
        // dataDisplay = ` <span class="fw-bold text-secondary">[${JSON.stringify(arg2).slice(0, 50)}...]</span>`;
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

  // 2. Ghi Console (Cho Dev)
  const colorStyle = type === 'error' ? 'red' : type === 'success' ? 'yellow' : 'white';
  console.log(`%c[${type.toUpperCase()}] ${msg}`, `color:${colorStyle}`, rawData || '');

  // 3. Chuẩn bị dữ liệu Log Object
  const timestamp = new Date().toLocaleTimeString('vi-VN', { hour12: false });
  const logEntry = {
    time: timestamp,
    type: type,
    msg: msg,
    htmlExtra: dataDisplay, // Lưu đoạn HTML phụ (nếu có)
  };

  // 4. LƯU VÀO LOCALSTORAGE (Bền vững)
  saveLogToStorage(logEntry);

  // 5. VẼ LÊN GIAO DIỆN (Nếu Tab Log đang hiển thị)
  const ul = document.getElementById('log-list');

  if (ul) {
    const li = createLogElement(logEntry);
    ul.insertBefore(li, ul.firstChild);

    // TỐI ƯU DOM: Nếu quá 100 dòng -> Xóa dòng cũ nhất (dưới cùng)
    // Giữ DOM nhẹ mà không làm mất nội dung đang xem
    if (ul.childElementCount > LOG_CFG.MAX_UI_LINES) {
      ul.removeChild(ul.lastElementChild);
    }
  }
}

/**
 * Helper: Tạo thẻ LI từ Log Object (Tách ra để dùng lại khi restore)
 */
function createLogElement(entry) {
  const iconMap = { success: '✔', warning: '⚠', error: '✘', info: '•' };
  const colorMap = {
    success: 'text-success',
    warning: 'text-warning',
    error: 'text-danger fw-bold',
    info: 'text-dark',
  };

  const li = document.createElement('li');
  li.className = `list-group-item py-1 small ${colorMap[entry.type] || 'text-dark'}`;
  li.style.fontSize = '0.8rem';

  li.innerHTML = `<span class="text-muted me-1">${entry.time}</span> <strong>${iconMap[entry.type] || '•'}</strong> ${entry.msg}${entry.htmlExtra || ''}`;
  return li;
}

/**
 * Helper: Lưu Log vào LocalStorage theo ngày
 */
function saveLogToStorage(entry) {
  try {
    const todayKey = getLogKey();

    // Lấy dữ liệu cũ (Dạng chuỗi JSON)
    const existingData = localStorage.getItem(todayKey);
    let logs = existingData ? JSON.parse(existingData) : [];

    // Thêm log mới vào đầu mảng
    logs.unshift(entry);

    // OPTIONAL: Giới hạn lưu trữ cục bộ (ví dụ chỉ lưu 500 dòng/ngày để tránh đầy bộ nhớ trình duyệt)
    if (logs.length > 500) logs.length = 500;

    localStorage.setItem(todayKey, JSON.stringify(logs));
  } catch (e) {
    console.warn('Local Storage Full or Error:', e);
    // Xóa tất cả log trong localStorage khi có lỗi
    try {
      const prefix = LOG_CFG.STORAGE_PREFIX;
      for (let key in localStorage) {
        if (key.startsWith(prefix)) {
          localStorage.removeItem(key);
        }
      }
      console.log('✅ Đã xóa tất cả log trong localStorage');
    } catch (clearErr) {
      console.error('Lỗi khi xóa localStorage:', clearErr);
    }
  }
}

/**
 * Helper: Tạo Key theo ngày (VD: app_logs_2023-10-25)
 */
function getLogKey() {
  const d = new Date();
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return LOG_CFG.STORAGE_PREFIX + dateStr;
}

/**
 * Helper: Khôi phục Log từ Storage (Gọi khi Tab Log được render)
 * Thay thế cho flushLogBuffer cũ
 */
function restoreLogsFromStorage() {
  const ul = getE('log-list');
  if (!ul) return;

  // Kiểm tra xem đã restore chưa để tránh duplicate (nếu gọi nhiều lần)
  if (ul.dataset.restored === 'true') return;

  const todayKey = getLogKey();
  const raw = localStorage.getItem(todayKey);

  if (raw) {
    const logs = JSON.parse(raw);
    // Chỉ lấy tối đa 100 dòng để hiển thị
    const logsToShow = logs.slice(0, LOG_CFG.MAX_UI_LINES);

    // Dùng DocumentFragment để render 1 lần cho nhanh
    const fragment = document.createDocumentFragment();

    // logs trong storage đang là [Mới nhất -> Cũ nhất]
    // Nhưng appendChild sẽ thêm xuống dưới, nên ta cứ loop bình thường
    logsToShow.forEach((entry) => {
      const li = createLogElement(entry);
      fragment.appendChild(li);
    });
    const divider = document.createElement('li');
    divider.className = 'list-group-item text-center fw-bold text-info small';
    divider.style.fontSize = '1rem';
    divider.textContent = '-------------------- LOG MỚI ----------------------';
    fragment.appendChild(divider);

    ul.appendChild(fragment);
  }
  ul.dataset.restored = 'true'; // Đánh dấu đã khôi phục
}

function clearLog() {
  try {
    const prefix = LOG_CFG.STORAGE_PREFIX;
    for (let key in localStorage) {
      if (key.startsWith(prefix)) {
        localStorage.removeItem(key);
      }
    }
    const ul = getE('log-list');
    if (ul) ul.innerHTML = '';
    log('✅ Đã xóa tất cả log trong localStorage', 'info');
  } catch (e) {
    console.error('Lỗi khi xóa log:', e);
  }
}

/**
 * logA – Hàm thông báo / xác nhận hợp nhất (Toast · Alert · Confirm).
 *
 * Chế độ hoạt động xác định bằng tham số `modeOrCallback`:
 *
 *  null / 'toast'   → Toast notification góc phải, tự đóng 3.5 s (mặc định)
 *  'alert'          → Modal thông báo, 1 nút "Đóng"
 *  'confirm'        → Modal xác nhận OK / Cancel, trả về Promise<boolean>
 *  Function         → Modal xác nhận; xem bảng dưới:
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ CALLBACK STYLE                    │ BUTTONS HIỂN THỊ                   │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ logA(msg, type, okFn)             │ [Xác nhận]  [Hủy]                  │
 * │ logA(msg, type, okFn, denyFn)     │ [Xác nhận]  [Từ chối]  [Hủy]       │
 * └─────────────────────────────────────────────────────────────────────────┘
 *  - "Hủy" (Cancel/dismiss) không gọi callback nào
 *  - "Từ chối" (Deny) gọi denyFn
 *
 * ★ Quy tắc quan trọng với callback style:
 *   Code NGOÀI lời gọi logA() luôn chạy ngay lập tức, bất kể user chọn gì.
 *
 *   // ✅ 2 nút – chỉ OK callback:
 *   logA('Xóa?', 'warning', () => deleteRecord());
 *
 *   // ✅ 3 nút – Xác nhận / Từ chối / Hủy:
 *   logA('Xóa?', 'warning', () => hardDelete(), () => softDelete());
 *
 *   // ✅ Await + onConfirm/onDeny trong options (không cần callback ở tham số 3):
 *   await logA('Xóa?', 'warning', 'confirm', {
 *     onConfirm: () => hardDelete(),
 *     onDeny:    () => softDelete(),
 *     denyText:  'Lưu nháp',
 *   });
 *
 * @param {string}               message            Nội dung (hỗ trợ HTML và \n).
 * @param {string}               [type='info']      'info'|'success'|'warning'|'error'|'danger'
 * @param {Function|string|null} [modeOrCallback]   Chế độ hoặc OK callback (xem trên).
 * @param {Function|Object|*}    [rest[0]]          Deny callback (nếu là Function → 3-button) HOẶC
 *                                                  object tùy chọn Swal (confirm/alert mode).
 *                                                  Object hỗ trợ: `onConfirm`, `onDeny`, `onCancel` (alias).
 * @returns {void|Promise<boolean>}  toast → void;  alert → Promise<void>;
 *                                   confirm/callback → Promise<boolean>  (true = isConfirmed)
 */
function logA(message, type = 'info', modeOrCallback = null, ...rest) {
  if (typeof log === 'function') log(message, type);

  // ── Xác định mode ───────────────────────────────────────────────────────
  const isCallbackMode = typeof modeOrCallback === 'function';
  const mode = isCallbackMode ? 'confirm' : String(modeOrCallback ?? 'toast').toLowerCase(); // 'toast' | 'alert' | 'confirm'

  // ── Tách deny callback và args ──────────────────────────────────────────
  // Callback mode:
  //   rest[0] là Function → denyCallback (kích hoạt chế độ 3 nút)
  //   rest[0] là object/undefined → không có deny
  // Options object mode (confirm/alert):
  //   { onDeny } hoặc { onCancel } (alias legacy) → denyCallback
  let confirmCallback = null; // callback cho nút "Xác nhận" khi dùng options mode
  let denyCallback = null; // callback cho nút "Từ chối" (Deny)
  let cbArgs = [];
  let swalExtra = {};

  if (isCallbackMode) {
    if (typeof rest[0] === 'function') {
      // logA(msg, type, okFn, denyFn) → 3-button mode
      denyCallback = rest[0];
      cbArgs = rest.slice(1);
    } else {
      // logA(msg, type, okFn, arg...) — tương thích ngược
      cbArgs = rest;
    }
  } else {
    // confirm/alert mode: rest[0] có thể là options object cho Swal
    if (rest.length === 1 && rest[0] && typeof rest[0] === 'object') {
      const { onConfirm: _onConfirm, onDeny: _onDeny, onCancel: _onCancel, ...remaining } = rest[0];
      // onConfirm trong options → dùng thay cho tham số 3 khi là string mode
      confirmCallback = typeof _onConfirm === 'function' ? _onConfirm : null;
      // onDeny ưu tiên hơn; onCancel giữ làm alias tương thích ngược
      denyCallback =
        typeof _onDeny === 'function'
          ? _onDeny
          : typeof _onCancel === 'function'
            ? _onCancel
            : null;
      swalExtra = remaining;
    }
  }

  // isDenyMode = true → hiển thị 3 nút (Xác nhận | Từ chối | Hủy)
  // isDenyMode = false → hiển thị 2 nút (Xác nhận | Hủy)
  const isDenyMode = denyCallback !== null;

  // ── Lookup tables ────────────────────────────────────────────────────────
  const iconMap = {
    info: 'info',
    success: 'success',
    warning: 'warning',
    error: 'error',
    danger: 'error',
    question: 'question',
    true: 'success',
    false: 'error',
  };
  const titleMap = {
    info: 'Thông báo',
    success: 'Thành công',
    warning: 'Cảnh báo',
    error: 'Lỗi',
    danger: 'Lỗi',
    true: 'Thành công',
    false: 'Thất bại',
  };
  const btnVariantMap = {
    info: 'primary',
    success: 'success',
    warning: 'warning',
    error: 'danger',
    danger: 'danger',
  };

  const norm = String(type ?? 'info').toLowerCase();
  const icon = iconMap[norm] || 'info';
  const autoTitle = titleMap[norm] || 'Thông báo';
  const variant = btnVariantMap[norm] || 'primary';
  const isDangerous = norm === 'warning' || norm === 'error' || norm === 'danger';
  const htmlBody = String(message).replace(/\n/g, '<br>');

  // ── Fallback khi Swal chưa load ─────────────────────────────────────────
  if (typeof Swal === 'undefined') {
    if (mode === 'toast') return;
    if (mode === 'alert') {
      alert(message);
      return Promise.resolve();
    }
    // confirm / callback mode
    // Fallback native dialog: chỉ có 2 nút (OK/Cancel)
    // → OK=Xác nhận, Cancel=Từ chối (không phân biệt được với Hủy trong native)
    return new Promise((resolve) => {
      const ok = window.confirm(message);
      if (ok && isCallbackMode) modeOrCallback(...cbArgs);
      else if (!ok && denyCallback) denyCallback();
      resolve(ok); // luôn resolve — không reject, không chặn luồng ngoài
    });
  }

  const c = typeof _bsBtnColors === 'function' ? _bsBtnColors() : {};

  // basePopup chỉ dùng cho Alert / Confirm (modal chính giữa, không tự ẩn)
  const basePopup = {
    position: 'center', // Luôn hiện chính giữa màn hình
    draggable: false,
    toast: false, // Không phải toast
    timer: undefined, // Không tự ẩn
    timerProgressBar: false,
    background: c.bodyBg || '',
    color: c.bodyColor || '',
    buttonsStyling: false,
    allowOutsideClick: false, // Mặc định: bắt buộc bấm nút (override được qua swalExtra)
    customClass: {
      popup: 'shadow rounded-3',
      title: 'fw-semibold fs-5',
      htmlContainer: 'text-start',
    },
  };

  // ── Toast: hiển thị góc phải trên, tự ẩn sau 3.5s ───────────────────────
  if (mode === 'toast') {
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon,
      title: String(message),
      showConfirmButton: false,
      timer: 3500,
      timerProgressBar: true,
      didOpen: (toast) => {
        toast.onmouseenter = Swal.stopTimer;
        toast.onmouseleave = Swal.resumeTimer;
      },
    });
    return;
  }

  // ── Alert modal: chính giữa, 1 nút Đóng, không tự ẩn ───────────────────
  if (mode === 'alert') {
    const { title: customTitle, ...extraSwal } = swalExtra;
    return Swal.fire({
      ...basePopup,
      allowOutsideClick: true, // Alert cho phép click ngoài để đóng
      draggable: true,
      icon,
      title: customTitle || autoTitle,
      html: htmlBody,
      confirmButtonText: 'Đóng',
      showCancelButton: false,
      focusConfirm: true,
      confirmButtonColor: c[variant] || c.primary || '#0d6efd',
      customClass: { ...basePopup.customClass, confirmButton: `btn btn-${variant} px-4` },
      ...extraSwal,
    });
  }

  // ── Confirm modal: 2 nút (Xác nhận | Hủy) hoặc 3 nút (Xác nhận | Từ chối | Hủy) ──
  const {
    title: customTitle = '',
    confirmText = 'Xác nhận',
    denyText = 'Từ chối',
    cancelText = 'Hủy',
    confirmBtn: okVariant = variant,
    denyBtn: denyVariant = 'danger',
    cancelBtn: noVariant = 'secondary',
    ...extraSwal
  } = swalExtra;
  const confirmTitle = customTitle || (autoTitle === 'Thông báo' ? 'Xác nhận' : autoTitle);

  return Swal.fire({
    ...basePopup,
    allowOutsideClick: false,
    icon,
    draggable: true,
    title: confirmTitle,
    html: htmlBody,
    showCancelButton: true,
    showDenyButton: isDenyMode, // ← 3-button khi có denyCallback
    confirmButtonText: confirmText,
    ...(isDenyMode && { denyButtonText: denyText }),
    cancelButtonText: cancelText,
    confirmButtonColor: c[okVariant] || c.primary || '#0d6efd',
    ...(isDenyMode && { denyButtonColor: c[denyVariant] || c.danger || '#dc3545' }),
    cancelButtonColor: c[noVariant] || c.secondary || '#6c757d',
    focusConfirm: !isDangerous,
    focusCancel: isDangerous && !isDenyMode, // 2-button: focus Hủy khi nguy hiểm
    focusDeny: isDangerous && isDenyMode, // 3-button: focus Từ chối khi nguy hiểm
    reverseButtons: false,
    customClass: {
      ...basePopup.customClass,
      confirmButton: `btn btn-${okVariant} px-4`,
      ...(isDenyMode && { denyButton: `btn btn-${denyVariant} px-4` }),
      cancelButton: `btn btn-${noVariant} px-4`,
      actions: 'gap-2',
    },
    ...extraSwal,
  }).then((result) => {
    if (result.isConfirmed) {
      // Nút "Xác nhận": ưu tiên callback tham số 3, sau đó options.onConfirm
      if (isCallbackMode) modeOrCallback(...cbArgs);
      else if (confirmCallback) confirmCallback();
    } else if (result.isDenied) {
      // Nút "Từ chối" → gọi denyCallback
      if (denyCallback) denyCallback();
    }
    // result.isDismissed (nút "Hủy" hoặc Escape) → không gọi callback nào
    return result.isConfirmed;
  });
}

// =========================================================================
// DIALOG UTILITIES — SweetAlert2 replacements for alert() / confirm()
// =========================================================================

/**
 * Đọc CSS variables Bootstrap / ThemeManager từ :root tại thời điểm gọi.
 * Kết quả phản ánh theme đang active mà không cần import ThemeManager.
 * @private
 * @returns {{ primary, secondary, success, danger, warning, info, bodyBg, bodyColor }}
 */
function _bsBtnColors() {
  const s = getComputedStyle(document.documentElement);
  const v = (name) => s.getPropertyValue(name).trim();
  return {
    primary: v('--bs-primary') || v('--primary-color') || '#0d6efd',
    secondary: v('--bs-secondary') || v('--secondary-color') || '#6c757d',
    success: v('--bs-success') || '#198754',
    danger: v('--bs-danger') || '#dc3545',
    warning: v('--bs-warning') || '#ffc107',
    info: v('--bs-info') || '#0dcaf0',
    bodyBg: v('--bs-body-bg') || v('--bg-primary') || '#ffffff',
    bodyColor: v('--bs-body-color') || v('--text-primary') || '#212529',
  };
}

function showAlert(message, type = 'info', title = '', options = {}) {
  return logA(message, type, 'alert', title ? { title, ...options } : options);
}

function showConfirm(message, okFn, denyFn, opts = {}) {
  if (okFn) opts.onConfirm = okFn;
  if (denyFn) opts.onDeny = denyFn;
  return logA(message, 'question', 'confirm', opts);
}

function logError(p1, p2) {
  // -----------------------------------------------------------
  if (typeof p1 === 'string' && !p2) {
    log(`ℹ️ [ERROR]: ${p1}`, 'error');
    return; // Dừng hàm, không xử lý báo lỗi phía sau
  }
  let msg = '';
  let e = null;

  // 3. LOGIC ĐẢO THAM SỐ (Adapter)

  if (typeof p1 === 'string') {
    msg = p1;
    e = p2;
  }
  // Ngược lại: Nếu p1 là Object/Error -> CHUẨN MỚI (e, msg)
  else {
    e = p1;
    // Nếu p2 là string thì lấy làm msg, nếu không thì để trống
    if (typeof p2 === 'string') {
      msg = p2;
    }
  }

  // Chuẩn hóa message
  msg = msg ? String(msg) : 'Lỗi không xác định';

  // Trích xuất nội dung lỗi
  let errorDetail = '';
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

  // -----------------------------------------------------------
  // 5. THỰC THI (Console.error)
  // -----------------------------------------------------------
  const timestamp = new Date().toLocaleString('vi-VN');
  const finalLog = `[${timestamp}] ❌ ERROR: ${msg} ${errorDetail}`;

  showAlert(finalLog, 'error', '❌ Lỗi', { timer: 5000, showConfirmButton: true });
}

// Biến lưu timer để xử lý conflict nếu thông báo đến liên tục
var _notifTimer = null;

// --- BỔ SUNG HÀM FULL SCREEN ---
function toggleFullScreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((err) => {
      console.log(`Lỗi khi bật Fullscreen: ${err.message}`);
    });
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
}

/**
 * Tự động tìm và chạy hàm theo Role của User hiện tại.
 * Quy tắc ghép tên: [tên_gốc]_[RoleViếtHoaChữCáiĐầu]
 * Ví dụ: baseName='init', Role='SALE' => Chạy hàm init_Sale()
 * * @param {string} baseFuncName - Tên hàm gốc (ví dụ: 'render', 'saveData')
 * @param {...any} args - Các tham số muốn truyền vào hàm đó (nếu có)
 * @return {any} - Trả về kết quả của hàm được gọi (nếu có)
 */
function runFnByRole(baseFuncName, ...args) {
  // 1. Kiểm tra an toàn: Biến CURRENT_USER có tồn tại không?
  let targetFuncName;
  if (typeof CURRENT_USER === 'undefined' || !CURRENT_USER.role) {
    logError('❌ [runFnByRole] Không tìm thấy thông tin Role (CURRENT_USER chưa init).');
    targetFuncName = baseFuncName;
  } else {
    // 2. Xử lý tên Role để ghép chuỗi
    // Input: "SALE" -> Output: "Sale"
    // Input: "OP" -> Output: "Op"
    const rawRole = CURRENT_USER.role;
    const roleSuffix = rawRole.charAt(0).toUpperCase() + rawRole.slice(1).toLowerCase();
    targetFuncName = `${baseFuncName}_${roleSuffix}`;
  }

  // 4. Tìm và chạy hàm
  // Trong JS trình duyệt, hàm toàn cục nằm trong object 'window'
  if (typeof window[targetFuncName] === 'function') {
    try {
      // Gọi hàm và truyền nguyên vẹn các tham số vào
      return window[targetFuncName](...args);
    } catch (err) {
      logError(`❌ [AutoRun] Hàm ${targetFuncName} bị lỗi khi chạy:`, err);
    }
  } else {
    // (Option) Nếu muốn chạy hàm mặc định khi không có hàm riêng
    // Ví dụ: Không có init_Sale thì chạy init()
    if (typeof window[baseFuncName] === 'function') {
      return window[baseFuncName](...args);
    }
  }
}

// =========================================================================
// SMART ASYNC LIBRARY LOADER - Load thư viện bất đồng bộ (không block page)
// =========================================================================

// Cache cấu hình Library - Chứa URL(s), trạng thái load, và check function
// Thêm library mới chỉ cần thêm entry vào đây, không cần sửa hàm loadLibraryAsync
//
// urls có thể là:
// - string: URL đơn lẻ
// - array: Nhiều URLs (load song song)
const _LibraryLoadStatus = {
  xlsx: {
    urls: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/2.8.0/xlsx.full.min.js',
    loaded: false,
    promise: null,
    check: () => typeof window.XLSX !== 'undefined',
  },
  jspdf: {
    urls: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    loaded: false,
    promise: null,
    check: () => typeof window.jspdf !== 'undefined',
  },
  autotable: {
    urls: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js',
    loaded: false,
    promise: null,
    check: () => {
      if (typeof window.jspdf === 'undefined') return false;
      const doc = new window.jspdf.jsPDF();
      return typeof doc.autoTable === 'function';
    },
  },
  pdfjs: {
    urls: [
      'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js',
    ],
    loaded: false,
    promise: null,
    check: () => typeof window.pdfjsLib !== 'undefined',
  },
  html2pdf: {
    urls: 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
    loaded: false,
    promise: null,
    check: () => typeof window.html2pdf !== 'undefined',
  },
};
/**
 * Helper: Load library bất đồng bộ (Async)
 * Hàm này tự động load từ config trong _LibraryLoadStatus
 * Support load 1 URL hoặc nhiều URLs (song song)
 *
 * @param {string} libName - Tên lib: 'xlsx', 'jspdf', 'autotable', 'pdfjs'
 * @returns {Promise<boolean>} - true nếu load thành công, false nếu thất bại
 *
 * Cách thêm library mới:
 * 1. Thêm entry vào _LibraryLoadStatus với urls (string hoặc array), loaded, promise, check
 * 2. Gọi loadLibraryAsync('tên-lib-mới') - Xong!
 * 3. Không cần sửa gì hàm này
 *
 * Ví dụ:
 * - URL đơn: urls: 'https://cdn.../lib.js'
 * - Nhiều URLs: urls: ['https://cdn.../lib1.js', 'https://cdn.../lib2.js']
 */
async function loadLibraryAsync(libName) {
  // 1. Kiểm tra library có tồn tại trong config không
  const libConfig = _LibraryLoadStatus[libName];
  if (!libConfig) {
    logError(`❌ loadLibraryAsync: Unknown library [${libName}]`);
    return false;
  }

  // 2. Nếu đã load xong -> return true luôn
  if (libConfig.loaded === true) {
    return true;
  }

  // 3. Nếu đang load -> chờ Promise đó hoàn thành
  if (libConfig.promise instanceof Promise) {
    return await libConfig.promise;
  }

  // 4. Bắt đầu load (tạo Promise)
  const promise = (async () => {
    try {
      // Kiểm tra xem lib đã có sẵn chưa (tránh load 2 lần)
      if (libConfig.check()) {
        log(`✅ Library [${libName}] already loaded`, 'success');
        return true;
      }

      // Normalize URLs thành array (support cả string và array)
      const urlsToLoad = Array.isArray(libConfig.urls) ? libConfig.urls : [libConfig.urls];

      log(
        `📥 Loading library [${libName}] (${urlsToLoad.length} file${urlsToLoad.length > 1 ? 's' : ''})...`,
        'info'
      );

      // Load tất cả URLs song song
      const loadPromises = urlsToLoad.map((url) => {
        return new Promise((resolve) => {
          const script = document.createElement('script');
          script.src = url;
          script.async = true;

          script.onload = () => {
            log(`✅ Loaded: ${url.split('/').pop()}`, 'success');
            resolve(true);
          };

          script.onerror = () => {
            logError(`❌ Failed to load: ${url}`);
            resolve(false);
          };

          document.head.appendChild(script);
        });
      });

      // Chờ tất cả files load xong
      const results = await Promise.all(loadPromises);

      // Kiểm tra xem tất cả đều load thành công không
      const allSuccess = results.every((r) => r === true);

      // Kiểm tra lại xem library hoạt động chưa
      if (allSuccess && libConfig.check()) {
        log(`✅ Library [${libName}] loaded successfully`, 'success');
        return true;
      } else {
        logError(`❌ Library [${libName}] loaded but check failed`);
        return false;
      }
    } catch (err) {
      logError(`❌ Error loading library [${libName}]:`, err);
      return false;
    }
  })();

  // 5. Cache Promise để tránh load 2 lần
  libConfig.promise = promise;

  // 6. Chờ load xong, update status
  const result = await promise;
  libConfig.loaded = result;
  libConfig.promise = null; // Xóa promise sau khi xong
  return result;
}

/**
 * Pre-load libraries ngay khi app start (Không block, tải song song)
 * Gọi function này trong main.js hoặc onready
 */
function preloadExportLibraries() {
  // Load bất đồng bộ (không chờ)
  Promise.all([
    loadLibraryAsync('xlsx'),
    loadLibraryAsync('jspdf'),
    loadLibraryAsync('autotable'),
  ]).then(() => {
    log('📦 All export libraries pre-loaded', 'success');
  });
}

function downloadTableData_Csv(tableId, fileName = 'table_data.csv') {
  const table = getE(tableId);
  if (!table) {
    logError(`❌ Table with ID "${tableId}" not found.`);
    return;
  }
  let csvContent = '';
  const rows = table.querySelectorAll('tr');
  rows.forEach((row) => {
    const cols = row.querySelectorAll('th, td');
    const rowData = Array.from(cols)
      .map((col) => `"${col.innerText.replace(/"/g, '""')}"`)
      .join(',');
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
}

async function downloadTableData(
  exportData,
  type = 'pdf',
  fileName = 'export_data',
  viewText = 'Dữ liệu xuất file'
) {
  // KIỂM TRA & LOAD LIBRARY TRƯỚC KHI DÙNG
  try {
    if (type === 'excel') {
      // Load XLSX library
      const isXlsxReady = await loadLibraryAsync('xlsx');
      if (!isXlsxReady) {
        throw new Error('❌ Không thể tải thư viện XLSX. Vui lòng kiểm tra kết nối internet.');
      }

      showLoading(true, 'Đang tạo file Excel...');
      const wb = window.XLSX.utils.book_new();
      const ws = window.XLSX.utils.json_to_sheet(exportData);
      const wscols = Object.keys(exportData[0] || {}).map(() => ({ wch: 15 }));
      ws['!cols'] = wscols;
      window.XLSX.utils.book_append_sheet(wb, ws, 'Data');
      window.XLSX.writeFile(wb, `${fileName}.xlsx`);
      showLoading(false);
    } else {
      // Load jsPDF + autoTable libraries
      const isJspdfReady = await loadLibraryAsync('jspdf');
      if (!isJspdfReady) {
        throw new Error('❌ Không thể tải thư viện jsPDF. Vui lòng kiểm tra kết nối internet.');
      }

      const isAutotableReady = await loadLibraryAsync('autotable');
      if (!isAutotableReady) {
        throw new Error('❌ Không thể tải plugin autoTable. Vui lòng kiểm tra kết nối internet.');
      }

      showLoading(true, 'Đang tạo file PDF...');

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'landscape' });

      // Cài đặt font hỗ trợ tiếng Việt
      doc.setFont('arial', 'normal');

      const headers = [Object.keys(exportData[0] || {})];
      const body = exportData.map((obj) => Object.values(obj));
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
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: [44, 62, 80],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          font: 'arial',
        },
        margin: { left: 10, right: 10 },
      });
      doc.save(`${fileName}.pdf`);
      showLoading(false);
    }
    if (typeof showNotify === 'function') showNotify('Đã xuất file thành công!', true);
  } catch (err) {
    showLoading(false);
    logError(err);
    alert('Lỗi khi xuất file: ' + err.message);
  }
}

/**
 * Chuyển đổi trạng thái của một Element giữa DOM và Template.
 * - Nếu Element đang hiển thị: Bọc nó vào <template> (Ẩn khỏi DOM).
 * - Nếu Element đang trong <template>: Đưa nó trở lại DOM.
 * @param {string} targetId - ID của element cần toggle (không phải ID của template).
 * @returns {HTMLElement|null} - Trả về Element nếu vừa unwrap, hoặc null nếu vừa wrap.
 */
function toggleTemplate(targetId) {
  try {
    const tmplId = 'tmpl-' + targetId;

    // Trường hợp 1: Element đang "Sống" trên DOM -> Cần đưa vào Template
    const activeElement = getE(targetId);
    if (!activeElement) {
      log(
        `⚠️ Element #${targetId} không tồn tại trên DOM. Kiểm tra lại ID hoặc trạng thái hiện tại.`
      );
      return null;
    }

    if (activeElement) {
      // 1. Tạo thẻ template
      const template = document.createElement('template');
      template.id = tmplId;
      const htmlString = activeElement.outerHTML; // Lấy HTML của element (bao gồm chính nó)

      // 2. Chèn template vào ngay trước element để giữ vị trí
      activeElement.parentNode.insertBefore(template, activeElement);

      // 3. Chuyển element vào trong template content
      // Lưu ý: appendChild sẽ di chuyển node từ DOM vào Fragment
      template.content.appendChild(activeElement);

      log(`[Utils] Đã ẩn element #${targetId} vào template #${tmplId}`);
      return htmlString;
    }

    // Trường hợp 2: Element đang "Ngủ" trong Template -> Cần đánh thức dậy
    const templateElement = getE(tmplId);

    if (templateElement) {
      // 1. Lấy nội dung từ template (DocumentFragment)
      const content = templateElement.content;

      // Tìm lại element gốc bên trong để return
      const originalElement = content.querySelector('#' + targetId) || content.firstElementChild;

      // 2. Đưa nội dung ra ngoài (chèn vào chỗ của thẻ template)
      templateElement.parentNode.insertBefore(content, templateElement);

      // 3. Xóa thẻ template đi (vì element đã ra ngoài rồi)
      templateElement.remove();

      log(`[Utils] Đã khôi phục element #${targetId} từ template`);
      return originalElement;
    }

    console.warn(`[Utils] Không tìm thấy Element #${targetId} hoặc Template #${tmplId}`);
    return null;
  } catch (error) {
    console.error(`[Utils] Lỗi trong toggleTemplate('${targetId}'):`, error);
    return null;
  }
}

// ✅ Cache để tránh fetch lặp lại
const _htmlCache = {};

/**
 * Tải nội dung HTML từ file tĩnh (local/Firebase Hosting)
 * ✅ Optimized: Cache, timeout, path validation, retry
 *
 * @param {string} url - Tên file (vd: 'tpl_all.html') hoặc đường dẫn đầy đủ
 * @param {Object} options - { useCache: true, timeout: 5000, retry: 1 }
 * @returns {Promise<string>} - HTML content
 */
function getHtmlContent(url, options = {}) {
  const { useCache = true, timeout = 5000, retry = 1 } = options;

  return new Promise((resolve, reject) => {
    let finalSourcePath = url;

    // 1. ✅ PATH VALIDATION: Chặn path traversal & absolute path
    // Bỏ các ký tự nguy hiểm để tránh injection
    if (url.includes('..') || url.startsWith('/')) {
      reject(new Error(`❌ Invalid path: ${url} (Path traversal detected)`));
      return;
    }

    // 2. Nếu là file HTML ngắn gọn (vd: 'tpl_all.html'), tự động thêm path
    if (url.endsWith('.html') && !url.includes('/')) {
      finalSourcePath = './src/components/' + url;
    }

    // 3. ✅ CHECK CACHE TRƯỚC
    if (useCache && _htmlCache[finalSourcePath]) {
      log(`⚡ HTML cached (from: ${finalSourcePath})`, 'info');
      resolve(_htmlCache[finalSourcePath]);
      return;
    }

    // 4. ✅ FETCH WITH TIMEOUT + RETRY LOGIC
    const fetchWithTimeout = (path, attempt = 1) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      fetch(path, { signal: controller.signal })
        .then((response) => {
          clearTimeout(timeoutId);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          return response.text();
        })
        .then((html) => {
          // ✅ CACHE RESULT
          if (useCache) {
            _htmlCache[finalSourcePath] = html;
          }
          log(`✅ HTML loaded from: ${finalSourcePath}`, 'success');
          resolve(html);
        })
        .catch((err) => {
          clearTimeout(timeoutId);

          // ✅ RETRY LOGIC
          if (attempt < retry) {
            log(`⚠️ HTML fetch failed (attempt ${attempt}/${retry}), retrying...`, 'warning');
            setTimeout(() => fetchWithTimeout(path, attempt + 1), 500);
          } else {
            logError(`❌ Failed to load HTML from: ${finalSourcePath} (${err.message})`);
            reject(err);
          }
        });
    };

    fetchWithTimeout(finalSourcePath);
  });
}

/**
 * Clear HTML cache (nếu cần reload)
 */
function clearHtmlCache(urlPattern = null) {
  if (!urlPattern) {
    Object.keys(_htmlCache).forEach((key) => delete _htmlCache[key]);
    log('🗑️ HTML cache cleared', 'info');
  } else {
    if (_htmlCache[urlPattern]) {
      delete _htmlCache[urlPattern];
      log(`🗑️ HTML cache cleared for: ${urlPattern}`, 'info');
    }
  }
}

/**
 * Tải file JS động vào DOM.
 * Tự động phát hiện Role Accountant để tải dạng Module (ES6).
 * * @param {string} filePath - Đường dẫn file JS
 * @param {string|HTMLElement} targetIdorEl - Vị trí append (mặc định là body)
 * @returns {Promise}
 */
function loadJSFile(filePath, userRole = null, targetIdorEl = null) {
  // 1. Xử lý target element
  if (!targetIdorEl) {
    targetIdorEl = document.body;
  } else if (typeof targetIdorEl === 'string') {
    const el = getE(targetIdorEl); // Đảm bảo hàm getE có sẵn
    if (el) {
      targetIdorEl = el;
    } else {
      const errorMsg = `❌ [loadJSFile] Target element not found: ${targetIdorEl}`;
      if (typeof logError === 'function') logError(errorMsg);
      return Promise.reject(new Error(errorMsg));
    }
  }

  return new Promise((resolve, reject) => {
    try {
      const s = document.createElement('script');
      s.src = filePath;

      // 2. Logic kiểm tra Role để set type="module"
      // Kiểm tra an toàn xem biến CURRENT_USER có tồn tại không trước khi truy cập
      if (userRole) {
        const role = userRole.toLowerCase();
        if (role === 'acc' || role === 'acc_thenice') {
          s.type = 'module';
        }
      }

      // 3. Xử lý sự kiện load/error
      s.onload = () => {
        resolve(s);
      };

      s.onerror = (e) => {
        const errorMsg = `❌ Failed to load JS file: ${filePath}`;
        if (typeof logError === 'function') logError(errorMsg);
        reject(new Error(errorMsg));
      };

      // 4. Append vào DOM
      targetIdorEl.appendChild(s);
    } catch (err) {
      // Catch các lỗi đồng bộ khi tạo element
      if (typeof logError === 'function') logError(`❌ Error inside loadJSFile: ${err.message}`);
      reject(err);
    }
  });
}
/**
 * ✅ FIX: Make loadJSForRole asynchronous to prevent scope/timing issues
 * Now waits for all JS files to load before continuing
 * @param {string} userRole - Role (e.g., 'sale', 'op', 'admin')
 * @param {string} baseFilePath - Base path for loading files
 * @returns {Promise} Resolves when all files are loaded
 */
async function loadJSForRole(userRole, baseFilePath = './src/js/') {
  if (!userRole) {
    log('⚠ loadJSForRole: No user role provided', 'warning');
    return Promise.resolve();
  }

  const fileNames = JS_MANIFEST[userRole] || [];
  if (fileNames.length === 0) {
    log(`⚠ loadJSForRole: No files found for role [${userRole}]`, 'warning');
    return Promise.resolve();
  }

  const loadPromises = fileNames.map((fname) => {
    const path = baseFilePath + fname;
    return loadJSFile(path, userRole).catch((err) => {
      logError(`❌ Error loading JS for role ${userRole}, file ${fname}:`, err);
      // Don't throw - continue loading other files
      return null;
    });
  });

  try {
    await Promise.all(loadPromises);
    return true;
  } catch (err) {
    logError(`❌ Error in loadJSForRole:`, err);
    return false;
  }
}

/**
 * Reload trang với tùy chọn force-refresh cache từ server.
 *
 * @param {string} [url] - URL điều hướng (nếu trống: reload URL hiện tại)
 * @param {boolean} [forceUpdate=false] - true = bỏ qua cache, tải mã nguồn mới từ server
 *
 * @example
 * reloadPage();                        // Reload thường (dùng cache)
 * reloadPage(true);                     // Reload + xóa cache (hard refresh)
 * reloadPage(false, '/dashboard');      // Điều hướng URL mới
 * reloadPage(true, '/dashboard');       // Điều hướng + bust cache
 */
function reloadPage(forceUpdate = false, url = null) {
  // Hủy tất cả subscription trước khi rời trang
  try {
    if (typeof A !== 'undefined' && A?.DB?.stopNotificationsListener) {
      A.DB.stopNotificationsListener();
    }
  } catch (e) {
    console.warn('[reloadPage] stopNotificationsListener error:', e);
  }

  if (url) {
    // ── ĐIỀU HƯỚNG URL MỚI ──────────────────────────────────────
    if (forceUpdate) {
      // Thêm cache-bust param vào URL để server trả về bản mới
      const separator = url.includes('?') ? '&' : '?';
      window.location.href = `${url}${separator}_cb=${Date.now()}`;
    } else {
      window.location.href = url;
    }
  } else {
    // ── RELOAD URL HIỆN TẠI ──────────────────────────────────────
    if (forceUpdate) {
      // Cách 1: location.reload(true) - deprecated nhưng vẫn hoạt động trên nhiều browser
      // Cách 2: Thêm cache-bust param vào URL hiện tại (chuẩn hơn)
      const currentUrl = window.location.href.split('?')[0]; // Bỏ query cũ
      const hash = window.location.hash || ''; // Giữ lại hash (#section)
      window.location.href = `${currentUrl}?_cb=${Date.now()}${hash}`;
    } else {
      window.location.reload();
    }
  }
}

/**
 * Module: DataUtils
 * Chuyên trách xử lý Form/Table cho ERP ngành du lịch
 */
const HD = {
  /**
   * setFormData: Đổ dữ liệu vào giao diện
   * @param {string|HTMLElement} root - Element cha (ID hoặc Node)
   * @param {Object|Array} data - Dữ liệu nguồn
   * @param {boolean} isNew - Mặc định true (Lưu giá trị vào data-initial)
   * @param {Object} options - { prefix }
   */
  setFormData(root, data, isNew = true, options = {}) {
    if (!data) return 0;
    const rootEl = $(root);
    if (!rootEl) return 0;

    const { prefix = '' } = options;

    try {
      // Trường hợp Mảng: Đổ vào Table/List
      if (Array.isArray(data)) {
        return this._handleArraySet(rootEl, data, isNew, prefix);
      }

      // Trường hợp Object: Đổ vào Form fields
      return this._handleObjectSet(rootEl, data, isNew, prefix);
    } catch (e) {
      logError('Lỗi setFormData: ', e);
      return 0;
    }
  },

  /**
   * getFormData: Thu thập dữ liệu từ giao diện
   * @param {string|HTMLElement} root - Element cha
   * @param {string} collection - Tên bộ data trong A.DB.schema.FIELD_MAP
   * @param {boolean} onlyNew - Mặc định false (true: chỉ lấy data đã thay đổi)
   * @param {Object} options - { prefix }
   */
  getFormData(root, collection, onlyNew = false, options = {}) {
    const rootEl = typeof root === 'string' ? document.querySelector(root) : root;
    if (!rootEl || !collection) return {};

    const { prefix = '' } = options;
    const results = {};

    // Truy xuất danh sách field từ Mapping hệ thống
    const fields =
      window.A.DB.schema.FIELD_MAP && A.DB.schema.FIELD_MAP[collection]
        ? Object.values(A.DB.schema.FIELD_MAP[collection])
        : [];

    log(
      `🔍 [getFormData] Thu thập dữ liệu từ collection: ${collection} (fields: ${fields.join(', ')})`,
      'info'
    );

    if (fields.length === 0) return results;

    fields.forEach((fieldName) => {
      const selector = `[data-field="${prefix}${fieldName}"], #${prefix}${fieldName}`;
      const el = rootEl.querySelector(selector);
      if (!el) return;

      const currentValue = typeof getFromEl === 'function' ? getFromEl(el) : el.value;
      const initialValue = el.dataset.initial;

      const isPrimaryKey = fieldName === 'id' || fieldName === 'uid';
      const isChanged = String(currentValue) !== String(initialValue);

      if (!onlyNew || isPrimaryKey || isChanged) {
        results[fieldName] = currentValue;
      }
    });

    return results;
  },

  // --- Private Methods ---

  /**
   * _handleArraySet: Xử lý đổ dữ liệu mảng vào Table/List
   * @private
   */
  _handleArraySet(rootEl, data, isNew, prefix) {
    const container = rootEl.tagName === 'TABLE' ? rootEl.querySelector('tbody') || rootEl : rootEl;

    // Tìm các dòng mẫu bằng thuộc tính [data-row]
    let rows = container.querySelectorAll('[data-row]');
    if (rows.length === 0) return 0;

    const templateRow = rows[0];
    const targetCount = data.length;
    const currentCount = rows.length;

    // 1. Đồng bộ số lượng dòng
    if (currentCount < targetCount) {
      const fragment = document.createDocumentFragment();
      for (let i = currentCount; i < targetCount; i++) {
        const newRow = templateRow.cloneNode(true);
        // Làm sạch data-initial và data-item của dòng mới clone
        newRow.removeAttribute('data-item');
        newRow.querySelectorAll('[data-field]').forEach((el) => delete el.dataset.initial);
        fragment.appendChild(newRow);
      }
      container.appendChild(fragment);
    } else if (currentCount > targetCount) {
      for (let i = currentCount - 1; i >= targetCount; i--) {
        rows[i].remove();
      }
    }

    // 2. Đổ dữ liệu và gán định danh (Mấu chốt ở đây)
    const finalRows = container.querySelectorAll('[data-row]');
    finalRows.forEach((row, index) => {
      const itemData = data[index];

      // Gán Index vào data-row thay vì dùng ID
      row.setAttribute('data-row', index);

      // Gán ID của object vào data-item (nếu có)
      if (itemData && (itemData.id || itemData.uid)) {
        row.setAttribute('data-item', itemData.id || itemData.uid);
      }

      // Đệ quy đổ dữ liệu vào các field trong dòng
      this.setFormData(row, itemData, isNew, { prefix });
    });

    return targetCount;
  },

  _handleObjectSet(rootEl, data, isNew, prefix) {
    let count = 0;
    for (const [key, value] of Object.entries(data)) {
      const selector = `[data-field="${prefix}${key}"], #${prefix}${key}`;
      const els = rootEl.querySelectorAll(selector);

      els.forEach((el) => {
        if (typeof setToEl === 'function' && setToEl(el, value)) {
          if (isNew) el.dataset.initial = value ?? '';
          count++;
        }
      });
    }
    return count;
  },
};

/**
 * =========================================================================
 * FILTER UPDATED DATA - So sánh giá trị input và data-initial
 * =========================================================================
 */
/**
 * So sánh giá trị hiện tại (value) với giá trị ban đầu (data-initial)
 * và trả về object chứa các field đã thay đổi.
 *
 * @param {string} containerId - ID của container chứa các input
 * @returns {object} - Object chứa các field có giá trị khác nhau
 *                     Format: { fieldName: newValue, ... }
 *
 * @example
 * // HTML:
 * // <div id="form-container">
 * //   <input data-field="full_name" value="Nguyễn A" data-initial="Nguyễn A">
 * //   <input data-field="phone" value="0909123456" data-initial="0909000000">
 * // </div>
 *
 * // JavaScript:
 * const changes = filterUpdatedData('form-container');
 * // Returns: { phone: "0909123456" } (chỉ field phone thay đổi)
 */
async function filterUpdatedData(containerId, root = document, isCollection = true) {
  const container = getE(containerId, root);
  if (!container) {
    log(`⚠️ Container với ID "${containerId}" không tìm thấy`, 'warning');
    return {};
  }

  // Các field hệ thống tự động cập nhật → bỏ qua khi tính hasRealChanges
  const SYSTEM_FIELDS = new Set(['updated_at', 'created_at']);
  const inputs = container.querySelectorAll('input, select, textarea');

  // ── EARLY EXIT: Phát hiện trường hợp TẠO MỚI ────────────────────────────
  // Chỉ áp dụng khi isCollection = true (ghi collection Firestore).
  // Tìm field 'id' trong container: nếu không có hoặc giá trị rỗng
  // → đây là record mới → trả về toàn bộ data (bỏ qua so sánh data-initial).
  if (isCollection) {
    const idEl = container.querySelector('[data-field="id"]');
    const idValue = idEl ? getFromEl(idEl) : null;
    if (!idEl || !idValue || idValue === '' || idValue === '0') {
      const allData = {};
      inputs.forEach((el) => {
        const fieldName = el.getAttribute('data-field') || el.id;
        if (!fieldName || SYSTEM_FIELDS.has(fieldName)) return;
        allData[fieldName] = getFromEl(el);
      });
      log(
        '⚡ [filterUpdatedData] No ID found, treating as new record. Returning all data.',
        allData
      );
      return allData;
    }
  }

  // ── NORMAL FLOW: So sánh data-initial để phát hiện thay đổi ─────────────
  const updatedData = {};
  let hasRealChanges = false;

  inputs.forEach((el) => {
    const currentValue = getFromEl(el);
    const initialAttr = el.getAttribute('data-initial') || null;
    const fieldName = el.getAttribute('data-field') || el.id;

    if (!fieldName) return;

    // Bỏ qua hoàn toàn các field hệ thống
    if (SYSTEM_FIELDS.has(fieldName)) return;

    const isExactId = fieldName === 'id';
    const isRelatedId = fieldName.endsWith('_id');
    // Nếu data-initial không tồn tại → luôn coi là đã thay đổi
    const isChanged = initialAttr === null || currentValue !== initialAttr;

    // Luôn lấy field id/..._id (làm khoá tham chiếu); các field khác chỉ lấy khi thay đổi
    if (isExactId || isRelatedId || isChanged) {
      updatedData[fieldName] = currentValue;
    }

    // Có thay đổi thực sự = field không phải id thuần, và giá trị khác data-initial
    if (isChanged && !isExactId) {
      hasRealChanges = true;
    }
  });

  // Chỉ trả về dữ liệu khi thực sự có field thay đổi (không tính field id thuần)
  if (!hasRealChanges) return {};
  log('🔍 [filterUpdatedData] Updated fields detected:', updatedData);
  return updatedData;
}

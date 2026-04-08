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
 * - Centralized error Ling
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
  ENABLE_LING: true,
  LOG_TO_STORAGE: true,
  get MAX_STORED_ERRORS() {
    return window.A?.getConfig?.('max_stored_errors') ?? 100;
  },
  ERROR_TIMEOUT_MS: 5000,
  STORAGE_KEY: 'app_errors_log',
  CONTEXTS: {}, // Track error contexts {functionName: count}
};

const LOG_CFG = {
  ENABLE: true,
  get MAX_UI_LINES() {
    return window.A?.getConfig?.('max_ui_log_lines') ?? 100;
  },
  STORAGE_PREFIX: 'app_logs_',
};

/**
 * =============================================================
 * LOG MANAGER - Bản nâng cấp tối ưu
 * =============================================================
 */
const L = {
  stack: [],

  // Helper parse stack trace để lấy file, dòng, hàm (Tối ưu truy vết chuỗi hàm & Line Number)
  _parseStack: function (stack) {
    if (!stack) return { file: 'unknown', line: '?', func: 'anonymous' };
    try {
      const lines = stack.split('\n');
      // Danh sách các hàm nội bộ cần bỏ qua để tìm hàm nghiệp vụ thực tế
      const internalFuncs = ['L.log', 'L._', 'Opps', 'warn', 'logA', 'Object.log', 'Object._', '_parseStack'];
      const appFuncs = [];

      // Duyệt qua stack trace để thu thập các hàm nghiệp vụ
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line || line.trim() === '') continue;

        const isInternal = internalFuncs.some((fn) => line.includes(fn));
        if (!isInternal) {
          // Regex cải tiến: Bắt từ cuối chuỗi ngược lại để tránh nhầm lẫn dấu : trong đường dẫn Windows (C:\...)
          // Nhóm 1: Tên hàm (optional), Nhóm 2: Đường dẫn file, Nhóm 3: Dòng, Nhóm 4: Cột
          const match = line.match(/(?:at\s+)?(?:(.+?)\s+\()?(.*?):(\d+):(\d+)\)?$/) || line.match(/^(.*?)(?:@|at\s+)(.*?):(\d+):(\d+)$/);

          if (match) {
            let fn = match[1] || 'anonymous';
            if (fn.includes('.')) fn = fn.split('.').pop();

            // Bỏ qua các hàm hệ thống/anonymous ở cuối stack
            if (fn !== 'anonymous' && !fn.includes('HTML') && !fn.includes('EventListener') && !fn.includes('Promise') && !fn.includes('setTimeout')) {
              appFuncs.push({
                name: fn,
                file: match[2] ? match[2].split('/').pop() : 'unknown',
                line: match[3] || '?',
                fullPath: match[2] || '',
              });
            }
          }
        }
      }

      // Hàm nghiệp vụ đầu tiên (nơi gọi log trực tiếp)
      const leafApp = appFuncs[0];

      // Tạo chuỗi truy vết (Breadcrumbs) từ hàm gốc đến hàm gọi log
      const breadcrumbs =
        appFuncs.length > 0
          ? appFuncs
              .map((f) => f.name)
              .reverse()
              .join(' > ')
          : 'anonymous';

      if (leafApp) {
        return {
          func: breadcrumbs,
          // Trả về file và line của hàm nghiệp vụ gần nhất với log
          file: leafApp.file,
          line: leafApp.line,
          fullPath: leafApp.fullPath,
        };
      }
      return { file: 'unknown', line: '?', func: 'anonymous' };
    } catch (e) {
      return { file: 'error_parsing', line: '?', func: 'error' };
    }
  },

  // 2. Ghi nhanh thông tin bình thường (L._)
  _: function (msg, data = null, context = 'INFO') {
    return this.log(msg, context, { severity: 'info', data: data });
  },

  // 1. Ghi log hệ thống chính (Core)
  log: function (error, context = 'SYSTEM', meta = {}) {
    const type = meta.severity || 'info';
    const isError = error instanceof Error;
    const message = isError ? error.message : String(error);
    const stack = isError ? error.stack : new Error().stack;
    const info = this._parseStack(stack);

    const errorEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toISOString(),
      timeDisplay: new Date().toLocaleTimeString('vi-VN', { hour12: false }),
      context: context,
      message: message,
      file: info.file,
      line: info.line,
      func: info.func,
      stack: stack,
      type: type,
      data: meta.data || null,
      userAgent: navigator.userAgent,
    };

    this.stack.push(errorEntry);
    if (this.stack.length > 1000) this.stack.shift();

    // Console cho Dev - Hiển thị đẹp hơn kèm vị trí file
    const colors = { error: '#ff4d4f', warning: '#faad14', success: '#52c41a', info: '#1890ff' };
    console.log(`%c[${context}] %c${errorEntry.message} %c(${info.file}:${info.line})`, `color: ${colors[type]}; font-weight: bold;`, 'color: inherit;', 'color: #888; font-style: italic;', meta.data || '');

    // Lưu vào Storage
    this._saveToStorage(errorEntry);
    return errorEntry;
  },

  _saveToStorage: function (entry) {
    try {
      const dateKey = 'app_sys_log_' + new Date().toISOString().split('T')[0];
      let logs = JSON.parse(localStorage.getItem(dateKey) || '[]');
      logs.unshift(entry);
      if (logs.length > 100) logs.length = 100;
      localStorage.setItem(dateKey, JSON.stringify(logs));
    } catch (e) {
      console.warn('LogStorage Full');
    }
  },

  /**
   * HÀM QUAN TRỌNG: Render giao diện log khi cần thiết
   * @param {string} targetId - ID của thẻ HTML (ví dụ 'log-viewer')
   */
  showUI: function (targetId = 'main-content') {
    const container = document.getElementById(targetId);
    if (!container) return;

    const dateKey = 'app_sys_log_' + new Date().toISOString().split('T')[0];
    const logs = JSON.parse(localStorage.getItem(dateKey) || '[]');

    const html = `
      <div class="card shadow-sm mt-3">
        <div class="card-header bg-dark text-white d-flex justify-content-between align-items-center">
          <h6 class="mb-0">Hệ thống Log - Ngày ${new Date().toLocaleDateString()}</h6>
          <button class="btn btn-sm btn-danger" onclick="L.clear()">Xóa tất cả Log</button>
        </div>
        <div class="card-body p-0" style="max-height: 600px; overflow-y: auto;">
          <table class="table table-sm table-hover mb-0" style="font-size: 0.75rem;">
            <thead class="table-light sticky-top">
              <tr>
                <th style="width: 80px">Thời gian</th>
                <th style="width: 60px">Loại</th>
                <th style="width: 120px">File:Dòng</th>
                <th>Nội dung</th>
                <th style="width: 60px">Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              ${logs
                .map(
                  (lg) => `
                <tr class="${lg.type === 'error' ? 'table-danger' : lg.type === 'warning' ? 'table-warning' : ''}">
                  <td class="text-muted">${lg.timeDisplay}</td>
                  <td><span class="badge bg-${lg.type === 'error' ? 'danger' : lg.type === 'success' ? 'success' : lg.type === 'warning' ? 'warning' : 'secondary'}">${lg.type}</span></td>
                  <td class="fw-bold text-primary">${lg.file}:${lg.line} <br><small class="text-muted">${lg.func}</small></td>
                  <td>
                    <div class="fw-bold">${lg.context}</div>
                    <div class="text-wrap">${lg.message}</div>
                  </td>
                  <td>
                    <div class="d-flex gap-1">
                      ${lg.stack ? `<button class="btn btn-xs btn-outline-info" onclick="console.log('Full Stack:', \`${lg.stack.replace(/`/g, '\\`')}\`)">Log</button>` : ''}
                      ${lg.data ? `<button class="btn btn-xs btn-outline-secondary" onclick="console.log('Log Data:', ${JSON.stringify(lg.data)})">Data</button>` : ''}
                    </div>
                  </td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    container.innerHTML = html;
  },

  clear: function () {
    const prefix = 'app_sys_log_';
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith(prefix)) localStorage.removeItem(key);
    });
  },
};

window.L = L;

function Opps(arg1, arg2, arg3, arg4) {
  try {
    let message = 'Lỗi hệ thống';
    let errorObj = null;
    let options = {};

    // 1. Phân tích tham số 1: Có thể là String (message) hoặc Object (Error)
    if (arg1 instanceof Error) {
      errorObj = arg1;
      message = arg1.message;
    } else if (typeof arg1 === 'object' && arg1 !== null) {
      message = arg1.message || JSON.stringify(arg1);
      errorObj = new Error(message);
    } else {
      message = String(arg1 || 'Lỗi không xác định');
    }

    // 2. Phân tích tham số 2: Có thể là Error, String 'error', hoặc Object options
    if (arg2 instanceof Error) {
      errorObj = arg2;
    } else if (typeof arg2 === 'object' && arg2 !== null) {
      options = arg2;
    } else if (typeof arg2 === 'string' && !arg3) {
      // Nếu arg2 là string và không có arg3, có thể là mode (alert/toast)
      options.mode = arg2;
    }

    // 3. Phân tích tham số 3 & 4
    if (typeof arg3 === 'string') options.mode = arg3;
    if (typeof arg4 === 'string') options.context = arg4;
    if (typeof arg4 === 'object') Object.assign(options, arg4);

    // 4. Đảm bảo luôn có Error Object để lấy Stack Trace
    // Nếu tự tạo Error ở đây, stack sẽ bắt đầu từ Opps. L.log sẽ xử lý việc bỏ qua Opps trong stack.
    if (!errorObj) {
      errorObj = new Error(message);
    }

    // 5. Ghi vào L (Hộp đen)
    const context = options.context || 'SYSTEM_OPPS';
    L.log(errorObj, context, {
      severity: 'error',
      data: { originalMessage: message, uiOptions: options },
    });

    // 6. Hiển thị UI qua logA
    if (typeof logA === 'function') {
      return logA(message, 'error', options.mode || 'alert', options);
    } else {
      console.error(`[OPPS]: ${message}`, errorObj);
    }
  } catch (err) {
    console.error('Lỗi nghiêm trọng trong chính hàm Opps:', err);
  }
}

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

/**
 * Chuẩn hóa danh sách từ APP_DATA.lists (có thể là Object hoặc Array) về dạng Array of Objects.
 * @param {Object|Array} list - Dữ liệu đầu vào
 * @returns {Array} Mảng các object
 */
function normalizeList(list) {
  if (!list) return [];
  if (Array.isArray(list)) return list;
  if (typeof list === 'object' && list !== null) {
    return Object.entries(list).map(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        return { id: key, ...value };
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
    .normalize('NFD') // Tách các ký tự có dấu thành ký tự gốc + dấu (ví dụ: 'á' -> 'a' + '´')
    .replace(/[\u0300-\u036f]/g, '') // Loại bỏ các ký tự dấu (diacritics) trong dải Unicode
    .replace(/đ/g, 'd') // Chữ 'đ' thường không được xử lý bởi normalize nên cần replace riêng
    .replace(/Đ/g, 'D'); // Chữ 'Đ' hoa
}

const warn = (prefix, msg, data) => {
  if (LOG_CFG.DEBUG_MODE) {
    console.warn(`%c[${prefix}] ⚠️ ${msg}`, 'color:orange; font-weight:bold;', data || '');
    L._(`%c[${prefix}] ⚠️ ${msg}`, data || '', 'warning');
  }
};

/* =========================
 * 3. FORMATTING UTILITIES (ĐÃ TỐI ƯU NGÀY THÁNG)
 * ========================= */

/**
 * 9 TRIP ERP HELPER: SMART DATE PARSER (V2 - Optimized)
 * Chức năng: Nhận diện ngôn ngữ tự nhiên để trả về khoảng thời gian
 * @param {string} textInput - "Tháng 1", "Tuần trước", "Quý 3", "Hôm qua"...
 */
function getDateRange(textInput) {
  if (!textInput) return null;

  const text = textInput.toLowerCase().trim();
  const now = new Date();
  const y = now.getFullYear(),
    m = now.getMonth(),
    d = now.getDate();

  // 1. Xác định trạng thái thời gian (isPast, isNext, isThis)
  const isPast = /qua|trước|ngoái|yesterday|last/.test(text);
  const isNext = /mai|tới|sau|tomorrow|next/.test(text);
  const isThis = /nay|này|this|current/.test(text);
  const offset = isPast ? -1 : isNext ? 1 : 0;

  // 2. Helper lấy số (VD: "Tháng 12" -> 12)
  const num = parseInt(text.match(/\d+/)?.[0] || 0);

  // 3. Config logic cho từng loại đơn vị
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

  // 4. Xử lý trường hợp đặc biệt
  if (text.includes('all')) return { start: new Date(2024, 0, 1, 0, 0, 0), end: new Date(2028, 11, 31, 23, 59, 59) };
  if (text.includes('tùy chọn') || text.includes('-1')) return null;

  // 5. Tìm unit phù hợp và tính toán
  const unit = units.find((u) => u.keys.some((k) => text.includes(k)));
  let [start, end] = unit ? unit.calc() : [new Date(y, m, d), new Date(y, m, d)];

  // 6. Chốt hạ giờ giấc chuẩn DB
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
  const config = window.A?.getConfig?.('intl') || {};
  return new Intl.NumberFormat(config.locale, config.numberOptions).format(num);
}

function formatMoney(n) {
  if (n === '' || n === null || n === undefined) return '';
  const num = Number(n);
  if (isNaN(num)) {
    warn('formatMoney', 'Giá trị không phải số:', n);
    return '0';
  }
  const config = window.A?.getConfig?.('intl') || {};
  return new Intl.NumberFormat(config.locale, config.currencyOptions).format(num);
}

/**
 * =========================================================================
 * DATE FORMATTER (V2) - dd/mm/yyyy
 * Hỗ trợ: String Number (IndexedDB), Timestamp, Serial Number, Date Object
 * =========================================================================
 */
function formatDateVN(dateInput) {
  try {
    if (!dateInput) return '';

    let date;
    let target = dateInput;

    // CHUYỂN ĐỔI THÔNG MINH: Nếu là string nhưng nội dung là dãy số (VD: "1772990290356")
    if (typeof target === 'string' && /^\d+$/.test(target.trim())) {
      target = Number(target.trim());
    }

    // 1. Xử lý Firestore Timestamp {seconds, nanoseconds}
    if (target && typeof target === 'object' && target.seconds) {
      date = new Date(target.seconds * 1000);
    }
    // 2. Xử lý Dạng số (Mili giây hoặc Excel Serial)
    else if (typeof target === 'number') {
      if (target > 1000000000000) {
        date = new Date(target);
      } else {
        // Excel Serial Number (nếu số nhỏ)
        date = new Date((target - 25569) * 86400 * 1000);
      }
    }
    // 3. Xử lý các định dạng khác (ISO String, Date Object...)
    else {
      date = new Date(target);
    }

    if (isNaN(date.getTime())) return '';

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const config = window.A?.getConfig?.('intl') || {};

    return new Intl.DateTimeFormat('vi-VN', config.dateOptions).format(date) || `${day}/${month}/${year}`;
  } catch (error) {
    if (typeof ErrorLogger !== 'undefined') {
      ErrorLogger.log(error, 'formatDateVN', { data: dateInput });
    }
    return '';
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
}

/* =========================
 * 4. UI MANIPULATION
 * ========================= */

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

    L._(`9 Trip UI: Điều chỉnh vị trí element. X: ${deltaX}, Y: ${deltaY}`);

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
    if (Array.isArray(target) || (typeof NodeList !== 'undefined' && target instanceof NodeList) || (typeof HTMLCollection !== 'undefined' && target instanceof HTMLCollection)) {
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
    if (typeof L.log === 'function') L.log(`[DOM] resolveEls lỗi: ${target}`, e);
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
  L._('[DOM] getE: Invalid input type', input);
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
    else if (classList.contains('number') || el.type === 'number') {
      // Lấy từ dataset (nguồn gốc) hoặc value (hiển thị)
      // const rawVal = el.dataset.val !== undefined && el.dataset.val !== '' ? el.dataset.val : el.value;
      // // Chỉ lấy số (0-9) để đảm bảo logic cũ không bị sai lệch
      // val = String(rawVal || '').replace(/[^0-9.-]/g, '');
      // return val === '' ? 0 : Number(val);
      return getNum(el);
    }
    // --- CASE 4: PHONE NUMBER (New: Chỉ lấy số sạch) ---
    else if (classList.contains('phone_number') || el.type === 'tel' || el.dataset.field === 'phone' || el.dataset.field === 'customer_phone') {
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
    if (typeof L.log === 'function') L.log(`[DOM] getFromEl lỗi ID: ${el.id}`, e);
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
    if (classList.contains('number') || el.type === 'number') {
      let rawNum = 0;
      if (vRaw !== '' && vRaw !== null && vRaw !== undefined) {
        rawNum = String(vRaw).replace(/[^0-9]/g, '');
        rawNum = Number(rawNum);
        if (isNaN(rawNum)) rawNum = 0;
      }
      if (el.dataset && !el.dataset.initial) el.dataset.initial = String(rawNum);

      // SSOT: Lưu số gốc
      el.dataset.val = rawNum;

      // UI: Hiển thị đẹp
      if (el.type === 'number') {
        el.value = rawNum;
      } else {
        el.value = typeof formatNumber === 'function' ? formatNumber(rawNum) : new Intl.NumberFormat('vi-VN').format(rawNum);
      }
      return true;
    }

    // --- CASE B: PHONE NUMBER (Format hiển thị) ---
    if (classList.contains('phone_number') || el.type === 'tel' || el.dataset.field === 'phone' || el.dataset.field === 'customer_phone') {
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
    if (typeof L.log === 'function') L.log(`[DOM] setToEl lỗi`, err);
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
    if (typeof L._ === 'function') L._(`[DOM] getVal lỗi`, 'danger');
    return opt.fallback ?? '';
  }
}
function setVal(id, value, root = document) {
  try {
    const el = $(id, root);
    if (!el) {
      // Không tìm thấy element để set -> Log warning nhẹ
      L._(`[DOM] setVal: Không tìm thấy ID "${id}"`, 'warning');
      return false;
    }
    return setToEl(el, value);
  } catch (e) {
    if (typeof L._ === 'function') L._(`[DOM] setVal lỗi ${e.message}`);
    return false;
  }
}

// --- NUMERIC SPECIALISTS ---

/**
 * setNum: An toàn tuyệt đối
 * (Giữ nguyên logic V3 vì đã tốt)
 */
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

    // SSOT: Lưu số gốc
    el.dataset.val = rawNum;

    // UI: Hiển thị đẹp
    if (el.type === 'number') {
      el.value = rawNum;
    } else {
      el.value = formatNumber(rawNum);
    }
  } catch (e) {
    if (typeof Opps === 'function') Opps(`[DOM] setNum lỗi`, 'danger');
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
function getNum(target, root = document) {
  try {
    if (typeof target === 'number') return target;
    var el = null;
    if (target.nodeType === 1) el = target;
    else el = $(target, root);
    let rawVal = el ? el.dataset.val || el.value || el.textContent : String(target);

    if (!rawVal) return 0;

    // Logic parse thông minh:
    let cleanStr = String(rawVal).trim();

    // 1. Kiểm tra trường hợp đặc biệt: nếu sau dấu , hoặc . chỉ có đúng 1 chữ số thì đó là dấu thập phân
    // Ví dụ: "1.200,5" -> 1200.5, nhưng "1.5" -> 1.5
    const lastDotIdx = cleanStr.lastIndexOf('.');
    const lastCommaIdx = cleanStr.lastIndexOf(',');

    // Yêu cầu mới: Nếu có dấu , hoặc . và sau nó là 1 chữ số duy nhất HOẶC trong giá trị có cả , và .
    // Thì đó là dấu phân cách hàng nghìn -> xử lý làm tròn giá trị để hết phần thập phân sau đó loại bỏ cả 2 kí tự khỏi giá trị

    const hasBoth = lastCommaIdx !== -1 && lastDotIdx !== -1;
    const lastCharIsDigit = /\d$/.test(cleanStr);

    // Tối ưu: Nếu sau dấu phân cách có 1 hoặc 2 chữ số thì đó là dấu thập phân (vì hàng nghìn phải có 3 số)
    const distToLastComma = cleanStr.length - lastCommaIdx - 1;
    const distToLastDot = cleanStr.length - lastDotIdx - 1;

    const isCommaDecimal = lastCommaIdx !== -1 && (distToLastComma === 1 || distToLastComma === 2) && lastCharIsDigit;
    const isDotDecimal = lastDotIdx !== -1 && (distToLastDot === 1 || distToLastDot === 2) && lastCharIsDigit;

    if (hasBoth || isCommaDecimal || isDotDecimal) {
      // Nếu là dấu thập phân (chỉ có 1 số sau dấu) hoặc có cả 2 loại dấu
      // Bước 1: Chuẩn hóa về dạng số có dấu chấm thập phân để parseFloat
      let tempStr = cleanStr;
      if (hasBoth) {
        // Có cả 2: Giả định dấu cuối cùng là thập phân nếu nó cách cuối 1-2 ký tự,
        // nhưng theo yêu cầu "có cả , và . thì đó là dấu phân cách hàng nghìn" -> làm tròn.
        // Tuy nhiên, để làm tròn chính xác, ta cần biết cái nào là thập phân.
        // Theo logic ERP: 1.200,5 hoặc 1,200.5
        if (lastCommaIdx > lastDotIdx) {
          tempStr = tempStr.replace(/\./g, '').replace(',', '.');
        } else {
          tempStr = tempStr.replace(/,/g, '');
        }
      } else if (isCommaDecimal) {
        tempStr = tempStr.replace(/\./g, '').replace(',', '.');
      } else if (isDotDecimal) {
        // Nếu chỉ có dấu chấm và sau đó là 1 số, parseFloat mặc định hiểu là thập phân
        // Nhưng nếu có nhiều dấu chấm thì là hàng nghìn.
        if (tempStr.split('.').length > 2) {
          const parts = tempStr.split('.');
          const lastPart = parts.pop();
          tempStr = parts.join('') + '.' + lastPart;
        }
      }

      let num = parseFloat(tempStr);
      if (!isNaN(num)) {
        // Làm tròn để hết phần thập phân
        num = Math.round(num);
        // Loại bỏ cả 2 kí tự khỏi giá trị (trả về số nguyên sạch)
        return num;
      }
    }

    // 2. Logic cũ cho các trường hợp khác
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

// --- BATCH OPERATORS ---
/**
 * Lấy giá trị từ các phần tử được chỉ định bởi target trong một phần tử gốc chỉ định.
 * Nếu target là một biến không tương ứng với bất kỳ phần tử nào, trả về mảng chứa target.
 *
 * @param {string|Array|NodeList|HTMLElement} target - Các phần tử đích để lấy giá trị từ đó. Có thể là CSS selector, mảng các phần tử, NodeList, hoặc một HTMLElement đơn lẻ.
 * @param {object} [optOrRoot={}] - Đối tượng cấu hình tùy chọn hoặc phần tử gốc.
 * @param {HTMLElement} [optOrRoot.root=document] - Phần tử gốc để bắt đầu tìm kiếm nếu không sử dụng document làm mặc định. Bỏ qua nếu `optOrRoot` là một nút DOM.
 * @param {boolean} [optOrRoot.silent=false] - Nếu được đặt thành true, bỏ qua bất kỳ lỗi nào trong quá trình thực thi.
 * @param {...*} [rest] - Tùy chọn bổ sung được chuyển đến hàm `getFromEl`.
 *
 * @returns {Array} Một mảng các giá trị lấy được từ các phần tử khớp với target.
 * Nếu không tìm thấy phần tử nào, trả về mảng chứa chính target.
 * Trong trường hợp xảy ra lỗi, trả về một mảng rỗng.
 */
function getVals(target, optOrRoot = {}) {
  try {
    const { root = document, silent = false, ...rest } = optOrRoot.nodeType === 1 ? { root: optOrRoot } : optOrRoot;
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
    const { root = document, keepMissing = false } = optOrRoot.nodeType === 1 ? { root: optOrRoot } : optOrRoot;
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

function showLoading(show, text = 'Loading...') {
  let el = getE('loading-overlay');
  if (!el) {
    if (!show) return;
    el = document.createElement('div');
    el.id = 'loading-overlay';
    el.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.8);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;';
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
  const normalized = normalizeList(dataList);

  if (Array.isArray(normalized)) {
    html += normalized
      .map((item) => {
        const val = typeof item === 'object' && item !== null ? item.id : item;
        const txt = typeof item === 'object' && item !== null ? item.name || item.id : item;
        return `<option value="${val}">${A.Lang.t(txt)}</option>`;
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

/* =========================
 * 6. EVENTS & ASYNC
 * ========================= */
async function retryTask(taskFn, options = {}) {
  const {
    retries = 2, // số lần thử lại
    delay = 1000, // thời gian chờ giữa các lần (ms)
    onError = null, // callback khi lỗi
  } = options;

  let attempt = 0;

  while (attempt < retries) {
    try {
      // Nếu là function thường → giữ ngữ cảnh bằng apply
      // Nếu là arrow function → chỉ cần spread
      if (taskFn.prototype) {
        return await taskFn.apply(this);
      } else {
        return await taskFn();
      }
    } catch (err) {
      attempt++;
      if (onError) onError(err, attempt);

      if (attempt >= retries) throw err;

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

function debounce(taskFn, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      // Nếu taskFn là arrow function hoặc không phụ thuộc this → dùng spread
      // Nếu taskFn là function thường → giữ ngữ cảnh bằng apply
      if (taskFn.prototype) {
        taskFn.apply(this, args);
      } else {
        taskFn(...args);
      }
    }, delay);
  };
}

function throttle(taskFn, limit = 300) {
  let inThrottle = false;

  return function (...args) {
    if (!inThrottle) {
      // Nếu là function thường → giữ ngữ cảnh bằng apply
      // Nếu là arrow function → chỉ cần spread
      if (taskFn.prototype) {
        taskFn.apply(this, args);
      } else {
        taskFn(...args);
      }

      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
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
  if (typeof L !== 'undefined' && typeof L._ === 'function') L._(message, null, type);

  // ── Xác định mode ───────────────────────────────────────────────────────
  const isCallbackMode = typeof modeOrCallback === 'function';
  const mode = isCallbackMode ? 'confirm' : String(modeOrCallback ?? 'toast').toLowerCase(); // 'toast' | 'alert' | 'confirm'

  // ── Tách deny callback và args ──────────────────────────────────────────
  let confirmCallback = null;
  let denyCallback = null;
  let cbArgs = [];
  let swalExtra = {};

  if (isCallbackMode) {
    if (typeof rest[0] === 'function') {
      denyCallback = rest[0];
      cbArgs = rest.slice(1);
    } else {
      cbArgs = rest;
    }
  } else {
    if (rest.length === 1 && rest[0] && typeof rest[0] === 'object') {
      const { onConfirm: _onConfirm, onDeny: _onDeny, onCancel: _onCancel, mode: _mode, ...remaining } = rest[0];
      confirmCallback = typeof _onConfirm === 'function' ? _onConfirm : null;
      denyCallback = typeof _onDeny === 'function' ? _onDeny : typeof _onCancel === 'function' ? _onCancel : null;
      swalExtra = remaining;
    }
  }

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
  const _Swal = window.Swal || (typeof Swal !== 'undefined' ? Swal : null);

  if (!_Swal) {
    console.warn('[logA] SweetAlert2 (Swal) is not loaded.');
    if (mode === 'toast') {
      console.info('[logA] Toast fallback to console:', message);
      return;
    }
    if (mode === 'alert') {
      alert(message);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const ok = window.confirm(message);
      if (ok && isCallbackMode) modeOrCallback(...cbArgs);
      else if (!ok && denyCallback) denyCallback();
      resolve(ok);
    });
  }

  const c = typeof _bsBtnColors === 'function' ? _bsBtnColors() : {};

  const basePopup = {
    position: 'center',
    draggable: false,
    toast: false,
    timer: undefined,
    timerProgressBar: false,
    background: c.bodyBg || '',
    color: c.bodyColor || '',
    buttonsStyling: false,
    allowOutsideClick: false,
    customClass: {
      popup: 'shadow rounded-3',
      title: 'fw-semibold fs-5',
      htmlContainer: 'text-start',
    },
  };

  // ── Toast: hiển thị góc phải trên, tự ẩn sau 3.5s ───────────────────────
  if (mode === 'toast') {
    _Swal.fire({
      toast: true,
      position: 'top-end',
      icon,
      title: String(message),
      showConfirmButton: false,
      timer: (typeof A !== 'undefined' && typeof A.getConfig === 'function' ? A.getConfig('toast_duration') : null) || 3500,
      timerProgressBar: true,
      didOpen: (toast) => {
        toast.onmouseenter = _Swal.stopTimer;
        toast.onmouseleave = _Swal.resumeTimer;
      },
    });
    return;
  }

  // ── Alert modal: chính giữa, 1 nút Đóng, không tự ẩn ───────────────────
  if (mode === 'alert') {
    const { title: customTitle, ...extraSwal } = swalExtra;
    return _Swal.fire({
      ...basePopup,
      allowOutsideClick: true,
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
  const { title: customTitle = '', confirmText = 'Xác nhận', denyText = 'Từ chối', cancelText = 'Hủy', confirmBtn: okVariant = variant, denyBtn: denyVariant = 'danger', cancelBtn: noVariant = 'secondary', ...extraSwal } = swalExtra;
  const confirmTitle = customTitle || (autoTitle === 'Thông báo' ? 'Xác nhận' : autoTitle);

  return _Swal
    .fire({
      ...basePopup,
      allowOutsideClick: false,
      icon,
      draggable: true,
      title: confirmTitle,
      html: htmlBody,
      showCancelButton: true,
      showDenyButton: isDenyMode,
      confirmButtonText: confirmText,
      ...(isDenyMode && { denyButtonText: denyText }),
      cancelButtonText: cancelText,
      confirmButtonColor: c[okVariant] || c.primary || '#0d6efd',
      ...(isDenyMode && { denyButtonColor: c[denyVariant] || c.danger || '#dc3545' }),
      cancelButtonColor: c[noVariant] || c.secondary || '#6c757d',
      focusConfirm: !isDangerous,
      focusCancel: isDangerous && !isDenyMode,
      focusDeny: isDangerous && isDenyMode,
      reverseButtons: false,
      customClass: {
        ...basePopup.customClass,
        confirmButton: `btn btn-${okVariant} px-4`,
        ...(isDenyMode && { denyButton: `btn btn-${denyVariant} px-4` }),
        cancelButton: `btn btn-${noVariant} px-4`,
        actions: 'gap-2',
      },
      ...extraSwal,
    })
    .then((result) => {
      if (result.isConfirmed) {
        if (isCallbackMode) modeOrCallback(...cbArgs);
        else if (confirmCallback) confirmCallback();
      } else if (result.isDenied) {
        if (denyCallback) denyCallback();
      }
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

function showAlert(message, type = 'info', title = 'Thông Báo', options = {}) {
  return logA(message, type, 'alert', title ? { title, ...options } : options);
}

function showConfirm(message, okFnOrOpts, denyFn, opts = {}) {
  let finalOpts = {};
  if (typeof okFnOrOpts === 'function') {
    finalOpts = { ...opts, onConfirm: okFnOrOpts, onDeny: denyFn };
  } else {
    finalOpts = { ...okFnOrOpts };
  }
  return logA(message, 'warning', 'confirm', finalOpts);
}

var _notifTimer = null;

// --- BỔ SUNG HÀM FULL SCREEN ---
function toggleFullScreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((err) => {
      Opps(`Lỗi khi bật Fullscreen: ${err.message}`);
    });
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
}

/**
 * THỰC THI HÀM ĐỘNG (DYNAMIC FUNCTION EXECUTION)
 * Phân giải và chạy một function từ biến trực tiếp hoặc đường dẫn chuỗi (VD: 'App.Sales.tinhTien').
 * Giữ nguyên ngữ cảnh (context/this) của object cha chứa hàm đó.
 * * @param {Function|String} funcRef - Hàm hoặc chuỗi đường dẫn tới hàm
 * @param {Array} args - Mảng các tham số truyền vào hàm (VD: [value, element])
 * @param {Object} defaultContext - Ngữ cảnh mặc định nếu không tìm thấy object cha (thường là window)
 * @returns {Promise<any>} - Trả về kết quả của hàm (hỗ trợ cả hàm async)
 */
window.runFn = async function (funcRef, args = [], defaultContext = window) {
  if (!funcRef) return null;

  try {
    let funcToCall = null;
    let context = defaultContext;

    // TH1: Nếu funcRef đã là một function trực tiếp
    if (typeof funcRef === 'function') {
      funcToCall = funcRef;
    }
    // else if (typeof funcRef === 'string' && funcRef.trim() !== '') {
    //   // Nếu chuỗi chứa các ký tự đặc trưng của một đoạn code (dấu ;, ngoặc, khoảng trắng)
    //   if (funcRef.includes(';') || funcRef.includes('(') || funcRef.match(/\s/)) {
    //     try {
    //       // Tạo một hàm ẩn danh nhận 3 tham số từ string code của bạn
    //       const dynamicScript = new Function('value', 'selectEl', 'instance', funcRef);
    //       return await dynamicScript(args[0], args[1], args[2]);
    //     } catch (err) {
    //       Opps('Lỗi khi chạy script nội tuyến:', err);
    //       return null;
    //     }
    //   }
    // }
    // TH2: Nếu funcRef là chuỗi (VD: 'ModuleA.Controller.handleEvent')
    else if (typeof funcRef === 'string' && funcRef.trim() !== '') {
      const parts = funcRef.trim().split('.');
      let current = window;

      for (let i = 0; i < parts.length; i++) {
        if (current[parts[i]] !== undefined) {
          // Cập nhật context là Object cha chứa hàm (phần tử ngay trước hàm cuối cùng)
          if (i < parts.length - 1) {
            context = current[parts[i]];
          }
          current = current[parts[i]];
        } else {
          current = null;
          break;
        }
      }

      if (typeof current === 'function') {
        funcToCall = current;
      } else {
        console.warn(`[Helper] Cảnh báo: Không tìm thấy hàm hợp lệ cho chuỗi "${funcRef}"`);
        return null;
      }
    }

    // Thực thi hàm với context đã phân giải và truyền mảng tham số
    if (funcToCall) {
      return await funcToCall.apply(context, args);
    }
  } catch (error) {
    Opps(`[Helper] Lỗi khi thực thi hàm động (${funcRef}):`, error);
    return null; // Trả về null để không làm crash luồng chạy chính
  }
};

/**
 * Tự động tìm và chạy hàm theo Role của User hiện tại. Hỗ trợ an toàn cả hàm Sync và Async (Promise).
 * Quy tắc ghép tên: [tên_gốc]_[RoleViếtHoaChữCáiĐầu]
 * Ví dụ: baseName='init', Role='SALE' => Chạy hàm init_Sale()
 * * @param {string} baseFuncName - Tên hàm gốc (ví dụ: 'render', 'saveData')
 * @param {...any} args - Các tham số muốn truyền vào hàm đó (nếu có)
 * @return {any} - Trả về kết quả của hàm được gọi (có thể là giá trị ngay lập tức hoặc một Promise)
 */
window.runFnByRole = function (baseFuncName, ...args) {
  try {
    // 1. Kiểm tra User context
    if (typeof CURRENT_USER === 'undefined' || !CURRENT_USER || !CURRENT_USER.role) {
      console.warn('❌ [runFnByRole] CURRENT_USER chưa init. Thử chạy hàm gốc.');
      if (typeof window[baseFuncName] === 'function') {
        return executeAndHandlePromise(window[baseFuncName], baseFuncName, args);
      }
      return;
    }

    const rawRole = CURRENT_USER.role;
    const moduleObj = ['UI', 'Logic', 'DB', 'Confirmation'];
    let moduleKey = null;
    let finalArgs = [...args];

    // 2. Tự động nhận diện moduleKey nếu tham số đầu tiên nằm trong danh sách
    if (typeof args[0] === 'string' && moduleObj.includes(args[0])) {
      moduleKey = args[0];
      finalArgs.shift(); // Loại bỏ moduleKey khỏi danh sách tham số truyền vào hàm đích
    }

    const prefixMap = {
      sale: 'SalesModule',
      admin: 'SalesModule',
      op: 'Op',
      acc: 'AccountantController',
      acc_thenice: 'AccountantController',
    };

    const prefix = prefixMap[rawRole] || null;
    let targetFn = null;
    let executedFuncName = baseFuncName;

    // 3. Phân tích tên hàm đích
    if (prefix && moduleKey) {
      // Truy cập hàm lồng nhau: window[prefix][moduleKey][baseFuncName]
      targetFn = window[prefix]?.[moduleKey]?.[baseFuncName];
      executedFuncName = `${prefix}.${moduleKey}.${baseFuncName}`;
    } else {
      // Ghép tên hàm phẳng: baseFuncName_Role
      const roleSuffix = rawRole.charAt(0).toUpperCase() + rawRole.slice(1).toLowerCase();
      const targetFuncName = `${baseFuncName}_${roleSuffix}`;
      targetFn = window[targetFuncName];
      executedFuncName = targetFuncName;
    }

    // 4. Chọn hàm để thực thi
    let fnToRun = null;
    if (typeof targetFn === 'function') {
      fnToRun = targetFn;
    } else if (typeof window[baseFuncName] === 'function') {
      fnToRun = window[baseFuncName];
      executedFuncName = baseFuncName; // Fallback về hàm gốc
    } else {
      console.warn(`⚠️ [runFnByRole] Không tìm thấy hàm mục tiêu: ${executedFuncName} hoặc ${baseFuncName}`);
      return;
    }

    // 5. Thực thi và xử lý kết quả trả về
    return executeAndHandlePromise(fnToRun, executedFuncName, finalArgs);
  } catch (err) {
    // Lỗi này bắt các sự cố đồng bộ (ví dụ: lỗi đánh máy biến, lỗi syntax nội tại khi thiết lập logic)
    console.error(`❌ [runFnByRole] Lỗi SYNC nội tại khi chuẩn bị/thực thi ${baseFuncName}:`, err);
    throw err;
  }
};

/**
 * Hàm Helper nội bộ: Nhận diện và bắt lỗi an toàn cho cả hàm thường và hàm trả về Promise
 */
function executeAndHandlePromise(fn, fnName, args) {
  const result = fn(...args);

  // Kiểm tra xem kết quả có phải là Promise không (Duck typing: object có chứa hàm .then)
  if (result && typeof result.then === 'function' && typeof result.catch === 'function') {
    return result.catch((err) => {
      // Lỗi này bắt các sự cố bất đồng bộ (ví dụ: lỗi Firestore, lỗi Fetch API)
      console.error(`❌ [runFnByRole] Lỗi ASYNC (Promise Rejection) khi chạy ${fnName}:`, err);
      throw err; // Tiếp tục ném lỗi lên để caller gốc (nếu có await) có thể handle tiếp
    });
  }

  return result; // Hàm đồng bộ bình thường
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
    urls: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
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
    urls: ['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js'],
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
    L.log(`❌ loadLibraryAsync: Unknown library [${libName}]`);
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
        L._(`✅ Library [${libName}] already loaded`, 'success');
        return true;
      }

      // Normalize URLs thành array (support cả string và array)
      const urlsToLoad = Array.isArray(libConfig.urls) ? libConfig.urls : [libConfig.urls];

      L._(`📥 Loading library [${libName}] (${urlsToLoad.length} file${urlsToLoad.length > 1 ? 's' : ''})...`, 'info');

      // Load tất cả URLs song song
      const loadPromises = urlsToLoad.map((url) => {
        return new Promise((resolve) => {
          const script = document.createElement('script');
          script.src = url;
          script.async = true;

          script.onload = () => {
            L._(`✅ Loaded: ${url.split('/').pop()}`, 'success');
            resolve(true);
          };

          script.onerror = () => {
            L.log(`❌ Failed to load: ${url}`);
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
        L._(`✅ Library [${libName}] loaded successfully`, 'success');
        return true;
      } else {
        L.log(`❌ Library [${libName}] loaded but check failed`);
        return false;
      }
    } catch (err) {
      L.log(`❌ Error loading library [${libName}]:`, err);
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
  Promise.all([loadLibraryAsync('xlsx'), loadLibraryAsync('jspdf'), loadLibraryAsync('autotable')]).then(() => {
    L._('📦 All export libraries pre-loaded', 'success');
  });
}

function downloadTableData_Csv(tableId, fileName = 'table_data.csv') {
  const table = getE(tableId);
  if (!table) {
    Opps(`❌ Table with ID "${tableId}" not found.`);
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

async function downloadTableData(exportData, type = 'pdf', fileName = 'export_data', viewText = 'Dữ liệu xuất file') {
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
    Opps(err);
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
      L._(`⚠️ Element #${targetId} không tồn tại trên DOM. Kiểm tra lại ID hoặc trạng thái hiện tại.`);
      return null;
    }

    if (activeElement && activeElement.tagName.toLowerCase() !== 'template') {
      // 1. Tạo thẻ template
      const template = document.createElement('template');
      template.id = tmplId;
      const htmlString = activeElement.outerHTML; // Lấy HTML của element (bao gồm chính nó)

      // 2. Chèn template vào ngay trước element để giữ vị trí
      activeElement.parentNode.insertBefore(template, activeElement);

      // 3. Chuyển element vào trong template content
      // Lưu ý: appendChild sẽ di chuyển node từ DOM vào Fragment
      template.content.appendChild(activeElement);

      L._(`[Utils] Đã ẩn element #${targetId} vào template #${tmplId}`);
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

      L._(`[Utils] Đã khôi phục element #${targetId} từ template`);
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
function loadHtmlFile(url, options = {}) {
  const { useCache = true, timeout = 5000, retry = 1, containerId = null } = options;

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
      finalSourcePath = '/src/components/' + url;
    }

    // 3. ✅ CHECK CACHE TRƯỚC
    if (useCache && _htmlCache[finalSourcePath]) {
      L._(`⚡ HTML cached (from: ${finalSourcePath})`, 'info');
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
          // 2. Tạo div ảo để chứa HTML
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = html;

          // 3. Tạo Fragment để chứa kết quả
          const contentFragment = document.createDocumentFragment();

          // 4. Chuyển TOÀN BỘ nội dung từ tempDiv sang Fragment
          // Cách này sẽ giữ nguyên mọi thứ: div, span, và cả thẻ <template>
          while (tempDiv.firstChild) {
            contentFragment.appendChild(tempDiv.firstChild);
          }
          if (containerId) getE(containerId).appendChild(contentFragment);

          L._(`✅ HTML loaded from: ${finalSourcePath}`, 'success');
          resolve(html);
        })
        .catch((err) => {
          clearTimeout(timeoutId);

          // ✅ RETRY LOGIC
          if (attempt < retry) {
            L._(`⚠️ HTML fetch failed (attempt ${attempt}/${retry}), retrying...`, 'warning');
            setTimeout(() => fetchWithTimeout(path, attempt + 1), 500);
          } else {
            Opps(`❌ Failed to load HTML from: ${finalSourcePath} (${err.message})`);
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
    L._('🗑️ HTML cache cleared', 'info');
  } else {
    if (_htmlCache[urlPattern]) {
      delete _htmlCache[urlPattern];
      L._(`🗑️ HTML cache cleared for: ${urlPattern}`, 'info');
    }
  }
}

function addDynamicCSS(cssCode, styleId = 'app-dynamic-styles') {
  let styleTag = getE(styleId);
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = styleId;
    document.head.appendChild(styleTag);
  }
  styleTag.textContent += '\n' + cssCode;
}

/**
 * Tải file JS động vào DOM.
 * Tự động phát hiện Role Accountant để tải dạng Module (ES6).
 * * @param {string} filePath - Đường dẫn file JS
 * @param {string|HTMLElement} targetIdorEl - Vị trí append (mặc định là body)
 * @returns {Promise}
 */
/**
 * Tải file JavaScript động và chèn vào DOM
 * @param {string} filePath - Đường dẫn file JS (Tương đối hoặc Tuyệt đối)
 * @param {string|null} userRole - Vai trò người dùng (admin, acc,...)
 * @param {string|HTMLElement|null} targetIdorEl - Nơi chèn thẻ script
 * @returns {Promise<HTMLScriptElement>}
 */
function loadJSFile(filePath, userRole = null, targetIdorEl = null) {
  // 1. Xử lý target element
  if (!targetIdorEl) {
    targetIdorEl = document.body;
  } else if (typeof targetIdorEl === 'string') {
    const el = getE(targetIdorEl); // Đảm bảo hàm helper getE từ utils.js
    if (el) {
      targetIdorEl = el;
    } else {
      const errorMsg = `❌ [loadJSFile] Target element not found: ${targetIdorEl}`;
      if (typeof Opps === 'function') Opps(errorMsg);
      return Promise.reject(new Error(errorMsg));
    }
  }

  return new Promise((resolve, reject) => {
    try {
      const s = document.createElement('script');

      // Xử lý giá trị fallback cho admin nếu vô tình truyền filePath rỗng để bảo toàn chức năng cũ
      const role = userRole ? userRole.toLowerCase() : '';
      if (role === 'admin' && !filePath) {
        filePath = '/src/js/modules/M_SalesModule.js';
      }

      const moduleLower = filePath ? filePath.toLowerCase() : '';

      // 2. Logic xác định type="module"
      const isModule = role === 'admin' || role === 'acc' || role === 'acc_thenice' || moduleLower.includes('module.js');

      if (isModule) {
        s.type = 'module';
      }

      // Xử lý CORS cho địa chỉ tuyệt đối (Cross-Origin)
      if (filePath && (filePath.startsWith('http://') || filePath.startsWith('https://'))) {
        s.crossOrigin = 'anonymous'; // Yêu cầu bắt buộc để load module từ domain khác
      }

      s.src = filePath;
      s.async = true;

      // 3. Xử lý sự kiện load/error
      s.onload = () => {
        resolve(s);
      };

      s.onerror = (e) => {
        const errorMsg = `❌ Failed to load JS file: ${filePath}`;
        if (typeof L.log === 'function') L.log(errorMsg);
      };

      // 4. Append vào DOM
      targetIdorEl.appendChild(s);
    } catch (err) {
      // Catch các lỗi đồng bộ khi khởi tạo
      if (typeof Opps === 'function') Opps(`❌ Error inside loadJSFile: ${err.message}`);
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
async function loadJSForRole(userRole, baseFilePath = '') {
  if (!userRole) {
    L._('⚠ loadJSForRole: No user role provided', 'warning');
    return Promise.resolve();
  }

  const fileNames = JS_MANIFEST[userRole] || [];
  if (fileNames.length === 0) {
    L._(`⚠ loadJSForRole: No files found for role [${userRole}]`, 'warning');
    return Promise.resolve();
  }

  const loadPromises = fileNames.map((fname) => {
    const filePath = baseFilePath ? baseFilePath + fname : fname;
    return loadJSFile(filePath, userRole).catch((err) => {
      Opps(`❌ Error loading JS for role ${userRole}, file ${fname}:`, err);
      // Don't throw - continue loading other files
      return null;
    });
  });

  try {
    await Promise.all(loadPromises);
    return true;
  } catch (err) {
    Opps(`❌ Error in loadJSForRole:`, err);
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
      Opps('Lỗi setFormData: ', e);
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
  getFormData(root, collectionName, onlyNew = false, options = {}) {
    const rootEl = typeof root === 'string' ? document.querySelector(root) : root;
    if (!rootEl || !collectionName) return {};

    const { prefix = '' } = options;
    const results = {};

    // Truy xuất danh sách field từ Mapping hệ thống
    const fields = window.A.DB.schema.FIELD_MAP && A.DB.schema.FIELD_MAP[collectionName] ? Object.values(A.DB.schema.FIELD_MAP[collectionName]) : [];

    L._(`🔍 [getFormData] Thu thập dữ liệu từ collection: ${collectionName} (fields: ${fields.join(', ')})`, 'info');

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

    // Nếu không thu thập được trường dữ liệu nào, trả về object rỗng
    if (Object.keys(results).length === 0) return {};

    // Lấy ID của bản ghi (Ưu tiên 'id', rồi đến 'uid', nếu dòng mới tinh chưa có thì tạo temp ID)
    const recordId = results.id || results.uid || `temp_${Date.now()}`;

    // Trả về cấu trúc Object có key là ID để đồng bộ với hệ thống
    return {
      [recordId]: results,
    };
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
      // Fix lỗi selector không hợp lệ khi key là số (VD: [data-field="0"], #0)
      // Trong CSS, ID không được bắt đầu bằng số.
      const isNumericKey = !isNaN(key) && /^\d+$/.test(key);
      const selector = isNumericKey ? `[data-field="${prefix}${key}"]` : `[data-field="${prefix}${key}"], #${prefix}${key}`;

      try {
        const els = rootEl.querySelectorAll(selector);
        els.forEach((el) => {
          if (typeof setToEl === 'function' && setToEl(el, value)) {
            if (isNew) el.dataset.initial = value ?? '';
            count++;
          }
        });
      } catch (selError) {
        // Nếu vẫn lỗi selector, bỏ qua field này
        warn('setFormData', `Invalid selector for key "${key}": ${selector}`, selError);
      }
    }
    return count;
  },

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
   * @param {Document|HTMLElement} root - Root để tìm container (mặc định document)
   * @param {boolean} isCollection - true: ghi Firestore collection (xử lý record mới)
   * @returns {Promise<object>} - Object chứa các field có giá trị thay đổi thực sự
   *                              Format: { fieldName: newValue, ... }
   *
   * @example
   * // HTML:
   * // <div id="form-container">
   * //   <input data-field="full_name" value="Nguyễn A" data-initial="Nguyễn A">
   * //   <input data-field="phone" value="0909123456" data-initial="0909000000">
   * // </div>
   *
   * // JavaScript:
   * const changes = await filterUpdatedData('form-container');
   * // Returns: [{ phone: "0909123456" }, 1] (chỉ 1 field phone thay đổi)
   */
  async filterUpdatedData(containerId, root = document, isCollection = true) {
    const container = getE(containerId, root);
    if (!container) {
      L._(`⚠️ Container với ID "${containerId}" không tìm thấy`, 'warning');
      return {};
    }

    // Các field hệ thống tự động cập nhật → bỏ qua khi tính hasRealChanges
    const SYSTEM_FIELDS = new Set(['updated_at', 'created_at']);
    const inputs = container.querySelectorAll('input, select, textarea');

    // ── HELPER: Chuẩn hoá giá trị trước khi so sánh ─────────────────────────
    // Mục tiêu: tránh false-positive do null/undefined/khoảng trắng/kiểu dữ liệu
    //
    // Quy tắc chuẩn hoá:
    //  1. null / undefined → chuỗi rỗng ""
    //  2. Boolean → "true" / "false"
    //  3. Cắt khoảng trắng đầu/cuối
    //  4. Số có định dạng ("1,500,000") → "1500000" để so sánh nhất quán
    //     (chỉ áp dụng khi toàn bộ chuỗi sau khi bỏ dấu phẩy là số thuần)
    const _normalize = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val).trim();
      // Chuẩn hoá số có format dấu phẩy ngàn: "1,500,000" → "1500000"
      let stripped = str.replace(/[,.]/g, '');
      if (stripped?.startsWith("'")) stripped = stripped.slice(1);
      if (stripped !== '' && !isNaN(stripped) && isFinite(stripped)) return stripped;
      return str;
    };

    // ── EARLY EXIT: Phát hiện trường hợp TẠO MỚI ────────────────────────────
    // Chỉ áp dụng khi isCollection = true (ghi collection Firestore).
    // Tìm field 'id' trong container: nếu không có hoặc giá trị rỗng
    // → đây là record mới → trả về toàn bộ data (bỏ qua so sánh data-initial).
    if (isCollection) {
      const idEl = container.querySelector('[data-field="id"]') || container.querySelector('[data-field="customer_id"]') || container.querySelector('[data-field="uid"]');

      const idValue = idEl ? _normalize(getFromEl(idEl)) : '';
      if (!idEl || !idValue || idValue === '0') {
        const allData = {};
        inputs.forEach((el) => {
          const fieldName = el.getAttribute('data-field') || el.id;
          if (!fieldName || SYSTEM_FIELDS.has(fieldName)) return;
          allData[fieldName] = getFromEl(el);
        });
        L._('⚡ [filterUpdatedData] No ID found, treating as new record. Returning all data.', allData);
        return [allData, Object.keys(allData).length];
      }
    }

    // ── NORMAL FLOW: So sánh data-initial để phát hiện thay đổi ─────────────
    const updatedData = {};
    let hasRealChanges = 0;
    let initialAttr;

    inputs.forEach((el) => {
      const rawCurrent = getFromEl(el);
      const fieldName = el.dataset.field || el.id;

      if (!fieldName) return;

      // Bỏ qua hoàn toàn các field hệ thống
      if (SYSTEM_FIELDS.has(fieldName)) return;

      const isExactId = fieldName === 'id';
      const isRelatedId = fieldName.endsWith('_id');

      // ── SO SÁNH CHẶT CHẼ ──────────────────────────────────────────────────
      // FIX: dùng `initialAttr !== undefined` thay vì `!initialAttr`
      //      để tránh false-positive khi data-initial="" (chuỗi rỗng hợp lệ)
      initialAttr = el.dataset.initial; // undefined nếu attribute chưa được set
      const hasInitialSet = initialAttr !== undefined;

      let isChanged;
      if (!hasInitialSet && (rawCurrent || Number(rawCurrent) > 0)) {
        // data-initial chưa được inject → coi là đã thay đổi (an toàn hơn)
        isChanged = true;
      } else if (hasInitialSet) {
        // So sánh sau khi chuẩn hoá cả hai vế
        isChanged = String(_normalize(rawCurrent)) !== String(_normalize(initialAttr));
      }

      // Luôn lấy field id/..._id (làm khoá tham chiếu); các field khác chỉ lấy khi thay đổi
      if (isExactId || isRelatedId || isChanged) {
        updatedData[fieldName] = rawCurrent;
      }

      // Có thay đổi thực sự = field không phải id thuần, và giá trị khác data-initial
      if (isChanged && !isExactId) {
        hasRealChanges++;
        L._(`🔍 [filterUpdatedData] Updated ${hasRealChanges} fields detected: ${fieldName}: ${rawCurrent} - ${initialAttr ? initialAttr : 'Không có'}`);
      }
    });
    // Chỉ trả về dữ liệu khi thực sự có field thay đổi (không tính field id thuần)
    if (!hasRealChanges) return [{}, 0];

    return [updatedData, hasRealChanges];
  },
  /**
   * Helper: Trích xuất dữ liệu từ Table Form dựa trên dataset
   * @param {string} tableId - ID của table cần lấy dữ liệu
   * @returns {Array} - Mảng các object đã được map với Firestore field
   */
  async getTableData(tableId) {
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
          L._(Object.entries(rowData));
        }
      });

      return dataResult;
    } catch (error) {
      Opps('Lỗi tại Utils.getTableData:', error);
      return [];
    }
  },

  /**
   * Extract row data from HTML form using data-field attributes
   * Supports both object and array formats dynamically
   *
   * @param {string} collectionName - Collection name (e.g., 'operator_entries', 'booking_details')
   * @param {string} rowId - Row ID or row index (for searching the TR element)
   * @param {string|Element} rootIdOrEl - Container ID (e.g., 'detail-tbody') or Element containing the row
   * @returns {Object} - Object with field names as keys mapped from data-field attributes
   *
   * @example
   * // Get data from row with id="row-5" inside container with id="detail-tbody"
   * const rowData = getRowData('operator_entries', 5, 'detail-tbody');
   *
   * @example
   * // Get data using Element reference
   * const container = document.getElementById('detail-tbody');
   * const rowData = getRowData('operator_entries', 1, container);
   */
  getRowData(collectionName, rowIdorEl, rootIdOrEl) {
    try {
      // 2. Find the TR element
      let trElement;
      if (rowIdorEl instanceof Element) trElement = rowIdorEl;
      else {
        let root = $(rootIdOrEl);
        if (!root) root = document.body;
        rowId = rowIdorEl;

        // Try to find by id first (format: row-{idx})
        trElement = root.querySelector(`tr#row-${rowId}`) || root.querySelector(`tr[data-row="${rowId}"]`);

        // Fallback: search by data-row-id or similar
        if (!trElement) {
          trElement = root.querySelector(`tr[data-item="${rowId}"]`);
        }

        // Fallback: if rowId is numeric, use as nth-child
        if (!trElement && !isNaN(rowId)) {
          const childIndex = parseInt(rowId) + 1;
          trElement = container.querySelector(`tr:nth-child(${childIndex})`);
        }

        if (!trElement) {
          console.warn(`⚠️ Row not found with rowId: ${rowId}`);
          return {};
        }
      }

      // 3. Get array field names for this collection
      const fieldNames = A.DB.schema.getFieldNames(collectionName);

      if (fieldNames.length === 0) {
        console.error(`❌ No field mapping found for collection: ${collectionName}`);
        return {};
      }

      // 4. Extract data from TR using data-field attributes
      const rowData = {};

      fieldNames.forEach((fieldName) => {
        // Find input/select with data-field attribute matching this fieldName
        const field = trElement.querySelector(`[data-field="${fieldName}"]`);

        if (field) {
          rowData[fieldName] = getVal(field);
        } else {
          // Field not found in this row - set empty value
          rowData[fieldName] = '';
        }
      });

      return rowData;
    } catch (e) {
      console.error(`❌ Error in getRowDataByField:`, e);
      return {};
    }
  },

  /**
   * 1. Lọc dữ liệu đa năng (Hỗ trợ lọc đơn và lọc nhiều điều kiện)
   * @param {Object|Array} source - Dữ liệu gốc (Object hoặc Array)
   * @param {any} value - Giá trị cần tìm HOẶC Object/Array chứa nhiều điều kiện
   * @param {string} op - Toán tử (==, !=, >, <, >=, <=, includes) mặc định '=='
   * @param {string} field - Tên trường, mặc định 'booking_id'
   * @returns {Object} Dữ liệu đã lọc dạng Object { id: item }
   */
  filter(source, value, op = '==', field = 'booking_id') {
    const result = {};
    if (!source) return result;

    // Xử lý đầu vào: đồng bộ thành mảng [key, item] để giữ nguyên ID gốc
    const entries = Array.isArray(source) ? source.map((item, idx) => [item.id || `temp_${idx}`, item]) : Object.entries(source);
    if (!entries.length) return result;

    // Kiểm tra nếu value là Object hoặc Array (Lọc nhiều điều kiện)
    const isComplex = typeof value === 'object' && value !== null;

    // Tiền xử lý điều kiện để tối ưu hiệu năng
    let conditions = [];
    if (isComplex) {
      if (Array.isArray(value)) {
        // Dạng mảng: [{ field, op, value }, ...]
        conditions = value.map((c) => ({ field: c.field, op: c.op || '==', value: c.value }));
      } else {
        // Dạng Object: { field: value } hoặc { field: { op, value } }
        conditions = Object.entries(value).map(([f, v]) => {
          if (v && typeof v === 'object' && v.op) return { field: f, op: v.op, value: v.value };
          return { field: f, op: '==', value: v };
        });
      }
    } else {
      // Dạng đơn (như code cũ)
      conditions = [{ field, op, value }];
    }

    // Cache các giá trị parse để tránh parse lặp lại trong vòng lặp
    const processedConds = conditions.map((c) => {
      const v = c.value;
      const isNum = v !== '' && v !== null && !isNaN(v);
      const isDate = v instanceof Date || (typeof v === 'string' && isNaN(v) && !isNaN(Date.parse(v)));
      return {
        ...c,
        isNum,
        numVal: isNum ? Number(v) : v,
        isDate,
        dateVal: isDate ? (v instanceof Date ? v.getTime() : new Date(v).getTime()) : NaN,
      };
    });

    entries.forEach(([key, item]) => {
      const isMatch = processedConds.every((c) => {
        const itemVal = item[c.field];
        if (itemVal === undefined || itemVal === null) return false;

        // 1. So sánh Date
        if (c.isDate && (typeof itemVal === 'string' || itemVal instanceof Date)) {
          const itemDate = itemVal instanceof Date ? itemVal.getTime() : new Date(itemVal).getTime();
          if (!isNaN(itemDate) && !isNaN(c.dateVal)) {
            switch (c.op) {
              case '==':
                return itemDate === c.dateVal;
              case '!=':
                return itemDate !== c.dateVal;
              case '>':
                return itemDate > c.dateVal;
              case '<':
                return itemDate < c.dateVal;
              case '>=':
                return itemDate >= c.dateVal;
              case '<=':
                return itemDate <= c.dateVal;
            }
          }
        }

        // 2. So sánh Number
        if (c.isNum) {
          const itemNum = Number(itemVal);
          if (!isNaN(itemNum)) {
            switch (c.op) {
              case '==':
                return itemNum === c.numVal;
              case '!=':
                return itemNum !== c.numVal;
              case '>':
                return itemNum > c.numVal;
              case '<':
                return itemNum < c.numVal;
              case '>=':
                return itemNum >= c.numVal;
              case '<=':
                return itemNum <= c.numVal;
            }
          }
        }

        // 3. So sánh String (Text, includes)
        const sItem = String(itemVal).toLowerCase().trim();
        const sVal = String(c.value).toLowerCase().trim();
        switch (c.op) {
          case '==':
            return sItem === sVal;
          case '!=':
            return sItem !== sVal;
          case 'includes':
            return sItem.includes(sVal);
        }
        return false;
      });

      if (isMatch) result[key] = item;
    });

    return result;
  },

  /**
   * 2. Tính toán tổng hợp (Agg/Sum)
   * @param {Object|Array} source - Dữ liệu gốc
   * @param {string|null} field - Tên trường cần tính (Nếu null sẽ tính tự động)
   * @returns {number|Object} Tổng số tiền (nếu truyền field) HOẶC Object {sum, count, quantity}
   */
  agg(source, field = null) {
    const items = Array.isArray(source) ? source : Object.values(source || {});

    // Trường hợp 1: Có chỉ định field cụ thể -> Trả về thẳng giá trị Number
    if (field) {
      return items.reduce((acc, item) => acc + (Number(String(item[field]).replace(/[^0-9]/g, '')) || 0), 0);
    }

    // Trường hợp 2: Tính toán tự động tổng thể
    let sum = 0;
    let quantity = 0;
    const count = items.length;

    const sumFields = ['total_amount', 'total', 'total_cost', 'amount', 'balance', 'balance_amount'];
    const qtyFields = ['quantity', 'qtt', 'adults', 'adult', 'no_of_guest', 'so_luong'];

    items.forEach((item) => {
      // Ưu tiên tìm field tiền tệ đầu tiên có dữ liệu
      const sField = sumFields.find((f) => item[f] !== undefined && item[f] !== null && item[f] !== '');
      if (sField) sum += Number(String(item[sField]).replace(/[^0-9]/g, '')) || 0;

      // Ưu tiên tìm field số lượng đầu tiên có dữ liệu
      const qField = qtyFields.find((f) => item[f] !== undefined && item[f] !== null && item[f] !== '');
      if (qField) quantity += Number(item[qField]) || 0;
    });

    return { sum, count, quantity };
  },

  /**
   * 3. Gom nhóm (Group)
   * @param {Object|Array} source - Dữ liệu gốc
   * @param {string} field - Tên trường dùng để group
   * @returns {Object} { [group_value]: { [item_id]: item } }
   */
  group(source, field) {
    const result = {};
    if (!source) return result;

    const entries = Array.isArray(source) ? source.map((item, idx) => [item.id || `temp_${idx}`, item]) : Object.entries(source);

    entries.forEach(([key, item]) => {
      const groupVal = item[field] || 'Khác';
      if (!result[groupVal]) result[groupVal] = {};

      result[groupVal][key] = item; // Gắn item vào group bằng chính key ID
    });

    return result;
  },

  /**
   * 4. Sắp xếp (Sort)
   * @param {Object|Array} source - Dữ liệu gốc
   * @param {string} field - Trường cần sắp xếp
   * @param {string} dir - Chiều sắp xếp ('asc' hoặc 'desc')
   * @returns {Object} Object đã được sắp xếp (Giữ nguyên ID làm key)
   */
  sort(source, field, dir = 'asc') {
    if (!source) return {};

    const entries = Array.isArray(source) ? source.map((item, idx) => [item.id || `temp_${idx}`, item]) : Object.entries(source);

    // Sắp xếp mảng entries
    entries.sort((a, b) => {
      let valA = a[1][field];
      let valB = b[1][field];

      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';

      // Ưu tiên so sánh số
      const numA = Number(valA);
      const numB = Number(valB);
      if (!isNaN(numA) && !isNaN(numB) && valA !== '' && valB !== '') {
        return dir === 'asc' ? numA - numB : numB - numA;
      }

      // Ưu tiên so sánh Date
      const dateA = new Date(valA).getTime();
      const dateB = new Date(valB).getTime();
      if (!isNaN(dateA) && !isNaN(dateB) && isNaN(valA) && isNaN(valB)) {
        return dir === 'asc' ? dateA - dateB : dateB - dateA;
      }

      // So sánh chuỗi (Fallback)
      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      if (strA < strB) return dir === 'asc' ? -1 : 1;
      if (strA > strB) return dir === 'asc' ? 1 : -1;
      return 0;
    });

    // Rebuild lại thành Object
    // LƯU Ý JS: Object đảm bảo thứ tự key insertion order nếu key là String (VD: "BK01").
    // Nếu ID key của bạn là số nguyên (như "1", "2"), JS Engine có thể tự sắp xếp lại key.
    const result = {};
    entries.forEach(([key, item]) => {
      result[key] = item;
    });

    return result;
  },

  find(source, value, field) {
    const items = Array.isArray(source) ? source : Object.values(source || {});
    // Tìm thấy là return ngay lập tức, không quét hết mảng
    return items.find((item) => item && String(item[field]).trim() === String(value).trim()) || null;
  },
  /**
   * 5. Lấy giá trị duy nhất (Unique)
   * @param {Object|Array} source - Dữ liệu gốc
   * @param {string} field - Trường cần lấy giá trị duy nhất
   * @returns {Array} Mảng các giá trị duy nhất của trường đã chọn
   */
  unique(source, field) {
    return HD.pluck(source, field, true); // Tận dụng luôn hàm pluck ở trên
  },

  /**
   * Nối dữ liệu từ bảng khác vào bảng hiện tại
   * @param {Object} source - Bảng gốc (VD: danh sách booking)
   * @param {string} localField - Tên trường khóa ngoại ở bảng gốc (VD: 'customer_id')
   * @param {Object} targetData - Dữ liệu bảng đích (VD: APP_DATA.customers)
   * @param {string} asField - Tên trường mới sẽ được tạo ra chứa dữ liệu nối (VD: '_customer')
   */
  join(source, localField, targetData, asField) {
    const result = { ...source }; // Clone shallow tránh ảnh hưởng data gốc

    Object.keys(result).forEach((key) => {
      const item = { ...result[key] };
      const targetId = item[localField];

      // Tìm trong targetData bằng độ phức tạp O(1)
      if (targetId && targetData[targetId]) {
        item[asField] = targetData[targetId];
      } else {
        item[asField] = null;
      }
      result[key] = item;
    });

    return result;
  },
  /**
   * 6. Tạo array loại bỏ các giá trị rỗng
   * @param {Object|Array} source - Dữ liệu gốc
   * @param {string} field - Trường cần sắp xếp
   * @param {boolean} unique - Có loại bỏ giá trị trùng lặp hay không (mặc định: true)
   * @returns {Array} Mảng các giá trị của trường đã chọn
   */
  pluck(source, field, unique = true) {
    const items = Array.isArray(source) ? source : Object.values(source || {});
    const result = items.map((item) => item[field]).filter((val) => val !== undefined && val !== null && val !== '');
    return unique ? [...new Set(result)] : result;
  },

  /**
   * Helper: Kiểm tra một giá trị có khớp với điều kiện hay không
   * @private
   */
  _checkMatch(itemVal, targetVal, op = '==') {
    if (itemVal === undefined || itemVal === null) return false;

    // 1. So sánh Date
    const isDate = targetVal instanceof Date || (typeof targetVal === 'string' && isNaN(targetVal) && !isNaN(Date.parse(targetVal)));
    if (isDate && (typeof itemVal === 'string' || itemVal instanceof Date)) {
      const itemDate = itemVal instanceof Date ? itemVal.getTime() : new Date(itemVal).getTime();
      const dateVal = targetVal instanceof Date ? targetVal.getTime() : new Date(targetVal).getTime();
      if (!isNaN(itemDate) && !isNaN(dateVal)) {
        switch (op) {
          case '==':
            return itemDate === dateVal;
          case '=':
            return itemDate === dateVal;
          case '!=':
            return itemDate !== dateVal;
          case '>':
            return itemDate > dateVal;
          case '<':
            return itemDate < dateVal;
          case '>=':
            return itemDate >= dateVal;
          case '<=':
            return itemDate <= dateVal;
        }
      }
    }

    // 2. So sánh Number
    const isNum = targetVal !== '' && targetVal !== null && !isNaN(targetVal);
    if (isNum) {
      const itemNum = Number(itemVal);
      const numVal = Number(targetVal);
      if (!isNaN(itemNum)) {
        switch (op) {
          case '==':
            return itemNum === numVal;
          case '=':
            return itemNum === numVal;
          case '!=':
            return itemNum !== numVal;
          case '>':
            return itemNum > numVal;
          case '<':
            return itemNum < numVal;
          case '>=':
            return itemNum >= numVal;
          case '<=':
            return itemNum <= numVal;
        }
      }
    }

    // 3. So sánh String
    const sItem = String(itemVal).toLowerCase().trim();
    const sVal = String(targetVal).toLowerCase().trim();
    switch (op) {
      case '==':
        return sItem === sVal;
      case '=':
        return sItem === sVal;
      case '!=':
        return sItem !== sVal;
      case 'includes':
        return sItem.includes(sVal);
    }
    return false;
  },
};

// ============================================================================
// HD DATA PIPELINE HELPERS
// Hỗ trợ xử lý dữ liệu mạnh mẽ, nhận/trả về Object (key là id) theo chuẩn DB
// ============================================================================
window.HD = window.HD || {};

// Cache cấu hình để không phải gọi Firestore nhiều lần
let _GAS_SECRETS = null;

async function _callServer(funcName, ...args) {
  const reqId = `CS_${Date.now().toString().slice(-6)}`;

  // Debug log
  const dbg = (msg, data) => {
    if (typeof LOG_CFG !== 'undefined' && LOG_CFG.ENABLE) L._(msg, data || '');
  };

  dbg(`[${reqId}] 🚀 CALL -> ${funcName}`, args);

  try {
    // 1. Tải Config (Singleton)
    if (!_GAS_SECRETS) {
      const doc = await A.DB.getCollection('app_config', 'app_secrets');
      if (!doc) throw new Error('Missing app_secrets');
      _GAS_SECRETS = doc;
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
      L._('Server đã chạy xong ko trả kết quả: ', funcName);
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
        L._(`❌ API Error [${res.status || 'UNKNOWN'}]:`, res.error || res.message, 'error');
      }
      return null;
    }
  } catch (err) {
    const errMsg = err.message || String(err);
    Opps(errMsg, err);
    return null;
  } finally {
    showLoading(false);
  }
}

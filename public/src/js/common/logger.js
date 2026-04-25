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
            console.warn('LogStorage Full - Auto Cleaning');
            this.clear();
        }
    },

    /**
     * HÀM QUAN TRỌNG: Render giao diện log khi cần thiết
     * @param {string} targetId - ID của thẻ HTML (ví dụ 'log-viewer')
     */
    showUI: function (targetId = null) {
        if (!targetId) {
            A.Modal.render(null, 'Cấu hình Log', { size: 'modal-lg', footer: false });
            targetId = 'dynamic-modal-body';
        }
        const container = document.getElementById(targetId);
        if (!container) return;

        const dateKey = 'app_sys_log_' + new Date().toISOString().split('T')[0];
        const logs = JSON.parse(localStorage.getItem(dateKey) || '[]');

        const html = `
      <div class="card shadow-sm mt-3">
        <div class="card-header bg-dark  d-flex justify-content-between align-items-center">
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
        A.Modal.show();
    },

    clear: function () {
        const prefix = 'app_sys_log_';
        Object.keys(localStorage).forEach((key) => {
            if (key.startsWith(prefix)) localStorage.removeItem(key);
        });
    },
};

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

window.Opps = Opps;

export default L;

/* =========================
 * 6. EVENTS & ASYNC
 * ========================= */

const SYS = {
  retryTask: async function (taskFn, options = {}) {
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
  },

  debounce: function (taskFn, delay = 300) {
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
  },

  throttle: function (taskFn, limit = 300) {
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
  },

  // --- BỔ SUNG HÀM FULL SCREEN ---

  /**
   * THỰC THI HÀM ĐỘNG (DYNAMIC FUNCTION EXECUTION)
   * Phân giải và chạy một function từ function trực tiếp, string nội tuyến, hoặc string object path.
   * * @param {Function|String} funcRef - Hàm, String nội tuyến, hoặc Chuỗi đường dẫn (VD: 'App.Sales.tinhTien')
   * @param {Array|any} args - Mảng các tham số truyền vào hàm (VD: [value, element])
   * @returns {Promise<any>} - Trả về kết quả của hàm (hỗ trợ bất đồng bộ)
   */
  runFn: async function (funcRef, args = []) {
    if (!funcRef) return null;

    // Chuẩn hóa: Đảm bảo args luôn là mảng để gọi hàm an toàn
    const safeArgs = Array.isArray(args) ? args : [args] || '';

    try {
      // TRƯỜNG HỢP 1: function truyền trực tiếp (Standard function hoặc Arrow function)
      if (typeof funcRef === 'function') {
        // Arrow function đã tự động mang theo Context.
        // Dùng Spread Operator để đẩy mảng tham số vào hàm
        return await funcRef(...safeArgs);
      }

      // TRƯỜNG HỢP 2 & 3: Xử lý khi funcRef là Chuỗi (String)
      if (typeof funcRef === 'string') {
        const codeStr = funcRef.trim();
        if (!codeStr) return null;

        // TH2: Chuỗi là Code Nội Tuyến (Inline Code)
        // Dấu hiệu nhận biết: Có chứa dấu phẩy, khoảng trắng, hoặc ngoặc
        if (codeStr.includes(';') || codeStr.includes('(') || codeStr.includes(' ')) {
          // Sử dụng hàm Function nội hàm để wrap logic.
          // Hỗ trợ truyền cứng 3 biến hay dùng ở các Form/Select
          const dynamicScript = new Function('value', 'selectEl', 'instance', codeStr);
          return await dynamicScript(safeArgs[0], safeArgs[1], safeArgs[2]);
        }

        // TH3: Chuỗi là Đường Dẫn Hàm (Object Path) - VD: 'App.Sales.tinhTien'
        const parts = codeStr.split('.');
        let current = window; // Bắt đầu quét từ Window (Global)
        let context = window; // Context mặc định là Window

        for (let i = 0; i < parts.length; i++) {
          if (current[parts[i]] !== undefined) {
            // Ghi nhận context là object cha (phần tử đứng ngay trước hàm cuối cùng)
            if (i < parts.length - 1) {
              context = current[parts[i]];
            }
            current = current[parts[i]];
          } else {
            console.warn(`[runFn] Lỗi: Không tìm thấy đường dẫn hàm "${codeStr}"`);
            return null;
          }
        }

        // Sau khi phân giải, kiểm tra xem nó có đích thị là function không
        if (typeof current === 'function') {
          // Gọi hàm và áp dụng (apply) đúng ngữ cảnh context đã tìm được
          return await current.apply(context, safeArgs);
        } else {
          console.warn(`[runFn] Lỗi: "${codeStr}" không phải là một function.`);
          return null;
        }
      }
    } catch (error) {
      // Xử lý lỗi an toàn không làm gãy UI
      const errMsg = `[Helper] Lỗi khi thực thi hàm động (${funcRef}):`;
      if (typeof Opps === 'function') {
        Opps(errMsg, error);
      } else {
        console.error(errMsg, error);
      }
      return null;
    }
  },
  /**
   * Tự động tìm và chạy hàm theo Role của User hiện tại. Hỗ trợ an toàn cả hàm Sync và Async (Promise).
   * Quy tắc ghép tên: [tên_gốc]_[RoleViếtHoaChữCáiĐầu]
   * Ví dụ: baseName='init', Role='SALE' => Chạy hàm init_Sale()
   * * @param {string} baseFuncName - Tên hàm gốc (ví dụ: 'render', 'saveData')
   * @param {...any} args - Các tham số muốn truyền vào hàm đó (nếu có)
   * @return {any} - Trả về kết quả của hàm được gọi (có thể là giá trị ngay lập tức hoặc một Promise)
   */
  runFnByRole: function (baseFuncName, ...args) {
    try {
      // 1. Kiểm tra User context
      if (typeof CURRENT_USER === 'undefined' || !CURRENT_USER || !CURRENT_USER.role) {
        console.warn('❌ [runFnByRole] CURRENT_USER chưa init. Thử chạy hàm gốc.');
        if (typeof window[baseFuncName] === 'function') {
          return this.executeAndHandlePromise(window[baseFuncName], baseFuncName, args);
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
  },
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
  loadLibraryAsync: async function (libName) {
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
  },

  /**
   * Pre-load libraries ngay khi app start (Không block, tải song song)
   * Gọi function này trong main.js hoặc onready
   */
  preloadExportLibraries: function () {
    // Load bất đồng bộ (không chờ)
    Promise.all([this.loadLibraryAsync('xlsx'), this.loadLibraryAsync('jspdf'), this.loadLibraryAsync('autotable')]).then(() => {
      L._('📦 All export libraries pre-loaded', 'success');
    });
  },

  downloadTableData_Csv: function (tableId, fileName = 'table_data.csv') {
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
  },

  downloadTableData: async function (exportData, type = 'pdf', fileName = 'export_data', viewText = 'Dữ liệu xuất file') {
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
  },

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
  loadJSFile: function (filePath, userRole = null, targetIdorEl = null) {
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
  },

  /**
   * ✅ FIX: Make loadJSForRole asynchronous to prevent scope/timing issues
   * Now waits for all JS files to load before continuing
   * @param {string} userRole - Role (e.g., 'sale', 'op', 'admin')
   * @param {string} baseFilePath - Base path for loading files
   * @returns {Promise} Resolves when all files are loaded
   */
  loadJSForRole: async function (userRole, baseFilePath = '') {
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
      return this.loadJSFile(filePath, userRole).catch((err) => {
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
  },
};

var _notifTimer = null;

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

  clearLocalCache: function () {
    if (!confirm('Xóa Local Cache?')) return;
    localStorage.clear();
    A.DB.stopNotificationsListener();
    setTimeout(() => reloadPage(true), 1000);
  },
};

window.debounce = SYS.debounce;
window.throttle = SYS.throttle;

export default SYS;

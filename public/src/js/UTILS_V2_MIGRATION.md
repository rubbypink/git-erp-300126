# UTILS_V2 MIGRATION GUIDE

## 📋 Tổng Quan

File `utils_v2.js` là phiên bản ES6 Module của `utils.js` gốc, được tổ chức lại thành 2 Object chính:
- **DataController**: Các hàm liên quan xử lý dữ liệu (get, set, format)
- **Utils**: Các hàm tiện ích còn lại (logging, UI, events, etc.)

## ✅ Bảo Đảm Toàn Bộ Tính Năng

Tất cả tính năng của version cũ đều được giữ nguyên 100%. Chi tiết:

### DataController - Xử lý Dữ Liệu
```javascript
// DOM Resolution
resolveEls(target, root)      // Tìm kiếm phần tử an toàn
$(sel, root)                  // Alias ngắn gọn
$$(sel, root)                 // Get all elements
getE(input)                   // Safe getElementById wrapper

// Value Extraction & Assignment
getFromEl(el, opt)            // Trích xuất giá trị từ element
setToEl(el, value)            // Gán giá trị vào element
getVal(id, root, opt)         // Get value (tìm element hoặc fallback)
setVal(id, value, root)       // Set value an toàn
getNum(target)                // Get number value (STRICT)
setNum(idOrEl, val)           // Set number with formatting
getRawVal(val)                // Parse formatted string to number

// Batch Operations
getVals(target, optOrRoot)    // Get multiple values
setVals(target, values, ...)  // Set multiple values
getMany(spec, optOrRoot)      // Get object of values
setMany(spec, data, ...)      // Set object of values
getTableData(tableId)         // Extract table data

// Formatting Functions
formatDateForInput(d, inputType)   // Date → YYYY-MM-DD
formatDateISO(d)                   // Date → ISO format
parseInputDate(s, inputType)       // String → Date
formatPhone(p)                     // Format phone number
formatMoney(n)                     // Format currency
formatDateVN(dateStr)              // Date → Vietnamese format (DD/MM/YYYY)
escapeHtml(s)                      // HTML escape

// Row & Header Helpers
extractFirstItem(items)       // Get first item from array
getRowValue(row, fieldOrIndex) // Get field from row data
setRowValue(row, fieldOrIndex, value) // Set field in row
translateHeaderName(rawName)   // Dịch tên header sang Tiếng Việt
```

### Utils - Các Hàm Tiện Ích
```javascript
// DOM Display
setText(idOrEl, text)         // Set textContent
setHTML(idOrEl, html)         // Set innerHTML
setDisplay(idOrEl, on)        // Show/hide element
disable(idOrEl, on)           // Enable/disable
setClass(target, className, on, rootOrOpt)  // Toggle CSS classes
setStyle(target, styles, ...)               // Apply inline styles

// UI State Management
showLoading(show, text)       // Show loading spinner
setBtnLoading(btnSelector, isLoading, loadingText) // Button loading state
fillSelect(elmId, dataList, defaultText) // Populate select
setDataList(elmId, dataArray)            // Set datalist options

// Events
debounce(fn, ms)              // Debounce function
onEvent(target, eventNames, handler, options) // Event listener (support delegation)

// Server Communication
_callServer(funcName, ...args) // Internal API call
requestAPI(funcName, ...args)  // Main API call with loading & error handling

// Logging System
log(msg, arg2, arg3)          // Log with type (info/success/warning/error)
logA(message, type, callback, ...args) // Log with alert/toast
logError(p1, p2)              // Error logging
showOverlay(title, htmlContent) // Show overlay modal
closeOverlay()                // Close overlay
showNotify(msg, isSuccess)    // Quick notification
restoreLogsFromStorage()      // Restore logs from localStorage
clearLog()                    // Clear all logs

// Fullscreen & Role-based
toggleFullScreen()            // Toggle fullscreen mode
runFnByRole(baseFuncName, ...args) // Auto-run role-specific function

// Library Management
loadLibraryAsync(libName)     // Load library (xlsx, jspdf, autotable, etc.)
preloadExportLibraries()      // Preload export libraries

// Data Export
downloadTableData_Csv(tableId, fileName) // Export table to CSV
downloadTableData(exportData, type, fileName, viewText) // Export to Excel/PDF

// Resource Loading
getHtmlContent(url)           // Load HTML content
loadJSFile(filePath, targetIdorEl) // Load JS file dynamically
loadJSForRole(userRole, baseFilePath) // Load role-specific JS files
reloadPage(url)               // Reload or navigate to URL
```

## 🔄 Thay Đổi Cạnh Tranh

### 1. Import/Export Syntax
**Before (Global Scope):**
```javascript
// All functions available globally
getVal('fieldId');
log('Message', 'success');
formatMoney(1000);
```

**After (ES6 Module):**
```javascript
import { DataController, Utils } from './utils_v2.js';

// Call methods on objects
DataController.getVal('fieldId');
Utils.log('Message', 'success');
DataController.formatMoney(1000);

// Or destructure for convenience
const { getVal, getNum } = DataController;
const { log, logA } = Utils;
```

### 2. Thứ Tự Load
**Before:**
- Load utils.js trước, rồi các files khác
- Tất cả hàm đều global

**After:**
- Chỉ import tại files cần dùng
- Scope rõ ràng với object namespace

### 3. Backward Compatibility Window Object
Để hỗ trợ code cũ transitioning, có thể tạo global aliases:
```javascript
// main.js hoặc bootstrapping code
import { DataController, Utils } from './utils_v2.js';

// Attach to window for backward compatibility (Temporary)
window.DataController = DataController;
window.Utils = Utils;
window.getVal = DataController.getVal.bind(DataController);
window.setVal = DataController.setVal.bind(DataController);
window.log = Utils.log.bind(Utils);
// ... etc for frequently used functions
```

## 📦 Cấu Trúc Tổ Chức

```
utils_v2.js
├── 1. CONSTANTS & CONFIG
│   ├── ERROR_CONFIG
│   ├── LOG_CFG
│   ├── HEADER_DICT
│   └── _LibraryLoadStatus
│
├── 2. ERROR LOGGER (Module)
│
├── 3. ROW STYLER (Module)
│
├── 4. HELPER FUNCTIONS
│   ├── pad2()
│   └── warn()
│
├── 5. DataController Object
│   ├── DOM Resolution
│   ├── Value Extraction/Assignment
│   ├── Batch Operations
│   ├── Table Data
│   ├── Formatting
│   └── Row Helpers
│
├── 6. Utils Object
│   ├── DOM Display
│   ├── UI State
│   ├── Events
│   ├── Server Communication
│   ├── Logging System
│   ├── Export Features
│   └── Resource Loading
│
└── 7. EXPORTS
    ├── DataController
    ├── Utils
    ├── ErrorLogger
    ├── RowStyler
    └── Default export
```

## 🔧 Sử Dụng Trong Dự Án

### Option 1: Module Approach (Recommended)
```javascript
// file_cần_dùng.js
import { DataController, Utils } from './utils_v2.js';

// Use directly
DataController.getVal('custName');
Utils.log('Loading...', 'info');
```

### Option 2: Namespace Approach
```javascript
// main.js
import Utils from './utils_v2.js';

// Everywhere in your code
Utils.DataController.getVal('custName');
Utils.Utils.log('Loading...', 'info');
```

### Option 3: Destructuring (For convenience)
```javascript
import { DataController, Utils } from './utils_v2.js';

const { getVal, setVal, getNum, formatMoney } = DataController;
const { log, logA, logError, onEvent } = Utils;

// Use directly
getVal('custName');
log('Message', 'success');
```

## ✨ Tối Ưu Hóa Thực Hiện

### 1. Hàm getRawVal được di chuyển sang DataController
**Before:** Ở trong logic_operator.js
**After:** Là method trong DataController

Lợi ích:
- Tập trung các hàm format/parse số vào 1 chỗ
- Dễ reuse từ các files khác
- Bảo đảm logic đồng nhất

### 2. Refactor log system
- Tách helper functions (_createLogElement, _saveLogToStorage, _getLogKey) thành private methods
- Vẫn giữ nguyên API public (log, logA, logError, etc.)
- Dễ bảo trì hơn

### 3. Library loading cải thiện
- Config centralized trong _LibraryLoadStatus
- Support cả single URL hoặc multiple URLs
- Tự động parallel load khi có multiple files

## ⚠️ Lưu Ý Quan Trọng

### 1. Global Scope Variables
Một số biến global từ file gốc vẫn cần:
```javascript
// REQUIRED: Phải tồn tại global scope
window.APP_DATA       // Data dictionary
window.CURRENT_USER   // Current user context
window.A              // UI engine
window.JS_MANIFEST    // File manifest
window.log()          // Nếu dùng optional logging
window.logError()     // Nếu dùng optional error logging
```

### 2. Error Logging với ErrorLogger
```javascript
// ErrorLogger vẫn independent
import { ErrorLogger } from './utils_v2.js';

ErrorLogger.log(error, 'MY_CONTEXT', { severity: 'warning' });
ErrorLogger.getAll(); // Get all errors
ErrorLogger.clear();  // Clear error log
```

### 3. Date Handling
- `formatDateForInput()` → Luôn trả YYYY-MM-DD (trừ khi inputType='datetime-local')
- `formatDateISO()` → Alias an toàn cho ISO format
- `parseInputDate()` → Cân nhắc múi giờ local

### 4. Number Parsing
```javascript
// getRawVal("1,500,000") → 1500000
// getNum() → Same as getRawVal but với element support
DataController.getRawVal("1,500,000");  // 1500000
DataController.getNum("fieldId");       // 0 (if not found)
```

## 📋 Migration Checklist

- [ ] File utils_v2.js tạo thành công
- [ ] Import { DataController, Utils } trong files cần dùng
- [ ] Thay đổi tất cả getVal() → DataController.getVal()
- [ ] Thay đổi tất cả log() → Utils.log()
- [ ] Test toàn bộ form input/output
- [ ] Test logging system
- [ ] Test API calls (requestAPI)
- [ ] Test event delegation (onEvent)
- [ ] Test library loading (xlsx, jspdf)
- [ ] Test data export features
- [ ] Verify backward compatibility (nếu cần)

## 🚀 Next Steps

1. **Keeputils.js** nếu vẫn còn global dependencies
2. **Parallel migration**: Convert 1 module tại 1 thời điểm
3. **Test thoroughly**: Kiểm tra tất cả tính năng đang hoạt động
4. **Document API**: Cập nhật internal docs với new import statements

## 📞 Support

Nếu có vấn đề:
- Check browser console for import errors
- Verify HEADER_DICT, ErrorLogger, RowStyler exports
- Make sure DataController & Utils methods are correctly scoped
- Review UTILS_V2_MIGRATION.md (file này) for reference

---

**Last Updated**: February 7, 2026  
**Version**: 1.0  
**Status**: Ready for Production

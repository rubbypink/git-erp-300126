# ⚠️ Tối Ưu Xử Lý Lỗi - Error Handling Optimization

**Mục tiêu**: Đảm bảo tất cả lỗi chỉ được log, không làm chặn ứng dụng.

**Ngày cập nhật**: Tháng 2, 2026  
**Trạng thái**: 🚀 Sẵn sàng triển khai

---

## 📋 Tóm Tắt

| Vấn đề | Giải Pháp |
|--------|----------|
| **Lỗi JSON.parse() chặn app** | ✅ Dùng `safeFn()` bọc hàm |
| **Element DOM không tìm thấy** | ✅ Dùng `safeGetEl()`, `safeGetVal()` |
| **API call timeout chặn app** | ✅ Dùng `safePromise()` với timeout |
| **Event listener lỗi** | ✅ Dùng `safeOn()` |
| **Lỗi Firebase chặn app** | ✅ Dùng `safeAsync()` |
| **Không biết lỗi gì xảy ra** | ✅ Dùng `ErrorLogger` + `getErrorStats()` |

---

## 🚀 Quick Start (3 Bước)

### Bước 1: Load error-handler.js sớm nhất

**File**: `public/index.html`

```html
<!-- Chuỗi tải script trong <body> -->
<script src="./js/utils.js"></script>
<script src="./js/error-handler.js"></script> <!-- ✅ THÊM ĐÂY (ngay sau utils.js) -->
<script src="./js/shortkey.js"></script>
<script src="./js/db_schema.js"></script>
<script src="./js/login_module.js"></script>
<!-- ... rest of scripts ... -->
```

### Bước 2: Sử dụng Safe Wrappers trong code mới

```javascript
// ❌ TRƯỚC (có thể chặn)
function saveData(json) {
  const data = JSON.parse(json);        // Có thể throw
  updateUI(data);                       // Có thể throw
}

// ✅ SAU (an toàn)
function saveData(json) {
  const data = safeFn(
    () => JSON.parse(json),
    'saveData_parse',
    null
  );
  if (data) {
    safeFn(() => updateUI(data), 'saveData_updateUI', null);
  }
}
```

### Bước 3: Kiểm tra lỗi trong Console

```javascript
// Xem tất cả lỗi
ErrorLogger.getAll()

// Xem thống kê
getErrorStats()

// Xem lỗi từ 1 hàm
ErrorLogger.getByContext('myFunction')

// Export lỗi ra file
exportErrors()
```

---

## 📚 Safe Wrappers Reference

### 1. `safeFn()` - Bọc Hàm Sync

**Khi dùng**: Hàm đồng bộ có chứa code rủi ro (parse JSON, DOM, logic)

**Việt Nam hóa**: JSON, tương tác DOM, tính toán

```javascript
// Cách dùng
const safeFn = safeFn(
  function() { 
    return JSON.parse(str);
  },
  'parseJSON',         // Tên hàm (log)
  null                 // Giá trị mặc định khi lỗi
);

// Gọi
const result = safeFn();  // Không throw, return null nếu lỗi
```

**Ví dụ thực tế**:

```javascript
// Đọc giá trị từ form input (có thể không tồn tại)
const name = safeFn(
  () => document.getElementById('name').value,
  'readNameInput',
  ''
);

// Parse JSON từ string
const config = safeFn(
  () => JSON.parse(localStorage.getItem('config')),
  'parseConfig',
  {}  // Default: empty object
);

// Gọi hàm tính toán phức tạp (có thể fail)
const total = safeFn(
  () => calculateTotal(items),
  'calculateTotal',
  0
);
```

### 2. `safeAsync()` - Bọc Hàm Async

**Khi dùng**: Hàm async (API, Firebase, Network)

```javascript
// Cách dùng
const loadData = safeAsync(
  async function(id) {
    const response = await fetch(`/api/data/${id}`);
    return response.json();
  },
  'loadData',      // Tên hàm (log)
  null             // Default khi lỗi
);

// Gọi
const data = await loadData(123);  // Không throw, return null nếu lỗi
```

**Ví dụ**:

```javascript
// Async API call
const fetchBookings = safeAsync(
  async function() {
    const response = await firebase.firestore()
      .collection('bookings')
      .get();
    return response.docs.map(d => d.data());
  },
  'fetchBookings',
  []  // Default: array rỗng
);

const bookings = await fetchBookings();  // Safe!
```

### 3. `safeGetEl()` - Lấy DOM Element An Toàn

**Khi dùng**: Thay thế `document.querySelector()` hoặc `getElementById()`

```javascript
// ❌ TRƯỚC
const btn = document.getElementById('btn-save');  // null nếu không tìm thấy
btn.addEventListener('click', ...);               // ❌ Throw!

// ✅ SAU
const btn = safeGetEl('#btn-save');  // null nếu không tìm thấy
if (btn) {
  btn.addEventListener('click', ...);  // Safe!
}

// Ngắn hơn - dùng safeOn
safeOn('#btn-save', 'click', handler);  // Tự check element
```

### 4. `safeGetVal()` - Lấy Giá Trị Input An Toàn

**Khi dùng**: Lấy giá trị từ input, textarea, select (không ném lỗi)

```javascript
// ❌ TRƯỚC
const name = document.getElementById('name').value;      // Throw if null
const age = parseInt(document.getElementById('age').value); // Throw if null

// ✅ SAU
const name = safeGetVal('#name', '');           // '' nếu không tìm thấy
const age = parseInt(safeGetVal('#age', '0'), 10) || 0;
```

### 5. `safeSetVal()` - Set Giá Trị Input An Toàn

**Khi dùng**: Set giá trị vào input, textarea, select (không ném lỗi)

```javascript
// ❌ TRƯỚC
document.getElementById('name').value = data.name;  // Throw if null

// ✅ SAU
safeSetVal('#name', data.name || '');  // Không throw

// Return true/false nếu muốn check
const success = safeSetVal('#email', 'test@example.com');
if (!success) {
  console.warn('Could not set email field');
}
```

### 6. `safeOn()` - Attach Event Listener An Toàn

**Khi dùng**: Gắn event listener (nếu element hoặc handler fail)

```javascript
// ❌ TRƯỚC
document.getElementById('btn').addEventListener('click', () => {
  JSON.parse(getVal('json-input'));  // Throw nếu JSON invalid
});

// ✅ SAU
safeOn('#btn', 'click', function() {
  const json = safeFn(
    () => JSON.parse(getVal('json-input')),
    'parseJSON',
    null
  );
  if (json) {
    // Process json
  }
});
```

### 7. `safePromise()` - Async Với Timeout

**Khi dùng**: Promise với timeout bảo vệ (5-30 giây)

```javascript
// Cách dùng
const data = await safePromise(
  firebase.firestore().collection('items').get(),
  'fetchItems',      // Tên operation
  10000,             // Timeout 10 giây
  { docs: [] }       // Default nếu timeout/error
);

if (data?.docs?.length > 0) {
  // Process items
}
```

**Ví dụ thực tế**:

```javascript
// Có timeout bảo vệ
const customers = await safePromise(
  loadCustomersFromAPI(),
  'loadCustomers',
  5000,    // 5 giây timeout
  []       // Return [] nếu fail
);

// Retry logic phức tạp hơn
async function loadWithRetry() {
  for (let i = 0; i < 3; i++) {
    const result = await safePromise(
      fetchData(),
      `fetchData[attempt_${i+1}]`,
      5000,
      null
    );
    if (result) return result;
    await new Promise(r => setTimeout(r, 1000)); // Wait 1s
  }
  return null;  // All retries failed
}
```

### 8. `safeBatch()` - Xử Lý Batch An Toàn

**Khi dùng**: Lặp qua nhiều item, skip nếu có lỗi

```javascript
// Lưu 100 booking, skip những cái lỗi
const results = await safeBatch(
  bookings,                    // Array to process
  async (booking) => {         // Async function for each
    await saveBooking(booking);
    return { success: true };
  },
  'saveAllBookings',           // Operation name
  true                         // Continue on error
);

console.log(`Success: ${results.filter(r => r?.success).length}`);
```

### 9. `safeGet()` - Access Deep Properties An Toàn

**Khi dùng**: Truy cập nested object properties (không throw)

```javascript
// ❌ TRƯỚC - Throw nếu bất kỳ level nào là null
const name = data.booking.customer.profile.fullName;

// ✅ SAU - Safe
const name = safeGet(
  data,
  'booking.customer.profile.fullName',
  'Unknown'
);

// Ví dụ khác
const phone = safeGet(data, 'user.contact.phone', 'N/A');
const address = safeGet(data, 'user.address.street', '');
```

### 10. `safeSet()` - Set Deep Properties An Toàn

**Khi dùng**: Set lớp sâu của object (tự tạo path nếu cần)

```javascript
const user = {};

// ✅ Tự tạo path nếu không tồn tại
safeSet(user, 'profile.contact.email', 'test@example.com');
// Result: user = { profile: { contact: { email: '...' } } }

safeSet(user, 'settings.theme', 'dark');
// Result: user.settings.theme = 'dark'
```

### 11. `safeCall()` - Gọi Function Từ String

**Khi dùng**: Gọi global function từ tên (string), hàm có thể không tồn tại

```javascript
// Setup (global scope)
window.myFunction = function(x) { return x * 2; };

// ❌ TRƯỚC - Throw nếu hàm không tồn tại
const result = myFunction(5);

// ✅ SAU - Safe
const result = safeCall('myFunction', [5], {
  context: 'MyModule',
  defaultReturn: 0,
  logLevel: 'warning'
});
```

---

## 🔍 ErrorLogger - Theo Dõi Lỗi

### Xem Tất Cả Lỗi

```javascript
// Hiển thị danh sách lỗi
ErrorLogger.getAll()

// Hiển thị dạng bảng
console.table(ErrorLogger.getAll())
```

### Lọc Lỗi Theo Hàm

```javascript
// Xem lỗi từ hàm 'saveData'
ErrorLogger.getByContext('saveData')

// Xem lỗi từ 'loadCustomers'
ErrorLogger.getByContext('loadCustomers')
```

### Thống Kê Lỗi

```javascript
// Xem tóm tắt
getErrorStats()

// Output:
// {
//   total: 5,
//   bySeverity: { error: 3, warning: 2 },
//   byContext: { parseJSON: 2, loadData: 1, ... },
//   recentErrors: [...]
// }
```

### Export Lỗi Ra File

```javascript
// Download error log (JSON)
exportErrors()

// Hoặc thủ công
const data = ErrorLogger.export();
console.save(data, 'errors.json');  // Browser save
```

---

## 📋 Migration Checklist

### Phase 1: Setup (Ngay bây giờ)

- [ ] Thêm `error-handler.js` vào index.html
- [ ] Đặt nó sau `utils.js` trong load order
- [ ] Kiểm tra console: `ErrorLogger` đã có global
- [ ] Test: `getErrorStats()` trả về object

### Phase 2: Update Critical Paths

Ưu tiên cao (có thể crash app):

- [ ] `db_manager.js` - Firebase calls
- [ ] `api_base.js` - API requests
- [ ] `renderer.js` - DOM manipulation
- [ ] `logic_operator.js` - Form processing
- [ ] `logic_sales.js` - Calculations

### Phase 3: Update General Code

- [ ] `login_module.js` - Auth
- [ ] `logic_base.js` - Filters, sorts
- [ ] `shortkey.js` - Keyboard events
- [ ] HTML components - Event handlers

### Phase 4: Testing

- [ ] Test mỗi safe function nguyên mẫu
- [ ] Kiểm tra error log không quá lớn
- [ ] Xác nhận app không crash
- [ ] Check performance không ảnh hưởng

---

## 🔄 Các Pattern Phổ Biến

### Pattern 1: Form Validation

```javascript
function validateForm(formId) {
  const name = safeGetVal(`#${formId} [name="name"]`, '').trim();
  const email = safeGetVal(`#${formId} [name="email"]`, '').trim();

  let errors = [];

  if (!name) errors.push('Tên không được để trống');
  if (!email || !email.includes('@')) errors.push('Email không hợp lệ');

  if (errors.length > 0) {
    log(errors.join('; '), 'warning');
    return false;
  }

  return true;
}
```

### Pattern 2: Data Transformation

```javascript
function transformBooking(rawData) {
  return {
    id: safeGet(rawData, 'id', ''),
    customer: safeGet(rawData, 'customer.name', 'Unknown'),
    startDate: safeGet(rawData, 'dates.start', ''),
    endDate: safeGet(rawData, 'dates.end', ''),
    total: parseInt(safeGet(rawData, 'pricing.total', '0'), 10) || 0
  };
}
```

### Pattern 3: Render với Error Handling

```javascript
function renderBookingTable(bookings) {
  const container = safeGetEl('#table-container');
  if (!container) {
    log('Table container not found', 'error');
    return false;
  }

  const html = safeFn(
    () => {
      return bookings.map(b => `
        <tr>
          <td>${b.id}</td>
          <td>${b.customer}</td>
          <td>${b.total}</td>
        </tr>
      `).join('');
    },
    'renderBookingTable_map',
    ''
  );

  if (!html) {
    log('Failed to render table', 'error');
    return false;
  }

  container.innerHTML = html;
  return true;
}
```

---

## 📊 Performance

**Safe wrappers có ảnh hưởng gì không?**

- ✅ **Try-catch**: ~1-5 microseconds (không đáng kể)
- ✅ **safeGet()**: ~10 microseconds (không đáng kể)
- ✅ **safePromise()**: Timeout check (không bất đồng bộ)

**Tóm lại**: Overhead không đáng kể, được đánh đổi bằng app stability

---

## 🐛 Debugging Commands

Copy-paste vào DevTools Console để debug:

```javascript
// Xem lỗi recentist
ErrorLogger.getAll().slice(-5)

// Xem lỗi từ 1 hàm
ErrorLogger.getByContext('loadCustomers')

// Xem số lần error mỗi hàm
ERROR_CONFIG.CONTEXTS

// Clear errors
ErrorLogger.clear()

// Export errors
exportErrors()

// Test error handling
testErrorHandling()
```

---

## ⚠️ Common Mistakes

### ❌ SAIIII

```javascript
// Không wrap return value
const name = safeFn(() => data.name, 'getName');
// Nếu data = null, vẫn throw!

// Không kiểm tra result
const data = safeFn(() => JSON.parse(json), 'parse', null);
data.id;  // Throw nếu data = null!

// Quên pass default
await safePromise(fetchData(), 'fetch');
// Returns undefined nếu fail!
```

### ✅ ĐÚNG

```javascript
// Bao toàn bộ operation
const name = safeFn(() => data?.name || 'Unknown', 'getName', 'Unknown');

// Kiểm tra trước dùng
const data = safeFn(() => JSON.parse(json), 'parse', null);
if (data) {
  console.log(data.id);
}

// Luôn pass default
const data = await safePromise(fetchData(), 'fetch', 10000, []);
// Nếu fail, return [] (không undefined)
```

---

## 📞 Support

**Câu hỏi thường gặp**:

1. **Có cần bọc tất cả hàm không?**  
   → Không, chỉ hàm có rủi ro: JSON.parse, DOM access, API calls

2. **Safe wrapper có chậm không?**  
   → Không, overhead ~1-10 microseconds

3. **Lỗi vẫn được ghi log?**  
   → Có, log vào `ErrorLogger` và `localStorage`

4. **User sẽ thấy lỗi không?**  
   → Có nếu bạn dùng `log()`, nếu không dùng thì im lặng

5. **App sẽ crash không?**  
   → Không, tất cả lỗi được bắt

---

## 📚 Files đã thêm

| File | Mô tả |
|------|-------|
| `error-handler.js` | Hệ thống XỬ LỖI chính |
| `error-handler-guide.js` | Ví dụ + hướng dẫn chi tiết |
| `ERROR_HANDLING.md` | **Tài liệu này** |

---

**Bắt đầu ngay hôm nay - Không có app crash! 🚀**

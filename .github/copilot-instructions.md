# 9-Trip ERP Frontend - Coding Instructions & Architecture Guide

**Last Updated**: April 2026 | **Version**: 2.0
**Project Status**: Modular ES6 Modernization Complete

---

## 📋 TABLE OF CONTENTS

1. [Project Architecture](#project-architecture)
2. [Data Flow & Gatekeeper Pattern](#data-flow--gatekeeper-pattern)
3. [Code Organization Standards](#code-organization-standards)
4. [Critical Development Patterns](#critical-development-patterns)
5. [Module & Feature Reference](#module--feature-reference)
6. [Troubleshooting & Common Issues](#troubleshooting--common-issues)

---

## 🏗️ PROJECT ARCHITECTURE

### System Overview

**9-Trip ERP** là hệ thống quản lý tour/booking dựa trên kiến trúc **Modular ES6** thuần (Vanilla JS), sử dụng Bootstrap 5 cho UI và Firebase Firestore làm cơ sở dữ liệu chính.

### The Singleton 'A' Object

Đối tượng `window.A` (từ [`public/src/js/modules/core/app.js`](public/src/js/modules/core/app.js)) là trung tâm điều phối toàn bộ ứng dụng.

- **A.DB**: Quản lý Firestore v9+ Modular SDK, hỗ trợ batching, queueing và sync.
- **A.UI**: Quản lý template, tab, và các thành phần giao diện động.
- **A.Event**: Quản lý sự kiện tập trung với delegation và auto-cleanup.
- **A.Modal**: Engine modal động, hỗ trợ stacking (nhiều modal chồng nhau) và kéo thả.
- **A.Auth**: Quản lý xác thực Firebase và phân quyền người dùng.

### File Structure

```
public/src/js/
├── modules/
│   ├── core/               # Lõi hệ thống (app.js, EventManager.js, UI_Manager.js, ATable.js)
│   │   ├────app.js         # Điểm khởi đầu ứng dụng (Legacy entry point)
│   ├── db/                 # Quản lý cấu trúc & xử lý dữ liệu (DBManager.js, DBSchema.js, DBLocalStorage.js)
│   ├── prices/             # Các module quản lý giá (HotelPrice, ServicePrice)
│   ├── ReportModule.js     # Module báo cáo (ReportModule)
│   ├── M_SalesModule.js    # Nghiệp vụ Sales (Booking)
│   └── M_OperatorModule.js # Nghiệp vụ Điều hành (Operator)
├── components/             # Các Web Components tùy chỉnh (ASelect.js, at_modal_full.js)
├── common/                 # Module cơ bản (logger.js)
└── libs/                   # Thư viện tiện ích (utils.js, sys_helper.js, db_helper.js)
```

---

## 🔄 DATA FLOW & GATEKEEPER PATTERN

### Gatekeeper Pattern (Firestore → LocalDB → RAM)

Hệ thống áp dụng luồng dữ liệu bắt buộc để đảm bảo tính nhất quán và hỗ trợ offline:

1. **Firestore**: Nguồn chân lý (Source of Truth).
2. **IndexedDB (Dexie)**: Cache offline và lưu trữ trung gian (Local Truth). Quản lý bởi [`DBLocalStorage.js`](public/src/js/modules/db/DBLocalStorage.js).
3. **APP_DATA (RAM)**: State toàn cục trong bộ nhớ để truy cập tức thì.

**Quy tắc**: Không dữ liệu nào được lọt vào `APP_DATA` mà chưa được ghi xuống `IndexedDB`.

### Data Format

Hệ thống đã chuyển sang **Object Format** hoàn toàn.

- **Truy cập**: `APP_DATA.bookings['BK123'].customer_full_name`
- **Schema**: Định nghĩa tại [`DBSchema.js`](public/src/js/modules/db/DBSchema.js), dùng cho cả DB và UI rendering.

---

## 📁 CODE ORGANIZATION STANDARDS

### 1. Class-based Modules

Các tính năng nghiệp vụ mới phải được viết dưới dạng Class và đăng ký vào hệ thống qua `A.addModule()`.

```javascript
class MyModule {
  constructor() { this._initialized = false; }
  init() { ... }
  // Business logic
}
```

### 2. Error Handling

Luôn sử dụng **try-catch** cho mọi logic, đặc biệt là các thao tác I/O và xử lý DOM. Sử dụng `Opps(error)` hoặc `L.log()` để ghi lại lỗi.

### 3. Language & Style

- **Ngôn ngữ**: Tiếng Việt (cho comment và thông báo).
- **Công nghệ**: Vanilla JS, Bootstrap 5, Firestore. **KHÔNG** dùng framework (React/Vue).
- **Bulk Replacements**: Ưu tiên thay đổi hàng loạt thay vì sửa đổi nhỏ lẻ để tiết kiệm token.

---

## 🎯 CRITICAL DEVELOPMENT PATTERNS

### Pattern 1: Event Handling (A.Event.on)

Sử dụng `A.Event.on` thay vì `addEventListener` trực tiếp để tận dụng tính năng **Auto-cleanup** và **Delegation**.

```javascript
A.Event.on('.btn-save', 'click', (e, target) => { ... }, true); // true = lazy delegation
```

### Pattern 2: Form Data (HD Helper)

Sử dụng `HD` (từ [`db_helper.js`](public/src/js/libs/db_helper.js)) để thu thập và đổ dữ liệu vào Form.

- `HD.getFormData(rootEl, collectionName)`: Thu thập dữ liệu từ các input có `data-field`.
- `HD.setFormData(rootEl, data, collectionName)`: Đổ dữ liệu vào form.

### Pattern 3: Advanced Table (ATable)

Sử dụng component `ATable` cho mọi danh sách dữ liệu lớn. Hỗ trợ filter, sort, group và inline edit dựa trên `DBSchema`.

### Pattern 4: Dynamic Execution (SYS.runFn)

Sử dụng `SYS.runFn(funcRef, args)` để thực thi các hàm từ chuỗi hoặc đường dẫn đối tượng một cách an toàn.

### Pattern 5: Global Utilities (utils.js)

- `getVal(id)` / `setVal(id, val)`: Thao tác với giá trị input.
- `getE(id)` / `$(selector, root)`: Alias cho `document.getElementById` và `document.querySelector`.
- `formatMoney(num)`, `formatDateVN(date)`, `formatDateForInput(date)`: Định dạng dữ liệu lần lượt là: tiền tệ, ngày tháng địa phương, ngày tháng chuẩn cho firestore.

---

## 🗂️ MODULE & FEATURE REFERENCE

| Module              | Purpose                 | Key Access    |
| ------------------- | ----------------------- | ------------- |
| **DB Manager**      | CRUD Firestore & Sync   | `A.DB`        |
| **UI Manager**      | Render Template & Tabs  | `A.UI`        |
| **Event Manager**   | Centralized Events      | `A.Event`     |
| **Modal Engine**    | Dynamic Modals          | `A.Modal`     |
| **Sales Module**    | Booking & Customer      | `SalesModule` |
| **Operator Module** | Service Entries & Costs | `Op`          |

---

## 🐛 TROUBLESHOOTING & COMMON ISSUES

| Issue                  | Root Cause                  | Solution                                                       |
| ---------------------- | --------------------------- | -------------------------------------------------------------- |
| `APP_DATA` rỗng        | `A.DB.init()` chưa hoàn tất | Await `A.DB.ready()` trước khi truy cập dữ liệu.               |
| Event không chạy       | Element được render động    | Sử dụng `A.Event.on` với tham số `isLazy = true`.              |
| Lỗi phân quyền         | `CURRENT_USER` chưa load    | Kiểm tra trạng thái trong `A.Auth`.                            |
| Dữ liệu không cập nhật | Sai luồng Gatekeeper        | Đảm bảo gọi qua `A.DB.syncLocal` hoặc các hàm CRUD của `A.DB`. |

---

## ✅ NEXT STEPS FOR AI AGENTS

1. **Luôn đọc DBSchema** trước khi tạo hoặc sửa đổi các trường dữ liệu.
2. **Sử dụng A object** cho mọi tương tác với hệ thống lõi.
3. **Tuân thủ Gatekeeper** khi thao tác với dữ liệu.
4. **Viết code sạch**, có try-catch và comment / document tiếng Việt.

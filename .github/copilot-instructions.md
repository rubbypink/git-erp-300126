# 9-Trip ERP Frontend - AI Coding Instructions & Architecture Guide

**Last Updated**: January 2026 | **Version**: 1.0  
**Project Status**: Legacy Modernization In Progress (v1 → v2)

---

## 📋 TABLE OF CONTENTS
1. [Project Architecture](#project-architecture)
2. [Data Flow & Format Duality](#data-flow--format-duality)
3. [Code Organization Standards](#code-organization-standards)
4. [Critical Development Patterns](#critical-development-patterns)
5. [Module & Feature Reference](#module--feature-reference)
6. [Troubleshooting & Common Issues](#troubleshooting--common-issues)
7. [Modernization Roadmap](#modernization-roadmap)

---

## 🏗️ PROJECT ARCHITECTURE

### System Overview
**9-Trip ERP** is a dual-version tour/booking management system:

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Vue/Vanilla JS)                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  v1 (PRODUCTION)      │  v2 (BETA)                  │  │
│  │  └─ public/src/       │  └─ public/v2/             │  │
│  │     (Vanilla JS)       │     (Modular, ES6)        │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                             ↓
                    Firebase Firestore
                    Google Sheets (API)
```

**Key Technologies**:
- **Frontend**: Vanilla JavaScript, Bootstrap 5, Font Awesome 6, jQuery (legacy)
- **Backend**: Firebase Firestore (real DB) + Google Apps Script (data sync)
- **Hosting**: Firebase Hosting with SPA rewrites
- **Config**: `.eslintrc.json`, `.prettierrc` (2 spaces, semicolons, 100 char limit)

### File Structure (v1 - Current)
```
public/src/
├── index.html              # Main entry point, tab structure
├── components/
│   ├── tpl_all.html        # Master template (all fields)
│   ├── tpl_operator.html   # Operator form template
│   └── tpl_sales.html      # Sales form template
├── css/
│   └── main.css            # Global + responsive styles
├── images/                 # Logos, icons, assets
└── js/
    ├── main.js             # ★ Core init, tab switching, global handlers
    ├── login_module.js     # Firebase auth, user context
    ├── db_manager.js       # Firestore/Sheets data loading, ID generation
    ├── db_schema.js        # Field mapping (array ↔ object conversion)
    ├── api_base.js         # Server API wrapper (requestAPI function)
    ├── api_operator.js     # Operator role API calls
    ├── api_sales.js        # Sales role API calls
    ├── logic_base.js       # Shared UI logic (filters, sorting, settings)
    ├── logic_operator.js   # ★ Form logic, calculations (operator entries)
    ├── logic_sales.js      # Sales-specific form logic
    ├── renderer.js         # Dynamic HTML generation (tables, modals, UI)
    ├── utils.js            # ★ Global helpers (getVal, setVal, log, etc.)
    ├── shortkey.js         # Keyboard shortcuts system
    └── login_module.js     # Firebase authentication
```

### Script Load Order (Critical)
```javascript
/* index.html <head> - External Libraries */
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/js/all.min.js"></script>
<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
<script src="https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js"></script>

/* index.html <body> - Custom Scripts (ORDER MATTERS!) */
1. utils.js               (Global utils: getVal, setVal, log)
2. shortkey.js            (Keyboard shortcuts config)
3. db_schema.js           (Field mapping + converters)
4. login_module.js        (Firebase init + auth check)
5. db_manager.js          (Data loading + APP_DATA initialization)
6. renderer.js            (UI generation functions)
7. logic_base.js          (Shared logic, filters, sorting)
8. api_base.js            (API wrappers)
9. api_operator.js        (Role-specific: Operator)
10. logic_operator.js     (Role-specific: Operator form logic)
11. api_sales.js          (Role-specific: Sales)
12. logic_sales.js        (Role-specific: Sales form logic)
13. main.js               (Final: event listeners, initialization)
```

---

## 🔄 DATA FLOW & FORMAT DUALITY

### Critical: Array vs Object Format

The system **MUST support both formats** during migration:

| Aspect | Array Format (Legacy) | Object Format (Modern) |
|--------|----------------------|----------------------|
| **Access** | `bkData[2]` | `bkData.customer_name` |
| **Source** | Direct from Firestore | Transformed by schema |
| **Example** | `['BK001', '', 'Nguyễn A', '0909...']` | `{id: 'BK001', customer_name: 'Nguyễn A', ...}` |

### Format Detection Pattern
**ALWAYS use this in ALL data handlers**:
```javascript
const isObject = typeof data === 'object' && !Array.isArray(data);
const fieldValue = isObject 
  ? data.field_name 
  : data[COL_INDEX.ARRAY_INDEX];
```

### Global Data Structure (`window.APP_DATA`)
Initialized in [db_manager.js](public/src/js/db_manager.js#L200), used everywhere:

```javascript
window.APP_DATA = {
  // ─── Collections (both formats during migration) ───
  bookings_obj: [{id, customer_name, customer_phone, start_date, ...}],
  bookings: [['BK001', '', 'Nguyễn A', '0909...', ...]], // Legacy
  
  operator_entries_obj: [{id, booking_id, service_type, hotel_name, ...}],
  operator_entries: [[...array format...]],
  
  customers_obj: [{id, full_name, phone, source, ...}],
  customers: [[...array format...]],
  
  users_obj: [{uid, account, user_name, role, ...}],
  
  // ─── Lookup Tables (master data) ───
  lists: {
    hotelMatrix: [
      ['Hotel A', '', 'Phòng Đơn', 'Phòng Đôi', 'Phòng Triple'],
      ['Hotel B', '', 'Standard', 'Deluxe']
    ],
    serviceMatrix: [
      ['Vé MB', 'Vé Máy Bay'],
      ['Vé Tàu', 'Vé Tàu'],
      ['Ăn', 'Bữa Sáng']
    ],
    supplier: ['Supplier A', 'Supplier B'],
    locOther: ['Khác...'],
    types: ['Phòng', 'Vé MB', 'Vé Tàu', 'Ăn', ...]
  }
};
```

### Data Load Flow
```
1. index.html loads → scripts in order
2. login_module.js: Firebase auth → sets CURRENT_USER
3. db_manager.js: loadDataFromFirebase() → fetches from Firestore/Sheets
4. Transforms via db_schema.js: arrayToObject() → populates APP_DATA
5. renderer.js + logic_*.js: Display using APP_DATA
6. User edits → getFormData() collects changes
7. api_base.js: requestAPI('functionName', data) → sends to Google Apps Script
```

---

## 📁 CODE ORGANIZATION STANDARDS

### 1. File Naming Convention
```
├── {domain}_{layer}.js
│   ├── db_*.js           # Data access (db_manager, db_schema)
│   ├── api_*.js          # Server communication (api_base, api_sales)
│   ├── logic_*.js        # Business logic (logic_operator, logic_base)
│   ├── {feature}.js      # Standalone features (shortkey, renderer, utils)
│   └── main.js           # Entry point
```

### 2. Function Organization Within Files
```javascript
/**
 * =========================================================================
 * MODULE_NAME.JS - DESCRIPTIVE COMMENT
 * Purpose: What this file does
 * =========================================================================
 */

// =========================================================================
// 1. CONSTANTS & INITIALIZATION
// =========================================================================
const MODULE_CONFIG = {...};
var globalState = null;

// =========================================================================
// 2. PUBLIC FUNCTIONS (window.* for global access)
// =========================================================================
window.publicFunction = function() { ... };

// =========================================================================
// 3. PRIVATE HELPER FUNCTIONS
// =========================================================================
function _internalHelper() { ... }

// =========================================================================
// 4. EVENT HANDLERS
// =========================================================================
function handleEvent() { ... }

// =========================================================================
// 5. MODULE EXPORTS / INITIALIZATION
// =========================================================================
function init() { ... }
```

### 3. Commenting Standards
```javascript
/**
 * Summary sentence ending with period.
 * 
 * Detailed description if needed (optional).
 * 
 * @param {type} paramName - Description
 * @param {type} [optionalParam] - Optional parameter
 * @returns {type} - What is returned
 * 
 * @example
 * // Usage example:
 * functionName(value);
 * 
 * @throws {ErrorType} When something goes wrong
 */
function functionName(paramName, optionalParam = null) { ... }
```

### 4. Variable Naming
| Context | Convention | Example |
|---------|-----------|---------|
| DOM elements | `el*` or `*El` | `elName`, `inputEl` |
| Input fields | `*Input` | `custNameInput` |
| Collections | `*List`, `*Arr` | `bookingsList`, `rowsArr` |
| State flags | `is*`, `has*` | `isLoading`, `hasError` |
| Config objects | `*CONFIG`, `*_CONFIG` | `DB_MANAGER`, `THEMES` |
| CSS classes | `.d-*` | `.d-name`, `.d-type` (in forms) |
| jQuery objects | `$*` | `$container`, `$row` |

---

## 🎯 CRITICAL DEVELOPMENT PATTERNS

### Pattern 1: Global Utilities (From utils.js)
Every function is GLOBAL (no imports):
```javascript
// Reading & Writing Form Values
getVal('fieldId')                    // Get input value
setVal('fieldId', value)             // Set input value  
getNum('fieldId')                    // Get as number
setNum('fieldId', number)            // Set + format as currency

// DOM Manipulation
getE('elementId')                    // Get element (fast alias for getElementById)
setStyle(element, 'color: red')      // Apply inline styles
onEvent(element, 'click', handler)   // Add event listener

// Data Parsing
getRawVal('1,500,000')               // Parse number (removes formatting)
formatMoney(1500000)                 // Format as "1,500,000"
parseDateVN('01/02/2026')            // Parse Vietnamese date format

// Logging & Alerts
log('message', 'type')               // Console + UI notification
logA('message', 'type', callback)    // Alert banner with OK/Cancel
logError(exception)                  // Error logging with stack

// Hided getters
$()                                  // jQuery alias
```

### Pattern 2: Form Field Class Selectors (Operator Form)
All form row operations use `.d-*` CSS classes:

```html
<!-- In addDetailRow() - HTML template -->
<tr id="row-{idx}">
  <td><input class="d-sid" data-field="id" /></td>
  <td><select class="d-type" data-field="service_type" /></td>
  <td><select class="d-loc" data-field="hotel_name" /></td>
  <td><select class="d-name" data-field="service_name" /></td>
  <td><input class="d-in" data-field="check_in" type="date" /></td>
  <td><input class="d-out" data-field="check_out" type="date" /></td>
  <td><input class="d-qty" data-field="adults" type="number" /></td>
  <td><input class="d-costA" data-field="cost_adult" /></td>
  <td><input class="d-qtyC" data-field="children" type="number" /></td>
  <td><input class="d-costC" data-field="cost_child" /></td>
  <td><input class="d-sur" data-field="surcharge" /></td>
  <td><input class="d-disc" data-field="discount" /></td>
  <td><input class="d-totalSales" data-field="total_sale" readonly /></td>
  <td><input class="d-totalCost" data-field="total_cost" readonly /></td>
  <td><input class="d-paid" data-field="paid_amount" /></td>
  <td><input class="d-remain" data-field="debt_balance" readonly /></td>
  <td><select class="d-supplier" data-field="supplier" /></td>
  <td><input class="d-note" data-field="operator_note" /></td>
</tr>
```

**Extract from row**:
```javascript
const tr = getE(`row-${idx}`);
const getRowVal = (cls) => {
  const el = tr.querySelector('.' + cls);
  return el ? getVal(el) : '';
};
const serviceType = getRowVal('d-type');
const hotelName = getRowVal('d-loc');
```

### Pattern 3: Schema Conversion (db_schema.js)
Convert between formats using:
```javascript
// Array → Object
const obj = arrayToObject(arrayData, 'operator_entries');

// Object → Array (for saving)
const arr = objectToArray(objData, 'operator_entries');

// Get field name from index
const fieldName = getFieldName('operator_entries', 10);

// Get index from field name
const index = getFieldIndex('operator_entries', 'cost_adult');
```

**Schema mapping** in `FIELD_MAP`:
```javascript
const FIELD_MAP = {
  operator_entries: {
    10: 'cost_adult',
    11: 'children',
    12: 'cost_child',
    // ... etc
  }
};
```

### Pattern 4: Cascading Dropdowns (Service Selection)

**Hierarchy**: Type → Location → Service Name

```javascript
// User changes Type
onTypeChange(idx, resetChildren = true) {
  // Reset Location when Type changes
  updateLocationList(idx);
}

// User changes Location
onLocationChange(idx, resetName = true) {
  // For room service, load room types by hotel
  updateServiceNameList(idx);
}

// Load locations from matrix
function updateLocationList(idx) {
  const lists = APP_DATA.lists;
  const hotels = lists.hotelMatrix.map(r => r[0]);
  const others = lists.locOther || [];
  const allLocs = [...new Set([...hotels, ...others])];
  // Populate d-loc select
}

// Load service names based on Type & Location
function updateServiceNameList(idx) {
  const type = getVal(`.d-type`, tr);
  const loc = getVal(`.d-loc`, tr);
  
  if (type === 'Phòng') {
    // Room type: lookup hotelMatrix[hotel] → columns 2+ = room types
    const hotelRow = lists.hotelMatrix.find(r => r[0] === loc);
    options = hotelRow.slice(2).filter(c => c);
  } else {
    // Service type: lookup serviceMatrix
    options = lists.serviceMatrix
      .filter(r => r[0] === type)
      .map(r => r[1]);
  }
}
```

### Pattern 5: Calculations (Operator Form)

**Flow**: Per-row → Grand totals → Profit

```javascript
// 1. Per-row calculation (called on any field change)
function calcRow(idx) {
  const tr = getE(`row-${idx}`);
  
  // Calculate nights from dates (only for Phòng type)
  const dIn = new Date(tr.querySelector('.d-in').value);
  const dOut = new Date(tr.querySelector('.d-out').value);
  const type = tr.querySelector('.d-type').value;
  const night = (type === 'Phòng' && dOut > dIn) 
    ? (dOut - dIn) / 86400000 
    : 1;
  
  // Cost calculation
  const multiplier = (type === 'Phòng') ? night : 1;  // ★ KEY: Only rooms multiply by nights
  const totalCost = (
    (qtyA * costA) + 
    (qtyC * costC) + 
    sur - disc
  ) * multiplier;
  
  calcGrandTotal(); // Trigger parent recalc
}

// 2. Grand total (header level)
function calcGrandTotal() {
  let totalSales = 0;
  const rows = document.querySelectorAll('#detail-tbody tr');
  
  rows.forEach(tr => {
    const sales = getRawVal(tr.querySelector('.d-totalSales').value);
    totalSales += sales;
  });
  
  const totalCost = getNum('BK_TotalCost');
  const profit = totalSales - totalCost;
  
  setVal('BK_Total', formatMoney(totalSales));
  setVal('BK_Balance', formatMoney(profit));
  calcBalanceInternal(totalSales, totalCost);
}

// 3. Profit with color coding
function calcBalanceInternal(total, cost) {
  const profit = total - cost;
  const elBalance = getE('BK_Balance');
  
  elBalance.classList.toggle('text-success', profit >= 0);
  elBalance.classList.toggle('text-danger', profit < 0);
}
```

### Pattern 6: Data Extraction (getFormData)
Extract all form data for saving:
```javascript
window.getFormData = function() {
  const bookings = {
    id: getVal('BK_ID'),
    customer_name: getVal('Cust_Name'),
    customer_phone: getVal('Cust_Phone'),
    start_date: getVal('BK_Start'),
    end_date: getVal('BK_End'),
    adults: getNum('BK_Adult'),
    total_amount: getNum('BK_Total'),
    status: getVal('BK_Status'),
    // ... other fields
  };
  
  const operator_entries = [];
  document.querySelectorAll('#detail-tbody tr').forEach(tr => {
    const getRowVal = (cls) => getVal(tr.querySelector('.' + cls));
    
    if (!getRowVal('d-name')) return; // Skip empty rows
    
    operator_entries.push({
      id: getRowVal('d-sid'),
      booking_id: getRowVal('d-idbk'),
      service_type: getRowVal('d-type'),
      hotel_name: getRowVal('d-loc'),
      service_name: getRowVal('d-name'),
      check_in: getRowVal('d-in'),
      check_out: getRowVal('d-out'),
      adults: getRowVal('d-qty'),
      cost_adult: getRawVal(getRowVal('d-costA')),
      total_sale: getNum('.d-totalSales'),
      // ... etc
    });
  });
  
  return { bookings, customer: {...}, operator_entries };
};
```

### Pattern 7: API Communication (requestAPI)
From [api_base.js](public/src/js/api_base.js):
```javascript
// Async call to Google Apps Script
await requestAPI('functionName', arg1, arg2, ...);

// Google Apps Script receives:
// function doPost(e) {
//   const functionName = e.parameter.func;
//   const args = JSON.parse(e.parameter.args);
//   // Handle based on functionName
// }
```

**Usage example**:
```javascript
const res = await requestAPI('saveBookingAPI', bookingData, entriesData);
if (res.success) {
  log('Booking saved!', 'success');
  loadDataFromFirebase(); // Refresh
}
```

### Pattern 8: Module Pattern (PartnerMailModule)
Encapsulation without ES6 classes:
```javascript
const PartnerMailModule = (function() {
  // Private variables
  const config = {...};
  
  // Private functions
  function _validate() { ... }
  
  // Public API
  function open() {
    // Show modal
  }
  
  async function send() {
    // Send email via API
  }
  
  return { open, send }; // Expose only public methods
})();

// Usage
PartnerMailModule.open();
```

---

## 🗂️ MODULE & FEATURE REFERENCE

### Core Modules

| File | Purpose | Key Functions |
|------|---------|---|
| [main.js](public/src/js/main.js) | App initialization, global handlers | `loadBookingToUI()`, `activateTab()`, `handleSearchClick()` |
| [utils.js](public/src/js/utils.js) | Global utilities (1500 lines) | `getVal()`, `setVal()`, `log()`, `formatMoney()` |
| [db_schema.js](public/src/js/db_schema.js) | Field mapping, format conversion | `arrayToObject()`, `getFieldName()` |
| [db_manager.js](public/src/js/db_manager.js) | Firestore data loading, ID generation | `generateIds()`, `loadDataFromFirebase()` |
| [renderer.js](public/src/js/renderer.js) | Dynamic HTML generation (900+ lines) | `renderGrid()`, `renderDashboard()`, `A.UI.*` |
| [logic_base.js](public/src/js/logic_base.js) | Shared UI logic (1543 lines) | `applyGridFilter()`, `applyGridSorter()`, `openSettingsModal()` |
| [logic_operator.js](public/src/js/logic_operator.js) | Operator form logic, calculations | `loadBookingToUI()`, `addDetailRow()`, `calcGrandTotal()` |
| [api_base.js](public/src/js/api_base.js) | Server API wrapper | `requestAPI()`, `handleSearchClick()` |
| [shortkey.js](public/src/js/shortkey.js) | Keyboard shortcuts | `initShortcuts()`, `recordingKey()` |

### ⭐ NEW: Service Layer (Phase 2+)

| File | Purpose | Key Functions |
|------|---------|---|
| `services/StoreService.js` | Centralized state (Pub/Sub) | `subscribe()`, `setState()`, `getState()` |
| `services/MatrixAdapter.js` | Complex matrix data | `getRoomTypes()`, `buildLocationOptions()`, `validateMatrix()` |
| `services/AuditService.js` | Logging & audit trail | `logDataChange()`, `queryAuditLog()`, `exportAuditLog()` |
| `services/CalculationService.js` | Business logic formulas | `calculateNights()`, `calculateRowCost()`, `calculateProfit()` |
| `services/DataService.js` | Data operations | `findBookingById()`, `getOperatorEntries()`, `saveBooking()` |
| `services/FormService.js` | Form operations | `extractFormData()`, `populateForm()`, `validateForm()` |
| `controllers/BookingController.js` | Booking logic | `loadBooking()`, `saveBooking()`, `addDetailRow()` |
| `controllers/MobileNavController.js` | Mobile navigation | `toggleDrawer()`, `switchTab()`, `nextStep()` |

### Role-Specific Modules

**Operator Role** (public/src/js/):
- `api_operator.js` - Operator API endpoints
- `logic_operator.js` - Operator entry form, calculations

**Sales Role** (public/src/js/):
- `api_sales.js` - Sales API endpoints
- `logic_sales.js` - Sales booking form logic

---

## 🐛 TROUBLESHOOTING & COMMON ISSUES

| Issue | Root Cause | Solution |
|-------|-----------|----------|
| **Undefined function** | Not in load order or not global | Check script order in index.html; add `window.` prefix |
| **APP_DATA is null** | db_manager.js didn't run | Ensure `loadDataFromFirebase()` called after auth |
| **Format detection fails** | Mixed obj/array comparison | Use: `typeof x === 'object' && !Array.isArray(x)` |
| **Cascading dropdown empty** | Missing `hotelMatrix` or `serviceMatrix` | Check `APP_DATA.lists` population in db_manager.js |
| **Form row calculation wrong** | Wrong CSS class selector | Verify `.d-` class matches `addDetailRow()` template |
| **Modal doesn't open** | Bootstrap JS not loaded or already destroyed | Use `bootstrap.Modal.getOrCreateInstance()` |
| **Search returns nothing** | Data in array format instead of object | Ensure db_schema.js converts properly |
| **Firebase permission denied** | User role not set | Check `CURRENT_USER` in `login_module.js` |

### Debug Checklist
```javascript
// 1. Check authentication
console.log(CURRENT_USER);

// 2. Check data loaded
console.log(window.APP_DATA.bookings_obj.length);
console.log(window.APP_DATA.lists.hotelMatrix);

// 3. Check form DOM
console.log(document.querySelectorAll('#detail-tbody tr').length);

// 4. Check calculation
console.log(getRawVal('1,500,000')); // Should be 1500000
console.log(getNum('BK_Total')); // Raw number value

// 5. Check API communication
await requestAPI('testAPI');
```

---

## 🚀 MODERNIZATION ROADMAP

### Phase 1: File Organization (Current)
- [x] Separate concerns: db_*, api_*, logic_*
- [x] Document field mapping in db_schema.js
- [ ] Extract common calculations to logic_base.js

### Phase 2: Format Migration (Next Sprint)
- [ ] Complete object format for all collections
- [ ] Remove legacy array parsing in v1 files
- [ ] Update db_schema.js mappings
- [ ] Migrate API responses to object format

### Phase 3: Module Refactoring
- [ ] Convert logic_*.js to class-based controllers
- [ ] Extract calculations → `CalculationService`
- [ ] Extract data → `DataService` (replace db_manager)
- [ ] Consolidate UI logic → `UIService`

### Phase 4: v2 Deployment
- [ ] Complete v2/js/core/* implementation
- [ ] Migrate routes to v2 module structure
- [ ] Replace requestAPI with native Firestore calls
- [ ] Upgrade Firebase SDK v8 → v9+

### Phase 5: Code Quality (Final)
- [ ] Add Webpack bundling
- [ ] Implement ES6 modules
- [ ] Add unit tests (Jest)
- [ ] Auto-minification & optimization

---

## 📝 CODING STYLE GUIDE

### Enforcement Tools
- **Linter**: ESLint (.eslintrc.json) - `no-console: off`, `no-unused-vars: warn`
- **Formatter**: Prettier (.prettierrc) - 2 spaces, semicolons, 100 char wrap, single quotes

### Before Committing
```bash
# Format code
npx prettier --write "public/src/js/**/*.js"

# Check for errors
npx eslint "public/src/js/**/*.js"

# Manual checks
# - All getVal() wrapped with null check
# - All DOM queries wrapped with getE() or validation
# - Format detection: typeof x === 'object' && !Array.isArray(x)
# - Calculations: use getRawVal() for formatted numbers
# - Logging: use log() not console.log()
```

---

## 🔗 QUICK REFERENCE

**Project Config**:
- Firebase: `trip-erp-923fd` (Firebase console)
- Hosting: Firebase Hosting (automatic deploy via `firebase deploy`)
- Google Sheets: Sales sheet, Operator sheet (in app-config.js)

**Important IDs**:
- Main form: `#tab-form` → `#detail-tbody` (booking table include details/operator entries )
- Booking header: `BK_ID`, `BK_Total`, `BK_Status`, etc.
- Search: `#global-search` input
- Dashboard: `#dash-table-1`, `#dash-table-2`, `#dash-table-3`

**Key Global Objects**:
- `window.APP_DATA` - All application data
- `window.CURRENT_USER` - Authenticated user {uid, role, email}
- `window.CURRENT_CTX_ROW` - Right-click context row
- `window.A.UI` - UI rendering engine

---

## ✅ NEXT STEPS FOR AI AGENTS

1. **Before making changes**: Read the relevant section above (Data Format, Patterns, etc.)
2. **Always check format**: `typeof data === 'object' && !Array.isArray(data)`
3. **Use global utils**: `getVal()`, `setVal()`, `getRawVal()`, `log()`
4. **Test in browser**: Open DevTools, check `APP_DATA` and `CURRENT_USER`
5. **Follow file structure**: Use `.d-` classes in forms, `*_manager.js` for data, `*_logic.js` for UI
6. **Document additions**: Comment all functions with JSDoc format
7. **Verify calculation flow**: calcRow() → calcGrandTotal() → updateUI()

---

**Questions?** Check the inline comments in specific files or run `log('message', 'warning')` to test the logging system.

<!-- Context: project-intelligence/erp-architecture | Priority: critical | Version: 1.0 | Updated: 2026-05-25 -->

# ERP Frontend Architecture

**Purpose**: Deep dive into the 9-Trip ERP frontend architecture — singleton, module system, event system, rendering, security, table component. The definitive reference for any frontend work.
**Audience**: Developers, AI agents working on ERP frontend code.

---

## 1. Application Singleton (`window.A`)

**File**: `public/src/js/modules/core/app.js` (856 lines)
**Pattern**: Singleton with private fields + Proxy-based module access

### Registration API

```javascript
// Lazy module (only instantiated on first access)
A.addModule('Sales', SalesModule);          // autoInit default true

// Eager module (instantiated immediately)
A.addModule('Database', DBManager, true);

// Lazy module with explicit control
A.addModule('Router', RouterModule, false); // autoInit: false

// Plain object/singleton
A.addModule('Config', { debug: true });

// Dynamic import
await A.load('LateModule', false);
```

### Registration Shapes Detected

| Shape | Detection | Behavior |
|-------|-----------|----------|
| **Class constructor** (sealed prototype) | `Object.getOwnPropertyDescriptor(proto, 'prototype').writable === false` | Stored with lazy wrapper or instantiated eagerly |
| **Plain object / singleton** | Not a function, or function with writable prototype | Stored directly |
| **Plain function** (factory) | Function with writable prototype | Stored directly |

### Proxy-Based Access

```javascript
A.Sales           // → Proxy resolving lazy class, binding methods
A.Sales.method()  // → method bound to correct instance
A.Sales.raw       // → raw stored value (class constructor or object)
A.Sales.class     // → original constructor (if class)
```

### Built-in Modules (Pre-registered)

| Property | Module | Purpose |
|----------|--------|---------|
| `A.Auth` | AUTH_MANAGER (LoginModule) | Firebase Auth, login/logout |
| `A.Security` | SECURITY_MANAGER (LoginModule) | Role-based DOM cleanup |
| `A.Event` | EventManager | Event delegation, auto-cleanup |
| `A.UI` | UI_Manager | Template rendering, navigation |
| `A.DB` | DBManager | Firestore CRUD, data sync |
| `A.State` | StateProxy | Reactive state management |
| `A.Theme` | ThemeManager | Dark/light mode |
| `A.Router` | Router | Client-side routing |

### Boot Sequence

```
1. init() → Auth.initFirebase()
2. #listenAuth() → onAuthStateChanged
3. On login:
   a. Dynamic import ModuleLoader → load core modules
   b. DB.init() → IndexedDB + Firestore
   c. Fetch user profile from Firestore users/{uid}
   d. If /admin pathname: set isReady, return
   e. Normal: UI.init() → load layout templates
   f. SECURITY_MANAGER.applySecurity(userProfile)
   g. moduleManager.loadForRole() → role-specific modules
4. #runPostBoot() (non-blocking, after UI visible):
   a. Load UI modules, config, data
   b. Init StateProxy
   c. Dispatch 'app-ready' event
```

### Config Object

```javascript
A.getConfig('ADMIN_EMAILS')  // ['tranthuaanh90@...', '9tripphuquoc@...']
A.getConfig('debug')          // true
A.getConfig('intl.locale')   // 'vi-VN'
A.setConfig('debug', false)  // Update (admin-only guard on some keys)
```

---

## 2. Event System (`EventManager`)

**File**: `public/src/js/modules/core/EventManager.js` (730 lines)
**Access**: `A.Event`

### Core API

```javascript
// Lazy delegation (handler on document, filtered by target)
A.Event.on('.btn-save', 'click', handler, true);
// Equivalent: document.addEventListener('click', e => {
//   if (e.target.closest('.btn-save')) handler(e);
// });

// Direct binding
A.Event.on('#my-input', 'change', handler);

// Multiple events
A.Event.on('#form', 'click change', handler);

// Remove listener
A.Event.off('.btn-save', 'click');

// Programmatic trigger
A.Event.trigger('.btn-refresh', 'click');

// Get all listeners affecting an element
A.Event.getListenersForElement(el);
```

### Key Features

| Feature | Description |
|---------|-------------|
| **Auto-cleanup** | Same target+event combo auto-removes previous listener |
| **Delegation** | `true` flag = lazy delegation on `document` with `e.target.closest()` |
| **Error isolation** | Handler errors caught and logged via `Opps()` — one broken handler doesn't break others |
| **Signature keys** | `_makeKey(target, eventNames, options)` → unique key for registry |

### Built-in Global Events (registered in `init()`)

- **Bootstrap tabs**: `show.bs.tab` → `A.UI.toggleContextUI()`, `shown.bs.tab` → `A.UI.selectTab()`
- **Server actions**: `.btn-server-action` click → reads `data-func`, `data-args`, `data-confirm`
- **Search**: `#global-search` keyup Enter, `#booking-search` keyup Enter
- **Form**: `#BK_Start` change → auto-calc dates
- **Number inputs**: `input[type="number"]` → 850ms debounce, stores raw value in `dataset.val`
- **Grid keyboard nav**: Ctrl+Enter/Down/Up/Left/Right/D for cell navigation, Ctrl+D copies from cell above
- **Row click**: `tr` dblclick → `B.onGridRowClick`, `tr` Ctrl+click → same

---

## 3. UI Manager & Template Rendering

**File**: `public/src/js/modules/core/UI_Manager.js` (1368 lines)
**Access**: `A.UI`

### Template System

```
public/src/components/
├── tpl_all.html              # Main layout shell (loaded FIRST)
├── tpl_sales.html            # Sales role template
├── tpl_operator.html         # Operator role template
├── tpl_accountant.html       # Accountant role template
├── tpl_accountant_report.html
├── tpl_booking_overview.html
├── tpl_tour_price.html
├── tpl_price_manager.html
├── tpl_ai_marketing.html     # AI Marketing dashboard
├── tpl_admin_settings.html
├── tpl_hr.html
└── report_dashboard.html
```

### renderTemplate(targetId, source, force, positionRef, mode)

```javascript
// Load from file (fetched & cached)
A.UI.renderTemplate('main-content', 'tpl_sales.html');

// Load from <template id="tmpl-*"> (DOM template)
A.UI.renderTemplate('modal-body', 'tmpl-booking-form');

// Force re-render (skip renderedTemplates guard)
A.UI.renderTemplate('main-content', 'tpl_sales.html', true);

// Append instead of replace
A.UI.renderTemplate('list', 'tmpl-item', false, null, 'append');
```

**Caching**: Loaded HTML files cached in `htmlCache` object. Templates with `id="tmpl-*"` are extracted, registered in `renderedTemplates`, then removed from DOM fragment.

### Tab-Based Navigation

```javascript
// Activate a tab (Bootstrap Tab API)
A.UI.activateTab('tab-form');

// Select tab handler (switch-based dispatch)
A.UI.selectTab('tab-dashboard');  // → dashboard update
A.UI.selectTab('tab-data-tbl');   // → create ATable
A.UI.selectTab('tab-price-pkg');  // → delegate to pricing module
```

### Other Key Methods

| Method | Description |
|--------|-------------|
| `createTable(containerId, opts)` | Dynamic import `ATable.js`, instantiate |
| `renderForm(collectionName, dataorId, title)` | Auto-generate form from DBSchema |
| `renderModal(tmplId, title, btnSaveHandler, btnResetHandler)` | Render template in modal |
| `stableSort(data, currentTable, sort)` | Vietnamese-collator-based sort |
| `showLoading(show, text)` | Full-screen loading overlay |
| `setBtnLoading(btnSelector, isLoading)` | Toggle button spinner |
| `generateGridColsFromObject(collectionName)` | Create GRID_COLS from schema |

### UI_HELP (Dialog Helpers)

```javascript
// Toast notification
A.UI.HELP.logA('Đã lưu thành công', 'success');

// Confirm dialog (3 buttons)
A.UI.HELP.showConfirm('Xác nhận xóa?', 
    () => { /* OK */ }, 
    () => { /* Deny */ }
);
```

---

## 4. Security & Role-Based Access

**File**: `public/src/js/modules/core/LoginModule.js` (587 lines)
**Access**: `A.Auth`, `A.Security`

### Role Hierarchy

| Role | Level | Template | Can Edit | Can Delete |
|------|-------|----------|----------|------------|
| `sale` / `sales` | 0 | `tpl_sales.html` | ✅ (booking_details) | ✅ |
| `op` / `operator` | 0 | `tpl_operator.html` | ✅ (operator_entries) | ❌ |
| `acc` / `ketoan` | 0 | `tpl_operator.html` | Limited | ❌ |
| `acc_thenice` | 0 | `tpl_operator.html` | Limited | ❌ |
| `admin` | ≥50 | both | ✅ | ✅ |

### Role Masking (Testing)

```javascript
// Set localStorage to mock a different role
localStorage.setItem('erp-mock-role', 'op');
// Reload page → UI renders as operator
// Remove to restore real role:
localStorage.removeItem('erp-mock-role');
```

### CSS Class-Based Security

```html
<!-- These elements are removed by SECURITY_MANAGER.cleanDOM() if role doesn't match -->
<div class="admin-only">Chỉ admin thấy</div>
<div class="manager-only">Admin + Manager</div>
<div class="op-only">Chỉ operator thấy</div>
<div class="sales-only">Chỉ sales thấy</div>
<div class="acc-only">Chỉ accountant thấy</div>
```

### Body Classes

| Condition | Body Class |
|-----------|------------|
| `level >= 50` or hard-coded admin email | `is-admin` |
| `level >= 10` | `is-manager` |
| `level >= 5` | `is-sup` |
| Role `ketoan`/`acc` | `is-acc` |
| Role `acc_thenice` | `is-acc-thenice` |
| Role `op`/`operator` | `is-op` |
| Default | `is-sale` |

---

## 5. LogicBase — Shared Grid Logic

**File**: `public/src/js/modules/core/LogicBase.js`
**Alias**: `window.B`

### Static State

```javascript
LogicBase.GRID_COLS = [];           // Column metadata
LogicBase.GRID_STATE = {
    currentTable: '',               // bookings | booking_details | operator_entries
    sourceData: [],                 // Raw data
    filteredData: [],               // After filtering
    displayData: [],                // Currently displayed (paginated)
    sort: { column: '', dir: 'desc' }
};
```

### Key Methods (All on `window` + `LogicBase`)

| Method | Description |
|--------|-------------|
| `loadDataFromFirebase(silent)` | Load all data via `A.DB.loadAllData()`, 3 retries |
| `handleServerData(data)` | Post-load: fill datalists, update dashboard |
| `handleBookingSearch(bkId)` | Throttled search by ID/name/phone across collections |
| `initGlobalTableSearch(inputId)` | Live table row filter, 300ms debounce |
| `onGridRowClick(id, collection)` | Row click → fill form |
| `findBookingInLocal(id, collection)` | Find booking + details from IndexedDB |
| `openBatchEdit(dataList, title)` | Batch edit mode |
| `deleteItem(id, dataSource)` | Confirm → delete |
| `requestAPI(funcName, ...args)` | Client → Google Apps Script API |

---

## 6. ATable — Data Table Component

**File**: `public/src/js/modules/core/ATable.js`

### Usage

```javascript
const table = new ATable('#table-container', {
    colName: 'bookings',       // Links to DB_SCHEMA.bookings
    pageSize: 25,
    editable: true,
    groupBy: true,
    download: true,
    contextMenu: true,
    zoom: true,
    onCellChange: (id, field, value) => { /* save */ },
    onRowClick: (id, row) => { /* navigate */ }
});

table.init(data);
table.filter('Nguyễn');
table.sort('start_date');
table.groupBy('status');
table.download('excel');
```

### Key Features

| Feature | Description |
|---------|-------------|
| **Schema-driven columns** | Auto-generate from `DB_SCHEMA[colName]` |
| **Dictionary lookup** | Select fields auto-resolve display values from IndexedDB |
| **Grouped rows** | Collapsible group headers with sums |
| **Inline editing** | `<input>`, `<select>`, `<textarea>` with `at-cell-edit` class |
| **Export** | Excel (XLSX) / PDF (html2pdf) |
| **Zoom** | Scale transform +/- 0.1 |
| **Column visibility** | Toggle via checkbox dropdown |
| **Singleton per container** | `ATable.instances` Map prevents duplicates |
| **Hotel Price Matrix** | Special visualizer for `roomId___rateType → periodId___supplierId` data |

### Data Rendering Pipeline

```
options.columns (custom) 
  → DB_SCHEMA[colName] (schema)
  → _resolveFieldConfigs() 
  → _prefetchDictionaries() (IndexedDB lookups)
  → _renderTableContent() (generate <table> HTML)
  → _renderPagination()
```

---

## 7. Module Organization

```
public/src/js/modules/
├── core/                  # Core framework (15 files)
│   ├── app.js             # Application singleton
│   ├── EventManager.js    # Event delegation
│   ├── UI_Manager.js      # Template rendering
│   ├── LoginModule.js     # Auth + Security
│   ├── LogicBase.js       # Shared grid logic
│   ├── ATable.js          # Data table
│   ├── ModuleLoader.js    # Dynamic imports
│   ├── Router.js          # Client routing
│   ├── StateProxy.js      # State management
│   ├── ThemeManager.js    # Dark/light
│   ├── TranslationModule.js
│   ├── NotificationModule.js
│   ├── M_ShortKey.js      # Keyboard shortcuts
│   ├── M_AutoMobileEvents.js
│   └── emily.js           # Chatbot integration
├── db/                    # Database layer (4 files)
│   ├── DBSchema.js        # 28 collection schemas
│   ├── DBManager.js       # Firestore CRUD
│   ├── DBLocalStorage.js  # Dexie IndexedDB
│   └── MigrationHelper.js
├── prices/                # Pricing (9 files)
├── ai/                    # AI Marketing (1 file)
├── M_SalesModule.js       # Sales workflow
├── M_OperatorModule.js    # Operator workflow
├── OperatorController.js
├── BookingOverviewController.js
├── AdminController.js
└── ReportModule.js
```

### Module Pattern Example

```javascript
class SalesModule {
    // Static config
    static Config = { 
        typeOrder: ['Vé MB', 'Vé Tàu', 'Phòng', 'Xe'], 
        minRows: 5 
    };
    
    // State (shared across instances)
    static State = { isInitialized: false };
    
    // Lazy init flag
    static autoInit = false;
    
    // Init method (called once)
    static async init() {
        if (this.State.isInitialized) return;
        await this.syncState();
        this.State.isInitialized = true;
    }
    
    // Instance methods
    fillFormFromSearch(bookingId) { /* ... */ }
    saveBooking() { /* ... */ }
}

A.addModule('Sales', SalesModule);
```

---

## 8. Component System

```
public/src/js/components/      # JavaScript components
├── ASelect.js                 # Custom select dropdown
├── at_modal_full.js           # Full-screen modal
├── calculator_widget.js       # Price calculator
├── custom_tag.js              # Custom HTML elements
├── footer_menu.js             # Footer
├── header_menu.js             # Header
├── M_ContextMenu.js           # Right-click menu
├── M_NavBarResponsive.js      # Responsive nav
├── Menu_StyleChrome.js        # Chrome-style menu
├── NotificationPanel.js       # Notifications
└── offcanvas_menu.js          # Off-canvas sidebar

public/src/components/         # HTML templates (12 files)
├── tpl_all.html → tpl_sales.html → tpl_operator.html ...
```

---

## 9. Path Aliases (vite.config.js)

| Alias | Resolves To | Usage |
|-------|------------|-------|
| `@` | `public/src` | General source reference |
| `@js` | `public/src/js` | JS modules root |
| `@db` | `public/src/js/modules/db` | Database layer |
| `@md` | `public/src/js/modules` | All modules |
| `@core` | `public/src/js/modules/core` | Core framework |
| `@acc` | `public/src/accountant` | Accountant module |
| `@cpt` | `public/src/js/components` | UI components |
| `@hr` | `public/src/hr` | HR module |

## Related Files

- `database-dataflow.md` — DB Schema, Data flow, Gatekeeper pattern
- `development-guide.md` — How to add modules, templates, use helpers
- `decisions-log.md` — ADR-002 (singleton), ADR-009 (CSS security)

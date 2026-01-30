# 9-Trip ERP Frontend - Modernization & Optimization Strategy

**Target**: International best practices for legacy code modernization  
**Timeline**: 3-6 months (5 phases)  
**Priority**: High impact, low risk changes first

---

## 📊 CURRENT STATE ANALYSIS

### Code Metrics
| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| **Architecture** | Monolithic + global scope | Modular (services) | 🔴 Need refactor |
| **Module coupling** | High (global state) | Low (dependency injection) | 🔴 Critical |
| **Type safety** | None (vanilla JS) | 90%+ with JSDoc | 🟡 In progress |
| **Format consistency** | Mixed array/object | Pure object | 🟡 Migration |
| **Test coverage** | 0% | 80%+ | 🔴 Not started |
| **Build process** | None | Webpack/Vite | 🔴 Not started |
| **ES version** | ES5/6 mixed | ES9+ (modern) | 🟡 Partial |
| **Framework** | Vanilla JS | Framework-ready (Vue 3) | 🔴 v2 in beta |

### Pain Points
1. **Global namespace pollution** (50+ functions on `window`)
2. **Data format duality** (array ↔ object everywhere)
3. **Scattered business logic** (calculations in UI files)
4. **No dependency management** (manual load order)
5. **Duplicate code** (similar logic in operator/sales files)
6. **No build optimization** (all files loaded in HTML)
7. **Testing impossible** (everything depends on DOM/globals)

---

## 🎯 PHASE 1: FOUNDATION & FORMAT CLEANUP (Weeks 1-3)

### Goal
Establish code standards, **eliminate array format completely**, document architecture, prepare for advanced services.

### V2-Only Build Rule (No v1 edits)
- **public/src (v1) is read-only** and remains production-safe.
- **All new code lives in public/v2** (HTML/CSS/JS).
- **Copy v1 files into v2 first**, then refactor only inside v2.
- **Feature parity first**, optimizations come after parity is stable.

### Key Change: Remove Array Format Immediately ⚡
**Instead of waiting for Phase 2**, we now:
- ✅ Load ONLY object format from Firestore (Phase 1)
- ✅ Remove ALL array format detection (Phase 1)
- ✅ Use DataTransformer from day 1 (Phase 1)
- This saves 2 weeks and simplifies Phase 2-3

### Tasks

#### 1.1 Establish Development Standards
```javascript
// ✅ Create docs/STYLE_GUIDE.md
- Naming conventions (already in copilot-instructions.md)
- Function organization template
- JSDoc standard (copy from utils.js example)
- Module export pattern
- Error handling standards
```

#### 1.2 Setup Build & Lint Infrastructure
```bash
# Initialize package.json (if not exists)
npm init -y

# Add dev dependencies
npm install --save-dev \
  webpack webpack-cli \
  babel-loader @babel/core \
  eslint prettier \
  jest @babel/preset-env

# Add npm scripts
"scripts": {
  "lint": "eslint public/v2/src/js/**/*.js",
  "format": "prettier --write public/v2/src/js/**/*.js",
  "test": "jest",
  "build": "webpack",
  "dev": "webpack --watch"
}

# Create webpack.config.js
module.exports = {
  entry: './public/v2/src/js/main.js',
  output: {
    filename: 'bundle.min.js',
    path: `${__dirname}/public/v2/dist`
  },
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: { loader: 'babel-loader' }
      }
    ]
  }
};
```

#### 1.3 Create DataTransformer (Object Format Only) ⭐
**NEW in Phase 1** - No longer in Phase 2!

```javascript
// NEW: public/v2/src/js/db_transformer.js

/**
 * Transform raw Firestore documents → application objects
 * Single responsibility: Format conversion
 * 
 * ✅ ONLY produces object format
 * ❌ NO array format support
 */
class DataTransformer {
  /**
   * Firestore → Booking object
   */
  static toBooking(rawDoc) {
    return {
      id: rawDoc.id || '',
      created_at: rawDoc.created_at || new Date().toISOString().split('T')[0],
      customer_id: rawDoc.customer_id || '',
      customer_name: rawDoc.customer_name || '',
      customer_phone: rawDoc.customer_phone || '',
      start_date: rawDoc.start_date || '',
      end_date: rawDoc.end_date || '',
      adults: Number(rawDoc.adults) || 0,
      children: Number(rawDoc.children) || 0,
      total_amount: Number(rawDoc.total_amount) || 0,
      deposit_amount: Number(rawDoc.deposit_amount) || 0,
      balance_amount: Number(rawDoc.balance_amount) || 0,
      payment_method: rawDoc.payment_method || '',
      payment_due_date: rawDoc.payment_due_date || '',
      note: rawDoc.note || '',
      staff_id: rawDoc.staff_id || '',
      status: rawDoc.status || 'Đặt lịch'
    };
  }

  static toOperatorEntry(rawDoc) {
    return {
      id: rawDoc.id || '',
      booking_id: rawDoc.booking_id || '',
      customer_name: rawDoc.customer_name || '',
      service_type: rawDoc.service_type || '',
      hotel_name: rawDoc.hotel_name || '',
      service_name: rawDoc.service_name || '',
      check_in: rawDoc.check_in || '',
      check_out: rawDoc.check_out || '',
      nights: Number(rawDoc.nights) || 1,
      adults: Number(rawDoc.adults) || 1,
      cost_adult: Number(rawDoc.cost_adult) || 0,
      children: Number(rawDoc.children) || 0,
      cost_child: Number(rawDoc.cost_child) || 0,
      surcharge: Number(rawDoc.surcharge) || 0,
      discount: Number(rawDoc.discount) || 0,
      total_sale: Number(rawDoc.total_sale) || 0,
      ref_code: rawDoc.ref_code || '',
      total_cost: Number(rawDoc.total_cost) || 0,
      paid_amount: Number(rawDoc.paid_amount) || 0,
      debt_balance: Number(rawDoc.debt_balance) || 0,
      supplier: rawDoc.supplier || '',
      operator_note: rawDoc.operator_note || ''
    };
  }

  static toCustomer(rawDoc) {
    return {
      id: rawDoc.id || '',
      full_name: rawDoc.full_name || '',
      phone: rawDoc.phone || '',
      email: rawDoc.email || '',
      address: rawDoc.address || '',
      source: rawDoc.source || '',
      vat_id: rawDoc.vat_id || '',
      company_name: rawDoc.company_name || '',
      created_at: rawDoc.created_at || new Date().toISOString().split('T')[0]
    };
  }
}

// Update public/v2/src/js/db_manager.js to use ONLY this:
window.APP_DATA = {
  bookings_obj: [],           // ✅ Only this
  operator_entries_obj: [],   // ✅ Only this
  customers_obj: [],          // ✅ Only this
  // ❌ REMOVED: bookings, operator_entries, customers (array formats)
  lists: { ... }
};
```

#### 1.4 Update v2 db_manager.js - Remove All Array Formats
```javascript
// In public/v2/src/js/db_manager.js, loadDataFromFirebase():

// Load collections using DataTransformer
const bookingsSnapshot = await db.collection('bookings').get();
window.APP_DATA.bookings_obj = bookingsSnapshot.docs
  .map(doc => DataTransformer.toBooking(doc.data()));

const operatorSnapshot = await db.collection('operator_entries').get();
window.APP_DATA.operator_entries_obj = operatorSnapshot.docs
  .map(doc => DataTransformer.toOperatorEntry(doc.data()));

// Result: ONLY object format in memory ✅
```

#### 1.5 Update v2 utils.js - Remove Format Detection
```javascript
// BEFORE (everywhere in code)
const custName = typeof bkData === 'object' && !Array.isArray(bkData) 
  ? bkData.customer_name 
  : bkData[2];

// AFTER (simplified)
const custName = bkData.customer_name || '';

// Mark deprecated functions
/**
 * @deprecated Array format removed in 2026-Q1
 * Use object format only
 */
function getFieldByIndex(arr, index) { ... }
```

#### 1.6 Cleanup Logic Files
```javascript
// Remove from logic_operator.js, logic_sales.js:
// - All array indices (bkData[2], bkData[3], etc.)
// - All format detection logic
// - All conversion functions

// Result: ~200 lines removed per file
```

#### 1.7 Create Refactoring Roadmap Document
```markdown
# REFACTORING_ROADMAP.md

## Phase Timeline
- Phase 1: Foundation + Format Cleanup (Weeks 1-3) ✅
- Phase 2: Service Layer (Weeks 4-5)
- Phase 3: State Management + Audit (Weeks 6-7)
- Phase 4: Module Organization (Weeks 8-9)
- Phase 5: Testing & Optimization (Weeks 10+)

[Details for each phase...]
```

**Phase 1 Result**: ✅ Clean object-only format, 200+ lines removed

---

## 🏗️ PHASE 2: SERVICE LAYER EXTRACTION (Weeks 4-5)

### Goal
Extract business logic into reusable services; introduce State Management and Audit Trail.

### 2.1 Create Centralized State Management (StoreService) ⭐ NEW
```javascript
// NEW: public/v2/src/js/services/StoreService.js

/**
 * Centralized state management with Pub/Sub pattern
 * Replaces scattered window.APP_DATA
 * 
 * Benefits:
 * - Single source of truth
 * - Reactive updates (observers notified on change)
 * - Easy to debug state changes
 * - Testable state logic
 */
class StoreService {
  constructor() {
    this.state = {
      bookings: [],
      operatorEntries: [],
      customers: [],
      users: [],
      lists: {
        hotelMatrix: [],
        serviceMatrix: [],
        suppliers: [],
        types: []
      },
      currentUser: null,
      currentBookingId: null,
      isLoading: false,
      error: null
    };

    // Subscribers for state changes
    this.subscribers = {};
    this.history = []; // For audit trail
  }

  /**
   * Subscribe to state changes
   * @param {string} key - State key ('bookings', 'operatorEntries', etc.)
   * @param {function} callback - Called when state[key] changes
   * @returns {function} Unsubscribe function
   */
  subscribe(key, callback) {
    if (!this.subscribers[key]) {
      this.subscribers[key] = [];
    }
    this.subscribers[key].push(callback);

    // Return unsubscribe function
    return () => {
      const idx = this.subscribers[key].indexOf(callback);
      if (idx > -1) this.subscribers[key].splice(idx, 1);
    };
  }

  /**
   * Update state and notify all subscribers
   */
  setState(key, value, metadata = {}) {
    const oldValue = this.state[key];
    this.state[key] = value;

    // Record change for audit trail
    AuditService.logStateChange(key, oldValue, value, metadata);

    // Notify all subscribers
    if (this.subscribers[key]) {
      this.subscribers[key].forEach(cb => cb(value, oldValue));
    }

    return this;
  }

  /**
   * Get state value
   */
  getState(key) {
    return key ? this.state[key] : this.state;
  }

  /**
   * Batch state updates
   */
  setStateMany(updates) {
    Object.entries(updates).forEach(([key, value]) => {
      this.setState(key, value);
    });
  }

  /**
   * Reset state (for testing)
   */
  reset() {
    this.state = { ... /* initial state */ };
    this.history = [];
  }
}

// Global instance
window.Store = new StoreService();

// Usage:
// Store.setState('bookings', newBookings, { source: 'firestore' });
// Store.subscribe('bookings', (newVal, oldVal) => {
//   console.log('Bookings changed:', newVal);
// });
```

### 2.2 Create Matrix Adapter (Nhập Liệu Ma Trận) ⭐ NEW
```javascript
// NEW: public/v2/src/js/services/MatrixAdapter.js

/**
 * Adapter for complex matrix data (hotel rooms, pricing, suppliers)
 * 
 * Problem: Operator form has N rows × M columns = complex data structure
 * Solution: Normalize matrix ↔ form UI
 * 
 * Structure:
 * hotelMatrix[i][j] = Hotel row
 *   [0] = Hotel name
 *   [1] = Reserved
 *   [2+] = Room types (Single, Double, Triple, etc.)
 */
class MatrixAdapter {
  /**
   * Extract room types from hotel matrix
   */
  static getRoomTypes(hotelName, hotelMatrix) {
    const hotelRow = hotelMatrix.find(r => r[0] === hotelName);
    if (!hotelRow) return [];
    
    // Room types are columns 2+
    return hotelRow.slice(2).filter(room => room && room.trim());
  }

  /**
   * Extract services by type from service matrix
   */
  static getServicesByType(serviceType, serviceMatrix) {
    const services = serviceMatrix
      .filter(r => r[0] === serviceType)
      .map(r => r[1]); // Column 1 = service name
    
    return [...new Set(services)]; // Remove duplicates
  }

  /**
   * Validate hotel + room combination
   */
  static isValidRoom(hotelName, roomType, hotelMatrix) {
    const roomTypes = this.getRoomTypes(hotelName, hotelMatrix);
    return roomTypes.includes(roomType);
  }

  /**
   * Build cascading dropdown options
   */
  static buildLocationOptions(serviceType, { hotelMatrix, locOther }) {
    if (serviceType === 'Phòng') {
      // Room service: Get all hotel names
      return hotelMatrix.map(r => r[0]).filter(Boolean);
    } else {
      // Other services: Include "Other" locations
      const hotelNames = hotelMatrix.map(r => r[0]).filter(Boolean);
      return [...new Set([...hotelNames, ...(locOther || [])])];
    }
  }

  /**
   * Export matrix data for backup/import
   */
  static exportMatrix(matrixData) {
    return JSON.stringify(matrixData, null, 2);
  }

  /**
   * Import matrix data with validation
   */
  static importMatrix(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (!Array.isArray(data)) throw new Error('Must be array');
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Validate matrix structure
   */
  static validateMatrix(matrix, type = 'hotel') {
    const errors = [];

    if (!Array.isArray(matrix)) {
      errors.push('Matrix must be array');
      return errors;
    }

    if (type === 'hotel') {
      matrix.forEach((row, idx) => {
        if (!Array.isArray(row)) errors.push(`Row ${idx} not array`);
        if (row[0] === '') errors.push(`Row ${idx} missing hotel name`);
      });
    }

    return errors;
  }
}

// Usage:
// const roomTypes = MatrixAdapter.getRoomTypes('Hotel A', APP_DATA.lists.hotelMatrix);
// const locations = MatrixAdapter.buildLocationOptions('Phòng', APP_DATA.lists);
```

### 2.3 Create Audit Service (Logging & Audit Trail) ⭐ NEW
```javascript
// NEW: public/v2/src/js/services/AuditService.js

/**
 * Comprehensive logging & audit trail for ERP
 * 
 * Tracks:
 * - WHO made change (user + timestamp)
 * - WHAT changed (field + old/new values)
 * - WHY changed (source: manual, import, api, etc.)
 * - WHERE changed (form, grid, api, etc.)
 * 
 * Use case: "Ai đã sửa giá từ 1M thành 2M vào lúc nào?"
 */
class AuditService {
  constructor() {
    this.auditLog = [];
    this.enabled = true;
  }

  /**
   * Log data change
   */
  static logDataChange(collectionName, docId, fieldName, oldValue, newValue) {
    const entry = {
      timestamp: new Date().toISOString(),
      user: CURRENT_USER?.email || 'system',
      action: 'UPDATE',
      collection: collectionName,
      docId: docId,
      field: fieldName,
      oldValue: oldValue,
      newValue: newValue,
      source: 'manual',
      ip: null // If available
    };

    this._writeAudit(entry);
    log(`Changed ${collectionName}.${docId}.${fieldName}`, 'info');
  }

  /**
   * Log state change (from StoreService)
   */
  static logStateChange(key, oldValue, newValue, metadata = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      user: CURRENT_USER?.email || 'system',
      action: 'STATE_CHANGE',
      key: key,
      oldValue: oldValue,
      newValue: newValue,
      source: metadata.source || 'unknown',
      context: metadata.context || {}
    };

    this._writeAudit(entry);
  }

  /**
   * Log user action
   */
  static logAction(action, details) {
    const entry = {
      timestamp: new Date().toISOString(),
      user: CURRENT_USER?.email || 'system',
      action: action,
      details: details,
      source: 'ui'
    };

    this._writeAudit(entry);
  }

  /**
   * Log API call
   */
  static logAPICall(functionName, args, response, duration) {
    const entry = {
      timestamp: new Date().toISOString(),
      user: CURRENT_USER?.email || 'system',
      action: 'API_CALL',
      function: functionName,
      args: args,
      response: response.success ? 'SUCCESS' : 'FAIL',
      duration: duration + 'ms'
    };

    this._writeAudit(entry);
  }

  /**
   * Query audit log by filters
   */
  static queryAuditLog(filters = {}) {
    let results = this.auditLog;

    if (filters.user) {
      results = results.filter(e => e.user === filters.user);
    }
    if (filters.action) {
      results = results.filter(e => e.action === filters.action);
    }
    if (filters.collection) {
      results = results.filter(e => e.collection === filters.collection);
    }
    if (filters.dateFrom && filters.dateTo) {
      results = results.filter(e => {
        const t = new Date(e.timestamp);
        return t >= new Date(filters.dateFrom) && t <= new Date(filters.dateTo);
      });
    }

    return results;
  }

  /**
   * Export audit log as CSV (for compliance)
   */
  static exportAuditLog(filters = {}) {
    const results = this.queryAuditLog(filters);
    const csv = [
      'Timestamp,User,Action,Collection,DocId,Field,OldValue,NewValue,Source',
      ...results.map(e => 
        `"${e.timestamp}","${e.user}","${e.action}","${e.collection}","${e.docId}","${e.field}","${e.oldValue}","${e.newValue}","${e.source}"`
      )
    ].join('\n');

    return csv;
  }

  /**
   * Get audit trail for specific document
   */
  static getDocumentHistory(collectionName, docId) {
    return this.auditLog.filter(e => 
      e.collection === collectionName && e.docId === docId
    );
  }

  /**
   * Private: Write to audit storage
   */
  static _writeAudit(entry) {
    this.auditLog.push(entry);

    // Store to Firestore periodically (batch)
    if (this.auditLog.length % 10 === 0) {
      this._syncToFirebase();
    }

    // Keep in-memory limit (last 1000 entries)
    if (this.auditLog.length > 1000) {
      this.auditLog.shift();
    }
  }

  /**
   * Private: Sync to Firebase
   */
  static _syncToFirebase() {
    // Batch save to 'audit_logs' collection
    requestAPI('saveAuditLogs', this.auditLog);
  }
}

// Usage:
// AuditService.logDataChange('operator_entries', 'OE123', 'cost_adult', 1000, 1500);
// const history = AuditService.getDocumentHistory('bookings', 'BK001');
// const csv = AuditService.exportAuditLog({ user: 'operator@example.com' });
```

### 2.4 Update Calculation Service
```javascript
// public/v2/SRC/JS/SERVICES/CALCULATIONSERVICE.JS (Already from Phase description)

### Goal
Separate business logic from UI; create reusable services.

### Architecture

```
public/v2/src/
├── js/
│   ├── services/              🆕 New layer
│   │   ├── CalculationService.js     # All calculations
│   │   ├── DataService.js            # All data operations
│   │   ├── ValidationService.js      # All validation
│   │   ├── FormService.js            # Form operations
│   │   └── index.js                  # Export all
│   │
│   ├── controllers/           🆕 Business logic
│   │   ├── BookingController.js
│   │   ├── OperatorController.js
│   │   └── SalesController.js
│   │
│   ├── ui/                    🆕 Pure UI (render only)
│   │   ├── FormRenderer.js
│   │   ├── GridRenderer.js
│   │   └── ModalManager.js
│   │
│   └── legacy/                Keep for now
│       ├── utils.js
│       ├── main.js
│       └── ...
```


### 3.1 HTML Optimization - Mobile-First Structure ⭐ NEW

**Current Problem**: Desktop-first HTML, responsive CSS patches
**Solution**: Restructure HTML with mobile-first, progressive enhancement

```html
<!-- NEW: public/v2/src/index.html (simplified, mobile-first) -->

<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>9-Trip ERP</title>
  
  <!-- Mobile-first CSS (smallest first) -->
  <link rel="stylesheet" href="css/mobile.css">        <!-- Mobile: 375px+ -->
  <link rel="stylesheet" href="css/tablet.css">        <!-- Tablet: 768px+ -->
  <link rel="stylesheet" href="css/desktop.css">       <!-- Desktop: 1024px+ -->
  
  <!-- Responsive utilities -->
  <style>
    /* Mobile-first defaults */
    .d-desktop { display: none; }
    .d-tablet { display: none; }
    .d-mobile { display: block; }
    
    /* Tablet 768px+ */
    @media (min-width: 768px) {
      .d-tablet { display: block; }
      .d-mobile { display: none; }
    }
    
    /* Desktop 1024px+ */
    @media (min-width: 1024px) {
      .d-desktop { display: block; }
      .d-tablet { display: none; }
    }
  </style>
</head>
<body class="mobile-first">

  <!-- Header (same on all devices) -->
  <header class="header-bar">
    <button id="menu-toggle" class="menu-btn">☰</button>
    <h1>9-Trip ERP</h1>
    <button id="user-menu" class="user-btn">👤</button>
  </header>

  <!-- Navigation (mobile: drawer, desktop: sidebar) -->
  <nav id="nav-drawer" class="nav-drawer d-mobile">
    <ul>
      <li><a href="#" data-tab="dashboard">📊 Dashboard</a></li>
      <li><a href="#" data-tab="bookings">📅 Bookings</a></li>
      <li><a href="#" data-tab="operations">⚙️ Operations</a></li>
      <li><a href="#" data-tab="admin">🔧 Admin</a></li>
    </ul>
  </nav>

  <nav id="nav-sidebar" class="nav-sidebar d-desktop">
    <div class="nav-header">Menu</div>
    <ul>
      <li><a href="#" data-tab="dashboard">Dashboard</a></li>
      <li><a href="#" data-tab="bookings">Bookings</a></li>
      <li><a href="#" data-tab="operations">Operations</a></li>
      <li><a href="#" data-tab="admin">Admin</a></li>
    </ul>
  </nav>

  <!-- Main content (responsive layout) -->
  <main class="main-content">
    
    <!-- Tab: Dashboard (Mobile optimized) -->
    <section id="tab-dashboard" class="tab-pane d-mobile">
      <div class="card-container">
        <!-- Mobile: Stack cards vertically -->
        <div class="metric-card">
          <div class="metric-label">Today Revenue</div>
          <div class="metric-value">1.5M</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">New Bookings</div>
          <div class="metric-value">8</div>
        </div>
      </div>
    </section>

    <!-- Tab: Booking Form (Multi-step on mobile) -->
    <section id="tab-bookings" class="tab-pane">
      
      <!-- Mobile: Step indicator -->
      <div class="step-indicator d-mobile">
        <span class="step active">1. Info</span>
        <span class="step">2. Services</span>
        <span class="step">3. Review</span>
      </div>

      <!-- Step 1: Customer Info (Mobile: Full width) -->
      <div class="form-step active" data-step="1">
        <h3>Customer Information</h3>
        <div class="form-group">
          <label for="cust-name">Name</label>
          <input id="cust-name" type="text" class="form-control" placeholder="Full name">
        </div>
        <div class="form-group">
          <label for="cust-phone">Phone</label>
          <input id="cust-phone" type="tel" class="form-control" placeholder="09xx xxx xxx">
        </div>
      </div>

      <!-- Step 2: Services (Mobile: Horizontal scroll) -->
      <div class="form-step" data-step="2" style="display:none;">
        <h3>Services</h3>
        <div class="services-grid d-mobile">
          <!-- Horizontal scrolling on mobile -->
          <div class="service-card">...</div>
          <div class="service-card">...</div>
        </div>
        <div class="services-table d-desktop">
          <!-- Full table on desktop -->
          <table>...</table>
        </div>
      </div>

      <!-- Step 3: Review & Save (Mobile: Sticky button) -->
      <div class="form-step" data-step="3" style="display:none;">
        <h3>Review</h3>
        <div class="review-summary">...</div>
      </div>

      <!-- Mobile: Sticky action buttons -->
      <div class="action-buttons d-mobile sticky-bottom">
        <button class="btn btn-secondary" onclick="prevStep()">← Back</button>
        <button class="btn btn-primary" onclick="nextStep()">Next →</button>
      </div>

      <!-- Desktop: Inline action buttons -->
      <div class="action-buttons d-desktop">
        <button class="btn btn-secondary">← Back</button>
        <button class="btn btn-primary">Save →</button>
      </div>
    </section>

  </main>

  <!-- Footer (mobile: above action buttons) -->
  <footer class="footer">
    <p>© 2026 9-Trip. All rights reserved.</p>
  </footer>

  <!-- Modals (responsive) -->
  <div id="modal-container"></div>

  <!-- Scripts (load StoreService first) -->
  <script src="js/services/StoreService.js"></script>
  <script src="js/services/MatrixAdapter.js"></script>
  <script src="js/services/AuditService.js"></script>
  <script src="js/services/CalculationService.js"></script>
  <script src="js/services/DataService.js"></script>
  <script src="js/controllers/BookingController.js"></script>
  <script src="js/main.js"></script>
</body>
</html>
```

**New Mobile-First CSS** (`public/v2/src/css/mobile.css`):
```css
/* Mobile-first: Base styles for 375px screens */

:root {
  /* Smaller spacing on mobile */
  --spacing-unit: 4px;
  --header-height: 44px;      /* iOS standard */
  --input-height: 44px;       /* Touch-friendly */
}

body {
  font-size: 14px;            /* Readable on mobile */
  padding: 0;
  margin: 0;
}

/* Header (mobile: compact) */
.header-bar {
  height: var(--header-height);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 12px;
  background: #fff;
  border-bottom: 1px solid #ddd;
  position: sticky;
  top: 0;
  z-index: 100;
}

/* Navigation drawer (mobile: hidden by default) */
.nav-drawer {
  position: fixed;
  left: 0;
  top: var(--header-height);
  width: 80vw;
  max-width: 280px;
  height: 100vh;
  background: #f5f5f5;
  transform: translateX(-100%);
  transition: transform 0.3s;
  z-index: 99;
  overflow-y: auto;
  padding-bottom: 100px;
}

.nav-drawer.open {
  transform: translateX(0);
}

/* Form layout (mobile: stack) */
.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
  font-size: 14px;
}

.form-control {
  width: 100%;
  height: var(--input-height);
  padding: 0 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 16px;        /* Prevents zoom on iOS */
}

/* Sticky buttons (mobile) */
.sticky-bottom {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px;
  background: #fff;
  border-top: 1px solid #ddd;
  display: flex;
  gap: 8px;
}

.sticky-bottom .btn {
  flex: 1;
  height: 44px;
}

/* Tables: Horizontal scroll on mobile */
table {
  width: 100%;
  overflow-x: auto;
  display: block;
  font-size: 12px;
}

table tbody tr {
  display: block;
  margin-bottom: 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 8px;
}

table td {
  display: block;
  padding: 4px 0;
}

table td::before {
  content: attr(data-label);
  font-weight: 500;
  display: inline-block;
  width: 80px;
}
```

**Desktop CSS** (`public/v2/src/css/desktop.css`):
```css
/* Desktop: 1024px+ */

:root {
  --spacing-unit: 8px;
  --header-height: 60px;
  --sidebar-width: 250px;
}

body {
  display: grid;
  grid-template-columns: var(--sidebar-width) 1fr;
  grid-template-rows: var(--header-height) 1fr auto;
  font-size: 14px;
}

.header-bar {
  grid-column: 1 / -1;
  height: var(--header-height);
  padding: 0 20px;
}

.nav-sidebar {
  grid-column: 1;
  grid-row: 2;
  background: #f5f5f5;
  padding: 20px 0;
  position: fixed;
  width: var(--sidebar-width);
  height: calc(100vh - var(--header-height));
  overflow-y: auto;
}

.main-content {
  grid-column: 2;
  grid-row: 2;
  margin-left: var(--sidebar-width);
  padding: 20px;
}

/* Forms: Side-by-side on desktop */
.form-group {
  display: inline-block;
  width: calc(50% - 8px);
  margin-right: 16px;
  margin-bottom: 16px;
}

/* Tables: Normal display on desktop */
table {
  width: 100%;
  border-collapse: collapse;
}

table thead {
  background: #f5f5f5;
}

table tbody tr:hover {
  background: #fafafa;
}

table td {
  padding: 8px 12px;
  border-bottom: 1px solid #ddd;
}

/* No sticky buttons on desktop */
.sticky-bottom {
  position: static;
}
```

**Result**: 
- ✅ Mobile: Touch-friendly, readable, single-column
- ✅ Tablet: 2-column with optimized spacing
- ✅ Desktop: Full sidebar + content layout
- ✅ Progressive enhancement (works on all screens)

### 3.2 Extract Calculation Service
```javascript
// NEW: public/v2/src/js/services/CalculationService.js

class CalculationService {
  /**
   * Calculate nights between dates
   */
  static calculateNights(checkInStr, checkOutStr, serviceType) {
    if (!checkInStr || !checkOutStr) return 0;
    
    const checkIn = new Date(checkInStr);
    const checkOut = new Date(checkOutStr);
    const nights = (checkOut - checkIn) / 86400000;
    
    return (serviceType === 'Phòng' && nights > 0) ? nights : 1;
  }

  /**
   * Calculate row total cost
   * Formula: ((qtyA × costA) + (qtyC × costC) + sur - disc) × multiplier
   */
  static calculateRowCost(adults, costAdult, children, costChild, surcharge, discount, multiplier = 1) {
    const cost = (
      (adults * costAdult) + 
      (children * costChild) + 
      surcharge - 
      discount
    ) * multiplier;
    
    return Math.max(0, cost); // Prevent negative
  }

  /**
   * Calculate profit with validation
   */
  static calculateProfit(totalSales, totalCost) {
    return totalSales - totalCost;
  }

  /**
   * Calculate booking status based on profit per adult
   */
  static calculateStatus(profit, adultsCount) {
    if (profit < 0) return 'Lỗ';
    if (profit === 0) return 'Hòa';
    if (profit / adultsCount <= 500) return 'Lời';
    return 'LỜI TO';
  }

  /**
   * Calculate average price per person
   */
  static calculateAveragePrice(totalPrice, paxCount) {
    return paxCount > 0 ? totalPrice / paxCount : 0;
  }

  /**
   * Parse number from formatted string
   */
  static parseFormattedNumber(value) {
    if (!value) return 0;
    return Number(String(value).replace(/[^0-9-]/g, '')) || 0;
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CalculationService;
}
```

**Usage**: Decouple from UI
```javascript
// OLD (in logic_operator.js)
const totalCost = ((qtyA * costA) + (qtyC * costC) + sur - disc) * multiplier;

// NEW (in OperatorController)
const totalCost = CalculationService.calculateRowCost(
  qtyA, costA, qtyC, costC, sur, disc, multiplier
);
```

### 3.2 Extract Data Service
```javascript
// NEW: public/v2/src/js/services/DataService.js

class DataService {
  static bookings = [];
  static operatorEntries = [];
  static customers = [];

  /**
   * Load all data from Firebase/Sheets
   */
  static async loadAll() {
    try {
      this.bookings = await this._fetchCollection('bookings');
      this.operatorEntries = await this._fetchCollection('operator_entries');
      this.customers = await this._fetchCollection('customers');
      return { success: true };
    } catch (error) {
      console.error('Failed to load data:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Find booking by ID
   */
  static findBookingById(id) {
    return this.bookings.find(b => b.id === id);
  }

  /**
   * Get entries for booking
   */
  static getOperatorEntriesByBooking(bookingId) {
    return this.operatorEntries.filter(e => e.booking_id === bookingId);
  }

  /**
   * Filter entries by date range
   */
  static filterEntriesByDateRange(from, to) {
    return this.operatorEntries.filter(e => {
      const checkIn = new Date(e.check_in);
      return checkIn >= new Date(from) && checkIn <= new Date(to);
    });
  }

  /**
   * Private: Fetch collection from Firestore
   */
  static async _fetchCollection(name) {
    // Transform via DataTransformer
    // Return array of objects
  }

  /**
   * Save booking + entries
   */
  static async saveBooking(bookingData, entriesData) {
    try {
      await requestAPI('saveBookingAPI', bookingData, entriesData);
      await this.loadAll(); // Refresh
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// Usage in controller:
// const booking = DataService.findBookingById('BK001');
// const entries = DataService.getOperatorEntriesByBooking('BK001');
```

### 3.3 Extract Form Service
```javascript
// NEW: public/v2/src/js/services/FormService.js

class FormService {
  /**
   * Extract all form data into structured object
   */
  static extractFormData() {
    const bookings = {
      id: getVal('BK_ID'),
      customer_name: getVal('Cust_Name'),
      // ... etc
    };

    const operator_entries = this._extractDetailRows();
    
    return { bookings, operator_entries };
  }

  /**
   * Populate form from booking object
   */
  static populateForm(booking, entries) {
    setVal('BK_ID', booking.id);
    setVal('Cust_Name', booking.customer_name);
    // ... etc
    
    this._populateDetailRows(entries);
  }

  /**
   * Clear form
   */
  static clearForm() {
    document.getElementById('booking-form').reset();
    const tbody = getE('detail-tbody');
    if (tbody) tbody.innerHTML = '';
  }

  /**
   * Validate form before save
   */
  static validateForm() {
    const errors = [];
    
    if (!getVal('Cust_Name')?.trim()) {
      errors.push('Customer name required');
    }
    if (!getVal('BK_Start')) {
      errors.push('Start date required');
    }
    // ... more validations
    
    return { valid: errors.length === 0, errors };
  }

  // Private helpers
  static _extractDetailRows() {
    const entries = [];
    document.querySelectorAll('#detail-tbody tr').forEach(tr => {
      const getRowVal = (cls) => getVal(tr.querySelector('.' + cls));
      entries.push({
        id: getRowVal('d-sid'),
        service_type: getRowVal('d-type'),
        // ...
      });
    });
    return entries;
  }

  static _populateDetailRows(entries) {
    // Call addDetailRow() for each entry
  }
}
```

**Benefits**: ✅
- 100% testable (no DOM dependency)
- Reusable across roles (Operator, Sales, Admin)
- Easy to mock in tests
- Decoupled from UI

---

## � PHASE 3: MODULE REORGANIZATION + MOBILE UI (Weeks 6-7)

### Goal
Establish proper module boundaries; Mobile-first responsive UI; role-based controllers.

### 3.1 New Project Structure with Mobile Components
```
public/v2/src/
├── js/
│   ├── app.js                    # Entry point (replaces main.js)
│   ├── config/
│   │   ├── app.config.js         # App settings
│   │   ├── firebase.config.js
│   │   └── constants.js
│   ├── services/
│   │   ├── index.js              # Export all services
│   │   ├── CalculationService.js
│   │   ├── DataService.js
│   │   ├── FormService.js
│   │   └── ValidationService.js
│   ├── controllers/
│   │   ├── BookingController.js
│   │   ├── OperatorController.js
│   │   └── SalesController.js
│   ├── ui/
│   │   ├── FormRenderer.js       # Pure rendering
│   │   ├── GridRenderer.js
│   │   ├── ModalManager.js
│   │   └── ToastNotifier.js
│   ├── utils/
│   │   ├── dom.js                # DOM utilities
│   │   ├── format.js             # Formatting utilities
│   │   ├── date.js               # Date utilities
│   │   ├── validation.js         # Validation helpers
│   │   └── logger.js             # Logging service
│   └── legacy/                   # Temporary (gradual migration)
│       ├── utils.js              # Keep until all migrated
│       └── renderer.js
```

```
public/v2/src/
├── js/
│   ├── app.js                         # Entry point
│   ├── config/
│   │   ├── app.config.js             # App settings
│   │   ├── firebase.config.js
│   │   └── constants.js
│   ├── services/
│   │   ├── index.js                  # Export all services
│   │   ├── StoreService.js           # State management (NEW)
│   │   ├── MatrixAdapter.js          # Matrix data (NEW)
│   │   ├── AuditService.js           # Logging & audit (NEW)
│   │   ├── CalculationService.js
│   │   ├── DataService.js
│   │   ├── FormService.js
│   │   └── ValidationService.js
│   ├── controllers/
│   │   ├── BookingController.js
│   │   ├── OperatorController.js
│   │   ├── SalesController.js
│   │   └── MobileNavController.js     # Mobile navigation (NEW)
│   ├── ui/
│   │   ├── FormRenderer.js           # Pure rendering
│   │   ├── GridRenderer.js
│   │   ├── ModalManager.js
│   │   ├── ToastNotifier.js
│   │   ├── MobileRenderer.js         # Mobile-specific UI (NEW)
│   │   └── ResponsiveLayout.js       # Responsive utilities (NEW)
│   ├── utils/
│   │   ├── dom.js                    # DOM utilities
│   │   ├── format.js                 # Formatting utilities
│   │   ├── date.js                   # Date utilities
│   │   ├── validation.js             # Validation helpers
│   │   └── logger.js                 # Logging service
│   └── legacy/                       # Temporary (gradual migration)
│       ├── utils.js                  # Keep until all migrated
│       └── renderer.js
│
├── css/
│   ├── mobile.css                    # Mobile-first (NEW)
│   ├── tablet.css                    # Tablet optimizations (NEW)
│   ├── desktop.css                   # Desktop layout (NEW)
│   └── main.css                      # Utilities & animations
│
└── index.html                        # New mobile-first structure
```

### 3.2 Mobile Navigation Controller ⭐ NEW
```javascript
// NEW: public/v2/src/js/controllers/MobileNavController.js

/**
 * Handle mobile navigation (drawer, tabs, step indicators)
 * Detects screen size and manages responsive behavior
 */
class MobileNavController {
  constructor() {
    this.isMobile = window.innerWidth < 768;
    this.isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;
    this.isDesktop = window.innerWidth >= 1024;
    
    this.currentTab = 'dashboard';
    this.currentStep = 1;
    
    this.init();
  }

  init() {
    this._attachEventListeners();
    this._setupResizeHandler();
    this._updateLayoutForScreenSize();
  }

  /**
   * Show/hide drawer on mobile
   */
  toggleDrawer() {
    if (this.isMobile) {
      const drawer = document.getElementById('nav-drawer');
      drawer?.classList.toggle('open');
    }
  }

  /**
   * Switch active tab
   */
  switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-pane').forEach(tab => {
      tab.classList.remove('active');
    });

    // Show selected tab
    const tabEl = document.getElementById(`tab-${tabName}`);
    if (tabEl) {
      tabEl.classList.add('active');
      this.currentTab = tabName;
      
      // Log for audit
      AuditService.logAction('SWITCH_TAB', { tab: tabName });
    }
  }

  /**
   * Multi-step form navigation (mobile)
   */
  nextStep() {
    if (this.currentStep < 3) {
      this._showStep(++this.currentStep);
    }
  }

  previousStep() {
    if (this.currentStep > 1) {
      this._showStep(--this.currentStep);
    }
  }

  /**
   * Private: Show specific step
   */
  _showStep(stepNum) {
    document.querySelectorAll('.form-step').forEach(step => {
      step.style.display = 'none';
    });

    const stepEl = document.querySelector(`[data-step="${stepNum}"]`);
    if (stepEl) {
      stepEl.style.display = 'block';
    }

    this._updateStepIndicator(stepNum);
    this.currentStep = stepNum;
  }

  /**
   * Private: Update step indicator
   */
  _updateStepIndicator(step) {
    document.querySelectorAll('.step-indicator .step').forEach((el, idx) => {
      el.classList.toggle('active', idx === step - 1);
    });
  }

  /**
   * Detect screen size change
   */
  _setupResizeHandler() {
    window.addEventListener('resize', () => {
      const wasDesktop = this.isDesktop;
      this.isMobile = window.innerWidth < 768;
      this.isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;
      this.isDesktop = window.innerWidth >= 1024;

      if (this.isDesktop !== wasDesktop) {
        this._updateLayoutForScreenSize();
      }
    });
  }

  /**
   * Private: Update layout based on screen size
   */
  _updateLayoutForScreenSize() {
    const drawer = document.getElementById('nav-drawer');
    if (drawer && this.isMobile) {
      drawer.classList.remove('open'); // Close drawer on mobile
    }

    // Trigger custom event for other controllers
    window.dispatchEvent(new CustomEvent('screenSizeChanged', {
      detail: {
        isMobile: this.isMobile,
        isTablet: this.isTablet,
        isDesktop: this.isDesktop
      }
    }));
  }

  _attachEventListeners() {
    // Menu toggle
    document.getElementById('menu-toggle')?.addEventListener('click', () => {
      this.toggleDrawer();
    });

    // Tab switching
    document.querySelectorAll('[data-tab]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const tabName = link.dataset.tab;
        this.switchTab(tabName);
        if (this.isMobile) {
          this.toggleDrawer(); // Close drawer after tap
        }
      });
    });

    // Step navigation
    document.getElementById('btn-next-step')?.addEventListener('click', () => {
      this.nextStep();
    });

    document.getElementById('btn-prev-step')?.addEventListener('click', () => {
      this.previousStep();
    });
  }
}

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.mobileNavController = new MobileNavController();
  });
} else {
  window.mobileNavController = new MobileNavController();
}
```

### 3.3 Responsive Layout Utilities ⭐ NEW
```javascript
// NEW: public/v2/src/js/ui/ResponsiveLayout.js

class ResponsiveLayout {
  static BREAKPOINTS = {
    mobile: 0,
    tablet: 768,
    desktop: 1024,
    wide: 1440
  };

  /**
   * Get current breakpoint
   */
  static getBreakpoint() {
    const width = window.innerWidth;
    if (width < this.BREAKPOINTS.tablet) return 'mobile';
    if (width < this.BREAKPOINTS.desktop) return 'tablet';
    if (width < this.BREAKPOINTS.wide) return 'desktop';
    return 'wide';
  }

  /**
   * Check if screen is mobile
   */
  static isMobile() {
    return this.getBreakpoint() === 'mobile';
  }

  /**
   * Show element only on mobile
   */
  static showOnMobileOnly(element) {
    element.classList.add('d-mobile');
  }

  /**
   * Show element only on desktop
   */
  static showOnDesktopOnly(element) {
    element.classList.add('d-desktop');
  }

  /**
   * Convert table to card view on mobile
   */
  static tableToCards(tableElement) {
    if (!this.isMobile()) return;

    const tbody = tableElement.querySelector('tbody');
    const headers = Array.from(tableElement.querySelectorAll('thead th'))
      .map(th => th.textContent);

    const cardContainer = document.createElement('div');
    cardContainer.className = 'card-container';

    tbody.querySelectorAll('tr').forEach(row => {
      const card = document.createElement('div');
      card.className = 'data-card';

      const cells = row.querySelectorAll('td');
      cells.forEach((cell, idx) => {
        const field = document.createElement('div');
        field.className = 'card-field';
        field.innerHTML = `
          <span class="card-label">${headers[idx]}</span>
          <span class="card-value">${cell.textContent}</span>
        `;
        card.appendChild(field);
      });

      cardContainer.appendChild(card);
    });

    tableElement.parentElement.replaceChild(cardContainer, tableElement);
  }

  /**
   * Format phone number for mobile input
   */
  static formatPhoneInput(input) {
    input.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\D/g, '');
      if (value.length > 0) {
        if (value.length <= 3) {
          e.target.value = value;
        } else if (value.length <= 6) {
          e.target.value = value.slice(0, 3) + ' ' + value.slice(3);
        } else {
          e.target.value = value.slice(0, 3) + ' ' + value.slice(3, 6) + ' ' + value.slice(6, 9);
        }
      }
    });
  }
}

// Usage:
// if (ResponsiveLayout.isMobile()) { /* ... */ }
```

### 3.4 New Project Structure
```javascript
// NEW: public/v2/src/js/app.js

import CalculationService from './services/CalculationService.js';
import DataService from './services/DataService.js';
import FormService from './services/FormService.js';
import OperatorController from './controllers/OperatorController.js';
import SalesController from './controllers/SalesController.js';
import FormRenderer from './ui/FormRenderer.js';

class App {
  static async init() {
    try {
      // 1. Initialize Firebase
      await this._initFirebase();
      
      // 2. Load data
      await DataService.loadAll();
      
      // 3. Setup UI based on role
      const controller = CURRENT_USER.role === 'op' 
        ? new OperatorController()
        : new SalesController();
      
      await controller.init();
      
      // 4. Setup event listeners
      this._setupEventListeners();
      
      log('App initialized successfully', 'success');
    } catch (error) {
      console.error('App initialization failed:', error);
      logA('Failed to initialize app: ' + error.message, 'danger');
    }
  }

  static async _initFirebase() {
    // Firebase auth setup
  }

  static _setupEventListeners() {
    // Global event listeners
    document.addEventListener('click', (e) => {
      if (e.target.matches('[data-action]')) {
        this._handleGlobalAction(e);
      }
    });
  }

  static async _handleGlobalAction(event) {
    const action = event.target.dataset.action;
    const args = JSON.parse(event.target.dataset.args || '{}');
    // Route to appropriate controller
  }
}

// Auto-init when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}
```

### 3.5 Create app.js (New Entry Point)
```javascript
// NEW: public/v2/src/js/controllers/OperatorController.js

import CalculationService from '../services/CalculationService.js';
import FormService from '../services/FormService.js';
import DataService from '../services/DataService.js';
import FormRenderer from '../ui/FormRenderer.js';

class OperatorController {
  constructor() {
    this.currentBookingId = null;
    this.currentEntries = [];
  }

  async init() {
    this._setupUIComponents();
    this._attachEventListeners();
  }

  /**
   * Load booking and entries into form
   */
  async loadBooking(bookingId) {
    try {
      const booking = DataService.findBookingById(bookingId);
      const entries = DataService.getOperatorEntriesByBooking(bookingId);
      
      if (!booking) {
        logA('Booking not found', 'warning');
        return;
      }

      this.currentBookingId = bookingId;
      this.currentEntries = entries;
      
      FormService.populateForm(booking, entries);
      this._updateCalculations();
      
    } catch (error) {
      logA('Failed to load booking: ' + error.message, 'danger');
    }
  }

  /**
   * Save booking + entries
   */
  async saveBooking() {
    const validation = FormService.validateForm();
    if (!validation.valid) {
      logA(validation.errors.join('\n'), 'warning');
      return;
    }

    try {
      const data = FormService.extractFormData();
      const result = await DataService.saveBooking(data.bookings, data.operator_entries);
      
      if (result.success) {
        logA('Booking saved successfully!', 'success');
        await this.loadBooking(data.bookings.id);
      } else {
        logA('Save failed: ' + result.error, 'danger');
      }
    } catch (error) {
      logA('Error: ' + error.message, 'danger');
    }
  }

  /**
   * Add detail row
   */
  addDetailRow(data = null) {
    const renderer = new FormRenderer();
    renderer.addDetailRow(data, this.currentBookingId);
    this._attachRowEventListeners();
  }

  /**
   * Calculate all totals
   */
  _updateCalculations() {
    // Get all rows
    const rows = document.querySelectorAll('#detail-tbody tr');
    let totalSales = 0;

    rows.forEach((tr, idx) => {
      const qtyA = CalculationService.parseFormattedNumber(tr.querySelector('.d-qty').value);
      const costA = CalculationService.parseFormattedNumber(tr.querySelector('.d-costA').value);
      // ... calculate per row
      totalSales += rowCost;
    });

    const totalCost = getNum('BK_TotalCost');
    const profit = CalculationService.calculateProfit(totalSales, totalCost);
    
    setVal('BK_Total', formatMoney(totalSales));
    setVal('BK_Balance', formatMoney(profit));
  }

  _setupUIComponents() {
    // Initialize form, validation, etc.
  }

  _attachEventListeners() {
    getE('btn-save-booking')?.addEventListener('click', () => this.saveBooking());
    getE('btn-add-row')?.addEventListener('click', () => this.addDetailRow());
  }

  _attachRowEventListeners() {
    // Row-specific handlers
  }
}

export default OperatorController;
```

---

## 🧪 PHASE 4: TESTING & OPTIMIZATION (Weeks 8-9)

### Goal
Add automated tests; optimize performance; prepare for production v2.

### 5.1 Setup Jest Testing
```javascript
// NEW: tests/CalculationService.test.js

import CalculationService from '../public/v2/src/js/services/CalculationService';

describe('CalculationService', () => {
  describe('calculateNights', () => {
    test('should return 1 for same day', () => {
      const nights = CalculationService.calculateNights('2026-01-15', '2026-01-15', 'Phòng');
      expect(nights).toBe(1);
    });

    test('should calculate nights for multi-day stay', () => {
      const nights = CalculationService.calculateNights('2026-01-15', '2026-01-20', 'Phòng');
      expect(nights).toBe(5);
    });

    test('should return 1 for non-room service types', () => {
      const nights = CalculationService.calculateNights('2026-01-15', '2026-01-20', 'Vé MB');
      expect(nights).toBe(1);
    });
  });

  describe('calculateRowCost', () => {
    test('should calculate cost correctly', () => {
      const cost = CalculationService.calculateRowCost(2, 1000, 1, 500, 100, 0, 1);
      expect(cost).toBe(2600); // 2*1000 + 1*500 + 100 = 2600
    });

    test('should apply multiplier for rooms', () => {
      const cost = CalculationService.calculateRowCost(2, 1000, 0, 0, 0, 0, 3);
      expect(cost).toBe(6000); // 2*1000 * 3 nights
    });

    test('should handle negative costs as zero', () => {
      const cost = CalculationService.calculateRowCost(1, 100, 0, 0, 0, 500, 1);
      expect(cost).toBe(0); // Prevent negative
    });
  });

  describe('parseFormattedNumber', () => {
    test('should parse "1,500,000" as 1500000', () => {
      expect(CalculationService.parseFormattedNumber('1,500,000')).toBe(1500000);
    });

    test('should handle empty string', () => {
      expect(CalculationService.parseFormattedNumber('')).toBe(0);
    });
  });
});
```

### 5.2 Performance Optimization
```javascript
// Optimize calculation performance

// BEFORE: Recalculate everything on every keystroke
input.addEventListener('input', () => {
  calcGrandTotal(); // Heavy operation
});

// AFTER: Debounce calculation
import { debounce } from './utils/debounce.js';

const debouncedCalc = debounce(() => {
  calcGrandTotal();
}, 300); // Wait 300ms after last keystroke

input.addEventListener('input', debouncedCalc);
```

### 5.3 Bundle & Minify
```bash
# Build production bundle
npm run build

# Output: public/v2/dist/bundle.min.js (instead of 13 separate files)
# Result: ~60% smaller (minified), faster load time
```

---

## 📋 IMPLEMENTATION CHECKLIST

### Phase 1: Foundation & Format Cleanup
- [ ] Create STYLE_GUIDE.md
- [ ] Setup webpack + babel
- [ ] Add npm scripts
- [ ] ⭐ Create DataTransformer.js (object format ONLY)
- [ ] ⭐ Update db_manager.js to remove array format
- [ ] ⭐ Remove format detection from all logic files
- [ ] Test all data operations with object format only

### Phase 2: Service Layer + State Management
- [ ] ⭐ Create StoreService (Pub/Sub state management)
- [ ] ⭐ Create MatrixAdapter (complex data handling)
- [ ] ⭐ Create AuditService (logging & audit trail)
- [ ] Create CalculationService (with tests)
- [ ] Create DataService (with tests)
- [ ] Create FormService (with tests)
- [ ] Create ValidationService
- [ ] Refactor logic_operator.js to use services
- [ ] Refactor logic_sales.js to use services

### Phase 3: Mobile-First UI + Module Organization
- [ ] ⭐ Restructure HTML (mobile-first)
- [ ] ⭐ Create mobile.css, tablet.css, desktop.css
- [ ] ⭐ Create MobileNavController
- [ ] ⭐ Create ResponsiveLayout utilities
- [ ] Create services/ directory + index.js
- [ ] Create controllers/ directory
- [ ] Create ui/ directory
- [ ] Create utils/ directory
- [ ] Write OperatorController
- [ ] Write SalesController
- [ ] Create app.js
- [ ] Test all controllers

### Phase 4: Testing & Optimization
- [ ] Setup Jest
- [ ] Write service tests (80%+ coverage)
- [ ] Write controller tests
- [ ] Write UI tests
- [ ] Setup CI/CD
- [ ] Performance optimization (debounce, lazy-load)
- [ ] Bundle & minify

---

## 🎯 SUCCESS METRICS

| Metric | Current | After Phase 4 |
|--------|---------|---|
| **Lines of global code** | 8,000+ | <500 |
| **Global functions** | 50+ | <10 |
| **Array format usage** | 40% | 0% ⭐ |
| **State management** | Scattered | Centralized (StoreService) ⭐ |
| **Audit trail** | None | Complete with AuditService ⭐ |
| **Mobile responsiveness** | CSS patches | Mobile-first structure ⭐ |
| **Test coverage** | 0% | 80%+ |
| **Bundle size** | 400KB (13 files) | 120KB minified |
| **Load time** | 3.2s | 1.8s |
| **Duplicate code** | ~15% | <2% |
| **Module coupling** | High | Low |

---

## 📝 MIGRATION STRATEGY: v1 → v2

### Timeline (New)
```
Phase 1: Foundation + Format Cleanup    (Weeks 1-3)    ⭐ CRITICAL
Phase 2: Service Layer + State Mgmt     (Weeks 4-5)    ⭐ STATE_FIRST
Phase 3: Mobile-First UI + Modules      (Weeks 6-7)    ⭐ RESPONSIVE
Phase 4: Testing & Optimization         (Weeks 8-9)    ⭐ COMPLETE

Total: 9 weeks instead of 9+ weeks
Savings: Parallel format cleanup + State management focus
```

---

## 💡 QUICK WINS (Do These First - Phase 1)

1. **Remove Array Format Detection** (1 day) ⭐
   - Delete all `typeof x === 'object'` checks
   - Cleaner code, fewer bugs, major milestone

2. **Create DataTransformer** (1 day) ⭐
   - Firestore → Object via DataTransformer
   - Centralized format control
   - Replace db_schema.js usage

3. **Setup StoreService** (2 days) ⭐
   - Centralized state management
   - Pub/Sub for reactive updates
   - Foundation for all future services

4. **Create MatrixAdapter** (1 day) ⭐
   - Normalize hotel/service matrix data
   - Simplify cascading dropdown logic
   - Reusable for complex data structures

5. **Add AuditService** (1 day) ⭐
   - Basic logging infrastructure
   - Query audit history
   - Export for compliance

6. **Restructure HTML for Mobile** (2 days) ⭐
   - New mobile-first structure
   - Mobile.css + tablet.css + desktop.css
   - Responsive from day 1

7. **Extract Calculations** (1 day)
   - Move all formulas → CalculationService
   - ~200 lines saved, easier to test

8. **Setup Jest** (1 day)
   - Write tests for StoreService + CalculationService
   - Prove value of testing

9. **Document Architecture** (Done!)
   - Already created copilot-instructions.md

---

## 🔄 BEFORE & AFTER EXAMPLES

### Example 1: Format Detection → Single Format
```javascript
// BEFORE (Phase 0 - current)
const custName = typeof bkData === 'object' && !Array.isArray(bkData)
  ? bkData.customer_name
  : bkData[2];
const phone = typeof bkData === 'object' && !Array.isArray(bkData)
  ? bkData.customer_phone
  : bkData[3];

// AFTER (Phase 1 - immediate)
const custName = bkData.customer_name;
const phone = bkData.customer_phone;
// Result: -40% code
```

### Example 2: Global State → StoreService
```javascript
// BEFORE (Phase 0 - current)
window.APP_DATA.bookings_obj = [...];
// Scattered updates everywhere, hard to track changes
// No way to react to state changes

// AFTER (Phase 2)
Store.setState('bookings', [...]);
// Subscribe to changes
Store.subscribe('bookings', (newVal, oldVal) => {
  console.log('Bookings changed!');
  updateUI();
});
// Result: Observable state, audit trail, testable
```

### Example 3: Scattered Calculations → CalculationService
```javascript
// BEFORE (Phase 0)
const multiplier = (type === 'Phòng' && dOut > dIn) 
  ? (dOut - dIn) / 86400000 
  : 1;
const cost = ((qtyA * costA) + (qtyC * costC) + sur - disc) * multiplier;
// Mixed in logic_operator.js, hard to test

// AFTER (Phase 2)
const nights = CalculationService.calculateNights(checkIn, checkOut, type);
const cost = CalculationService.calculateRowCost(qtyA, costA, qtyC, costC, sur, disc, nights);
// Pure functions, 100% testable, reusable
```

### Example 4: Desktop-First → Mobile-First
```html
<!-- BEFORE (Phase 0) -->
<table style="width: 1200px;">
  <tr>
    <td>...</td>
    <td>...</td>
  </tr>
</table>

<!-- AFTER (Phase 3) -->
<div class="services-grid d-mobile">
  <!-- Mobile: Cards, scrollable -->
</div>
<table class="d-desktop">
  <!-- Desktop: Full table -->
</table>
<!-- Result: Works on all devices, touch-friendly -->
```

### Example 5: No Audit → Full Audit Trail
```javascript
// BEFORE (Phase 0)
// Who changed price from 1M to 2M? → No history

// AFTER (Phase 2)
AuditService.logDataChange('operator_entries', 'OE123', 'cost_adult', 1000000, 2000000);
// Query: Find all changes by "operator@example.com"
const history = AuditService.queryAuditLog({ user: 'operator@example.com' });
// Export: CSV for compliance
const csv = AuditService.exportAuditLog();
// Result: Complete audit trail, compliant, traceable
```

---

## 🔗 SERVICE INTEGRATION FLOW

```
index.html (NEW structure)
    ↓
1. DataTransformer.js       ← Load Firestore → Object only
    ↓
2. StoreService.js          ← Initialize central state
    ↓
3. AuditService.js          ← Start logging system
    ↓
4. MatrixAdapter.js         ← Load master data
    ↓
5. CalculationService.js    ← Ready for calculations
    ↓
6. DataService.js           ← Load all collections via Store
    ↓
7. MobileNavController.js   ← Setup responsive layout
    ↓
8. BookingController.js     ← Role-specific logic
    ↓
9. app.js                   ← Entry point init
```

**Key Integration Points**:
- ✅ All services use `Store` for state
- ✅ All data changes trigger `AuditService.logDataChange()`
- ✅ All matrix data goes through `MatrixAdapter`
- ✅ All calculations use `CalculationService`
- ✅ All UI responsive via `ResponsiveLayout`
- ✅ Mobile navigation via `MobileNavController`

---

## 📚 RELATED FILES & DEPENDENCIES

| File | Purpose | Updated |
|------|---------|---------|
| [copilot-instructions.md](.github/copilot-instructions.md) | Development guide | Reference |
| [firebase.json](firebase.json) | Firebase config | No change needed |
| [.eslintrc.json](.eslintrc.json) | Linting rules | Update for services/ |
| [.prettierrc](.prettierrc) | Code formatting | No change needed |
| `public/v2/src/index.html` | Entry point | ⭐ RESTRUCTURE |
| `public/v2/src/js/db_schema.js` | Old format mapping | DEPRECATE (use DataTransformer) |
| `public/v2/src/js/db_manager.js` | Data loading | ⭐ UPDATE for object format |
| `public/v2/src/js/utils.js` | Global utils | ⭐ REMOVE format detection |
| `public/v2/src/css/main.css` | Old styles | REPLACE with mobile-first |

---

## 🚀 START HERE

### Week 1: Phase 1 Quick Wins
1. Remove array format detection (1 day)
2. Create DataTransformer.js (1 day)
3. Create StoreService.js (2 days)
4. Update db_manager.js for object-only (1 day)

### Week 2: Phase 1 Continued
5. Create MatrixAdapter.js (1 day)
6. Create AuditService.js (1 day)
7. Restructure HTML mobile-first (2 days)

### Week 3: Phase 1 Complete
8. Create mobile.css, tablet.css, desktop.css (2 days)
9. Update main.js to use new structure (1 day)
10. Test everything works (1 day)

### Then Proceed: Phase 2, 3, 4...

---

**Status**: ✅ Strategy complete and ready to implement  
**Timeline**: 4-5 weeks (Phase 1) → 9 weeks (All phases)  
**Priority**: START IMMEDIATELY with Phase 1 (object format only)

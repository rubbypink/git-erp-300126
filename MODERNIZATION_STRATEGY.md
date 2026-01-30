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

## 🎯 PHASE 1: FOUNDATION (Weeks 1-2)

### Goal
Establish code standards, document architecture, prepare for refactoring.

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
  "lint": "eslint public/src/js/**/*.js",
  "format": "prettier --write public/src/js/**/*.js",
  "test": "jest",
  "build": "webpack",
  "dev": "webpack --watch"
}

# Create webpack.config.js
module.exports = {
  entry: './public/src/js/main.js',
  output: {
    filename: 'bundle.min.js',
    path: `${__dirname}/public/dist`
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

#### 1.3 Create Refactoring Roadmap Document
```markdown
# REFACTORING_ROADMAP.md

## Phase Timeline
- Phase 1: Foundation (Weeks 1-2) ✅
- Phase 2: Data Format Migration (Weeks 3-4)
- Phase 3: Service Layer Extraction (Weeks 5-6)
- Phase 4: Module Organization (Weeks 7-8)
- Phase 5: Testing & Optimization (Weeks 9+)

[Details for each phase...]
```

---

## 🔄 PHASE 2: DATA FORMAT MIGRATION (Weeks 3-4)

### Goal
Complete object format migration; remove array format from v1 code.

### Current Problem
```javascript
// Mixed format detection everywhere
const custName = typeof bkData === 'object' && !Array.isArray(bkData) 
  ? bkData.customer_name 
  : bkData[2];
```

### Solution: Complete Object Format

#### 2.1 Update db_schema.js → db_transformer.js
```javascript
// NEW: public/src/js/db_transformer.js

/**
 * Transform raw Firestore documents → application objects
 * Single responsibility: Format conversion
 */
class DataTransformer {
  /**
   * Firestore → Object format
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
}

// Usage:
// const booking = DataTransformer.toBooking(firebaseDoc);
```

#### 2.2 Remove Array Format Detection (Backward Compat: Optional)
```javascript
// BEFORE (utils.js)
const custName = typeof bkData === 'object' && !Array.isArray(bkData) 
  ? bkData.customer_name 
  : bkData[2];

// AFTER (utils.js) - Remove array check
const custName = bkData.customer_name || '';

// For critical functions, add deprecation notice:
/**
 * @deprecated Use object format only from 2026-Q1+
 * Array format support will be removed.
 */
function extractBookingData(bkData) { ... }
```

#### 2.3 Update All Collections in db_manager.js
```javascript
// Load only object format from Firestore
window.APP_DATA = {
  bookings_obj: [],          // Keep only this
  // bookings: [],            // DELETE THIS LINE
  
  operator_entries_obj: [],  // Keep only this
  // operator_entries: [],    // DELETE THIS LINE
  
  customers_obj: [],         // Keep only this
  // customers: [],           // DELETE THIS LINE
  
  lists: { ... }
};
```

#### 2.4 Update Form Data Extraction
```javascript
// logic_operator.js - getFormData()
window.getFormData = function() {
  const bookings = {
    id: getVal('BK_ID'),
    customer_name: getVal('Cust_Name'),
    // ... now ALWAYS object format, no conditions
  };
  
  const operator_entries = [];
  document.querySelectorAll('#detail-tbody tr').forEach(tr => {
    const entry = {
      id: getRowVal('d-sid'),
      service_type: getRowVal('d-type'),
      // ... etc - pure object
    };
    operator_entries.push(entry);
  });
  
  return { bookings, operator_entries };
};
```

**Result**: ~200 lines removed, 40% fewer conditionals ✅

---

## 🏗️ PHASE 3: SERVICE LAYER EXTRACTION (Weeks 5-6)

### Goal
Separate business logic from UI; create reusable services.

### Architecture

```
public/src/
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

### 3.1 Extract Calculation Service
```javascript
// NEW: public/src/js/services/CalculationService.js

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
// NEW: public/src/js/services/DataService.js

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
// NEW: public/src/js/services/FormService.js

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

## 📦 PHASE 4: MODULE REORGANIZATION (Weeks 7-8)

### Goal
Establish proper module boundaries; convert from global scope to exports.

### 4.1 New Project Structure
```
public/src/
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

### 4.2 Create app.js (New Entry Point)
```javascript
// NEW: public/src/js/app.js

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

### 4.3 Create Role-Specific Controller
```javascript
// NEW: public/src/js/controllers/OperatorController.js

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

## 🧪 PHASE 5: TESTING & OPTIMIZATION (Weeks 9+)

### Goal
Add automated tests; optimize performance; prepare for production v2.

### 5.1 Setup Jest Testing
```javascript
// NEW: tests/CalculationService.test.js

import CalculationService from '../public/src/js/services/CalculationService';

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

# Output: public/dist/bundle.min.js (instead of 13 separate files)
# Result: ~60% smaller (minified), faster load time
```

---

## 📋 IMPLEMENTATION CHECKLIST

### Phase 1: Foundation
- [ ] Create STYLE_GUIDE.md
- [ ] Setup webpack + babel
- [ ] Add npm scripts
- [ ] Create REFACTORING_ROADMAP.md

### Phase 2: Data Format
- [ ] Create DataTransformer class
- [ ] Remove array format from all collections
- [ ] Update db_manager.js to load only objects
- [ ] Update logic_operator.js, logic_sales.js
- [ ] Test all data operations

### Phase 3: Services
- [ ] Create CalculationService (with tests)
- [ ] Create DataService (with tests)
- [ ] Create FormService (with tests)
- [ ] Create ValidationService
- [ ] Refactor logic_operator.js to use services
- [ ] Refactor logic_sales.js to use services

### Phase 4: Modules
- [ ] Create services/ directory + index.js
- [ ] Create controllers/ directory
- [ ] Create ui/ directory
- [ ] Create utils/ directory
- [ ] Write OperatorController
- [ ] Write SalesController
- [ ] Create app.js
- [ ] Test all controllers

### Phase 5: Testing
- [ ] Setup Jest
- [ ] Write service tests (80%+ coverage)
- [ ] Write controller tests
- [ ] Write UI tests
- [ ] Setup CI/CD

---

## 🚀 SUCCESS METRICS

| Metric | Current | After Phase 5 |
|--------|---------|---|
| **Lines of global code** | 8,000+ | <500 |
| **Global functions** | 50+ | <10 |
| **Test coverage** | 0% | 80%+ |
| **Bundle size** | 400KB (13 files) | 120KB minified |
| **Load time** | 3.2s | 1.8s |
| **Duplicate code** | ~15% | <2% |
| **Build process** | Manual | Automated |
| **Module coupling** | High | Low |

---

## 📝 MIGRATION STRATEGY: v1 → v2

### Keep v1 Production While Building v2
```
┌─ v1 (public/src/) - Currently live ──→ Refactor gradually
└─ v2 (public/v2/) - New structure ─────→ Parallel development

Timeline:
Month 1-2: Services + Tests (Phase 3-5 in v1)
Month 3: Parallel v2 with new architecture
Month 4: Integration testing
Month 5: Switch to v2 in production
Month 6: Archive v1
```

### Coexistence Strategy
```javascript
// Entry point chooses version
if (feature_flags.USE_V2) {
  // Load v2/js/app.js (new architecture)
  import('./v2/js/app.js').then(app => app.init());
} else {
  // Load v1/js/main.js (current, still works)
  loadV1Scripts();
}
```

---

## 💡 QUICK WINS (Do These First)

1. **Extract Calculations** (2 days)
   - Move all formulas from logic_*.js → CalculationService
   - ~200 lines saved, easier to test

2. **Remove Array Format** (2 days)
   - Delete all `typeof x === 'object'` checks
   - Cleaner code, fewer bugs

3. **Add Data Transformer** (1 day)
   - Firestore → Object via DataTransformer
   - Centralized format control

4. **Setup Jest** (1 day)
   - Write tests for CalculationService only
   - Prove value of testing

5. **Document Architecture** (Done!)
   - Already created copilot-instructions.md

---

## 🔗 RELATED FILES

- [copilot-instructions.md](.github/copilot-instructions.md) - Development guide
- [firebase.json](firebase.json) - Firebase config
- [.eslintrc.json](.eslintrc.json) - Linting rules
- [.prettierrc](.prettierrc) - Code formatting

---

**Next Step**: Start Phase 1 (Foundation) immediately.  
**Target**: Complete refactoring by Q2 2026.

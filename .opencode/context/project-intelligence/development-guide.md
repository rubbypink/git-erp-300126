<!-- Context: project-intelligence/development | Priority: high | Version: 1.0 | Updated: 2026-05-25 -->

# Development Guide — 9-Trip ERP

**Purpose**: Practical development patterns, how to add features, common workflows. The go-to guide for any code change.
**Audience**: Developers, AI agents writing ERP frontend code.

---

## 1. Helper-First Principle

> **ALWAYS use existing helpers before writing new code.**

### Go-To Helpers

| Task | Helper | Source |
|------|--------|--------|
| Get element by ID | `getE(id)` | `utils.js` |
| Query selector | `$(sel, root)` | `utils.js` |
| Read input value | `getVal(id)` | `utils.js` |
| Write input value | `setVal(id, val)` | `utils.js` |
| Write number (formatted) | `setNum(id, val)` | `utils.js` |
| Read number (from formatted) | `getNum(id)` | `utils.js` |
| Fill form from data | `HD.setFormData(root, data)` | `db_helper.js` |
| Read form to data | `HD.getFormData(root, col)` | `db_helper.js` |
| Event binding (delegation) | `A.Event.on(sel, event, handler, true)` | `EventManager.js` |
| Event binding (direct) | `A.Event.on(sel, event, handler)` | `EventManager.js` |
| Format money | `formatMoney(n)` | `utils.js` |
| Format date (VN) | `formatDateVN(d)` | `utils.js` |
| Format date (input) | `formatDateForInput(d, 'date')` | `utils.js` |
| Show alert | `A.UI.HELP.showAlert(msg, type)` | `UI_Manager.js` |
| Show confirm | `A.UI.HELP.showConfirm(msg, okFn, denyFn)` | `UI_Manager.js` |
| Toast notification | `A.UI.HELP.logA(msg, 'success')` | `UI_Manager.js` |
| Error reporting | `Opps(error)` | `utils.js` |
| Logging | `L.log(msg, data)` | `logger.js` |
| Server API call | `requestAPI(funcName, ...args)` | `LogicBase.js` |
| Set text content | `setText(el, text)` | `utils.js` |
| Set element display | `setDisplay(el, true/false)` | `utils.js` |
| Disable element | `disable(el, true/false)` | `utils.js` |
| Fill select options | `fillSelect(el, data, defaultText)` | `utils.js` |

---

## 2. Adding a New Module

### Step-by-Step

```javascript
// 1. Create file: public/src/js/modules/M_NewModule.js

class NewModule {
    // Static config (accessed via A.NewModule.Config)
    static Config = {
        someOption: 'value',
    };
    
    // State (shared, persisted across hot reload if needed)
    static State = {
        isInitialized: false,
    };
    
    // Lazy init (false = only init when first accessed)
    static autoInit = false;
    
    // Init (called once, automatically)
    static async init() {
        if (this.State.isInitialized) return;
        // Setup code here
        this.State.isInitialized = true;
    }
    
    // Instance methods
    doSomething() {
        // Use A.Event.on() for event binding (auto-cleanup)
        A.Event.on('.my-button', 'click', (e) => {
            // handler
        }, true); // true = delegation
        
        // Use A.DB for data
        // Use A.UI for rendering
    }
    
    // Cleanup (called when module is unregistered)
    destroy() {
        // Clean up listeners if needed
        A.Event.off('.my-button', 'click');
    }
}

// 2. Register in app.js boot sequence or via A.addModule
A.addModule('NewModule', NewModule);

// 3. Access anywhere
A.NewModule.doSomething();
```

### Module Registration Options

```javascript
// Eager (instantiated immediately)
A.addModule('MyModule', MyModule, true);

// Lazy via autoInit: false (instantiated on first access)
A.addModule('MyModule', MyModule, false);

// Dynamic import (loaded on demand)
await A.load('MyModule', false);
```

---

## 3. Adding a New Collection

```javascript
// 1. Add schema to DBSchema.js
export const DB_SCHEMA = {
    // ... existing collections ...
    
    my_new_collection: {
        primaryKey: 'id',
        fields: [
            {
                index: 0,
                name: 'id',
                displayName: 'ID',
                type: 'text',
                tag: 'input',
                attrs: ['readonly'],
                initial: '',
            },
            {
                index: 1,
                name: 'name',
                displayName: 'Tên',
                type: 'text',
                tag: 'input',
                attrs: ['required'],
                validation: { required: true },
                initial: '',
            },
            // ... more fields
        ],
        aggregates: {
            sum: ['amount'],            // Fields to sum in footer
            unique: ['id', 'name'],     // Unique fields
        }
    },
};

// 2. Add to DBManager's role collections (#ROLE_COLL_MAP) if role-restricted
// In DBManager.js:
#ROLE_COLL_MAP = {
    sale: ['bookings', 'booking_details', ..., 'my_new_collection'],
    // ...
};

// 3. Add to DBLocalStorage's TTL config if needed
// In DBLocalStorage.js:
this.ttlConfig = {
    // ...
    my_new_collection: 120,  // 2 hours
};

// 4. Add to APP_DATA (auto-handled by DBManager, but reference in code):
// APP_DATA.my_new_collection = { 'id-001': { id: 'id-001', name: '...', ... } }

// 5. Generate form from schema (UI):
A.UI.renderForm('my_new_collection', null, 'Tạo mới');

// 6. Generate table from schema (UI):
A.UI.generateGridColsFromObject('my_new_collection');
const table = new ATable('#container', { colName: 'my_new_collection' });
table.init(data);
```

---

## 4. Adding a New Template

```html
<!-- 1. Create file: public/src/components/tpl_new_feature.html -->

<template id="tmpl-new-feature">
    <div class="new-feature-container">
        <h3>New Feature</h3>
        <div data-field="name">
            <input data-field="name" type="text" class="form-control" />
        </div>
        <button class="btn-save-new-feature">Lưu</button>
    </div>
</template>
```

```javascript
// 2. Render template
A.UI.renderTemplate('target-container', 'tpl_new_feature.html');

// 3. Bind events (after rendering)
A.Event.on('.btn-save-new-feature', 'click', async (e) => {
    // Read form data using HD helper
    const data = HD.getFormData('.new-feature-container', 'my_collection');
    // Save to Firestore
    await A.DB.saveRecord('my_collection', Object.values(data));
    A.UI.HELP.logA('Đã lưu!', 'success');
}, true);
```

---

## 5. Form Data Pattern

### Reading from Form

```javascript
// Single field
const name = getVal('#customer-name');

// Multiple fields
const { name, phone, email } = getVals(['#customer-name', '#customer-phone', '#customer-email']);

// Form with data-field attributes (HD helper)
const formData = HD.getFormData('#form-root', 'bookings');
// Returns: { 'bk-new-001': { customer_name: '...', start_date: '...', ... } }
// Key is auto-generated or read from data-field="id" element
```

### Writing to Form

```javascript
// Single field
setVal('#customer-name', 'Nguyễn Văn A');

// Number (with formatting)
setNum('#total-amount', 1500000); // Displays "1.500.000", stores 1500000 in dataset.val

// Full form from data object
HD.setFormData('#form-root', {
    customer_name: 'Nguyễn Văn A',
    start_date: '2026-05-25',
    adults: 2,
    total_amount: 1500000,
});
// Auto-detects [data-field="customer_name"], [data-field="start_date"], etc.
```

---

## 6. Event Binding Best Practices

```javascript
// ✅ DO: Use A.Event.on() for ALL event binding
A.Event.on('.btn-save', 'click', handler, true);

// ✅ DO: Use delegation for dynamic elements (elements added after page load)
A.Event.on('#detail-tbody', 'click', '.btn-delete-row', handler, {
    delegate: '.btn-delete-row'
});

// ✅ DO: Space-separate multiple events
A.Event.on('#search-input', 'keyup change', handler);

// ❌ DON'T: Raw addEventListener
document.querySelector('.btn').addEventListener('click', handler);

// ❌ DON'T: Inline onclick
<button onclick="doSomething()">
```

### Event Cleanup

```javascript
// A.Event.on() auto-cleans up when same target+event is registered again
// Manual cleanup if needed:
A.Event.off('#my-element', 'click');
```

---

## 7. Data Access Pattern

```javascript
// ✅ CORRECT: Object format (O(1) lookup)
const booking = APP_DATA.bookings['bk-001'];
const allBookings = Object.values(APP_DATA.bookings);

// ✅ CORRECT: Filter with HD helper
const activeBookings = HD.filter(APP_DATA.bookings, 'active', '==', 'status');

// ❌ WRONG: Array format (legacy, avoid)
const booking = APP_DATA.bookings_obj.find(b => b.id === 'bk-001');

// ✅ For loops over data, use Object.values:
Object.values(APP_DATA.bookings).forEach(booking => {
    console.log(booking.customer_name);
});

// ✅ For getting a single doc by ID:
const doc = A.DB.getCollection ? APP_DATA.bookings[id] : null;
```

---

## 8. Saving Data Pattern

```javascript
// Simple save (auto-generates ID)
const data = HD.getFormData('#form-root', 'bookings');
const records = Object.values(data); // Convert { id: doc } → [doc]
await A.DB.saveRecord('bookings', records[0]);

// Batch save (multiple records)
const rows = HD.getTableData('#detail-tbody');
await A.DB.batchSave('booking_details', rows);

// Update single field
await A.DB.updateSingle('bookings', 'bk-001', { status: 'completed' });

// Increment counter
await A.DB.incrementField('transactions', 'tx-001', 'amount', 500000);

// Delete
const confirmed = await A.UI.HELP.showConfirm('Xác nhận xóa?');
if (confirmed) {
    await A.DB.deleteRecord('booking_details', 'bd-001');
}
```

---

## 9. Table Pattern

```javascript
// Create table from schema
const cols = A.UI.generateGridColsFromObject('bookings');
const table = new ATable('#table-container', {
    colName: 'bookings',
    pageSize: 25,
    editable: true,
    groupBy: true,
    download: true,
    onCellChange: async (id, field, value) => {
        await A.DB.updateSingle('bookings', id, { [field]: value });
    },
    onRowClick: (id, row) => {
        B.onGridRowClick(id, 'bookings');
    },
});

// Load data
const data = Object.values(APP_DATA.bookings);
table.init(data);

// Filter
table.filter('Nguyễn Văn A');

// Sort
table.sort('start_date');

// Group
table.groupBy('status');

// Export
table.download('excel');
```

---

## 10. Code Style Checklist

- [ ] Vietnamese comments, UI text
- [ ] 4-space tabs (Prettier)
- [ ] Single quotes (Prettier)
- [ ] `printWidth: 500` (Prettier)
- [ ] ES5 trailing commas, semicolons (Prettier)
- [ ] Use `const` by default, `let` only when needed
- [ ] camelCase functions (`getFormData`, `formatMoney`)
- [ ] SCREAMING_SNAKE constants (`M_CUSTOMER_NAME`)
- [ ] kebab-case CSS classes (`pdf-compact-mode`)
- [ ] `M_*.js` for module files, `tpl_*.html` for templates
- [ ] Use `A.Event.on()` not raw event listeners
- [ ] Use `HD.getFormData()` / `HD.setFormData()` for forms
- [ ] Use `Opps(error)` for error reporting
- [ ] Object format for APP_DATA access
- [ ] No ALL-CAPS text in AI content
- [ ] No banned words in AI content

---

## 11. Debugging Tips

```javascript
// Check APP_DATA state
console.log(APP_DATA);

// Check registered modules
console.log(A.getModules());

// Check event listeners on element
console.log(A.Event.getListenersForElement($('#my-btn')));

// Check IndexedDB
localDB.getCollection('bookings').then(console.log);

// Force reload from Firestore
await A.DB.loadAllData(true);

// Mock a role for testing
localStorage.setItem('erp-mock-role', 'op');
location.reload();

// Check current user
console.log(APP_DATA.currentUser);

// Check config
console.log(A.getConfig('debug'));
```

---

## 12. Common Workflows

### Add a New Feature

1. Create template HTML in `public/src/components/` (if new UI needed)
2. Create module JS in `public/src/js/modules/`
3. Register via `A.addModule()` in boot sequence
4. Add collection to `DBSchema.js` (if new data type)
5. Add to role collections in `DBManager.js` (if role-restricted)
6. Bind events with `A.Event.on()`
7. Use `HD` for form handling
8. Use `A.DB` for data persistence
9. Test with role masking (`erp-mock-role`)

### Fix a Bug

1. Reproduce with role masking
2. Check `APP_DATA` state
3. Check event bindings via `A.Event.getListenersForElement()`
4. Check IndexedDB cache (may be stale — force reload)
5. Fix, test with multiple roles
6. Check Prettier/ESLint
7. Commit with Vietnamese message

### Add an AI Agent

1. Add config in `functions-ai/.9trip-agents/configs/`
2. Create flow in `functions-ai/ai/flows/`
3. Create API in `functions-ai/api/`
4. Register in `prompts_master.js`
5. Create sub-agent wrapper in `.9trip-agents/sub-agents/`
6. Update orchestrator flow if part of pipeline

---

## Related Files

- `erp-architecture.md` — Core architecture patterns
- `database-dataflow.md` — Data layer patterns
- `functions-guide.md` — Backend function patterns
- `ai-agents-system.md` — AI agent development

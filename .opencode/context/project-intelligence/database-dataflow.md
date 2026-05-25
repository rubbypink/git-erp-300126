<!-- Context: project-intelligence/database | Priority: critical | Version: 1.0 | Updated: 2026-05-25 -->

# Database & Data Flow Architecture

**Purpose**: Complete reference for the 3-layer data architecture — Firestore schemas, IndexedDB caching, RAM state, form helpers.
**Audience**: Developers, AI agents working with data layer.

---

## 1. Data Flow Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        WRITE PATH                                │
│                                                                  │
│  Form (DOM)                                                      │
│    │ HD.getFormData(root, collectionName)                        │
│    ▼                                                             │
│  DBManager.saveRecord(collection, dataArray)                     │
│    │ #firestoreCRUD('set'|'update')                              │
│    ▼                                                             │
│  Firestore (Cloud)                                               │
│    │ onWrite trigger                                             │
│    ▼                                                             │
│  #gatekeepSyncToLocal()  ←── MANDATORY: persist before RAM       │
│    │ DBLocalStorage.putBatch()                                   │
│    ▼                                                             │
│  IndexedDB (Dexie)                                               │
│    │ _updateAppDataObj()                                         │
│    ▼                                                             │
│  APP_DATA (RAM)    ←── Read-only from UI perspective             │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                        READ PATH                                 │
│                                                                  │
│  APP_DATA (RAM)    ←── First check (instant)                     │
│    │ fallback                                                    │
│  IndexedDB (Dexie) ←── Second check (1-5ms)                      │
│    │ fallback                                                    │
│  Firestore (Cloud) ←── Last resort (50-200ms)                    │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                     SYNC PATH (Delta)                            │
│                                                                  │
│  loadAllData()                                                   │
│    ├── IndexedDB has valid data? → load from cache               │
│    │   └── #smartDeltaSync() → canary query on bookings          │
│    │       └── Found updated doc? → full syncDelta()             │
│    │       └── No changes? → skip (save bandwidth)               │
│    └── No cache / forceNew? → syncDelta() (full Firestore load)  │
│                                                                  │
│  Real-time: onSnapshot(notifications) → autoSyncData()           │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. APP_DATA Structure (RAM)

```javascript
window.APP_DATA = {
    // ─── Object format (PRIMARY — O(1) lookup by ID) ───
    bookings: {
        'bk-001': { id: 'bk-001', customer_name: '...', start_date: '...', ... },
        'bk-002': { id: 'bk-002', customer_name: '...', start_date: '...', ... },
    },
    booking_details: {
        'bd-001': { id: 'bd-001', booking_id: 'bk-001', hotel_name: '...', ... },
    },
    operator_entries: {
        'op-001': { id: 'op-001', booking_id: 'bk-001', ... },
    },
    customers: {
        'c-001': { id: 'c-001', phone: '090...', full_name: '...', ... },
    },
    transactions: {
        'tx-001': { id: 'tx-001', type: 'IN', amount: 5000000, ... },
    },
    users: {
        'uid-001': { uid: 'uid-001', email: '...', role: 'sale', ... },
    },

    // ─── Array format (LEGACY — avoid in new code) ───
    bookings_obj: [{ id: 'bk-001', ... }, { id: 'bk-002', ... }],
    details_obj: [{ ... }],
    operator_entries_obj: [{ ... }],
    customers_obj: [{ ... }],

    // ─── Lists / Lookups ───
    lists: {
        hotelMatrix: [...],
        serviceMatrix: [...],
        staff: [...],
        tourTypes: [...],
    },

    // ─── Current User ───
    currentUser: {
        uid: '...',
        email: '...',
        role: 'sale',
        level: 0,
        displayName: '...',
    },

    // ─── Meta ───
    _meta: {
        lastSync: { bookings: 1716500000000, ... },
        version: 15,
    }
};
```

> ⚠️ **CRITICAL RULE**: All Firestore collections in `APP_DATA` default to **object format `{ id: doc }`**. 
> Access: `APP_DATA.bookings[id]` or `Object.values(APP_DATA.bookings)`. 
> `*_obj` arrays are LEGACY — do NOT use in new code.

---

## 3. DBSchema (`public/src/js/modules/db/DBSchema.js`)

**3875 lines — 28 collections defined**

### Collection Categories

| Category | Collections | Count |
|----------|------------|-------|
| **Core ERP** | `bookings`, `booking_details`, `operator_entries`, `customers`, `users` | 5 |
| **Finance** | `transactions`, `transactions_thenice`, `fund_accounts`, `fund_accounts_thenice` | 4 |
| **Products** | `hotels`, `suppliers`, `tour_prices`, `selling_prices`, `hotel_price_schedules`, `service_price_schedules` | 6 |
| **Reports** | `report_sales_general`, `report_sales_services`, `report_op_debt_detail`, `report_fin_general`, `report_error_sync_sa`, `report_error_booking_details`, `report_error_sync_so`, `report_error_cancelled_booking` | 8 |
| **HR** | `employees`, `attendance`, `salary_records`, `bonuses` | 4 |
| **AI** | `ai_content_queue` | 1 |

### Field Schema Properties

Mỗi field trong collection có:

```javascript
{
    index: 0,                   // Vị trí trong array format
    name: 'customer_name',      // Firestore field key
    displayName: 'Tên khách',   // Vietnamese label
    displayNameEng: 'Customer Name',
    type: 'text',               // text|number|date|select|phone|email|textarea|url|checkbox|json|map|object|time
    tag: 'input',              // input|select|textarea|object
    attrs: ['required'],       // readonly|hidden|required
    class: 'fw-bold',          // CSS classes
    dataSource: 'APP_DATA.lists.staff',  // For select fields
    foreignKey: 'customers',   // FK reference
    foreignKeyDisplay: 'full_name',
    options: [...],            // Static options
    validation: { required: true, min: 1, max: 100 },
    initial: '',               // Default value ('0', 'today', year)
    dependsOn: ['field_name'], // Cascading dropdown
    onchange: 'functionName',  // Change handler
}
```

### Helper Methods on DB_SCHEMA

```javascript
DB_SCHEMA.FIELD_MAP('bookings')           // { 0: 'id', 1: 'customer_id', ... }
DB_SCHEMA.getHeader('bookings')           // ['id', 'customer_id', 'customer_full_name', ...]
DB_SCHEMA.getFieldNames('bookings')       // ['id', 'customer_id', ...]
DB_SCHEMA.isCollection('bookings')        // true
DB_SCHEMA.createFormBySchema('bookings', 'form-id')  // → HTML string
```

### FIELD_MAP Constants

Exposed as `window.FIELD_MAP` — a lazy Proxy that caches results.

```javascript
FIELD_MAP.bookings        // { 0: 'id', 1: 'customer_id', 2: 'customer_full_name', ... }
FIELD_MAP.booking_details  // { 0: 'id', 1: 'booking_id', 2: 'service_type', ... }
FIELD_MAP.operator_entries // { 0: 'id', 1: 'booking_id', 2: 'customer_full_name', ... }
FIELD_MAP.customers        // { 0: 'id', 1: 'full_name', 2: 'dob', ... }
FIELD_MAP.users            // { 0: 'uid', 1: 'account', 2: 'user_name', ... }
```

### Key Collections Quick Reference

**bookings** (19 fields, indices 0-18):
`id, customer_id, customer_full_name, customer_phone, start_date, end_date, adults, children, total_amount, deposit_amount, balance_amount, payment_method, payment_due_date, note, staff_id, status, note_internal, history, created_at`

**booking_details** (17 fields, indices 0-16):
`id, booking_id, service_type, hotel_name, service_name, check_in, check_out, nights, quantity, unit_price, child_qty, child_price, surcharge, discount, total, ref_code, note`

**operator_entries** (22 fields, indices 0-21):
`id, booking_id, customer_full_name, service_type, hotel_name, service_name, check_in, check_out, nights, adults, cost_adult, children, cost_child, surcharge, discount, total_sale, ref_code, total_cost, paid_amount, debt_balance, supplier, operator_note`

---

## 4. DBManager (`public/src/js/modules/db/DBManager.js`)

**2788 lines — Firestore CRUD + Sync + Notifications**

### Core CRUD via `#firestoreCRUD(collection, action, id, data, options)`

| Action | Description | Firestore Operation |
|--------|-------------|-------------------|
| `get` | Read single or all | `getDoc()` / `getDocs()` |
| `query` | Query with filters | `getDocs(query(...))` |
| `add` | Auto-ID + create | `setDoc(doc(collection(...)))` |
| `set` | Create or overwrite | `setDoc(ref, data, { merge })` |
| `update` | Partial update | `updateDoc()` |
| `delete` | Remove document | `deleteDoc()` |
| `increment` | Atomic counter | `updateDoc(ref, { field: increment(n) })` |
| `arrayUnion` | Atomic array append | `updateDoc(ref, { field: arrayUnion(data) })` |
| `batch` | Bulk write (≤499/batch) | `writeBatch()` then `commit()` |
| `transaction` | Atomic read-write | `runTransaction()` |

### After Every Write

1. **Sync to IndexedDB**: `#gatekeepSyncToLocal()` — converts Firestore Timestamps, persists via Dexie
2. **Update RAM**: `_updateAppDataObj(coll, id)` — updates `APP_DATA[coll][id]`
3. **Create Notification**: `notifications/{autoId}` document for real-time sync
4. **Record History**: `#recordBookingHistory()` for bookings/booking_details/transactions

### Role-Based Collections (`#ROLE_COLL_MAP`)

| Role | Allowed Collections |
|------|-------------------|
| `sale` | bookings, booking_details, customers, transactions, fund_accounts, tour_prices, hotel_price_schedules, service_price_schedules |
| `op` | bookings, operator_entries, suppliers, hotels, hotel_price_schedules, service_price_schedules, transactions, fund_accounts, customers, tour_prices |
| `acc` | transactions, suppliers, fund_accounts, bookings, operator_entries |
| `acc_thenice` | transactions_thenice, fund_accounts_thenice |
| `admin` | ALL collections including users |

### Public API

```javascript
// Data loading
await A.DB.loadAllData(forceNew);
await A.DB.loadCollections(['bookings', 'customers']);

// CRUD
await A.DB.saveRecord('bookings', { customer_name: '...', ... });
await A.DB.deleteRecord('bookings', 'bk-001');
await A.DB.updateSingle('bookings', 'bk-001', { status: 'completed' });

// Batch operations
await A.DB.batchSave('booking_details', [detail1, detail2, ...]);
await A.DB.batchDelete('booking_details', ['bd-001', 'bd-002']);
await A.DB.batchUpdateFieldData('bookings', 'staff_id', 'old-staff', 'new-staff');

// Specialized
await A.DB.incrementField('transactions', 'tx-001', 'amount', 500000);
await A.DB.arrayUnionField('bookings', 'bk-001', 'history', historyEntry);
await A.DB.runQuery('bookings', 'status', '==', 'active', 'created_at', 50);

// Cloud Functions
await A.DB.callFunction('deleteBooking', { bookingId: 'bk-001' });
```

### Notifications System

- **Listener**: `onSnapshot` on `notifications/` collection
- **Filtering**: By user group, role, target user
- **Deduplication**: `notification_dedup` IndexedDB table
- **Auto-clean**: Old notifications (>3 days for admin) removed automatically
- **Data sync**: `data-change` type notifications trigger `#autoSyncData()`

---

## 5. DBLocalStorage — IndexedDB via Dexie

**File**: `public/src/js/modules/db/DBLocalStorage.js` (585 lines)
**Export**: `const localDB = new IndexedDBHelper('9TripERP_LocalDB')`
**Version**: 15

### TTL Cache Configuration

```javascript
ttlConfig = {
    app_config: 4320,      // 72 hours
    hotels: 4320,          // 72 hours
    suppliers: 4320,       // 72 hours
    bookings: 60,          // 1 hour
    booking_details: 60,   // 1 hour
    operator_entries: 60,  // 1 hour
    transactions: 120,     // 2 hours
    customers: 120,        // 2 hours
    defaultTTL: 360,       // 6 hours
};
```

### Key Methods

```javascript
// Read
await localDB.get('bookings', 'bk-001');           // Single doc
await localDB.getCollection('bookings');            // All as array
await localDB.getAllAsObject('bookings');           // All as { id: doc }
await localDB.find('bookings', 'status', 'active'); // Filtered
await localDB.search('bookings', 'customer_name', 'Nguyễn'); // Prefix search

// Write
await localDB.put('bookings', doc);
await localDB.putBatch('bookings', docs);
await localDB.patch('bookings', 'bk-001', { status: 'completed' });

// Delete
await localDB.delete('bookings', 'bk-001');
await localDB.deleteBatch('bookings', ids);
await localDB.deleteByQuery('bookings', 'status', '==', 'cancelled');

// Sync
localDB.isSynced('bookings');          // Check TTL
localDB.markSynced('bookings');         // Update timestamp
localDB.getStaleCollections(cols);      // Find expired
```

### Auto-Recovery

If Dexie `UpgradeError` occurs → delete entire DB → rebuild from schema. No data loss because Firestore is source of truth.

---

## 6. HD Form Helper (`public/src/js/libs/db_helper.js`)

**946 lines — Bidirectional DOM ↔ Data binding**
**Access**: `window.HD`

### Core Form API

```javascript
// Fill form from data object
HD.setFormData('#form-root', {
    customer_name: 'Nguyễn Văn A',
    start_date: '2026-05-25',
    adults: 2,
});
// Automatically finds [data-field="customer_name"], [data-field="start_date"], etc.

// Read form data from DOM
const data = HD.getFormData('#form-root', 'bookings');
// → { 'bk-new-001': { customer_name: '...', start_date: '...', ... } }

// Get only changed fields (efficient Firestore updates)
const changed = HD.filterUpdatedData('#form-root', document, true);

// Read table rows
const rows = HD.getTableData('#detail-tbody');
// → [{ booking_id: '...', service_type: '...', ... }, ...]

// Read single row
const row = HD.getRowData('booking_details', 'bd-001', '#detail-tbody');
```

### Data Transformation Pipeline

```javascript
// Filter (single or multi-condition)
HD.filter(data, 'bk-001', '==', 'booking_id');
HD.filters(data, [
    { field: 'status', op: '==', value: 'active' },
    { field: 'total_amount', op: '>', value: 1000000 }
], 'AND');

// Aggregate
HD.agg(data);           // Auto-detect monetary + quantity fields
HD.agg(data, 'total');  // Sum specific field

// Group
const grouped = HD.group(data, 'status');
// → { active: { 'bk-001': {...}, 'bk-002': {...} }, completed: {...} }

// Sort (number > date > string priority)
const sorted = HD.sort(data, 'start_date', 'desc');

// Join (O(1) foreign key lookup)
const enriched = HD.join(details, 'booking_id', APP_DATA.bookings, '_booking');

// Convert formats
HD.toArray(APP_DATA.bookings);           // Object → [{ id, ... }]
HD.toObject(arrayData, 'id');            // Array → { id: doc }
```

---

## 7. Utils (`public/src/js/libs/utils.js`)

**963 lines — Global utility functions**

### Quick Reference

```javascript
// DOM access
getE('my-element')              // document.getElementById passthrough
$('.my-class')                  // querySelector
$$('.my-class')                 // querySelectorAll as array

// Value read/write
getVal('#input-id')             // Read element value
setVal('#input-id', 'value')    // Write element value
setNum('#amount', 1500000)      // Write number → formatted display, raw in dataset.val
getNum('#amount')               // Parse formatted number → raw 1500000

// Multi-value
getVals(['#name', '#phone', '#email'])  // Batch read
setVals({ '#name': 'A', '#phone': '090' })  // Batch write

// Formatting
formatMoney(1500000)            // → '1.500.000'
formatDateVN(new Date())        // → '25/05/2026'
formatDateForInput(date, 'date') // → '2026-05-25'
formatPhone('0901234567')       // Clean phone number
formatNumber(1500)              // → '1.500'

// UI
setText('#el', 'Hello')         // Set textContent
setHTML('#el', '<b>Hi</b>')    // Set innerHTML
setDisplay('#el', true)         // Show (remove d-none)
setDisplay('#el', false)        // Hide (add d-none)
disable('#btn', true)           // Disable
setClass('#el', 'active', true) // Add class
fillSelect('#select-id', dataList, '-- Chọn --')

// Error
Opps(error)                     // Report error
L.log('message', data)         // Logger

// Natural date parsing
DateUtils.getDateRange('tháng 5')     // → { start, end }
DateUtils.getDateRange('quý 2')       // → { start, end }
DateUtils.getDateRange('tuần trước')  // → { start, end }
DateUtils.isDateInRange(date, range)  // → boolean
```

---

## 8. Operator Trigger Auto-Sync

Khi save `booking_details`, operator trigger tự động sync sang `operator_entries`:
- **Merge mode**: `merge: true` — chỉ ghi đè field chung (check_in, check_out, hotel_name, service_name, adults, children, ...)
- **Preserve**: Operator-only fields (supplier, operator_note, paid_amount, debt_balance) được giữ nguyên
- **Limitation**: Customer name không tự động sync từ booking → operator entry

---

## Related Files

- `erp-architecture.md` — Frontend module system, ATable
- `development-guide.md` — How to use helpers in practice
- `DBSchema.js` — Authoritative source for all collection schemas

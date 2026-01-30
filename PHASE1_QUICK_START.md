# 🛠️ PHASE 1 QUICK START GUIDE

**Target**: Complete Phase 1 in 3 weeks  
**Focus**: Build v2 from scratch (based on v1 features), remove array format, setup new services  
**Status**: Ready to start immediately

---

## ✅ V2 BUILD PRINCIPLES (IMPORTANT)

**Goal**: Build a new codebase in **public/v2** using v1 as the functional reference.

**Rules**:
1. **Do NOT edit v1** (public/src is read-only).  
2. **All new work goes to public/v2** (new HTML/CSS/JS).  
3. **Copy v1 files into v2 first**, then refactor inside v2 only.  
4. **Feature parity first**, optimization later.

---

## 📅 WEEK 1: Core Changes

### Day 1-2: Remove Array Format
**Objective**: Delete ALL array format code

#### Task 1.1: Create v2 db_manager.js (from v1) and remove array formats
```javascript
// File: public/v2/src/js/db_manager.js
// Step 1: Copy from public/src/js/db_manager.js
// Step 2: Remove array formats

// ❌ REMOVE THIS
window.APP_DATA = {
  bookings: [],              // DELETE
  operator_entries: [],      // DELETE
  customers: [],             // DELETE
  bookings_obj: [],
  operator_entries_obj: [],
  customers_obj: [],
};

// ✅ KEEP ONLY THIS
window.APP_DATA = {
  bookings_obj: [],
  operator_entries_obj: [],
  customers_obj: [],
  lists: { ... }
};
```

#### Task 1.2: Create DataTransformer.js
```javascript
// NEW FILE: public/v2/src/js/db_transformer.js
// Copy code from MODERNIZATION_STRATEGY.md Section 1.3
// Classes: DataTransformer with toBooking(), toOperatorEntry(), toCustomer()
```

#### Task 1.3: Create v2 utils.js (from v1) and remove format detection
```javascript
// File: public/v2/src/js/utils.js
// Step 1: Copy from public/src/js/utils.js
// Step 2: Remove format detection

// Search for: typeof x === 'object' && !Array.isArray(x)
// Replace with: // REMOVED - using object format only

// Result: Remove ~40 conditional checks
```

**Verification**:
```javascript
// In browser console:
console.log(window.APP_DATA.bookings_obj);  // Should have objects, not arrays
console.log(window.APP_DATA.bookings);       // Should be undefined or removed
```

---

### Day 3-4: Create DataTransformer Integration
**Objective**: Load ONLY object format from Firestore

#### Task 1.4: Update Firestore Loading (v2 db_manager.js)
```javascript
// In public/v2/src/js/db_manager.js, inside loadDataFromFirebase():

const bookingsSnapshot = await db.collection('bookings').get();
window.APP_DATA.bookings_obj = bookingsSnapshot.docs
  .map(doc => {
    const data = doc.data();
    data.id = doc.id;  // Ensure ID is set
    return DataTransformer.toBooking(data);
  });

// RESULT: Only object format in memory
```

#### Task 1.5: Test Data Loading (v2)
```javascript
// In browser console:
await loadDataFromFirebase();
console.log(APP_DATA.bookings_obj[0]);  // Should be object:
// {id: 'BK001', customer_name: 'Nguyễn A', phone: '0909...', ...}
```

**Verification Checklist**:
- [ ] APP_DATA.bookings_obj has objects (not arrays)
- [ ] Each booking has id, customer_name, customer_phone, start_date, etc.
- [ ] No APP_DATA.bookings (array format)
- [ ] No format detection code remaining

---

### Day 5: Verify All Operations
**Objective**: Test form load, save, calculations with object format

#### Task 1.6: Test Booking Load (v2)
```javascript
// In browser console:
const booking = APP_DATA.bookings_obj[0];
console.log(booking.customer_name);    // Should work
console.log(booking.customer_phone);   // Should work
// ❌ Should NOT work: booking[2], booking[3]
```

#### Task 1.7: Test Form Population
```javascript
// Load a booking in form:
// 1. Click a booking in grid
// 2. Form should populate correctly
// 3. Check DevTools: all fields should have values
// 4. No console errors
```

**Verification**:
- [ ] Booking form loads without errors
- [ ] All fields populate correctly
- [ ] Calculations work
- [ ] No "Cannot read property 'X' of undefined" errors

---

## 📅 WEEK 2: New Services

### Day 1-3: Create StoreService
**Objective**: Centralized state management with Pub/Sub

#### Task 2.1: Create StoreService.js
```javascript
// NEW FILE: public/v2/src/js/services/StoreService.js
// Copy code from MODERNIZATION_STRATEGY.md Section 2.1
// Class: StoreService with subscribe(), setState(), getState()
```

#### Task 2.2: Initialize in v2 main.js
```javascript
// In public/v2/src/index.html (script order):
<script src="js/services/StoreService.js"></script>
<script src="js/services/AuditService.js"></script>

// Then in public/v2/src/js/main.js (DOMContentLoaded):
window.Store = new StoreService();
```

#### Task 2.3: Test State Management
```javascript
// In browser console:
Store.setState('bookings', APP_DATA.bookings_obj);
Store.subscribe('bookings', (newVal) => {
  console.log('Bookings changed!', newVal);
});
Store.setState('bookings', newData);  // Should trigger callback
```

---

### Day 4: Create MatrixAdapter
**Objective**: Handle complex hotel/service matrix data

#### Task 2.4: Create MatrixAdapter.js
```javascript
// NEW FILE: public/v2/src/js/services/MatrixAdapter.js
// Copy code from MODERNIZATION_STRATEGY.md Section 2.2
// Methods: getRoomTypes(), getServicesByType(), buildLocationOptions()
```

#### Task 2.5: Integrate with Dropdowns (v2 logic_operator.js)
```javascript
// In public/v2/src/js/logic_operator.js, updateLocationList():
// OLD:
const hotels = APP_DATA.lists.hotelMatrix.map(r => r[0]);

// NEW:
const hotels = MatrixAdapter.buildLocationOptions('Phòng', APP_DATA.lists);
```

---

### Day 5: Create AuditService
**Objective**: Logging and audit trail

#### Task 2.6: Create AuditService.js
```javascript
// NEW FILE: public/v2/src/js/services/AuditService.js
// Copy code from MODERNIZATION_STRATEGY.md Section 2.3
// Methods: logDataChange(), logAction(), queryAuditLog()
```

#### Task 2.7: Integrate Logging
```javascript
// When saving a booking:
const oldData = DB.findBooking(id);
// ... make changes ...
AuditService.logDataChange('bookings', id, 'customer_name', oldData.customer_name, newData.customer_name);
```

**Verification**:
- [ ] StoreService created and initialized
- [ ] MatrixAdapter working (test getRoomTypes())
- [ ] AuditService created and logging events
- [ ] No console errors

---

## 📅 WEEK 3: Mobile-First HTML

### Day 1-3: Restructure HTML
**Objective**: Mobile-first HTML structure

#### Task 3.1: Backup v2 index.html
```bash
cp public/v2/src/index.html public/v2/src/index.html.bak
```

#### Task 3.2: Create New Structure
```html
<!-- NEW: public/v2/src/index.html -->
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- Reference: MODERNIZATION_STRATEGY.md Section 3.1 -->
</head>
<body class="mobile-first">
  <!-- Header, Navigation, Main content, Footer -->
</body>
</html>
```

#### Task 3.3: Update Script Loading
```html
<!-- Load new services first -->
<script src="js/services/StoreService.js"></script>
<script src="js/services/MatrixAdapter.js"></script>
<script src="js/services/AuditService.js"></script>

<!-- Then legacy scripts (gradually remove) -->
<script src="js/utils.js"></script>
<script src="js/main.js"></script>
```

---

### Day 4-5: Create Mobile CSS
**Objective**: Mobile-first responsive styles

#### Task 3.4: Create mobile.css
```css
/* NEW FILE: public/v2/src/css/mobile.css */
/* Copy code from MODERNIZATION_STRATEGY.md */
/* Styles for 375px+ screens (base) */
```

#### Task 3.5: Create tablet.css & desktop.css
```css
/* NEW FILE: public/v2/src/css/tablet.css */
/* NEW FILE: public/v2/src/css/desktop.css */
/* Progressive enhancement styles */
```

#### Task 3.6: Link CSS in HTML
```html
<link rel="stylesheet" href="css/mobile.css">
<link rel="stylesheet" href="css/tablet.css" media="(min-width: 768px)">
<link rel="stylesheet" href="css/desktop.css" media="(min-width: 1024px)">
```

---

### Day 6: Create Mobile Navigation
**Objective**: Mobile-responsive navigation

#### Task 3.7: Create MobileNavController.js
```javascript
// NEW FILE: public/v2/src/js/controllers/MobileNavController.js
// Copy code from MODERNIZATION_STRATEGY.md Section 3.2
// Methods: toggleDrawer(), switchTab(), nextStep(), previousStep()
```

---

### Day 7: Test Responsive Design
**Objective**: Verify mobile-first on all devices

#### Task 3.8: Test Breakpoints
```
1. Mobile (375px - Chrome DevTools)
   - Header visible
   - Navigation drawer works
   - Sticky buttons visible
   
2. Tablet (768px)
   - Sidebar visible
   - 2-column layout
   
3. Desktop (1024px+)
   - Full layout with sidebar
   - Tables displayed normally
```

**Verification**:
- [ ] App loads on mobile
- [ ] Navigation drawer toggle works
- [ ] Forms stack vertically on mobile
- [ ] Multi-step forms work
- [ ] All layouts responsive
- [ ] No horizontal scroll on mobile
- [ ] No console errors

---

## ✅ WEEK 1-3 CHECKLIST

### Technical Deliverables
- [ ] DataTransformer.js created and working
- [ ] db_manager.js updated (object format ONLY)
- [ ] All array format code removed (0%)
- [ ] StoreService.js created and initialized
- [ ] MatrixAdapter.js created and working
- [ ] AuditService.js created and logging
- [ ] Mobile-first HTML structure
- [ ] mobile.css, tablet.css, desktop.css created
- [ ] MobileNavController.js working
- [ ] All services linked in index.html

### Testing
- [ ] Load bookings from Firestore (object only)
- [ ] Form populate/save works
- [ ] Calculations still work
- [ ] State management works (Store.setState/subscribe)
- [ ] Audit logging works
- [ ] Mobile layout responsive
- [ ] No console errors

### Code Quality
- [ ] No array format detection code
- [ ] All services have JSDoc comments
- [ ] Services are pure (no DOM dependencies)
- [ ] Mobile CSS follows best practices
- [ ] No duplicate code
- [ ] ESLint passes

---

## 🚨 COMMON PITFALLS

### ❌ Pitfall 1: Keeping Array Format Code
**Problem**: Leaving old array detection code
**Solution**: Do full search and replace
```bash
grep -r "\\[0\\]\\|\\[2\\]\\|\\[3\\]" public/v2/src/js/
```

### ❌ Pitfall 2: Not Updating All Collections
**Problem**: Only updating bookings, missing operator_entries
**Solution**: Update all in db_manager.js:
- bookings → bookings_obj
- operator_entries → operator_entries_obj
- customers → customers_obj

### ❌ Pitfall 3: Services Not Initialized
**Problem**: StoreService not created before use
**Solution**: Put `<script src="services/StoreService.js"></script>` FIRST

### ❌ Pitfall 4: Mobile CSS Not Loaded
**Problem**: Mobile styles not applied
**Solution**: Link all 3 CSS files in correct order

### ❌ Pitfall 5: Calculation Logic Still in HTML
**Problem**: Still using inline calculations
**Solution**: Move all to CalculationService

---

## 📞 NEED HELP?

1. **Error**: "Cannot read property 'customer_name' of undefined"
   - Check: Is data in object format or array format?
   - Solution: Verify DataTransformer is being used

2. **Error**: "Store is not defined"
   - Check: Is StoreService.js loaded before utils.js?
   - Solution: Check script load order in HTML

3. **Error**: "MatrixAdapter is not defined"
   - Check: Is MatrixAdapter.js loaded?
   - Solution: Add script tag before using

4. **Layout Issue**: Mobile view broken
   - Check: Is mobile.css being loaded?
   - Solution: Verify media queries in CSS

---

## 🎯 SUCCESS CRITERIA

When Week 3 is complete:

✅ Application works with OBJECT FORMAT ONLY (no arrays)  
✅ All new services created and integrated  
✅ Mobile-first HTML structure in place  
✅ Responsive design working on all devices  
✅ Audit trail logging all changes  
✅ Zero console errors  
✅ All tests passing  
✅ Ready for Phase 2

---

**Start**: As soon as possible  
**Duration**: 3 weeks  
**Team**: 1-2 developers  
**Next**: Phase 2 (Service layer + CalculationService)

🚀 **Let's modernize this codebase!**


# Transaction Rewrite - Issues & Fixes

## 2025-05-23: Broken `tmpl-operator-payment` template handlers — FIXED

**Problem**: Static template `tmpl-operator-payment` in `tpl_operator.html` (lines 367-368) used:
- `Op.Supplier.handlePayAll()`
- `Op.Supplier.handleUpdateSync()`

The alias chain `Op.Supplier` → `SupplierPayment` → `OperatorController` resolves to the class, but `handlePayAll` and `handleUpdateSync` are nested inside `OperatorController.DB`.

**Fix**: Changed onclick handlers to `OperatorController.DB.handlePayAll()` and `OperatorController.DB.handleUpdateSync()`, matching the dynamically-rendered buttons at lines 139-140.

**Impact**: Minimal — this template is never loaded by any JavaScript code. The fix is defensive; prevents runtime errors if template is used in the future.

**Verification**: Build passes (92 modules, 2.77s). All button handler chains now resolve correctly.

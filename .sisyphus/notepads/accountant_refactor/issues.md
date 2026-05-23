# Accountant Refactor — Issues & Blockers

## Active Issues
1. **Opps() calls remaining** (4 occurrences in controller_accountant.js)
   - Line ~447: `Opps('Lỗi chốt số dư: ' + error.message)`
   - Line ~1312: `Opps(...)` in handleSaveTransaction
   - Line ~1363: `Opps('❌ Lỗi: ' + e.message)`
   - Line ~1563: `Opps('Lỗi mở báo cáo: ' + e.message)`
   - **Impact**: Violates guardrail #7 (no alert/confirm/Opps)
   - **Fix**: Replace with `logA(msg, 'error', 'toast')`

2. **Fund Transfer not implemented**
   - No fund transfer UI or logic exists
   - Need: "Chuyển quỹ" button, modal with source/target fund + amount, create 2 linked transactions

## Resolved Issues
- Phase 1 bugs: All fixed
- Phase 2 architecture: All aligned
- Duplicate helpers: Removed
- Direct Firestore access: Replaced with DBManager

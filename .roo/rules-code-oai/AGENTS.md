# Code Mode Rules (Non-Obvious Only)

- **Utility First**: Never use `document.getElementById` directly; use `getE(id)` or `$(id)` or `$$(selector)` instead.
- **Value Handling**:
  - Use `getVal(id)` / `setVal(id, val)` for general inputs.
  - Use `getNum(id)` / `setNum(id, val)` for currency/numeric fields to handle formatting automatically.
  - Use Object `HD` for complex data transformations (e.g., `HD.agg(data, 'total_sale')`, `HD.filter(data, ['customer_phone', '==', '0987654321'])`).
  - Phone numbers must be cleaned via `formatPhone()` before DB storage.
- **Firestore Schema**: Before adding fields, check `DBSchema.js`. Follow the `index`, `name`, `type` pattern and always use class `DBManager` for CRUD operations by global proxy `A.DB` - example Always Use `A.DB.generateIds` to generate IDs for new records.
- **UI Handle**: Use class `UI_RENDERER` by global proxy `A.UI` for UI rendering (eg. `A.UI.renderForm(collection, id, data, opts)` or `A.UI.createTable(containerId, opts)`).
- **Bulk Edits**: When modifying a large file/ block, create list of functions/const name to double check after edit. Make sure never lost any data.
- **Safety**: Always use `try-catch` in event handlers and async calls.

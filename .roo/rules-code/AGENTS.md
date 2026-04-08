# Code Mode Rules (Non-Obvious Only)

- **Utility First**: Never use `document.getElementById` directly; use `getE(id)` or `$(id)` or `$$(selector)` instead.
- **Value Handling**:
  - Use `getVal(id)` / `setVal(id, val)` for general inputs.
  - Use `getNum(id)` / `setNum(id, val)` for currency/numeric fields to handle formatting automatically.
  - Use Object `HD` for complex data transformations (e.g., `HD.agg(data, 'total_sale')`).
  - Phone numbers must be cleaned via `formatPhone()` before DB storage.
- **Firestore Schema**: Before adding fields, check `DBSchema.js`. Follow the `index`, `name`, `type` pattern and always use `DBManager.js` for CRUD operations.
- **Role Dispatch**: If a feature behaves differently for Sale vs Admin, use `runFnByRole`.
- **Template Management**: Use `toggleTemplate` for complex UI sections that need to be swapped without re-rendering from strings.
- **Bulk Edits**: When modifying a file, rewrite the entire file or large blocks to maintain consistency and save tokens.
- **Safety**: Always use `try-catch` in event handlers and async calls.
# Architect Mode Rules (Non-Obvious Only)

- **No Frameworks**: Architectural decisions must stay within Vanilla JS and Bootstrap 5.
- **Schema-Driven UI**: New modules should be defined in `DBSchema.js` first to leverage dynamic rendering.
- **State Management**: Use `APP_DATA` or global objects; avoid complex state libraries.
- **Database**: Firestore is the primary DB and IndexedDB for local caching.
- **Code Modularity**: Use `DBManager.js` to handle CRUD operations and `EventManager.js` for event handling and `UI_RENDERER.js` for UI rendering.
- **UI Rendering**: Use `UIManager.js` for UI rendering. `ATable.js` is the main component for render tables; `ASelect.js` is the main component for render select tag elements; `A.Modal` is global proxy for Bootstrap Modals handle.
- **Performance**: Arrange main goal to seperate task and optimize for performance step by step.

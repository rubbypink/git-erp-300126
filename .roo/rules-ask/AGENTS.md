# Ask Mode Rules (Non-Obvious Only)

- **Core Logic**: `public/src/js/libs/utils.js` is the "Helper" file for all JS logic.
- **UI Rendering**: `public/src/js/modules/core/UIManager.js` handles UI rendering.
- **Event Handling**: `public/src/js/modules/core/EventManager.js` handles event delegation.
- **Data Structure**: `public/src/js/modules/db/DBSchema.js` defines the entire ERP data model.
- **Entry Point**: `public/src/js/modules/core/app.js` (or equivalent) initializes the system.
- **Library Loading**: Heavy libs (XLSX, jsPDF) are NOT in `index.html` but loaded via `loadLibraryAsync`.
- **Data Flow**: Frontend CRUD operations -> Firestore -> IndexedDB -> Frontend (APP_DATA will be cleared to save RAM) via DBManager.

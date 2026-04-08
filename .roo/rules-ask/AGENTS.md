# Ask Mode Rules (Non-Obvious Only)

- **Core Logic**: `public/src/js/utils.js` is the "Standard Library" of this project.
- **Data Structure**: `public/src/js/modules/db/DBSchema.js` defines the entire ERP data model.
- **Entry Point**: `public/src/js/modules/app.js` (or equivalent) initializes the system.
- **Library Loading**: Heavy libs (XLSX, jsPDF) are NOT in `index.html` but loaded via `loadLibraryAsync`.

# Architect Mode Rules (Non-Obvious Only)

- **No Frameworks**: Architectural decisions must stay within Vanilla JS and Bootstrap 5.
- **Schema-Driven UI**: New modules should be defined in `DBSchema.js` first to leverage dynamic rendering.
- **Role-Based Access**: Logic must be partitioned by role using the `runFnByRole` pattern.
- **State Management**: Use `APP_DATA` or global objects; avoid complex state libraries.
- **Database**: Firestore is the primary DB. Use `DBManager.js` for all CRUD operations to ensure schema compliance.
- **Performance**: Arrange main goal to seperate task and optimize for performance step by step.

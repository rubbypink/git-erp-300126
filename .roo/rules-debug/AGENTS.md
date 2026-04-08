# Debug Mode Rules (Non-Obvious Only)

- **Blackbox Logs**: Check `localStorage` keys starting with `app_sys_log_` or use `L.showUI()` in console to view system logs.
- **Error Context**: `Opps()` logs full stack traces to the internal log system even if the UI alert is simple.
- **Emulator**: Use `npm run emulator` to debug Firestore rules and Cloud Functions locally.
- **Network/API**: Check `functions/api/` for backend logic if frontend calls fail.
- **Data Integrity**: Verify `dataset.val` on `.number` elements if UI values look correct but logic fails.
- **Data Types Error**: Focus on type (Object or Array) - the top error of this system.

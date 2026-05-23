# Wave 1: Foundation — GenerateTransId System

## Design Notes

### API Contract
- `DBManager.generateTransIds(type, count)` → `Promise<string[]>`
  - type: 'IN' | 'OUT'
  - count: number (default 1)
  - Returns array of sequential IDs: ['PT-1'] or ['PC-1', 'PC-2']
  - Uses Firestore runTransaction for atomic counter increment
  - Counter doc: `counters_id/transactions` with fields `{ last_pt: number, last_pc: number }`
  
- `HD.generateTransId(type, count = 1)` → `Promise<string>` or `Promise<string[]>`
  - Thin wrapper around `A.DB.generateTransIds(type, count)`
  - If count=1, returns single string (not array) for convenience
  - If count>1, returns array

### Implementation Details
- Counter document path: `counters_id/transactions`
- Fields: `last_pt` (highest PT number used), `last_pc` (highest PC number used)
- Atomic increment via `runTransaction`: read doc → increment counter → return IDs
- If doc doesn't exist, create with `{ last_pt: 0, last_pc: 0 }` within the same transaction
- Format: `PT-${number}` or `PC-${number}` (e.g., PT-1, PC-1)

### Files Modified
- `public/src/js/modules/db/DBManager.js` — add `generateTransIds` method
- `public/src/js/libs/db_helper.js` — add `HD.generateTransId` method

## Execution Log

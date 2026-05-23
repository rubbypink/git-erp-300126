#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * migrate-transaction-ids.js
 *
 * Normalize transaction IDs to PT-/PC- sequential format.
 *
 * DETECTED ID FORMAT (from codebase analysis):
 *   PT-{N}  → Phiếu thu  (type === "IN")
 *   PC-{N}  → Phiếu chi  (type === "OUT")
 *   PENDING → defaults to PT- prefix (no existing code, assigned as PT for safety)
 *
 *   Where N is a sequential integer stored in `counters_id/transactions` doc
 *   (fields: `last_pt` for IN, `last_pc` for OUT).
 *
 *   Ref: DBManager.generateTransIds() at
 *     public/src/js/modules/db/DBManager.js (line 3097)
 *
 * ⚠️ NOTE: The user expected PT-YYMMDD-XXX format, but the actual codebase
 *    generates simple sequential IDs (PT-1, PT-2, ...). This script follows
 *    the ACTUAL codebase pattern, not the guessed format.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Usage:
 *   node scripts/migrate-transaction-ids.js
 *   node scripts/migrate-transaction-ids.js --dry-run
 *   node scripts/migrate-transaction-ids.js --collection transactions_thenice
 *
 * Options:
 *   --collection   Collection name (default: "transactions")
 *   --dry-run      Preview changes without writing to Firestore
 *   --help         Show this help message
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ────────────────────────────────────────────────────────────────────────────
// 1. PARSE ARGS
// ────────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const FLAGS = {
  collection: "transactions",
  dryRun: false,
  help: false,
};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--collection":
      FLAGS.collection = args[++i] || "transactions";
      break;
    case "--dry-run":
    case "--dryRun":
      FLAGS.dryRun = true;
      break;
    case "--help":
    case "-h":
      FLAGS.help = true;
      break;
  }
}

if (FLAGS.help) {
  console.log(`
  migrate-transaction-ids.js

  Normalize transaction IDs to PT-/PC- sequential format.

  Usage:
    node scripts/migrate-transaction-ids.js [options]

  Options:
    --collection   Collection to migrate (default: "transactions")
                   Use "transactions_thenice" for The Nice company
    --dry-run      Preview changes without writing to Firestore
    --help         Show this help message

  Examples:
    node scripts/migrate-transaction-ids.js --dry-run
    node scripts/migrate-transaction-ids.js
    node scripts/migrate-transaction-ids.js --collection transactions_thenice
  `);
  process.exit(0);
}

// ────────────────────────────────────────────────────────────────────────────
// 2. IMPORTS
// ────────────────────────────────────────────────────────────────────────────
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// ────────────────────────────────────────────────────────────────────────────
// 3. INIT FIREBASE ADMIN
// ────────────────────────────────────────────────────────────────────────────
function initFirebaseAdmin() {
  const apps = getApps();
  if (!apps.length) {
    console.log("🔑 Initializing Firebase Admin SDK...");
    return initializeApp();
  }
  return apps[0];
}

const app = initFirebaseAdmin();
const db = getFirestore(app);

// ────────────────────────────────────────────────────────────────────────────
// 4. HELPERS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Determine the prefix for a new transaction ID based on type.
 * @param {string} type - "IN", "OUT", or "PENDING"
 * @returns {"PT"|"PC"}
 */
function getPrefix(type) {
  if (type === "IN") return "PT";
  if (type === "OUT") return "PC";
  // PENDING or unknown: default to PT (receipt-like)
  console.warn("  ⚠️  Unknown type \"" + type + "\", defaulting to PT- prefix");
  return "PT";
}

/**
 * Read the current counter values for transactions.
 * @returns {Promise<{last_pt: number, last_pc: number}>}
 */
async function readCounter() {
  const counterRef = db.collection("counters_id").doc("transactions");
  const snap = await counterRef.get();
  if (snap.exists) {
    const data = snap.data();
    return {
      last_pt: Number(data.last_pt) || 0,
      last_pc: Number(data.last_pc) || 0,
    };
  }
  return { last_pt: 0, last_pc: 0 };
}

/**
 * Generate new IDs for a batch of transactions sorted by date.
 * Maintains interleaved PT/PC counter across all docs in sorted order.
 *
 * @param {Array<object>} docs - Array of { id, transaction_date, type, ... }
 * @param {{last_pt: number, last_pc: number}} counter - Current counter values
 * @returns {{docs: Array, last_pt: number, last_pc: number}}
 */
function generateIds(docs, counter) {
  let { last_pt, last_pc } = counter;
  const results = [];

  for (const doc of docs) {
    const type = doc.type || "PENDING";
    const prefix = getPrefix(type);

    let newNo;
    if (prefix === "PT") {
      last_pt += 1;
      newNo = last_pt;
    } else {
      last_pc += 1;
      newNo = last_pc;
    }

    const newId = prefix + "-" + newNo;
    results.push({ ...doc, newId });
  }

  return { docs: results, last_pt, last_pc };
}

/**
 * Parse transaction_date safely (supports string, Timestamp, Date, or undefined).
 * Returns an epoch millis for sorting; Infinity if absent.
 */
function parseDateSortKey(doc) {
  const val = doc.transaction_date;
  if (!val) return Infinity;
  if (typeof val === "string") return new Date(val).getTime();
  if (typeof val.toDate === "function") return val.toDate().getTime(); // Firestore Timestamp
  if (val instanceof Date) return val.getTime();
  if (typeof val === "number") return val;
  return Infinity;
}

// ────────────────────────────────────────────────────────────────────────────
// 5. MAIN
// ────────────────────────────────────────────────────────────────────────────
async function main() {
  const COLLECTION = FLAGS.collection;
  const DRY_RUN = FLAGS.dryRun;

  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║   MIGRATE TRANSACTION IDs TO PT-/PC- FORMAT                ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("  Collection : " + COLLECTION);
  console.log("  Mode       : " + (DRY_RUN ? "🔍 DRY RUN (no writes)" : "🚀 LIVE"));
  console.log("");

  // ── 5a. Fetch all docs ──────────────────────────────────────────────────
  console.log("  📥 Fetching all docs from \"" + COLLECTION + "\"...");
  const snapshot = await db.collection(COLLECTION).get();

  if (snapshot.empty) {
    console.log("  📭 Collection is empty. Nothing to do.");
    console.log("");
    return;
  }

  const allDocs = snapshot.docs.map((doc) => ({ ref: doc.ref, ...doc.data() }));
  console.log("  📊 Total docs found: " + allDocs.length);

  // ── 5b. Filter docs that need migration ─────────────────────────────────
  const migrateCandidates = allDocs.filter((doc) => {
    const id = String(doc.id || "");
    return !id.startsWith("PT-") && !id.startsWith("PC-");
  });

  const alreadyCompliant = allDocs.length - migrateCandidates.length;
  console.log("  ✅ Already PT-/PC- compliant: " + alreadyCompliant);
  console.log("  🔧 Need migration          : " + migrateCandidates.length);

  if (migrateCandidates.length === 0) {
    console.log("  ✅ All documents already have valid PT-/PC- IDs. Nothing to do.");
    console.log("");
    return;
  }

  // ── 5c. Sort by transaction_date ───────────────────────────────────────
  migrateCandidates.sort((a, b) => {
    const aKey = parseDateSortKey(a);
    const bKey = parseDateSortKey(b);
    return aKey - bKey;
  });

  // Show the date range
  const oldest = migrateCandidates[0];
  const newest = migrateCandidates[migrateCandidates.length - 1];
  console.log("  🗓️  Date range: " + (oldest.transaction_date || "??") + " → " + (newest.transaction_date || "??"));

  // ── 5d. Read counter & generate IDs ────────────────────────────────────
  console.log("  🔢 Reading counter from counters_id/transactions...");
  const counter = await readCounter();
  console.log("     last_pt: " + counter.last_pt + ", last_pc: " + counter.last_pc);

  const { docs: newDocs, last_pt, last_pc } = generateIds(migrateCandidates, counter);
  const counterDelta = { last_pt_delta: last_pt - counter.last_pt, last_pc_delta: last_pc - counter.last_pc };
  console.log("     New last_pt: " + last_pt + " (+" + counterDelta.last_pt_delta + ")");
  console.log("     New last_pc: " + last_pc + " (+" + counterDelta.last_pc_delta + ")");

  // ── 5e. Preview ────────────────────────────────────────────────────────
  console.log("");
  console.log("  ┌─────────┬──────────┬──────────────────────┬──────────────┐");
  console.log("  │ OLD ID  │ TYPE     │ DATE                 │ NEW ID       │");
  console.log("  ├─────────┼──────────┼──────────────────────┼──────────────┤");

  for (const doc of newDocs) {
    const dateStr = doc.transaction_date
      ? String(doc.transaction_date).substring(0, 19)
      : "??";
    console.log(
      "  │ " + String(doc.id).padEnd(7) +
      " │ " + String(doc.type || "?").padEnd(8) +
      " │ " + dateStr.padEnd(20) +
      " │ " + doc.newId.padEnd(12) + " │"
    );
  }
  console.log("  └─────────┴──────────┴──────────────────────┴──────────────┘");
  console.log("  Total: " + newDocs.length + " docs will be migrated");

  if (DRY_RUN) {
    console.log("");
    console.log("  🔍 DRY RUN completed. No changes written to Firestore.");
    console.log("  Run without --dry-run to execute the migration.");
    console.log("");
    return;
  }

  // ── 5f. Atomic batch write ─────────────────────────────────────────────
  // Each doc = 2 ops (set new + delete old). Batch max = 500 ops → 250 docs/batch.
  const BATCH_LIMIT = 250;
  const totalBatches = Math.ceil(newDocs.length / BATCH_LIMIT);

  console.log("");
  console.log("  💾 Writing " + newDocs.length + " docs in " + totalBatches + " batch(es)...");

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const start = batchIdx * BATCH_LIMIT;
    const end = Math.min(start + BATCH_LIMIT, newDocs.length);
    const batchDocs = newDocs.slice(start, end);

    const batch = db.batch();

    for (const doc of batchDocs) {
      // Build the new document data: remove `id`, add `old_id`
      const newData = { ...doc };
      delete newData.ref; // remove Firestore document reference
      delete newData.id;  // remove old id field
      delete newData.newId; // remove temporary field

      // Preserve any existing old_id (unlikely, but be safe)
      if (!doc.old_id) {
        newData.old_id = String(doc.id);
      }
      
      // Set the new id field matching docId
      newData.id = String(doc.newId);

      // New doc reference with the new ID
      const newDocRef = db.collection(COLLECTION).doc(doc.newId);
      batch.set(newDocRef, newData);

      // Delete the old document
      batch.delete(doc.ref);
    }

    await batch.commit();
    console.log("     ✅ Batch " + (batchIdx + 1) + "/" + totalBatches + " committed (docs " + (start + 1) + "\u2013" + end + ")");
  }

  // ── 5g. Update counter ─────────────────────────────────────────────────
  console.log("  🔢 Updating counter in counters_id/transactions...");

  const counterRef = db.collection("counters_id").doc("transactions");
  const counterSnap = await counterRef.get();
  const counterUpdate = {};

  if (counterDelta.last_pt_delta > 0 || counterDelta.last_pc_delta > 0) {
    if (counterDelta.last_pt_delta > 0) counterUpdate.last_pt = last_pt;
    if (counterDelta.last_pc_delta > 0) counterUpdate.last_pc = last_pc;

    if (counterSnap.exists) {
      await counterRef.update(counterUpdate);
    } else {
      // Create the counter doc if it doesn't exist (shouldn't happen, but be safe)
      counterUpdate.last_pt = counterUpdate.last_pt || 0;
      counterUpdate.last_pc = counterUpdate.last_pc || 0;
      await counterRef.set(counterUpdate);
    }
    console.log("     ✅ Counter updated: " + JSON.stringify(counterUpdate));
  } else {
    console.log("     ⏭️  No counter changes needed");
  }

  // ── 5h. Summary ────────────────────────────────────────────────────────
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║   ✅ MIGRATION COMPLETE                                     ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("  Collection  : " + COLLECTION);
  console.log("  Migrated    : " + newDocs.length + " docs");
  console.log("  Already OK  : " + alreadyCompliant + " docs");
  console.log("  PT counter  : " + counter.last_pt + " → " + last_pt);
  console.log("  PC counter  : " + counter.last_pc + " → " + last_pc);
  console.log("  Batches     : " + totalBatches);

  // Warn about sync side effects
  if (newDocs.length > 0) {
    console.log("");
    console.log("  ⚠️  NOTE: This migration only changes IDs in the collection.");
    console.log("     If these transactions are referenced elsewhere (e.g.,");
    console.log("     fund_accounts, booking_history, notifications), those");
    console.log("     references will need manual updates.");
    console.log("     The transaction-sync service triggers on Firestore writes,");
    console.log("     so fund_account balances may be affected.");
  }

  console.log("");
}

// ────────────────────────────────────────────────────────────────────────────
// 6. RUN
// ────────────────────────────────────────────────────────────────────────────
main().catch((err) => {
  console.error("");
  console.error("╔══════════════════════════════════════════════════════════════╗");
  console.error("║   ❌ MIGRATION FAILED                                      ║");
  console.error("╚══════════════════════════════════════════════════════════════╝");
  console.error("");
  console.error(err);
  process.exit(1);
});

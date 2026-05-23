const admin = require('firebase-admin');

// Initialize Firebase Admin (assuming you run this where default credentials work, or replace with serviceAccount)
const serviceAccount = require('./functions/keys/sa.json'); // Adjust path to your service account key if needed
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function run() {
    try {
        console.log('Fetching all transactions...');
        const snapshot = await db.collection('transactions').get();
        
        const docsToUpdate = [];
        const existingIds = new Set();
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const id = doc.id;
            
            if (!id.startsWith('PT-') && !id.startsWith('PC-')) {
                docsToUpdate.push({ id: doc.id, data: data });
            } else {
                existingIds.add(id);
            }
        });
        
        console.log(`Found ${docsToUpdate.length} documents to update out of ${snapshot.size} total.`);
        
        if (docsToUpdate.length === 0) {
            console.log('No documents need updating. Exiting.');
            return;
        }

        // Sort by transaction_date ascending
        docsToUpdate.sort((a, b) => {
            const dateA = new Date(a.data.transaction_date || a.data.created_at || 0);
            const dateB = new Date(b.data.transaction_date || b.data.created_at || 0);
            return dateA - dateB;
        });

        const batch = db.batch();
        const maxCounts = {}; // Track maximum sequence number for each prefix e.g., 'PT-240523'
        
        // Find existing max counts
        for (const id of existingIds) {
            const parts = id.split('-');
            if (parts.length === 3) {
                const prefix = `${parts[0]}-${parts[1]}`;
                const seq = parseInt(parts[2], 10);
                if (!isNaN(seq)) {
                    if (!maxCounts[prefix] || seq > maxCounts[prefix]) {
                        maxCounts[prefix] = seq;
                    }
                }
            }
        }

        for (const doc of docsToUpdate) {
            const { id: oldId, data } = doc;
            
            // Extract date info
            let txDate = data.transaction_date || data.created_at;
            let dateObj = txDate ? new Date(txDate) : new Date();
            if (isNaN(dateObj.getTime())) dateObj = new Date(); // fallback
            
            const yy = String(dateObj.getFullYear()).slice(-2);
            const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
            const dd = String(dateObj.getDate()).padStart(2, '0');
            const dateStr = `${yy}${mm}${dd}`;
            
            const prefixType = data.type === 'OUT' ? 'PC' : 'PT';
            const prefix = `${prefixType}-${dateStr}`;
            
            if (!maxCounts[prefix]) {
                maxCounts[prefix] = 0;
            }
            maxCounts[prefix]++;
            
            const seq = String(maxCounts[prefix]).padStart(3, '0');
            const newId = `${prefix}-${seq}`;
            
            // Create new doc data
            const newData = { ...data };
            newData.id = newId;
            newData.old_id = oldId;
            
            // Add to batch: Delete old, set new
            const oldRef = db.collection('transactions').doc(oldId);
            const newRef = db.collection('transactions').doc(newId);
            
            batch.delete(oldRef);
            batch.set(newRef, newData);
            
            console.log(`Mapping ${oldId} -> ${newId}`);
        }
        
        console.log('Committing batch...');
        await batch.commit();
        console.log('Batch commit successful!');
        
    } catch (error) {
        console.error('Error during execution:', error);
    }
}

run();

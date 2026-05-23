const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function run() {
    console.log('Fetching transactions...');
    try {
        const snapshot = await db.collection('transactions').get();
        const docsToUpdate = [];
        const existingIds = new Set();
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const id = doc.id;
            if (!id.startsWith('PT-') && !id.startsWith('PC-')) {
                docsToUpdate.push({ id: doc.id, ref: doc.ref, data: data });
            } else {
                existingIds.add(id);
            }
        });
        
        if (docsToUpdate.length === 0) {
            console.log('No documents need updating.');
            return;
        }

        // B3: sắp xếp theo transaction_date
        docsToUpdate.sort((a, b) => {
            const dateA = new Date(a.data.transaction_date || a.data.created_at || 0).getTime();
            const dateB = new Date(b.data.transaction_date || b.data.created_at || 0).getTime();
            return dateA - dateB;
        });

        // Generate IDs
        let counterPT = 0;
        let counterPC = 0;
        
        const counterRef = db.collection('counters_id').doc('transactions');
        const counterSnap = await counterRef.get();
        if (counterSnap.exists) {
            counterPT = counterSnap.data().last_pt || 0;
            counterPC = counterSnap.data().last_pc || 0;
        }

        const newDocs = docsToUpdate.map(doc => {
            const isOut = doc.data.type === 'OUT';
            const prefix = isOut ? 'PC' : 'PT';
            let seq = 0;
            if (isOut) {
                counterPC++;
                seq = counterPC;
            } else {
                counterPT++;
                seq = counterPT;
            }
            const newId = `${prefix}-${seq}`;
            return { ...doc, newId };
        });

        console.log(`Starting atomic update for ${newDocs.length} documents...`);
        
        // B4: chạy dạng atomic transaction
        await db.runTransaction(async (transaction) => {
            for (const doc of newDocs) {
                const newData = { ...doc.data };
                newData.old_id = doc.id;
                newData.id = doc.newId;
                
                const newRef = db.collection('transactions').doc(doc.newId);
                
                // Add to transaction: Delete old, set new
                transaction.delete(doc.ref);
                transaction.set(newRef, newData);
            }
            
            // Cập nhật counter
            transaction.set(counterRef, {
                last_pt: counterPT,
                last_pc: counterPC
            }, { merge: true });
        });
        
        console.log('Atomic transaction successful! All documents updated and old documents deleted.');

    } catch (error) {
        console.error('Transaction failed. All changes were rolled back. Error details:', error);
    }
}

run();

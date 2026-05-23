/**
 * TEST SCRIPT: Kiem tra save giao dich Phieu Thu vao Firestore
 * 
 * Chay: node --experimental-vm-modules functions/tests/test_transaction_save.mjs
 * Yeu cau: Firebase Emulator dang chay
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function initAdmin() {
    const apps = getApps();
    if (apps.length) return apps[0];
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    process.env.GCLOUD_PROJECT = 'demo-9trip';
    return initializeApp({ projectId: 'demo-9trip' });
}
const app = initAdmin();
const db = getFirestore(app);
const COL = 'transactions_test';

function validate(data, sourceModule) {
    const errs = [];
    if (!data.amount || data.amount <= 0) errs.push('So tien khong hop le');
    if (!data.status || !String(data.status).trim()) errs.push('Trang thai');
    if (!data.transaction_date || !String(data.transaction_date).trim()) errs.push('Ngay chung tu');
    if (sourceModule === 'sales' && (!data.booking_id || !String(data.booking_id).trim())) errs.push('Booking');
    return { ok: errs.length === 0, errs };
}

function build(id, type, amount, data) {
    const r = {
        id, type, amount,
        transaction_date: data.transaction_date,
        status: data.status,
        created_by: data.created_by || 'Test',
        created_at: data.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    ['category','description','booking_id','receiver','fund_source'].forEach(f => {
        const v = data[f];
        if (v !== undefined && v !== null && String(v).trim() !== '' && String(v) !== 'NaN') r[f] = v;
    });
    return r;
}

let p = 0; let f = 0;

async function check(id, src, data, saveFields, skipFields, vFail, vErrs, doFs) {
    const v = validate(data, src);
    if (vFail) {
        if (!v.ok && vErrs.every(e => v.errs.some(x => x.includes(e)))) {
            console.log(id + ' PASS - Valid rejected: ' + v.errs.join(', '));
            p++; return;
        }
        console.log(id + ' FAIL - Expected fail. Got: ' + v.errs);
        f++; return;
    }
    const rec = build(id, 'IN', data.amount, data);
    const keys = Object.keys(rec);
    const miss = saveFields.filter(k => !keys.includes(k));
    const extra = skipFields.filter(k => keys.includes(k));
    if (miss.length > 0) { console.log(id + ' FAIL - Missing: ' + miss); f++; return; }
    if (extra.length > 0) { console.log(id + ' FAIL - Extra: ' + extra); f++; return; }
    if (doFs) {
        try {
            await db.collection(COL).doc(id).set(rec);
            const snap = await db.collection(COL).doc(id).get();
            const da = snap.data();
            const fmiss = saveFields.filter(k => !Object.keys(da).includes(k));
            const fextra = skipFields.filter(k => Object.keys(da).includes(k));
            if (fmiss.length > 0) { console.log(id + ' FAIL - FS missing: ' + fmiss); f++; }
            else if (fextra.length > 0) { console.log(id + ' FAIL - FS extra: ' + fextra); f++; }
            else { console.log(id + ' PASS - FS OK: ' + JSON.stringify(da)); p++; }
            await db.collection(COL).doc(id).delete();
        } catch(e) { console.log(id + ' FAIL - FS: ' + e.message); f++; }
    } else {
        console.log(id + ' PASS - Record: ' + keys.join(', '));
        if (skipFields.length > 0) console.log('  Skipped: ' + skipFields.join(', '));
        p++;
    }
}

async function run() {
    console.log('\n============================================================');
    console.log('TEST: Kiem tra save giao dich Phieu Thu');
    console.log('============================================================\n');

    await check('TC1', 'sales', {amount:5e6,transaction_date:'2026-05-23',status:'Completed',booking_id:'BK-001',category:'Phong',description:'Test',receiver:'An',fund_source:'cash'}, ['id','type','amount','transaction_date','status','category','description','booking_id','receiver','fund_source','created_by','created_at','updated_at'], [], false, [], false);
    await check('TC2', 'sales', {amount:3e6,transaction_date:'2026-05-23',status:'Pending',booking_id:'BK-002',category:'',description:'',receiver:'',fund_source:'bank'}, ['id','type','amount','transaction_date','status','booking_id','fund_source','created_by','created_at','updated_at'], ['category','description','receiver'], false, [], false);
    await check('TC3', null, {amount:2e6,transaction_date:'2026-05-23',status:'',booking_id:'BK-003'}, [], [], true, ['Trang thai'], false);
    await check('TC4', null, {amount:2e6,transaction_date:'',status:'Completed'}, [], [], true, ['Ngay chung tu'], false);
    await check('TC5', 'sales', {amount:2e6,transaction_date:'2026-05-23',status:'Completed',booking_id:''}, [], [], true, ['Booking'], false);
    await check('TC6', null, {amount:2e6,transaction_date:'2026-05-23',status:'Completed',booking_id:'',category:''}, ['id','type','amount','transaction_date','status','created_by','created_at','updated_at'], ['booking_id','category','description','receiver','fund_source'], false, [], false);
    await check('TC7', 'sales', {amount:4e6,transaction_date:'2026-06-15',status:'Completed',booking_id:'BK-FIRE',category:'Tour',description:'Tour',receiver:'B',fund_source:'cash'}, ['id','type','amount','transaction_date','status','category','description','booking_id','receiver','fund_source','created_by','created_at','updated_at'], [], false, [], true);

    const total = p + f;
    console.log('\n============================================================');
    console.log('RESULT: ' + p + '/' + total + ' PASS, ' + f + '/' + total + ' FAIL');
    console.log('============================================================\n');
    process.exit(f > 0 ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });

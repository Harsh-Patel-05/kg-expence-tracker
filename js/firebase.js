let db = null;
let firebaseInitError = null;

function assertReady() {
    if (firebaseInitError) throw firebaseInitError;
    if (!db) throw new Error("Firestore is not initialized");
}

try {
    // Initialize Firebase (compat SDK loaded via script tags)
    if (!window.firebase) throw new Error("Firebase SDK not loaded (window.firebase missing)");
    if (!window.firebaseConfig) throw new Error("Firebase config missing (firebaseConfig is not defined)");

    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();

    // Enable offline persistence (best-effort)
    db.enablePersistence().catch((err) => {
        if (err.code === 'failed-precondition') {
            console.log('Multiple tabs open, persistence can only be enabled in one tab at a time.');
        } else if (err.code === 'unimplemented') {
            console.log('The current browser does not support persistence.');
        } else {
            console.log('Persistence not enabled:', err?.message || err);
        }
    });
} catch (e) {
    firebaseInitError = e instanceof Error ? e : new Error(String(e));
    console.error("Firebase init failed:", firebaseInitError);
}

// Surface init status for other scripts (api fallback, debugging)
window.__firebaseInitError = firebaseInitError ? firebaseInitError.message : null;
window.__firebaseReady = !!db && !firebaseInitError;

// Generic Firestore Operations
const addData = async (collectionName, data) => {
    try {
        assertReady();
        const docRef = await db.collection(collectionName).add({
            ...data,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return docRef.id;
    } catch (error) {
        console.error(`Error adding to ${collectionName}:`, error);
        throw error;
    }
};

const getData = async (collectionName) => {
    try {
        assertReady();
        const snapshot = await db.collection(collectionName).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error(`Error getting ${collectionName}:`, error);
        throw error;
    }
};

const getDocById = async (collectionName, id) => {
    try {
        assertReady();
        const doc = await db.collection(collectionName).doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() };
    } catch (error) {
        console.error(`Error getting document ${id} from ${collectionName}:`, error);
        throw error;
    }
};

const getDocsByField = async (collectionName, field, value) => {
    try {
        assertReady();
        const snapshot = await db.collection(collectionName).where(field, '==', value).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error(`Error querying ${collectionName} by ${field}:`, error);
        throw error;
    }
};

const updateData = async (collectionName, id, data) => {
    try {
        assertReady();
        await db.collection(collectionName).doc(id).update(data);
    } catch (error) {
        console.error(`Error updating document ${id} in ${collectionName}:`, error);
        throw error;
    }
};

const deleteData = async (collectionName, id) => {
    try {
        assertReady();
        await db.collection(collectionName).doc(id).delete();
    } catch (error) {
        console.error(`Error deleting document ${id} from ${collectionName}:`, error);
        throw error;
    }
};

const upsertByField = async (collectionName, field, value, data) => {
    try {
        assertReady();
        const existing = await getDocsByField(collectionName, field, value);
        if (existing.length === 0) {
            return await addData(collectionName, data);
        }
        await updateData(collectionName, existing[0].id, data);
        return existing[0].id;
    } catch (error) {
        console.error(`Error upserting ${collectionName}:`, error);
        throw error;
    }
};

/** Fast bulk upsert for menu (one read + batched writes). */
const bulkUpsertMenuItems = async (items) => {
    assertReady();
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) return [];

    const existing = await getData("menuItems");
    const byName = new Map();
    for (const doc of existing) {
        const n = String(doc.name || "").trim();
        if (n && !byName.has(n)) byName.set(n, doc.id);
    }

    const BATCH_LIMIT = 400;
    let batch = db.batch();
    let ops = 0;
    const commits = [];

    const flush = () => {
        if (ops > 0) commits.push(batch.commit());
        batch = db.batch();
        ops = 0;
    };

    for (const it of rows) {
        const name = String(it?.name || "").trim();
        if (!name) continue;
        const price = Number(it?.price);
        if (!Number.isFinite(price) || price < 0) continue;
        const row = {
            name,
            nameHi: String(it?.nameHi || "").trim(),
            price,
            category: String(it?.category || "General").trim() || "General",
            imageUrl: String(it?.imageUrl || "").trim(),
            available: it?.available !== false
        };
        const id = byName.get(name);
        if (id) {
            batch.update(db.collection("menuItems").doc(id), row);
        } else {
            const ref = db.collection("menuItems").doc();
            byName.set(name, ref.id);
            batch.set(ref, {
                ...row,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        ops += 1;
        if (ops >= BATCH_LIMIT) flush();
    }
    if (ops > 0) flush();
    await Promise.all(commits);
    return getData("menuItems");
};

const exportAllData = async () => {
    assertReady();
    const data = {};
    const collections = ['sales', 'purchases', 'expenses', 'inventory', 'attendance', 'salaries', 'advances', 'suppliers', 'staff', 'fixedSalaries', 'reminders'];
    
    for (const name of collections) {
        try {
            const snapshot = await db.collection(name).get();
            data[name] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`Error exporting ${name}:`, error);
            data[name] = [];
        }
    }
    
    return { data };
};

const importAllData = async (payload) => {
    assertReady();
    const incoming = payload && payload.data ? payload.data : payload || {};
    const collections = ['sales', 'purchases', 'expenses', 'inventory', 'attendance', 'salaries', 'advances', 'suppliers', 'staff', 'fixedSalaries', 'reminders'];

    // Clear existing data
    for (const name of collections) {
        try {
            const snapshot = await db.collection(name).get();
            await Promise.all(snapshot.docs.map(doc => doc.ref.delete()));
        } catch (error) {
            console.error(`Error clearing ${name}:`, error);
        }
    }

    // Import new data
    for (const name of collections) {
        const docs = incoming[name];
        if (!Array.isArray(docs) || docs.length === 0) continue;
        
        for (const doc of docs) {
            try {
                const { id, ...rest } = doc || {};
                const dataWithTimestamp = {
                    ...rest,
                    createdAt: rest.createdAt || firebase.firestore.FieldValue.serverTimestamp()
                };
                await db.collection(name).add(dataWithTimestamp);
            } catch (error) {
                console.error(`Error importing doc to ${name}:`, error);
            }
        }
    }
};

// Export for use in api.js
window.firebaseDB = {
    addData,
    getData,
    getDocById,
    getDocsByField,
    updateData,
    deleteData,
    upsertByField,
    bulkUpsertMenuItems,
    exportAllData,
    importAllData
};

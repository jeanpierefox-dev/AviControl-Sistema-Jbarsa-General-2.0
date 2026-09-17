const fs = require('fs');
let content = fs.readFileSync('services/storage.ts', 'utf-8');

// Replace Orders onSnapshot
const oldOrdersSnapshot = `  // Orders
  unsubscribes.push(onSnapshot(collection(db, 'orders'), (snapshot) => {
    if (snapshot.empty && getOrders().length > 0) return;
    const orders: ClientOrder[] = [];
    snapshot.forEach(doc => orders.push(doc.data() as ClientOrder));
    localStorage.setItem(KEYS.ORDERS, JSON.stringify(orders));
    window.dispatchEvent(new Event('avi_data_orders'));
  }, (err) => notifyConnectionState(false)));`;

const newOrdersSnapshot = `  // Orders (Optimized delta sync)
  let ordersTimeout: any;
  unsubscribes.push(onSnapshot(collection(db, 'orders'), (snapshot) => {
    if (snapshot.empty && getOrders().length > 0) return;
    
    const changes = snapshot.docChanges();
    if (changes.length === 0 && !snapshot.empty) return;

    // Use current orders from localStorage as base
    const currentOrders = getOrders();
    const ordersMap = new Map(currentOrders.map(o => [o.id, o]));
    
    let hasChanges = false;
    // For initial load, docChanges() contains all added docs.
    // If it's a massive initial load, we might as well just use snapshot.forEach for speed, 
    // but docChanges() works fine too.
    if (changes.length > 500) {
       // Bulk load
       const newOrders: ClientOrder[] = [];
       snapshot.forEach(doc => newOrders.push(doc.data() as ClientOrder));
       localStorage.setItem(KEYS.ORDERS, JSON.stringify(newOrders));
       window.dispatchEvent(new Event('avi_data_orders'));
       return;
    }

    changes.forEach(change => {
       if (change.type === 'added' || change.type === 'modified') {
           ordersMap.set(change.doc.id, change.doc.data() as ClientOrder);
           hasChanges = true;
       } else if (change.type === 'removed') {
           ordersMap.delete(change.doc.id);
           hasChanges = true;
       }
    });

    if (hasChanges) {
       const updatedOrders = Array.from(ordersMap.values());
       
       // Debounce the save and render to prevent UI freezing on rapid multiple updates
       clearTimeout(ordersTimeout);
       ordersTimeout = setTimeout(() => {
           localStorage.setItem(KEYS.ORDERS, JSON.stringify(updatedOrders));
           window.dispatchEvent(new Event('avi_data_orders'));
       }, 250);
    }
  }, (err) => notifyConnectionState(false)));`;

content = content.replace(oldOrdersSnapshot, newOrdersSnapshot);

// Replace Batches onSnapshot
const oldBatchesSnapshot = `  // Batches
  unsubscribes.push(onSnapshot(collection(db, 'batches'), (snapshot) => {
    if (snapshot.empty && getBatches().length > 0) return; 
    const batches: Batch[] = [];
    snapshot.forEach(doc => batches.push(doc.data() as Batch));
    localStorage.setItem(KEYS.BATCHES, JSON.stringify(batches));
    window.dispatchEvent(new Event('avi_data_batches'));
  }, (err) => notifyConnectionState(false)));`;

const newBatchesSnapshot = `  // Batches (Optimized)
  unsubscribes.push(onSnapshot(collection(db, 'batches'), (snapshot) => {
    if (snapshot.empty && getBatches().length > 0) return; 
    const changes = snapshot.docChanges();
    if (changes.length === 0 && !snapshot.empty) return;

    if (changes.length > 100) {
        const batches: Batch[] = [];
        snapshot.forEach(doc => batches.push(doc.data() as Batch));
        localStorage.setItem(KEYS.BATCHES, JSON.stringify(batches));
        window.dispatchEvent(new Event('avi_data_batches'));
        return;
    }

    const current = getBatches();
    const map = new Map(current.map(b => [b.id, b]));
    changes.forEach(c => {
        if (c.type === 'added' || c.type === 'modified') map.set(c.doc.id, c.doc.data() as Batch);
        else map.delete(c.doc.id);
    });
    localStorage.setItem(KEYS.BATCHES, JSON.stringify(Array.from(map.values())));
    window.dispatchEvent(new Event('avi_data_batches'));
  }, (err) => notifyConnectionState(false)));`;

content = content.replace(oldBatchesSnapshot, newBatchesSnapshot);

// Replace uploadLocalToCloud to use chunked batches
const oldUpload = `export const uploadLocalToCloud = async () => {
  try {
    const batch = writeBatch(db);
    
    getUsers().forEach(u => batch.set(doc(db, 'users', u.id), u));
    getBatches().forEach(b => batch.set(doc(db, 'batches', b.id), b));
    getOrders().forEach(o => batch.set(doc(db, 'orders', o.id), o));
    batch.set(doc(db, 'config', 'main'), getConfig());
    
    await batch.commit();
    notifyConnectionState(true);
  } catch (err) {
    console.warn('Direct cloud upload notice:', err);
  }
};`;

const newUpload = `export const uploadLocalToCloud = async () => {
  try {
    // Chunking to respect Firestore's 500 writes per batch limit
    const items = [
        ...getUsers().map(u => ({ col: 'users', id: u.id, data: u })),
        ...getBatches().map(b => ({ col: 'batches', id: b.id, data: b })),
        ...getOrders().map(o => ({ col: 'orders', id: o.id, data: o })),
        { col: 'config', id: 'main', data: getConfig() }
    ];

    const CHUNK_SIZE = 450; // safe margin below 500
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(item => {
            batch.set(doc(db, item.col, item.id), item.data);
        });
        await batch.commit();
    }
    notifyConnectionState(true);
  } catch (err) {
    console.warn('Direct cloud upload notice:', err);
  }
};`;

content = content.replace(oldUpload, newUpload);

fs.writeFileSync('services/storage.ts', content);
console.log('Optimized sync');

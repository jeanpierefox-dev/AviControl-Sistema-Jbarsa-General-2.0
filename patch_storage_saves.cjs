const fs = require('fs');
let content = fs.readFileSync('services/storage.ts', 'utf-8');

const oldSaveOrder = `export const saveOrder = async (order: ClientOrder) => {
  const orders = getOrders();
  const oWithMeta = { ...order, updatedAt: Date.now() };
  const idx = orders.findIndex(o => o.id === oWithMeta.id);
  if (idx >= 0) orders[idx] = oWithMeta; else orders.push(oWithMeta);
  localStorage.setItem(KEYS.ORDERS, JSON.stringify(orders));
  window.dispatchEvent(new Event('avi_data_orders'));
  
  await setDoc(doc(db, 'orders', oWithMeta.id), oWithMeta).catch(e => console.warn(e));
};`;

const newSaveOrder = `export const saveOrder = async (order: ClientOrder) => {
  const oWithMeta = { ...order, updatedAt: Date.now() };
  // We no longer manually overwrite all local storage here, because Firestore's onSnapshot
  // will immediately fire (latency compensation) and our optimized onSnapshot handler
  // will process the delta efficiently.
  
  // Actually, we still need to write it to local storage instantly in case onSnapshot is delayed
  // but we ONLY update the changed one.
  const orders = getOrders();
  const idx = orders.findIndex(o => o.id === oWithMeta.id);
  if (idx >= 0) orders[idx] = oWithMeta; else orders.push(oWithMeta);
  localStorage.setItem(KEYS.ORDERS, JSON.stringify(orders));
  window.dispatchEvent(new Event('avi_data_orders'));

  // Fire and forget, onSnapshot will pick it up
  setDoc(doc(db, 'orders', oWithMeta.id), oWithMeta).catch(e => console.warn(e));
};`;

// We just leave it, maybe the real fix is the onSnapshot debouncing and diffing!
// Wait, the onSnapshot debouncing already fixes the massive freeze on initial load.
// The force_sync fix stops the manual full upload.
// I think that's enough to solve the performance issue.

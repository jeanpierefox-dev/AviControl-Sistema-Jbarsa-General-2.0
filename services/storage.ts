import { User, WeighingType, UserRole, Batch, ClientOrder, AppConfig } from '../types';
import { db } from './firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, onSnapshot, writeBatch } from 'firebase/firestore';

const KEYS = {
  USERS: 'avi_users',
  BATCHES: 'avi_batches',
  ORDERS: 'avi_orders',
  CONFIG: 'avi_config',
  LAST_UPDATE: 'avi_last_update'
};

const safeParse = (key: string, fallback: any) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (e) {
    return fallback;
  }
};

const notifyConnectionState = (connected: boolean) => {
  window.dispatchEvent(new CustomEvent('avi_cloud_status', { detail: connected }));
};

const broadcastLocalSync = (key: string, data: any) => {
  localStorage.setItem(key + '_timestamp', Date.now().toString());
};

let unsubscribes: (() => void)[] = [];

export const initDataSync = async () => {
  console.log('Initializing Firebase Cloud Sync...');
  
  try {
    // Check if cloud is empty (first time connect)
    const usersSnapshot = await getDocs(collection(db, 'users'));
    if (usersSnapshot.empty) {
      console.log('Cloud database is empty, migrating local data to cloud...');
      await uploadLocalToCloud();
    }
  } catch(e) {
     console.error('Failed to check cloud state', e);
  }

  notifyConnectionState(true);

  // Clear previous subscriptions
  unsubscribes.forEach(unsub => unsub());
  unsubscribes = [];

  // Users
  unsubscribes.push(onSnapshot(collection(db, 'users'), (snapshot) => {
    if (snapshot.empty && getUsers().length > 0) return; // Prevent overwriting with empty
    const users: User[] = [];
    snapshot.forEach(doc => users.push(doc.data() as User));
    if (users.length > 0) {
      localStorage.setItem(KEYS.USERS, JSON.stringify(users));
      window.dispatchEvent(new Event('avi_data_users'));
    }
  }, (err) => notifyConnectionState(false)));

  // Batches (Optimized)
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
  }, (err) => notifyConnectionState(false)));

  // Orders (Optimized delta sync)
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
  }, (err) => notifyConnectionState(false)));

  // Config
  unsubscribes.push(onSnapshot(collection(db, 'config'), (snapshot) => {
    if (snapshot.empty) return;
    let config = safeParse(KEYS.CONFIG, {
      companyName: 'AVICONTROL PRO',
      logoUrl: '',
      printerConnected: false,
      scaleConnected: false,
      defaultFullCrateBatch: 5,
      defaultEmptyCrateBatch: 10
    });
    snapshot.forEach(doc => {
      if (doc.id === 'main') config = { ...config, ...doc.data() };
    });
    localStorage.setItem(KEYS.CONFIG, JSON.stringify(config));
    window.dispatchEvent(new Event('avi_data_config'));
  }, (err) => notifyConnectionState(false)));
};
export const getConfig = (): AppConfig => {
  return safeParse(KEYS.CONFIG, {
    companyName: 'AVICONTROL PRO',
    logoUrl: '',
    printerConnected: false,
    scaleConnected: false,
    defaultFullCrateBatch: 5,
    defaultEmptyCrateBatch: 10
  });
};

export const saveConfig = async (config: AppConfig) => {
  localStorage.setItem(KEYS.CONFIG, JSON.stringify(config));
  window.dispatchEvent(new Event('avi_data_config'));
  await setDoc(doc(db, 'config', 'main'), config).catch(e => console.warn(e));
};

export const getUsers = (): User[] => {
  const users = safeParse(KEYS.USERS, []);
  if (users.length === 0) {
    const defaultAdmin: User = { 
       id: 'admin', 
       username: 'admin', 
       password: '1234', 
       name: 'Administrador', 
       role: UserRole.ADMIN,
       allowedModes: [WeighingType.BATCH, WeighingType.SOLO_POLLO, WeighingType.SOLO_JABAS] 
     };
    return [defaultAdmin];
  }
  return users;
};

export const saveUser = async (user: User) => {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === user.id);
  if (idx >= 0) users[idx] = user; else users.push(user);
  localStorage.setItem(KEYS.USERS, JSON.stringify(users));
  window.dispatchEvent(new Event('avi_data_users'));
  
  await setDoc(doc(db, 'users', user.id), user).catch(e => console.warn(e));
};

export const deleteUser = async (id: string) => {
  const users = getUsers().filter(u => u.id !== id);
  localStorage.setItem(KEYS.USERS, JSON.stringify(users));
  window.dispatchEvent(new Event('avi_data_users'));
  
  await deleteDoc(doc(db, 'users', id)).catch(e => console.warn(e));
};

export const login = (username: string, password: string): User | null => {
  const users = getUsers();
  return users.find(u => u.username === username && u.password === password) || null;
};

export const getVisibleUserIds = (user: User | null): string[] => {
  if (!user) return ['*'];
  if (user.role === UserRole.ADMIN) {
    const allUsers = getUsers();
    return ['*', '', 'undefined', ...allUsers.map(u => u.id)];
  }
  const allUsers = getUsers();
  if (user.role === UserRole.GENERAL) {
    const operators = allUsers.filter(u => u.parentId === user.id);
    return ['', 'undefined', user.id, ...operators.map(u => u.id)];
  }
  return [user.id, '', 'undefined'];
};

export const getBatches = (): Batch[] => safeParse(KEYS.BATCHES, []);

export const saveBatch = async (batch: Batch) => {
  const batches = getBatches();
  const bWithMeta = { ...batch, updatedAt: Date.now() };
  const idx = batches.findIndex(b => b.id === bWithMeta.id);
  if (idx >= 0) batches[idx] = bWithMeta; else batches.push(bWithMeta);
  localStorage.setItem(KEYS.BATCHES, JSON.stringify(batches));
  window.dispatchEvent(new Event('avi_data_batches'));
  
  await setDoc(doc(db, 'batches', bWithMeta.id), bWithMeta).catch(e => console.warn(e));
};

export const deleteBatch = async (id: string) => {
  const batches = getBatches().filter(b => b.id !== id);
  localStorage.setItem(KEYS.BATCHES, JSON.stringify(batches));
  window.dispatchEvent(new Event('avi_data_batches'));
  
  await deleteDoc(doc(db, 'batches', id)).catch(e => console.warn(e));
};

export const getOrders = (): ClientOrder[] => {
  const orders = safeParse(KEYS.ORDERS, []);
  return orders.map((o: any) => ({
    ...o,
    payments: o.payments || []
  }));
};

export const getOrdersByBatch = (batchId: string): ClientOrder[] => 
  getOrders().filter(o => o.batchId === batchId);

export const saveOrder = async (order: ClientOrder) => {
  const orders = getOrders();
  const oWithMeta = { ...order, updatedAt: Date.now() };
  const idx = orders.findIndex(o => o.id === oWithMeta.id);
  if (idx >= 0) orders[idx] = oWithMeta; else orders.push(oWithMeta);
  localStorage.setItem(KEYS.ORDERS, JSON.stringify(orders));
  window.dispatchEvent(new Event('avi_data_orders'));
  
  await setDoc(doc(db, 'orders', oWithMeta.id), oWithMeta).catch(e => console.warn(e));
};

export const deleteOrder = async (id: string) => {
  const orders = getOrders().filter(o => o.id !== id);
  localStorage.setItem(KEYS.ORDERS, JSON.stringify(orders));
  window.dispatchEvent(new Event('avi_data_orders'));
  
  await deleteDoc(doc(db, 'orders', id)).catch(e => console.warn(e));
};

export const uploadLocalToCloud = async () => {
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
};

export const resetApp = async () => {
  localStorage.clear();
  window.dispatchEvent(new Event('avi_data_users'));
  window.dispatchEvent(new Event('avi_data_batches'));
  window.dispatchEvent(new Event('avi_data_orders'));
  window.dispatchEvent(new Event('avi_data_config'));
  
  // Note: we don't delete everything in firestore for safety here,
  // just the local cache. If needed, a cloud reset could be implemented.
};

export const initCloudSync = initDataSync;

window.addEventListener('avi_force_sync', () => {
  uploadLocalToCloud();
  initDataSync();
});

export const isFirebaseConfigured = () => true;

export const onConnectionStateChange = (callback: (connected: boolean) => void) => {
  const handler = (e: any) => callback(e.detail);
  window.addEventListener('avi_cloud_status', handler);
  return () => window.removeEventListener('avi_cloud_status', handler);
};

export const getEffectiveBranding = (item: any, user: User | null) => {
  const config = getConfig();
  let logoUrl = config.logoUrl;
  let companyName = config.companyName || 'AVICONTROL PRO';
  
  if (user && user.role !== UserRole.ADMIN) {
    if (user.logoUrl) logoUrl = user.logoUrl;
    if (user.companyName) companyName = user.companyName;
  }
  return { logoUrl, companyName };
};

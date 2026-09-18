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

let isCloudConnectedState = false;

export const getCloudStatus = () => isCloudConnectedState;

const notifyConnectionState = (connected: boolean) => {
  isCloudConnectedState = connected;
  window.dispatchEvent(new CustomEvent('avi_cloud_status', { detail: connected }));
};

export const checkCloudConnection = async (): Promise<boolean> => {
  try {
    const [usersSnapshot] = await Promise.all([
      getDocs(collection(db, 'config'))
    ]);
    notifyConnectionState(true);
    return true;
  } catch (err) {
    console.warn('Cloud connection check result: offline/error', err);
    notifyConnectionState(false);
    return false;
  }
};

const broadcastLocalSync = (key: string, data: any) => {
  localStorage.setItem(key + '_timestamp', Date.now().toString());
};

let unsubscribes: (() => void)[] = [];
let heartbeatInterval: any = null;

export const initDataSync = async () => {
  console.log('Initializing Firebase Cloud Sync...');
  
  try {
    // Check if cloud database has data or needs migration from local data
    const [usersSnapshot, batchesSnapshot] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'batches'))
    ]);
    if (usersSnapshot.empty || batchesSnapshot.empty) {
      console.log('Cloud database needs sync, migrating local data to cloud...');
      await uploadLocalToCloud();
    }
    notifyConnectionState(true);
  } catch(e) {
     console.error('Failed to check cloud state', e);
     notifyConnectionState(false);
  }

  // Clear previous subscriptions
  unsubscribes.forEach(unsub => unsub());
  unsubscribes = [];

  // Setup periodic heartbeat check if not already setup
  if (!heartbeatInterval && typeof window !== 'undefined') {
    heartbeatInterval = setInterval(() => {
      checkCloudConnection();
    }, 20000);

    window.addEventListener('online', () => {
      checkCloudConnection();
    });
    window.addEventListener('offline', () => {
      notifyConnectionState(false);
    });
  }

  // Users
  unsubscribes.push(onSnapshot(collection(db, 'users'), (snapshot) => {
    notifyConnectionState(true);
    if (snapshot.empty && getUsers().length > 0) return; // Prevent overwriting with empty
    const users: User[] = [];
    snapshot.forEach(doc => users.push(doc.data() as User));
    if (users.length > 0) {
      localStorage.setItem(KEYS.USERS, JSON.stringify(users));
      window.dispatchEvent(new Event('avi_data_users'));
    }
  }, (err) => {
    console.warn("Users sync error:", err);
    notifyConnectionState(false);
  }));

  // Batches (Optimized)
  unsubscribes.push(onSnapshot(collection(db, 'batches'), (snapshot) => {
    notifyConnectionState(true);
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
  }, (err) => {
    console.warn("Batches sync error:", err);
    notifyConnectionState(false);
  }));

  // Orders (Optimized delta sync)
  let ordersTimeout: any;
  unsubscribes.push(onSnapshot(collection(db, 'orders'), (snapshot) => {
    notifyConnectionState(true);
    if (snapshot.empty && getOrders().length > 0) return;
    
    const changes = snapshot.docChanges();
    if (changes.length === 0 && !snapshot.empty) return;

    // Use current orders from localStorage as base
    const currentOrders = getOrders();
    const ordersMap = new Map(currentOrders.map(o => [o.id, o]));
    
    let hasChanges = false;
    // For initial load, docChanges() contains all added docs.
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
  }, (err) => {
    console.warn("Orders sync error:", err);
    notifyConnectionState(false);
  }));

  // Config
  unsubscribes.push(onSnapshot(collection(db, 'config'), (snapshot) => {
    notifyConnectionState(true);
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
  }, (err) => {
    console.warn("Config sync error:", err);
    notifyConnectionState(false);
  }));
};
export const sanitizeForFirestore = (val: any): any => {
  if (val === undefined) return null;
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) {
    return val.map(sanitizeForFirestore);
  }
  const res: Record<string, any> = {};
  for (const [k, v] of Object.entries(val)) {
    if (v !== undefined) {
      res[k] = sanitizeForFirestore(v);
    }
  }
  return res;
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
  await setDoc(doc(db, 'config', 'main'), sanitizeForFirestore(config)).catch(e => console.warn(e));
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
  
  await setDoc(doc(db, 'users', user.id), sanitizeForFirestore(user)).catch(e => console.warn(e));
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
  const bWithMeta = { ...batch, updatedAt: batch.updatedAt || Date.now() };
  const idx = batches.findIndex(b => b.id === bWithMeta.id);
  if (idx >= 0) batches[idx] = bWithMeta; else batches.push(bWithMeta);
  localStorage.setItem(KEYS.BATCHES, JSON.stringify(batches));
  window.dispatchEvent(new Event('avi_data_batches'));
  
  await setDoc(doc(db, 'batches', bWithMeta.id), sanitizeForFirestore(bWithMeta)).catch(e => console.warn(e));
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
  const oWithMeta = { ...order, updatedAt: order.updatedAt || Date.now() };
  const idx = orders.findIndex(o => o.id === oWithMeta.id);
  if (idx >= 0) orders[idx] = oWithMeta; else orders.push(oWithMeta);
  localStorage.setItem(KEYS.ORDERS, JSON.stringify(orders));
  window.dispatchEvent(new Event('avi_data_orders'));
  
  await setDoc(doc(db, 'orders', oWithMeta.id), sanitizeForFirestore(oWithMeta)).catch(e => console.warn(e));
};

export const deleteOrder = async (id: string) => {
  const orders = getOrders().filter(o => o.id !== id);
  localStorage.setItem(KEYS.ORDERS, JSON.stringify(orders));
  window.dispatchEvent(new Event('avi_data_orders'));
  
  await deleteDoc(doc(db, 'orders', id)).catch(e => console.warn(e));
};

export interface ProgressCallback {
  (progress: { current: number; total: number; stage: string; percent: number }): void;
}

export const uploadLocalToCloud = async (onProgress?: ProgressCallback) => {
  try {
    const localUsers = getUsers();
    const localBatches = getBatches();
    const localOrders = getOrders();
    const localConfig = getConfig();

    const items: { col: string; id: string; data: any }[] = [
      ...localUsers.map(u => ({ col: 'users', id: u.id, data: sanitizeForFirestore(u) })),
      ...localBatches.map(b => ({ col: 'batches', id: b.id, data: sanitizeForFirestore(b) })),
      ...localOrders.map(o => ({ col: 'orders', id: o.id, data: sanitizeForFirestore(o) })),
      { col: 'config', id: 'main', data: sanitizeForFirestore(localConfig) }
    ];

    const total = items.length;
    let processed = 0;
    const CHUNK_SIZE = 300; // safe chunk size under firestore 500 limit

    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach(item => {
        batch.set(doc(db, item.col, item.id), item.data, { merge: true });
      });
      await batch.commit();
      processed += chunk.length;
      if (onProgress) {
        const percent = Math.min(100, Math.round((processed / total) * 100));
        onProgress({
          current: processed,
          total,
          stage: `Subiendo registros (${processed}/${total})...`,
          percent
        });
      }
    }
    notifyConnectionState(true);
    return {
      success: true,
      countUsers: localUsers.length,
      countBatches: localBatches.length,
      countOrders: localOrders.length,
    };
  } catch (err: any) {
    console.error('Error in uploadLocalToCloud:', err);
    throw err;
  }
};

export const downloadCloudToLocal = async (onProgress?: ProgressCallback) => {
  try {
    if (onProgress) onProgress({ current: 10, total: 100, stage: 'Descargando usuarios...', percent: 10 });
    const usersSnap = await getDocs(collection(db, 'users'));
    const cloudUsers: User[] = [];
    usersSnap.forEach(d => cloudUsers.push(d.data() as User));

    if (onProgress) onProgress({ current: 40, total: 100, stage: 'Descargando lotes de pollos...', percent: 40 });
    const batchesSnap = await getDocs(collection(db, 'batches'));
    const cloudBatches: Batch[] = [];
    batchesSnap.forEach(d => cloudBatches.push(d.data() as Batch));

    if (onProgress) onProgress({ current: 70, total: 100, stage: 'Descargando órdenes y pesajes...', percent: 70 });
    const ordersSnap = await getDocs(collection(db, 'orders'));
    const cloudOrders: ClientOrder[] = [];
    ordersSnap.forEach(d => cloudOrders.push(d.data() as ClientOrder));

    const configSnap = await getDocs(collection(db, 'config'));
    let cloudConfig = getConfig();
    configSnap.forEach(d => {
      if (d.id === 'main') cloudConfig = { ...cloudConfig, ...d.data() };
    });

    // Merge into local
    const localUsers = getUsers();
    const userMap = new Map<string, User>();
    localUsers.forEach(u => userMap.set(u.id, u));
    cloudUsers.forEach(u => userMap.set(u.id, u));
    const mergedUsers = Array.from(userMap.values());
    localStorage.setItem(KEYS.USERS, JSON.stringify(mergedUsers));
    window.dispatchEvent(new Event('avi_data_users'));

    const localBatches = getBatches();
    const batchMap = new Map<string, Batch>();
    localBatches.forEach(b => batchMap.set(b.id, b));
    cloudBatches.forEach(b => {
      const existing = batchMap.get(b.id);
      if (!existing || (b.updatedAt || 0) >= (existing.updatedAt || 0)) {
        batchMap.set(b.id, b);
      }
    });
    const mergedBatches = Array.from(batchMap.values());
    localStorage.setItem(KEYS.BATCHES, JSON.stringify(mergedBatches));
    window.dispatchEvent(new Event('avi_data_batches'));

    const localOrders = getOrders();
    const orderMap = new Map<string, ClientOrder>();
    localOrders.forEach(o => orderMap.set(o.id, o));
    cloudOrders.forEach(o => {
      const existing = orderMap.get(o.id);
      if (!existing || (o.updatedAt || 0) >= (existing.updatedAt || 0)) {
        orderMap.set(o.id, o);
      }
    });
    const mergedOrders = Array.from(orderMap.values());
    localStorage.setItem(KEYS.ORDERS, JSON.stringify(mergedOrders));
    window.dispatchEvent(new Event('avi_data_orders'));

    localStorage.setItem(KEYS.CONFIG, JSON.stringify(cloudConfig));
    window.dispatchEvent(new Event('avi_data_config'));

    if (onProgress) onProgress({ current: 100, total: 100, stage: '¡Sincronización completada!', percent: 100 });
    notifyConnectionState(true);

    return {
      success: true,
      countUsers: cloudUsers.length,
      countBatches: cloudBatches.length,
      countOrders: cloudOrders.length,
    };
  } catch (err: any) {
    console.error('Error in downloadCloudToLocal:', err);
    throw err;
  }
};

export const getStorageOverview = async () => {
  const local = {
    users: getUsers().length,
    batches: getBatches().length,
    orders: getOrders().length,
  };
  let cloud = {
    users: 0,
    batches: 0,
    orders: 0,
    connected: false,
  };
  try {
    const [uSnap, bSnap, oSnap] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'batches')),
      getDocs(collection(db, 'orders'))
    ]);
    cloud = {
      users: uSnap.size,
      batches: bSnap.size,
      orders: oSnap.size,
      connected: true,
    };
    notifyConnectionState(true);
  } catch (err) {
    console.warn('Could not fetch cloud overview', err);
    cloud.connected = false;
  }
  return { local, cloud };
};

export const exportAllDataAsJSON = (): string => {
  const data = {
    exportDate: new Date().toISOString(),
    version: '2.0',
    companyName: getConfig().companyName,
    config: getConfig(),
    users: getUsers(),
    batches: getBatches(),
    orders: getOrders(),
  };
  return JSON.stringify(data, null, 2);
};

export const importJsonBackup = async (jsonString: string, onProgress?: ProgressCallback) => {
  try {
    const data = JSON.parse(jsonString);
    let importedUsers: User[] = [];
    let importedBatches: Batch[] = [];
    let importedOrders: ClientOrder[] = [];

    if (Array.isArray(data.batches)) importedBatches = data.batches;
    if (Array.isArray(data.orders)) importedOrders = data.orders;
    if (Array.isArray(data.users)) importedUsers = data.users;

    // Merge into local
    if (importedUsers.length > 0) {
      const uMap = new Map(getUsers().map(u => [u.id, u]));
      importedUsers.forEach(u => uMap.set(u.id, u));
      localStorage.setItem(KEYS.USERS, JSON.stringify(Array.from(uMap.values())));
      window.dispatchEvent(new Event('avi_data_users'));
    }

    if (importedBatches.length > 0) {
      const bMap = new Map(getBatches().map(b => [b.id, b]));
      importedBatches.forEach(b => bMap.set(b.id, b));
      localStorage.setItem(KEYS.BATCHES, JSON.stringify(Array.from(bMap.values())));
      window.dispatchEvent(new Event('avi_data_batches'));
    }

    if (importedOrders.length > 0) {
      const oMap = new Map(getOrders().map(o => [o.id, o]));
      importedOrders.forEach(o => oMap.set(o.id, o));
      localStorage.setItem(KEYS.ORDERS, JSON.stringify(Array.from(oMap.values())));
      window.dispatchEvent(new Event('avi_data_orders'));
    }

    if (data.config) {
      const current = getConfig();
      const newConfig = { ...current, ...data.config };
      localStorage.setItem(KEYS.CONFIG, JSON.stringify(newConfig));
      window.dispatchEvent(new Event('avi_data_config'));
    }

    // Now upload everything to cloud as well
    await uploadLocalToCloud(onProgress);

    return {
      success: true,
      countBatches: importedBatches.length,
      countOrders: importedOrders.length,
      countUsers: importedUsers.length,
    };
  } catch (err: any) {
    console.error('Error importing backup:', err);
    throw new Error('El archivo de respaldo no tiene un formato JSON válido: ' + err.message);
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
  callback(isCloudConnectedState);
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

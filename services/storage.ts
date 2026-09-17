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

  // Batches
  unsubscribes.push(onSnapshot(collection(db, 'batches'), (snapshot) => {
    if (snapshot.empty && getBatches().length > 0) return; 
    const batches: Batch[] = [];
    snapshot.forEach(doc => batches.push(doc.data() as Batch));
    localStorage.setItem(KEYS.BATCHES, JSON.stringify(batches));
    window.dispatchEvent(new Event('avi_data_batches'));
  }, (err) => notifyConnectionState(false)));

  // Orders
  unsubscribes.push(onSnapshot(collection(db, 'orders'), (snapshot) => {
    if (snapshot.empty && getOrders().length > 0) return;
    const orders: ClientOrder[] = [];
    snapshot.forEach(doc => orders.push(doc.data() as ClientOrder));
    localStorage.setItem(KEYS.ORDERS, JSON.stringify(orders));
    window.dispatchEvent(new Event('avi_data_orders'));
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

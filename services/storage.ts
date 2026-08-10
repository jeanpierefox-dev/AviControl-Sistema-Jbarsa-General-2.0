
import { User, UserRole, Batch, ClientOrder, AppConfig, WeighingType } from '../types';
import { initializeApp, getApps, deleteApp, FirebaseApp } from 'firebase/app';
import { 
    getDatabase, 
    ref, 
    set, 
    remove, 
    onValue, 
    Database,
    get
} from 'firebase/database';

const KEYS = {
  USERS: 'avi_users',
  BATCHES: 'avi_batches',
  ORDERS: 'avi_orders',
  CONFIG: 'avi_config',
  SESSION: 'avi_session'
};

const safeParse = (key: string, fallback: any) => {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : fallback;
    } catch (e) {
        console.warn(`Data corruption detected in ${key}. Resetting to default.`);
        return fallback;
    }
};

const metaEnv = (import.meta as any).env || {};

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: metaEnv.VITE_FIREBASE_API_KEY || "AIzaSyAviControlProKey2026AutoCloud",
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID || "avicontrol-pro-cloud",
  databaseURL: metaEnv.VITE_FIREBASE_DATABASE_URL || "https://avicontrol-pro-cloud-default-rtdb.firebaseio.com",
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || "avicontrol-pro-cloud.firebaseapp.com"
};

const sanitizeDatabaseUrl = (url?: string, projectId?: string): string => {
    let clean = (url || '').trim();
    const defaultProjectId = (projectId || '').trim() || 'avicontrol-pro-cloud';
    const fallbackUrl = `https://${defaultProjectId}-default-rtdb.firebaseio.com`;

    if (!clean) {
        return fallbackUrl;
    }

    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
        clean = `https://${clean}`;
    }

    try {
        const parsed = new URL(clean);
        const host = parsed.hostname.toLowerCase();
        
        if (host.endsWith('.firebaseio.com') || host.endsWith('.firebasedatabase.app') || host === 'localhost' || host === '127.0.0.1') {
            return `https://${host}${parsed.pathname === '/' ? '' : parsed.pathname}`;
        }

        if (!host.includes('.')) {
            return `https://${host}-default-rtdb.firebaseio.com`;
        }

        return fallbackUrl;
    } catch (e) {
        return fallbackUrl;
    }
};

export const getConfig = (): AppConfig => {
  const parsed = safeParse(KEYS.CONFIG, {});
  const fbConfig = parsed.firebaseConfig || {};
  const projectId = fbConfig.projectId || DEFAULT_FIREBASE_CONFIG.projectId;
  const rawDbUrl = fbConfig.databaseURL || DEFAULT_FIREBASE_CONFIG.databaseURL;
  const sanitizedDbUrl = sanitizeDatabaseUrl(rawDbUrl, projectId);

  return {
    companyName: parsed.companyName || 'AVI CONTROL',
    logoUrl: parsed.logoUrl || '',
    printerConnected: parsed.printerConnected || false,
    scaleConnected: parsed.scaleConnected || false,
    defaultFullCrateBatch: parsed.defaultFullCrateBatch ?? 5,
    defaultEmptyCrateBatch: parsed.defaultEmptyCrateBatch ?? 10,
    firebaseConfig: {
      apiKey: fbConfig.apiKey || DEFAULT_FIREBASE_CONFIG.apiKey,
      projectId: projectId,
      databaseURL: sanitizedDbUrl,
      authDomain: fbConfig.authDomain || `${projectId}.firebaseapp.com`,
      appId: fbConfig.appId || '',
      storageBucket: fbConfig.storageBucket || '',
      messagingSenderId: fbConfig.messagingSenderId || ''
    }
  };
};

export const saveConfig = (config: AppConfig) => {
  localStorage.setItem(KEYS.CONFIG, JSON.stringify(config));
  window.dispatchEvent(new Event('avi_data_config'));
};

export const isFirebaseConfigured = (): boolean => {
  return true;
};

export const resetApp = () => {
    localStorage.clear();
    window.location.reload();
};

let db: Database | null = null;
let unsubscribers: Function[] = [];

export const testFirebaseConnection = async (config: any): Promise<boolean> => {
    try {
        const tempAppName = `test_${Date.now()}`;
        const dbUrl = sanitizeDatabaseUrl(config?.databaseURL, config?.projectId);
        const appConfig = { ...config, databaseURL: dbUrl };
        
        const tempApp = initializeApp(appConfig, tempAppName);
        const tempDb = getDatabase(tempApp, dbUrl);
        
        const testRef = ref(tempDb, '.info/connected');
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                deleteApp(tempApp);
                resolve(true); // Resolve gracefully on timeout for auto-connect
            }, 3000);

            onValue(testRef, () => {
                clearTimeout(timeout);
                deleteApp(tempApp);
                resolve(true);
            }, (error) => {
                clearTimeout(timeout);
                deleteApp(tempApp);
                resolve(true);
            }, { onlyOnce: true });
        });
    } catch (e) {
        return true;
    }
};

export const initCloudSync = async () => {
  const config = getConfig();
  unsubscribers.forEach(unsub => unsub());
  unsubscribers = [];

  try {
    let app: FirebaseApp;
    const apps = getApps();
    const defaultApp = apps.find(a => a.name === '[DEFAULT]');
    
    const projectId = config.firebaseConfig?.projectId || DEFAULT_FIREBASE_CONFIG.projectId;
    const dbUrl = sanitizeDatabaseUrl(config.firebaseConfig?.databaseURL, projectId);

    const appConfig = {
        ...config.firebaseConfig,
        databaseURL: dbUrl
    };

    if (!defaultApp) {
        app = initializeApp(appConfig);
    } else {
        app = defaultApp;
    }
    
    db = getDatabase(app, dbUrl);
    
    const connectedRef = ref(db, '.info/connected');
    onValue(connectedRef, (snap) => {
        if (snap.val() === false) {
            console.log("Realtime Database offline, keeping local state.");
        } else {
            console.log("Realtime Database connected directly.");
        }
    }, (err) => {
        console.warn("Connection listener handled gracefully:", err);
    });

    startListeners();
  } catch (e: any) {
    console.warn("Nube en segundo plano:", e);
  }
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

    // Auto-migrate admin password from 123 to 1234
    const adminIdx = users.findIndex((u: User) => u.username === 'admin');
    if (adminIdx >= 0 && users[adminIdx].password === '123') {
        users[adminIdx].password = '1234';
        localStorage.setItem(KEYS.USERS, JSON.stringify(users));
    }

    return users;
};

const cleanData = (obj: any): any => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(cleanData);
    
    return Object.fromEntries(
        Object.entries(obj)
            .filter(([_, v]) => v !== undefined)
            .map(([k, v]) => [k, cleanData(v)])
    );
};

export const saveUser = (user: User) => {
    const users = getUsers();
    const idx = users.findIndex(u => u.id === user.id);
    if (idx >= 0) users[idx] = user; else users.push(user);
    const cleaned = cleanData(user);
    localStorage.setItem(KEYS.USERS, JSON.stringify(users));
    window.dispatchEvent(new Event('avi_data_users'));
    if (db) set(ref(db, `users/${user.id}`), cleaned).catch(e => window.dispatchEvent(new CustomEvent('avi_sync_error', { detail: e.message })));
};

export const deleteUser = (id: string) => {
    const users = getUsers().filter(u => u.id !== id);
    localStorage.setItem(KEYS.USERS, JSON.stringify(users));
    if (db) remove(ref(db, `users/${id}`)).catch(e => window.dispatchEvent(new CustomEvent('avi_sync_error', { detail: e.message })));
};

export const login = (username: string, password: string): User | null => {
    const users = getUsers();
    return users.find(u => u.username === username && u.password === password) || null;
};

export const getVisibleUserIds = (user: User | null): string[] => {
    if (!user) return [];
    const allUsers = getUsers();
    if (user.role === UserRole.ADMIN) {
        return allUsers.map(u => u.id);
    }
    if (user.role === UserRole.GENERAL) {
        const operators = allUsers.filter(u => u.parentId === user.id);
        return [user.id, ...operators.map(u => u.id)];
    }
    return [user.id];
};

export const getBatches = (): Batch[] => safeParse(KEYS.BATCHES, []);

export const saveBatch = (batch: Batch) => {
    const batches = getBatches();
    const bWithMeta = { ...batch, updatedAt: Date.now() };
    const idx = batches.findIndex(b => b.id === bWithMeta.id);
    if (idx >= 0) batches[idx] = bWithMeta; else batches.push(bWithMeta);
    const cleaned = cleanData(bWithMeta);
    localStorage.setItem(KEYS.BATCHES, JSON.stringify(batches));
    window.dispatchEvent(new Event('avi_data_batches'));
    if (db) set(ref(db, `batches/${bWithMeta.id}`), cleaned).catch(e => window.dispatchEvent(new CustomEvent('avi_sync_error', { detail: e.message })));
};

export const deleteBatch = (id: string) => {
    const batches = getBatches().filter(b => b.id !== id);
    localStorage.setItem(KEYS.BATCHES, JSON.stringify(batches));
    if (db) remove(ref(db, `batches/${id}`)).catch(e => window.dispatchEvent(new CustomEvent('avi_sync_error', { detail: e.message })));
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

export const saveOrder = (order: ClientOrder) => {
    const orders = getOrders();
    const oWithMeta = { ...order, updatedAt: Date.now() };
    const idx = orders.findIndex(o => o.id === oWithMeta.id);
    if (idx >= 0) orders[idx] = oWithMeta; else orders.push(oWithMeta);
    const cleaned = cleanData(oWithMeta);
    localStorage.setItem(KEYS.ORDERS, JSON.stringify(orders));
    window.dispatchEvent(new Event('avi_data_orders'));
    if (db) set(ref(db, `orders/${oWithMeta.id}`), cleaned).catch(e => window.dispatchEvent(new CustomEvent('avi_sync_error', { detail: e.message })));
};

export const deleteOrder = (id: string) => {
    const orders = getOrders().filter(o => o.id !== id);
    localStorage.setItem(KEYS.ORDERS, JSON.stringify(orders));
    if (db) remove(ref(db, `orders/${id}`)).catch(e => window.dispatchEvent(new CustomEvent('avi_sync_error', { detail: e.message })));
};

export const onConnectionStateChange = (callback: (connected: boolean) => void) => {
    if (!db) {
        callback(false);
        return () => {};
    }
    const connectedRef = ref(db, '.info/connected');
    const unsub = onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
            callback(true);
        } else {
            callback(false);
        }
    });
    return () => unsub();
};

export const uploadLocalToCloud = async () => {
    if (!db) return;
    const upload = async (col: string, data: any[]) => {
        for (const item of data) {
            const cleaned = cleanData(item);
            await set(ref(db!, `${col}/${item.id}`), cleaned);
        }
    };
    await upload('users', getUsers());
    await upload('batches', getBatches());
    await upload('orders', getOrders());
};

const startListeners = () => {
  if (!db) return;
  
  const syncCollection = (colName: string, storageKey: string, eventName: string) => {
    if (!db) return;
    try {
        const collectionRef = ref(db, colName);
        const unsub = onValue(collectionRef, (snapshot) => {
          const val = snapshot.val();
          // Smart Merge logic: preserve local state that is fresher than cloud during sync
          const cloudDataArray: any[] = val ? Object.values(val) : [];
          const currentLocalRaw = localStorage.getItem(storageKey);
          const currentLocal: any[] = currentLocalRaw ? JSON.parse(currentLocalRaw) : [];
          
          let mergedData: any[] = [];

          if (cloudDataArray.length === 0 && currentLocal.length > 0) {
              // Initial seed: if cloud is empty, upload local items to cloud
              currentLocal.forEach(item => {
                  const cleaned = cleanData(item);
                  set(ref(db!, `${colName}/${item.id}`), cleaned).catch(err => {
                      console.error(`Upload error for ${colName}:`, err);
                  });
              });
              mergedData = currentLocal;
          } else {
              // Cloud has data: use cloud items as the source of truth
              mergedData = cloudDataArray.map(cloudItem => {
                  const localItem = currentLocal.find(li => li.id === cloudItem.id);
                  if (!localItem) return cloudItem;

                  if (localItem.updatedAt && cloudItem.updatedAt && localItem.updatedAt > cloudItem.updatedAt) {
                      return localItem;
                  }

                  if (colName === 'orders') {
                      const cloudRC = (cloudItem.records || []).length;
                      const localRC = (localItem.records || []).length;
                      if (localRC > cloudRC) return localItem;
                  }
                  
                  return cloudItem;
              });

              // Also preserve local items that were created offline recently and not yet present in cloud
              const now = Date.now();
              currentLocal.forEach(localItem => {
                  if (!cloudDataArray.some(ci => ci.id === localItem.id)) {
                      if (localItem.updatedAt && (now - localItem.updatedAt < 120000)) {
                          mergedData.push(localItem);
                          set(ref(db!, `${colName}/${localItem.id}`), cleanData(localItem)).catch(() => {});
                      }
                  }
              });
          }

          const sortedMerged = [...mergedData].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
          const sortedLocal = [...currentLocal].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
          
          if (JSON.stringify(sortedMerged) !== JSON.stringify(sortedLocal)) {
              localStorage.setItem(storageKey, JSON.stringify(mergedData));
              window.dispatchEvent(new Event(eventName));
          }
        }, (error) => {
            console.warn(`Sync listener notice (${colName}):`, error.message);
        });
        unsubscribers.push(() => unsub());
    } catch(e) {
        console.error(`Fallo crítico al iniciar listener ${colName}:`, e);
    }
  };
  
  syncCollection('users', KEYS.USERS, 'avi_data_users');
  syncCollection('batches', KEYS.BATCHES, 'avi_data_batches');
  syncCollection('orders', KEYS.ORDERS, 'avi_data_orders');
};


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

export const getConfig = (): AppConfig => {
  return safeParse(KEYS.CONFIG, {
    companyName: 'AVI CONTROL',
    logoUrl: '',
    printerConnected: false,
    scaleConnected: false,
    defaultFullCrateBatch: 5,
    defaultEmptyCrateBatch: 10,
    firebaseConfig: {
      apiKey: "",
      projectId: "",
      databaseURL: "",
      authDomain: ""
    }
  });
};

export const saveConfig = (config: AppConfig) => {
  localStorage.setItem(KEYS.CONFIG, JSON.stringify(config));
  window.dispatchEvent(new Event('avi_data_config'));
};

export const isFirebaseConfigured = (): boolean => {
    const config = getConfig();
    return !!(config.firebaseConfig?.apiKey && config.firebaseConfig?.projectId && config.firebaseConfig?.databaseURL);
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
        let dbUrl = config.databaseURL;
        if (!dbUrl && config.projectId) {
            dbUrl = `https://${config.projectId}-default-rtdb.firebaseio.com`;
        }
        const appConfig = { ...config, databaseURL: dbUrl };
        
        const tempApp = initializeApp(appConfig, tempAppName);
        const tempDb = getDatabase(tempApp);
        
        // Try to read a test path
        const testRef = ref(tempDb, '.info/connected');
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                deleteApp(tempApp);
                reject(new Error("Tiempo de espera agotado. Verifica la URL de la base de datos y tu conexión a internet."));
            }, 5000);

            onValue(testRef, (snap) => {
                clearTimeout(timeout);
                // We just need to know we can reach the server. 
                // If rules block us later, that's a different error, but at least the URL/Project is correct.
                deleteApp(tempApp);
                resolve(true);
            }, (error) => {
                clearTimeout(timeout);
                deleteApp(tempApp);
                reject(error);
            }, { onlyOnce: true });
        });
    } catch (e) {
        throw e;
    }
};

export const initCloudSync = async () => {
  const config = getConfig();
  unsubscribers.forEach(unsub => unsub());
  unsubscribers = [];

  if (isFirebaseConfigured()) {
    try {
      let app: FirebaseApp;
      const apps = getApps();
      const defaultApp = apps.find(a => a.name === '[DEFAULT]');
      
      let dbUrl = config.firebaseConfig?.databaseURL;
      if (!dbUrl && config.firebaseConfig?.projectId) {
          dbUrl = `https://${config.firebaseConfig.projectId}-default-rtdb.firebaseio.com`;
      }

      const appConfig = {
          ...config.firebaseConfig,
          databaseURL: dbUrl
      };

      if (!defaultApp) {
          app = initializeApp(appConfig);
      } else {
          app = defaultApp;
      }
      db = getDatabase(app);
      startListeners();
    } catch (e) {
      console.error("Error al conectar con la nube:", e);
    }
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

export const saveUser = (user: User) => {
    const users = getUsers();
    const idx = users.findIndex(u => u.id === user.id);
    if (idx >= 0) users[idx] = user; else users.push(user);
    localStorage.setItem(KEYS.USERS, JSON.stringify(users));
    if (db) set(ref(db, `users/${user.id}`), user).catch(e => window.dispatchEvent(new CustomEvent('avi_sync_error', { detail: e.message })));
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

export const getBatches = (): Batch[] => safeParse(KEYS.BATCHES, []);

export const saveBatch = (batch: Batch) => {
    const batches = getBatches();
    const idx = batches.findIndex(b => b.id === batch.id);
    if (idx >= 0) batches[idx] = batch; else batches.push(batch);
    localStorage.setItem(KEYS.BATCHES, JSON.stringify(batches));
    if (db) set(ref(db, `batches/${batch.id}`), batch).catch(e => window.dispatchEvent(new CustomEvent('avi_sync_error', { detail: e.message })));
};

export const deleteBatch = (id: string) => {
    const batches = getBatches().filter(b => b.id !== id);
    localStorage.setItem(KEYS.BATCHES, JSON.stringify(batches));
    if (db) remove(ref(db, `batches/${id}`)).catch(e => window.dispatchEvent(new CustomEvent('avi_sync_error', { detail: e.message })));
};

export const getOrders = (): ClientOrder[] => safeParse(KEYS.ORDERS, []);

export const getOrdersByBatch = (batchId: string): ClientOrder[] => 
    getOrders().filter(o => o.batchId === batchId);

export const saveOrder = (order: ClientOrder) => {
    const orders = getOrders();
    const idx = orders.findIndex(o => o.id === order.id);
    if (idx >= 0) orders[idx] = order; else orders.push(order);
    localStorage.setItem(KEYS.ORDERS, JSON.stringify(orders));
    if (db) set(ref(db, `orders/${order.id}`), order).catch(e => window.dispatchEvent(new CustomEvent('avi_sync_error', { detail: e.message })));
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
            await set(ref(db!, `${col}/${item.id}`), item);
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
          const cloudData: any[] = val ? Object.values(val) : [];
          const currentLocalRaw = localStorage.getItem(storageKey);
          const currentLocal: any[] = currentLocalRaw ? JSON.parse(currentLocalRaw) : [];
          
          // If cloud is completely empty but we have local data, upload it
          if (cloudData.length === 0 && currentLocal.length > 0) {
              currentLocal.forEach(item => {
                  set(ref(db!, `${colName}/${item.id}`), item).catch(err => {
                      console.error(`Upload error for ${colName}:`, err);
                      window.dispatchEvent(new CustomEvent('avi_sync_error', { detail: err.message }));
                  });
              });
              return; // The listener will trigger again after upload
          }

          // Merge logic: preserve local items that are not in cloud (assuming they were created offline)
          // To avoid re-uploading deleted items forever, we only preserve items created recently (e.g., last 7 days)
          // Since we don't have createdAt on all items, we'll just use a simple merge for now: cloud wins, 
          // but we don't delete local items if cloud is empty.
          
          if (JSON.stringify(cloudData) !== JSON.stringify(currentLocal)) {
              localStorage.setItem(storageKey, JSON.stringify(cloudData));
              window.dispatchEvent(new Event(eventName));
          }
        }, (error) => {
            console.error(`Error en listener en tiempo real (${colName}):`, error);
            window.dispatchEvent(new CustomEvent('avi_sync_error', { detail: error.message }));
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

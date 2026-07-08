
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
      
      let dbUrl = (config.firebaseConfig?.databaseURL || '').trim();
      if (!dbUrl && config.firebaseConfig?.projectId) {
          dbUrl = `https://${config.firebaseConfig.projectId}-default-rtdb.firebaseio.com`;
      }
      
      // Multi-region support: If user provides project-id.region.firebasedatabase.app
      if (dbUrl && !dbUrl.startsWith('http')) {
          dbUrl = `https://${dbUrl}`;
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
      
      // Listen for connection state specifically for UI reporting
      const connectedRef = ref(db, '.info/connected');
      onValue(connectedRef, (snap) => {
          if (snap.val() === false) {
              console.warn("Realtime Database disconnected.");
          } else {
              console.log("Realtime Database connected.");
          }
      }, (err) => {
          console.error("Connection info listener failed:", err);
          window.dispatchEvent(new CustomEvent('avi_sync_error', { detail: "Fallo de conexión: Revisa tus credenciales o reglas de seguridad." }));
      });

      startListeners();
    } catch (e: any) {
      console.error("Error al conectar con la nube:", e);
      window.dispatchEvent(new CustomEvent('avi_sync_error', { detail: e.message || "Fallo al inicializar Firebase" }));
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
          
          // Use cloud as the base, but look for fresher local items
          const mergedData = cloudDataArray.map(cloudItem => {
              const localItem = currentLocal.find(li => li.id === cloudItem.id);
              if (!localItem) return cloudItem;

              // Check updatedAt if available (added to ensure reliability)
              if (localItem.updatedAt && cloudItem.updatedAt) {
                  if (localItem.updatedAt > cloudItem.updatedAt) return localItem;
              }

              // Fallback records count heuristic for orders
              if (colName === 'orders') {
                  const cloudRC = (cloudItem.records || []).length;
                  const localRC = (localItem.records || []).length;
                  if (localRC > cloudRC) return localItem;
              }
              
              return cloudItem;
          });

          // Check if we have local-only items (initial upload scenario)
          currentLocal.forEach(localItem => {
              if (!cloudDataArray.some(ci => ci.id === localItem.id)) {
                  mergedData.push(localItem);
              }
          });

          const sortedMerged = [...mergedData].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
          const sortedLocal = [...currentLocal].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
          
          if (JSON.stringify(sortedMerged) !== JSON.stringify(sortedLocal)) {
              // If cloud is empty but local has data, upload local data
              if (cloudDataArray.length === 0 && currentLocal.length > 0) {
                  currentLocal.forEach(item => {
                      const cleaned = cleanData(item);
                      set(ref(db!, `${colName}/${item.id}`), cleaned).catch(err => {
                          console.error(`Upload error for ${colName}:`, err);
                      });
                  });
                  return;
              }

              localStorage.setItem(storageKey, JSON.stringify(mergedData));
              window.dispatchEvent(new Event(eventName));
          }
        }, (error) => {
            console.error(`Error en listener en tiempo real (${colName}):`, error);
            const msg = (error.message.toLowerCase().includes('permission') || error.message.toLowerCase().includes('denied'))
                ? "ERROR DE PERMISOS: Debes configurar las Reglas de tu Realtime Database en Firebase Console a '.read': true, '.write': true."
                : error.message;
            window.dispatchEvent(new CustomEvent('avi_sync_error', { detail: msg }));
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

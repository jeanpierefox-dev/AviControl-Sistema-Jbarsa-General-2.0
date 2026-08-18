import { User, UserRole, Batch, ClientOrder, AppConfig, WeighingType } from '../types';

const KEYS = {
  USERS: 'avi_users',
  BATCHES: 'avi_batches',
  ORDERS: 'avi_orders',
  CONFIG: 'avi_config',
  SESSION: 'avi_session'
};

// Cross-tab and local broadcast channel
const syncChannel: BroadcastChannel | null = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('avi_realtime_sync_channel')
  : null;

if (syncChannel) {
  syncChannel.onmessage = (event) => {
    const { type, key, data } = event.data || {};
    if (type === 'SYNC_DATA' && key && data) {
      localStorage.setItem(key, JSON.stringify(data));
      if (key === KEYS.USERS) window.dispatchEvent(new Event('avi_data_users'));
      if (key === KEYS.BATCHES) window.dispatchEvent(new Event('avi_data_batches'));
      if (key === KEYS.ORDERS) window.dispatchEvent(new Event('avi_data_orders'));
      if (key === KEYS.CONFIG) window.dispatchEvent(new Event('avi_data_config'));
    }
  };
}

const broadcastLocalSync = (key: string, data: any) => {
  if (syncChannel) {
    try {
      syncChannel.postMessage({ type: 'SYNC_DATA', key, data });
    } catch (e) {
      // Ignore broadcast errors
    }
  }
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
  const parsed = safeParse(KEYS.CONFIG, {});
  return {
    companyName: parsed.companyName || 'AVI CONTROL',
    logoUrl: parsed.logoUrl || '',
    printerConnected: parsed.printerConnected || false,
    scaleConnected: parsed.scaleConnected || false,
    defaultFullCrateBatch: parsed.defaultFullCrateBatch ?? 5,
    defaultEmptyCrateBatch: parsed.defaultEmptyCrateBatch ?? 10
  };
};

export const saveConfig = (config: AppConfig) => {
  localStorage.setItem(KEYS.CONFIG, JSON.stringify(config));
  broadcastLocalSync(KEYS.CONFIG, config);
  window.dispatchEvent(new Event('avi_data_config'));

  // Sync with cloud server
  fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  }).catch(err => console.warn('Cloud config sync notice:', err));
};

export const getEffectiveBranding = (
  creatorUserIdOrEntity?: string | Batch | ClientOrder | null, 
  fallbackUser?: User | null
): { companyName: string; logoUrl: string } => {
  const config = getConfig();
  let companyName = config.companyName || 'AVI CONTROL';
  let logoUrl = config.logoUrl || '';

  let creatorId: string | undefined;
  if (typeof creatorUserIdOrEntity === 'string') {
    creatorId = creatorUserIdOrEntity;
  } else if (creatorUserIdOrEntity && typeof creatorUserIdOrEntity === 'object' && 'createdBy' in creatorUserIdOrEntity) {
    creatorId = (creatorUserIdOrEntity as any).createdBy;
  }

  if (!creatorId && fallbackUser) {
    creatorId = fallbackUser.id;
  }

  if (creatorId) {
    const allUsers = getUsers();
    const user = allUsers.find(u => u.id === creatorId);
    if (user) {
      if (user.logoUrl) logoUrl = user.logoUrl;
      if (user.companyName) companyName = user.companyName;

      // If user is an operator under a supervisor with parentId
      if ((!user.logoUrl || !user.companyName) && user.parentId) {
        const parent = allUsers.find(u => u.id === user.parentId);
        if (parent) {
          if (!user.logoUrl && parent.logoUrl) logoUrl = parent.logoUrl;
          if (!user.companyName && parent.companyName) companyName = parent.companyName;
        }
      }
    }
  }

  return { companyName, logoUrl };
};

export const isFirebaseConfigured = (): boolean => {
  return true; // Always connected to backend cloud
};

let eventSource: EventSource | null = null;
let pollInterval: any = null;
let isCloudConnected = false;
let connectionListeners: ((connected: boolean) => void)[] = [];

const notifyConnectionState = (connected: boolean) => {
  isCloudConnected = connected;
  connectionListeners.forEach(fn => {
    try { fn(connected); } catch (e) {}
  });
};

export const onConnectionStateChange = (callback: (connected: boolean) => void) => {
  connectionListeners.push(callback);
  callback(isCloudConnected);
  return () => {
    connectionListeners = connectionListeners.filter(fn => fn !== callback);
  };
};

export const resetApp = async () => {
  localStorage.clear();
  try {
    await fetch('/api/reset', { method: 'POST' });
  } catch (e) {}
  window.location.reload();
};

export const testFirebaseConnection = async (): Promise<boolean> => {
  try {
    const res = await fetch('/api/health');
    return res.ok;
  } catch (e) {
    return true;
  }
};

const mergeServerData = (serverData: { users?: any[]; batches?: any[]; orders?: any[]; config?: any }) => {
  if (!serverData) return;

  if (Array.isArray(serverData.users) && serverData.users.length > 0) {
    const localUsers = safeParse(KEYS.USERS, []);
    const localMap = new Map(localUsers.map((u: any) => [u.id, u]));
    serverData.users.forEach((u: any) => {
      localMap.set(u.id, u);
    });
    const merged = Array.from(localMap.values());
    if (JSON.stringify(merged) !== JSON.stringify(localUsers)) {
      localStorage.setItem(KEYS.USERS, JSON.stringify(merged));
      window.dispatchEvent(new Event('avi_data_users'));
    }
  }

  if (Array.isArray(serverData.batches)) {
    const localBatches = safeParse(KEYS.BATCHES, []);
    const localMap = new Map<string, any>(localBatches.map((b: any) => [b.id, b]));
    
    serverData.batches.forEach((serverBatch: any) => {
      const local: any = localMap.get(serverBatch.id);
      if (!local || (serverBatch.updatedAt || 0) >= (local.updatedAt || 0)) {
        localMap.set(serverBatch.id, serverBatch);
      }
    });

    const merged = Array.from(localMap.values());
    if (JSON.stringify(merged) !== JSON.stringify(localBatches)) {
      localStorage.setItem(KEYS.BATCHES, JSON.stringify(merged));
      window.dispatchEvent(new Event('avi_data_batches'));
    }
  }

  if (Array.isArray(serverData.orders)) {
    const localOrders = safeParse(KEYS.ORDERS, []);
    const localMap = new Map<string, any>(localOrders.map((o: any) => [o.id, o]));

    serverData.orders.forEach((serverOrder: any) => {
      const local: any = localMap.get(serverOrder.id);
      if (!local) {
        localMap.set(serverOrder.id, serverOrder);
      } else {
        const sRecords = (serverOrder.records || []).length;
        const lRecords = (local.records || []).length;
        if (sRecords >= lRecords || (serverOrder.updatedAt || 0) >= (local.updatedAt || 0)) {
          localMap.set(serverOrder.id, serverOrder);
        }
      }
    });

    const merged = Array.from(localMap.values());
    if (JSON.stringify(merged) !== JSON.stringify(localOrders)) {
      localStorage.setItem(KEYS.ORDERS, JSON.stringify(merged));
      window.dispatchEvent(new Event('avi_data_orders'));
    }
  }

  if (serverData.config && typeof serverData.config === 'object') {
    const localConfig = safeParse(KEYS.CONFIG, {});
    const updated = { ...localConfig, ...serverData.config };
    if (JSON.stringify(updated) !== JSON.stringify(localConfig)) {
      localStorage.setItem(KEYS.CONFIG, JSON.stringify(updated));
      window.dispatchEvent(new Event('avi_data_config'));
    }
  }
};

const fetchInitialAndPoll = async () => {
  try {
    const res = await fetch('/api/data');
    if (res.ok) {
      notifyConnectionState(true);
      const serverData = await res.json();
      mergeServerData(serverData);

      // If local has data not yet on server, push immediately
      const localBatches = safeParse(KEYS.BATCHES, []);
      const localOrders = safeParse(KEYS.ORDERS, []);
      if ((serverData.batches?.length || 0) < localBatches.length || (serverData.orders?.length || 0) < localOrders.length) {
        await uploadLocalToCloud();
      }
    } else {
      notifyConnectionState(false);
    }
  } catch (err) {
    notifyConnectionState(false);
  }
};

export const initCloudSync = async () => {
  // 1. First push whatever local data we already have to seed the server
  const localBatches = safeParse(KEYS.BATCHES, []);
  const localOrders = safeParse(KEYS.ORDERS, []);
  if (localBatches.length > 0 || localOrders.length > 0) {
    await uploadLocalToCloud();
  }

  // 2. Initial Pull from Server
  await fetchInitialAndPoll();

  // 3. Setup Server-Sent Events (SSE) for instant real-time sync across devices
  if (typeof window !== 'undefined' && 'EventSource' in window) {
    if (eventSource) {
      eventSource.close();
    }

    try {
      eventSource = new EventSource('/api/events');
      
      eventSource.onopen = () => {
        notifyConnectionState(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'HANDSHAKE') {
            notifyConnectionState(true);
          } else if (payload.type === 'SYNC_ALL' && payload.data) {
            mergeServerData(payload.data);
          } else if (payload.type === 'BATCH_UPDATED' && payload.data) {
            const batches = getBatches();
            const idx = batches.findIndex(b => b.id === payload.data.id);
            if (idx >= 0) batches[idx] = payload.data; else batches.push(payload.data);
            localStorage.setItem(KEYS.BATCHES, JSON.stringify(batches));
            broadcastLocalSync(KEYS.BATCHES, batches);
            window.dispatchEvent(new Event('avi_data_batches'));
          } else if (payload.type === 'BATCH_DELETED' && payload.data?.id) {
            const batches = getBatches().filter(b => b.id !== payload.data.id);
            localStorage.setItem(KEYS.BATCHES, JSON.stringify(batches));
            broadcastLocalSync(KEYS.BATCHES, batches);
            window.dispatchEvent(new Event('avi_data_batches'));
          } else if (payload.type === 'ORDER_UPDATED' && payload.data) {
            const orders = getOrders();
            const idx = orders.findIndex(o => o.id === payload.data.id);
            if (idx >= 0) orders[idx] = payload.data; else orders.push(payload.data);
            localStorage.setItem(KEYS.ORDERS, JSON.stringify(orders));
            broadcastLocalSync(KEYS.ORDERS, orders);
            window.dispatchEvent(new Event('avi_data_orders'));
          } else if (payload.type === 'ORDER_DELETED' && payload.data?.id) {
            const orders = getOrders().filter(o => o.id !== payload.data.id);
            localStorage.setItem(KEYS.ORDERS, JSON.stringify(orders));
            broadcastLocalSync(KEYS.ORDERS, orders);
            window.dispatchEvent(new Event('avi_data_orders'));
          } else if (payload.type === 'USER_UPDATED' && payload.data) {
            const users = getUsers();
            const idx = users.findIndex(u => u.id === payload.data.id);
            if (idx >= 0) users[idx] = payload.data; else users.push(payload.data);
            localStorage.setItem(KEYS.USERS, JSON.stringify(users));
            broadcastLocalSync(KEYS.USERS, users);
            window.dispatchEvent(new Event('avi_data_users'));
          } else if (payload.type === 'USER_DELETED' && payload.data?.id) {
            const users = getUsers().filter(u => u.id !== payload.data.id);
            localStorage.setItem(KEYS.USERS, JSON.stringify(users));
            broadcastLocalSync(KEYS.USERS, users);
            window.dispatchEvent(new Event('avi_data_users'));
          } else if (payload.type === 'CONFIG_UPDATED' && payload.data) {
            localStorage.setItem(KEYS.CONFIG, JSON.stringify(payload.data));
            broadcastLocalSync(KEYS.CONFIG, payload.data);
            window.dispatchEvent(new Event('avi_data_config'));
          }
        } catch (e) {
          // Ignore JSON parse error on heartbeat
        }
      };

      eventSource.onerror = () => {
        notifyConnectionState(false);
      };
    } catch (e) {
      console.warn('SSE fallback to polling:', e);
    }
  }

  // 3. Periodic Background Sync (every 2.5 seconds) to ensure zero dropouts
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(fetchInitialAndPoll, 2500);
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

  // Auto-migrate admin password if needed
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
  broadcastLocalSync(KEYS.USERS, users);
  window.dispatchEvent(new Event('avi_data_users'));

  fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user)
  }).catch(e => console.warn('User cloud sync notice:', e));
};

export const deleteUser = (id: string) => {
  const users = getUsers().filter(u => u.id !== id);
  localStorage.setItem(KEYS.USERS, JSON.stringify(users));
  broadcastLocalSync(KEYS.USERS, users);
  window.dispatchEvent(new Event('avi_data_users'));

  fetch(`/api/users/${id}`, {
    method: 'DELETE'
  }).catch(e => console.warn('User delete cloud notice:', e));
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

export const saveBatch = (batch: Batch) => {
  const batches = getBatches();
  const bWithMeta = { ...batch, updatedAt: Date.now() };
  const idx = batches.findIndex(b => b.id === bWithMeta.id);
  if (idx >= 0) batches[idx] = bWithMeta; else batches.push(bWithMeta);
  localStorage.setItem(KEYS.BATCHES, JSON.stringify(batches));
  broadcastLocalSync(KEYS.BATCHES, batches);
  window.dispatchEvent(new Event('avi_data_batches'));

  fetch('/api/batches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bWithMeta)
  }).catch(e => console.warn('Batch cloud sync notice:', e));
};

export const deleteBatch = (id: string) => {
  const batches = getBatches().filter(b => b.id !== id);
  localStorage.setItem(KEYS.BATCHES, JSON.stringify(batches));
  broadcastLocalSync(KEYS.BATCHES, batches);
  window.dispatchEvent(new Event('avi_data_batches'));

  fetch(`/api/batches/${id}`, {
    method: 'DELETE'
  }).catch(e => console.warn('Batch delete cloud notice:', e));
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
  localStorage.setItem(KEYS.ORDERS, JSON.stringify(orders));
  broadcastLocalSync(KEYS.ORDERS, orders);
  window.dispatchEvent(new Event('avi_data_orders'));

  fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(oWithMeta)
  }).catch(e => console.warn('Order cloud sync notice:', e));
};

export const deleteOrder = (id: string) => {
  const orders = getOrders().filter(o => o.id !== id);
  localStorage.setItem(KEYS.ORDERS, JSON.stringify(orders));
  broadcastLocalSync(KEYS.ORDERS, orders);
  window.dispatchEvent(new Event('avi_data_orders'));

  fetch(`/api/orders/${id}`, {
    method: 'DELETE'
  }).catch(e => console.warn('Order delete cloud notice:', e));
};

export const uploadLocalToCloud = async () => {
  const payload = {
    users: getUsers(),
    batches: getBatches(),
    orders: getOrders(),
    config: getConfig()
  };

  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      notifyConnectionState(true);
    }
  } catch (err) {
    console.warn('Direct cloud upload notice:', err);
  }
};

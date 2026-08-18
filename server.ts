import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Data directory & storage file
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

interface DatabaseSchema {
  users: any[];
  batches: any[];
  orders: any[];
  config: any;
  lastUpdated: number;
}

const defaultAdmin = {
  id: 'admin',
  username: 'admin',
  password: '1234',
  name: 'Administrador',
  role: 'ADMIN',
  allowedModes: ['BATCH', 'SOLO_POLLO', 'SOLO_JABAS']
};

const getDefaultDB = (): DatabaseSchema => ({
  users: [defaultAdmin],
  batches: [],
  orders: [],
  config: {
    companyName: 'AVI CONTROL',
    logoUrl: '',
    printerConnected: false,
    scaleConnected: false,
    defaultFullCrateBatch: 5,
    defaultEmptyCrateBatch: 10
  },
  lastUpdated: Date.now()
});

const loadDatabase = (): DatabaseSchema => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (!parsed.users || parsed.users.length === 0) {
        parsed.users = [defaultAdmin];
      }
      return {
        users: parsed.users || [defaultAdmin],
        batches: parsed.batches || [],
        orders: parsed.orders || [],
        config: parsed.config || getDefaultDB().config,
        lastUpdated: parsed.lastUpdated || Date.now()
      };
    }
  } catch (err) {
    console.error('Error loading database file, using fallback:', err);
  }
  const initial = getDefaultDB();
  saveDatabase(initial);
  return initial;
};

const saveDatabase = (db: DatabaseSchema) => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    db.lastUpdated = Date.now();
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing database file:', err);
  }
};

let db = loadDatabase();

// SSE Connected clients
type SSEClient = {
  id: number;
  res: express.Response;
};
let sseClients: SSEClient[] = [];
let nextClientId = 1;

const broadcastSSE = (payload: { type: string; data?: any }) => {
  const message = `data: ${JSON.stringify(payload)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.res.write(message);
    } catch (err) {
      // client disconnected
    }
  });
};

// Healthcheck
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    connectedClients: sseClients.length,
    batchesCount: db.batches.length,
    ordersCount: db.orders.length,
    lastUpdated: db.lastUpdated
  });
});

// SSE Stream for real-time live synchronization across devices
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = nextClientId++;
  const client: SSEClient = { id: clientId, res };
  sseClients.push(client);

  // Send initial handshake with current timestamp
  res.write(`data: ${JSON.stringify({ type: 'HANDSHAKE', lastUpdated: db.lastUpdated })}\n\n`);

  // Heartbeat ping every 15 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (e) {
      clearInterval(heartbeat);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients = sseClients.filter(c => c.id !== clientId);
  });
});

// Get all application data
app.get('/api/data', (req, res) => {
  res.json({
    users: db.users,
    batches: db.batches,
    orders: db.orders,
    config: db.config,
    lastUpdated: db.lastUpdated
  });
});

// Full or differential sync
app.post('/api/sync', (req, res) => {
  const { users, batches, orders, config } = req.body || {};
  let changed = false;

  if (Array.isArray(users)) {
    // Merge users
    const userMap = new Map(db.users.map(u => [u.id, u]));
    users.forEach(u => {
      if (u && u.id) userMap.set(u.id, u);
    });
    db.users = Array.from(userMap.values());
    changed = true;
  }

  if (Array.isArray(batches)) {
    // Merge batches by ID, prefer higher updatedAt
    const batchMap = new Map(db.batches.map(b => [b.id, b]));
    batches.forEach(b => {
      if (b && b.id) {
        const existing = batchMap.get(b.id);
        if (!existing || (b.updatedAt || 0) >= (existing.updatedAt || 0)) {
          batchMap.set(b.id, b);
        }
      }
    });
    db.batches = Array.from(batchMap.values());
    changed = true;
  }

  if (Array.isArray(orders)) {
    // Merge orders by ID, prefer higher updatedAt or longer records length
    const orderMap = new Map(db.orders.map(o => [o.id, o]));
    orders.forEach(o => {
      if (o && o.id) {
        const existing = orderMap.get(o.id);
        if (!existing) {
          orderMap.set(o.id, o);
        } else {
          const incomingRecords = (o.records || []).length;
          const existingRecords = (existing.records || []).length;
          if (incomingRecords > existingRecords || (o.updatedAt || 0) >= (existing.updatedAt || 0)) {
            orderMap.set(o.id, o);
          }
        }
      }
    });
    db.orders = Array.from(orderMap.values());
    changed = true;
  }

  if (config && typeof config === 'object') {
    db.config = { ...db.config, ...config };
    changed = true;
  }

  if (changed) {
    saveDatabase(db);
    broadcastSSE({ type: 'SYNC_ALL', data: db });
  }

  res.json({
    success: true,
    users: db.users,
    batches: db.batches,
    orders: db.orders,
    config: db.config,
    lastUpdated: db.lastUpdated
  });
});

// Single Batch Upsert
app.post('/api/batches', (req, res) => {
  const batch = req.body;
  if (!batch || !batch.id) {
    return res.status(400).json({ error: 'Batch ID is required' });
  }

  const batchWithMeta = { ...batch, updatedAt: Date.now() };
  const idx = db.batches.findIndex(b => b.id === batchWithMeta.id);
  if (idx >= 0) {
    db.batches[idx] = batchWithMeta;
  } else {
    db.batches.push(batchWithMeta);
  }

  saveDatabase(db);
  broadcastSSE({ type: 'BATCH_UPDATED', data: batchWithMeta });
  res.json({ success: true, batch: batchWithMeta });
});

// Delete Batch
app.delete('/api/batches/:id', (req, res) => {
  const { id } = req.params;
  db.batches = db.batches.filter(b => b.id !== id);
  saveDatabase(db);
  broadcastSSE({ type: 'BATCH_DELETED', data: { id } });
  res.json({ success: true, id });
});

// Single Order Upsert (Weighings, Payments, Status)
app.post('/api/orders', (req, res) => {
  const order = req.body;
  if (!order || !order.id) {
    return res.status(400).json({ error: 'Order ID is required' });
  }

  const orderWithMeta = { ...order, updatedAt: Date.now() };
  const idx = db.orders.findIndex(o => o.id === orderWithMeta.id);
  if (idx >= 0) {
    db.orders[idx] = orderWithMeta;
  } else {
    db.orders.push(orderWithMeta);
  }

  saveDatabase(db);
  broadcastSSE({ type: 'ORDER_UPDATED', data: orderWithMeta });
  res.json({ success: true, order: orderWithMeta });
});

// Delete Order
app.delete('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  db.orders = db.orders.filter(o => o.id !== id);
  saveDatabase(db);
  broadcastSSE({ type: 'ORDER_DELETED', data: { id } });
  res.json({ success: true, id });
});

// Single User Upsert
app.post('/api/users', (req, res) => {
  const user = req.body;
  if (!user || !user.id) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  const idx = db.users.findIndex(u => u.id === user.id);
  if (idx >= 0) {
    db.users[idx] = user;
  } else {
    db.users.push(user);
  }

  saveDatabase(db);
  broadcastSSE({ type: 'USER_UPDATED', data: user });
  res.json({ success: true, user });
});

// Delete User
app.delete('/api/users/:id', (req, res) => {
  const { id } = req.params;
  db.users = db.users.filter(u => u.id !== id);
  saveDatabase(db);
  broadcastSSE({ type: 'USER_DELETED', data: { id } });
  res.json({ success: true, id });
});

// Config update
app.post('/api/config', (req, res) => {
  const config = req.body;
  db.config = { ...db.config, ...config };
  saveDatabase(db);
  broadcastSSE({ type: 'CONFIG_UPDATED', data: db.config });
  res.json({ success: true, config: db.config });
});

// Reset entire database
app.post('/api/reset', (req, res) => {
  db = getDefaultDB();
  saveDatabase(db);
  broadcastSSE({ type: 'RESET', data: db });
  res.json({ success: true });
});

async function startServer() {
  // Vite middleware in dev or static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
        return res.sendFile(path.join(distPath, 'index.html'));
      }
      next();
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[AviControl Pro Cloud Server] running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

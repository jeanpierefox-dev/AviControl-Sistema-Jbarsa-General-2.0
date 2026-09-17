const fs = require('fs');
let content = fs.readFileSync('services/storage.ts', 'utf-8');

const replacement = `let unsubscribes: (() => void)[] = [];

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
};`;

const startIndex = content.indexOf('let unsubscribes: (() => void)[] = [];');
const endIndex = content.indexOf('export const getConfig = (): AppConfig => {');

if (startIndex !== -1 && endIndex !== -1) {
  content = content.substring(0, startIndex) + replacement + '\n' + content.substring(endIndex);
  fs.writeFileSync('services/storage.ts', content);
  console.log('Fixed sync logic');
}

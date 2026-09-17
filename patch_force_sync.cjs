const fs = require('fs');
let content = fs.readFileSync('services/storage.ts', 'utf-8');

const importReplacement = `import { doc, setDoc, deleteDoc, collection, onSnapshot, getDocs, writeBatch, disableNetwork, enableNetwork } from 'firebase/firestore';`;
content = content.replace(/import \{ doc, setDoc, deleteDoc, collection, onSnapshot, getDocs, writeBatch \} from 'firebase\/firestore';/, importReplacement);

const forceSyncListener = `window.addEventListener('avi_force_sync', async () => {
  try {
    notifyConnectionState(false);
    await disableNetwork(db);
    await enableNetwork(db);
    notifyConnectionState(true);
  } catch (err) {
    console.error('Force sync error', err);
  }
});`;

content = content.replace(/window\.addEventListener\('avi_force_sync', \(\) => \{\n  uploadLocalToCloud\(\);\n\}\);/, forceSyncListener);

fs.writeFileSync('services/storage.ts', content);
console.log('Force sync optimized');

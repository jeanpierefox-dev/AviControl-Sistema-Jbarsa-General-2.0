const fs = require('fs');
let content = fs.readFileSync('services/storage.ts', 'utf-8');

const replacement = `export const initCloudSync = initDataSync;

window.addEventListener('avi_force_sync', () => {
  uploadLocalToCloud();
  initDataSync();
});`;

content = content.replace(/export const initCloudSync = initDataSync;/g, replacement);

fs.writeFileSync('services/storage.ts', content);
console.log('Patched storage.ts');

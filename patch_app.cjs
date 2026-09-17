const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf-8');

const replacement = `<button 
              onClick={() => {
                const event = new CustomEvent('avi_force_sync');
                window.dispatchEvent(event);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white p-1.5 rounded-lg transition-all shadow-lg active:scale-95"
              title="Sincronizar y Actualizar Datos"
            >
              <RefreshCw size={14} className={isCloudConnected ? '' : 'animate-spin'} />
            </button>
            <div className={\`flex items-center gap-1.5 px-2 py-0.5 rounded-full border \${isCloudConnected ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-slate-700 bg-slate-800 text-slate-500'}\`}>`;

content = content.replace(
  /<div className=\{\`flex items-center gap-1\.5 px-2 py-0\.5 rounded-full border \$\{isCloudConnected \? 'border-emerald-500\/30 bg-emerald-500\/10 text-emerald-400' : 'border-slate-700 bg-slate-800 text-slate-500'\}\`\}>/g, 
  replacement
);

content = content.replace(
  /import \{ LogOut, ArrowLeft, Settings, Database, Cloud, CloudOff, Wifi, WifiOff \} from 'lucide-react';/,
  "import { LogOut, ArrowLeft, Settings, Database, Cloud, CloudOff, Wifi, WifiOff, RefreshCw } from 'lucide-react';"
);

fs.writeFileSync('App.tsx', content);
console.log('Patched App.tsx');

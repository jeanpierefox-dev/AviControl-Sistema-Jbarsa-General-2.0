
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { User } from './types';
import { LogOut, ArrowLeft, Settings, Database, Cloud, CloudOff, Wifi, WifiOff } from 'lucide-react';
import { isFirebaseConfigured, getConfig, onConnectionStateChange, initCloudSync } from './services/storage';

// Pages
import LoginPage from './components/pages/Login';
import Dashboard from './components/pages/Dashboard';
import UserManagement from './components/pages/UserManagement';
import BatchList from './components/pages/BatchList';
import WeighingStation from './components/pages/WeighingStation';
import Collections from './components/pages/Collections';
import Reports from './components/pages/Reports';
import Configuration from './components/pages/Configuration';
import ErrorBoundary from './components/ErrorBoundary';

// Context
export const AuthContext = React.createContext<{
  user: User | null;
  setUser: (u: User | null) => void;
  logout: () => void;
}>({ user: null, setUser: () => {}, logout: () => {} });

const Container: React.FC<{ children: React.ReactNode; title?: string; showBack?: boolean }> = ({ children, title, showBack }) => {
  const { user, logout } = React.useContext(AuthContext);
  const navigate = useNavigate();
  const [isCloudConnected, setIsCloudConnected] = useState(false);
  const [appName, setAppName] = useState(getConfig().companyName || 'AVI CONTROL');
  
  useEffect(() => {
    const check = () => {
        const config = getConfig();
        setAppName(config.companyName || 'AVI CONTROL');
        
        if (config.logoUrl) {
           let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
           if (!link) {
               link = document.createElement('link');
               link.rel = 'icon';
               document.head.appendChild(link);
           }
           link.href = config.logoUrl;
        }
    };
    check();
    const interval = setInterval(check, 5000);
    window.addEventListener('avi_data_config', check);
    
    const handleSyncError = (e: any) => {
        console.error("Sync error caught in App:", e.detail);
    };
    window.addEventListener('avi_sync_error', handleSyncError);
    
    let unsubConnection = () => {};
    if (isFirebaseConfigured()) {
        // Wait a bit for db to be initialized
        setTimeout(() => {
            unsubConnection = onConnectionStateChange((connected) => {
                setIsCloudConnected(connected);
            });
        }, 1000);
    }

    return () => {
        clearInterval(interval);
        window.removeEventListener('avi_data_config', check);
        window.removeEventListener('avi_sync_error', handleSyncError);
        unsubConnection();
    }
  }, []);

  if (!user) return <Navigate to="/login" />;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-blue-950 text-white shadow-lg p-2 md:p-3 sticky top-0 z-50 border-b border-blue-900">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-2">
            {showBack && (
              <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-blue-900 rounded-xl transition-all active:scale-90">
                <ArrowLeft size={18} />
              </button>
            )}
            <h1 className="text-sm md:text-base font-black tracking-tighter uppercase truncate max-w-[150px] sm:max-w-none">
                {title ? `${appName} | ${title}` : appName}
            </h1>
          </div>
          <div className="flex items-center space-x-3">
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${isCloudConnected ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-slate-700 bg-slate-800 text-slate-500'}`}>
                {isCloudConnected ? <Wifi size={12} className="animate-pulse"/> : <WifiOff size={12}/>}
                <span className="text-[9px] font-black uppercase tracking-widest hidden xs:inline">{isCloudConnected ? 'Cloud' : 'Local'}</span>
            </div>

            <div className="text-right hidden sm:block">
              <p className="text-[10px] font-black text-blue-100 uppercase leading-none">{user?.name || 'Usuario'}</p>
              <p className="text-[8px] text-blue-400 font-bold uppercase tracking-widest leading-none mt-0.5">{user?.role || 'Rol'}</p>
            </div>
            <button
              onClick={logout}
              className="bg-red-600 hover:bg-red-700 p-1.5 rounded-lg transition-all shadow-lg active:scale-95"
              title="Cerrar Sesión"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-[98%] mx-auto w-full p-2 md:p-4">
        {children}
      </main>
    </div>
  );
};

const App: React.FC = () => {
    const [user, setUserState] = useState<User | null>(null);

    const [syncError, setSyncError] = useState<string | null>(null);

    useEffect(() => {
        // 1. Check Login with Safe Parse
        const saved = localStorage.getItem('avi_session');
        if (saved) {
            try {
                setUserState(JSON.parse(saved));
            } catch (e) {
                console.error("Session corrupted, clearing");
                localStorage.removeItem('avi_session');
            }
        }

        // 2. Initialize Cloud
        if (isFirebaseConfigured()) {
            initCloudSync();
        }

        const handleSyncError = (e: any) => {
            console.error("Sync error caught in App:", e.detail);
            setSyncError(e.detail);
        };
        window.addEventListener('avi_sync_error', handleSyncError);

        return () => {
            window.removeEventListener('avi_sync_error', handleSyncError);
        };
    }, []);

    const setUser = (u: User | null) => {
        setUserState(u);
        if (u) {
            localStorage.setItem('avi_session', JSON.stringify(u));
        } else {
            localStorage.removeItem('avi_session');
        }
    };

    const logout = () => setUser(null);

    return (
        <ErrorBoundary>
            <AuthContext.Provider value={{ user, setUser, logout }}>
                {syncError && (
                    <div className="fixed top-0 left-0 right-0 z-[100] bg-red-600 text-white p-3 text-center text-xs font-bold shadow-lg flex items-center justify-center gap-2">
                        <Database size={14} />
                        Error de sincronización: {syncError}. Revisa las reglas de seguridad o la URL de la base de datos.
                        <button onClick={() => setSyncError(null)} className="ml-4 bg-red-800 px-2 py-1 rounded hover:bg-red-900 transition-all">Cerrar</button>
                    </div>
                )}
                <HashRouter>
                    <Routes>
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/" element={<Container><Dashboard /></Container>} />
                        <Route path="/usuarios" element={<Container title="Usuarios" showBack><UserManagement /></Container>} />
                        <Route path="/lotes" element={<Container title="Lotes" showBack><BatchList /></Container>} />
                        <Route path="/weigh/:mode/:batchId?" element={<Container title="Pesaje" showBack><WeighingStation /></Container>} />
                        <Route path="/cobranza" element={<Container title="Cobranza" showBack><Collections /></Container>} />
                        <Route path="/reportes" element={<Container title="Reportes" showBack><Reports /></Container>} />
                        <Route path="/config" element={<Container title="Ajustes" showBack><Configuration /></Container>} />
                        <Route path="*" element={<Navigate to="/" />} />
                    </Routes>
                </HashRouter>
            </AuthContext.Provider>
        </ErrorBoundary>
    );
};

export default App;

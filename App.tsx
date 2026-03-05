
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { User } from './types';
import { LogOut, ArrowLeft, Settings, Database, Cloud, CloudOff, Wifi, WifiOff } from 'lucide-react';
import { isFirebaseConfigured, getConfig } from './services/storage';

// Pages
import LoginPage from './components/pages/Login';
import Dashboard from './components/pages/Dashboard';
import UserManagement from './components/pages/UserManagement';
import BatchList from './components/pages/BatchList';
import WeighingStation from './components/pages/WeighingStation';
import Collections from './components/pages/Collections';
import Reports from './components/pages/Reports';
import Configuration from './components/pages/Configuration';

// Context
export const AuthContext = React.createContext<{
  user: User | null;
  setUser: (u: User | null) => void;
  logout: () => void;
}>({ user: null, setUser: () => {}, logout: () => {} });

const Container: React.FC<{ children: React.ReactNode; title?: string; showBack?: boolean }> = ({ children, title, showBack }) => {
  const { user, logout } = React.useContext(AuthContext);
  const navigate = useNavigate();
  const [isCloudConnected, setIsCloudConnected] = useState(isFirebaseConfigured());
  const [appName, setAppName] = useState(getConfig().companyName || 'AVI CONTROL');
  
  useEffect(() => {
    const check = () => {
        setIsCloudConnected(isFirebaseConfigured());
        setAppName(getConfig().companyName || 'AVI CONTROL');
    };
    const interval = setInterval(check, 5000);
    window.addEventListener('avi_data_config', check);
    return () => {
        clearInterval(interval);
        window.removeEventListener('avi_data_config', check);
    }
  }, []);

  if (!user) return <Navigate to="/login" />;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-blue-950 text-white shadow-lg p-4 sticky top-0 z-50 border-b border-blue-900">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-3">
            {showBack && (
              <button onClick={() => navigate(-1)} className="p-2 hover:bg-blue-900 rounded-xl transition-all active:scale-90">
                <ArrowLeft size={22} />
              </button>
            )}
            <h1 className="text-lg font-black tracking-tighter uppercase truncate max-w-[180px] sm:max-w-none">
                {title ? `${appName} | ${title}` : appName}
            </h1>
          </div>
          <div className="flex items-center space-x-4">
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${isCloudConnected ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-slate-700 bg-slate-800 text-slate-500'}`}>
                {isCloudConnected ? <Wifi size={14} className="animate-pulse"/> : <WifiOff size={14}/>}
                <span className="text-[10px] font-black uppercase tracking-widest hidden xs:inline">{isCloudConnected ? 'Cloud' : 'Local'}</span>
            </div>

            <div className="text-right hidden sm:block">
              <p className="text-xs font-black text-blue-100 uppercase">{user.name}</p>
              <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">{user.role}</p>
            </div>
            <button
              onClick={logout}
              className="bg-red-600 hover:bg-red-700 p-2 rounded-xl transition-all shadow-lg active:scale-95"
              title="Cerrar Sesión"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full p-4">
        {children}
      </main>
    </div>
  );
};

const App: React.FC = () => {
    const [user, setUserState] = useState<User | null>(null);

    const setUser = (u: User | null) => {
        setUserState(u);
    };

    const logout = () => setUser(null);

    return (
        <AuthContext.Provider value={{ user, setUser, logout }}>
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
    );
};

export default App;

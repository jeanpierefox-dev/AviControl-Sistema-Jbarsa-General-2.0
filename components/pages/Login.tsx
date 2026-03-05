
import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../App';
import { login, getConfig, saveConfig, validateConfig } from '../../services/storage';
import { Scale, User, Lock, Cloud, X, Wifi, ShieldCheck, Loader2, Database, Globe, Key, Smartphone, MessageSquare, Box } from 'lucide-react';

const Login: React.FC = () => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('1234');
  const [error, setError] = useState('');
  
  const [showCloudSetup, setShowCloudSetup] = useState(false);
  const [manualForm, setManualForm] = useState({
    apiKey: '', 
    projectId: '', 
    authDomain: '', 
    databaseURL: '',
    appId: '',
    storageBucket: '',
    messagingSenderId: ''
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [setupError, setSetupError] = useState('');

  const { setUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const config = getConfig();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const user = login(username, password);
    if (user) {
      setUser(user);
      navigate('/');
    } else {
      setError('Credenciales inválidas o usuario no encontrado');
    }
  };

  const handleCloudConnect = async () => {
    setSetupError('');
    setIsConnecting(true);
    try {
        if (!manualForm.apiKey || !manualForm.projectId || !manualForm.databaseURL) {
            throw new Error("El API Key, Project ID y Database URL son obligatorios");
        }
        
        const res = await validateConfig(manualForm);
        if (!res.valid) throw new Error(res.error);
        
        saveConfig({ ...config, firebaseConfig: manualForm });
        alert("✅ Conexión establecida con éxito.");
        window.location.reload();
    } catch (e: any) {
        setSetupError(e.message || "Error en los datos ingresados");
    } finally {
        setIsConnecting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-950 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-500 rounded-full blur-[100px]"></div>
          <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-indigo-500 rounded-full blur-[100px]"></div>
      </div>

      <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-2xl w-full max-w-md border border-white/20 relative z-10 text-left">
        
        <div className="mb-10 flex flex-col items-center">
          <div className="bg-blue-900 p-5 rounded-3xl mb-5 shadow-xl shadow-blue-900/20">
            {config.logoUrl ? (
               <img src={config.logoUrl} alt="Logo" className="h-14 w-14 object-contain" />
            ) : (
               <Scale size={42} className="text-white" />
            )}
          </div>
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter text-center leading-none">
            {config.companyName || 'Sistema Barsa'}
          </h1>
          <p className="text-slate-400 text-xs font-black uppercase tracking-[0.2em] mt-3">Control Avícola Corporativo</p>
          <div className="w-12 h-1 bg-blue-600 mt-4 rounded-full"></div>
        </div>
        
        {error && (
          <div className="w-full mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded-r-xl text-xs font-bold uppercase">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5 w-full">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Usuario</label>
            <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-12 pr-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:bg-white outline-none transition-all font-bold"
                placeholder="Usuario de acceso"
                required
                />
            </div>
          </div>
          
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Contraseña</label>
            <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:bg-white outline-none transition-all font-bold"
                placeholder="••••••••"
                required
                />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-900 hover:bg-blue-800 text-white font-black py-5 rounded-2xl transition-all shadow-xl shadow-blue-900/20 active:scale-95 tracking-widest text-xs uppercase mt-6"
          >
            Entrar al Sistema
          </button>
        </form>
        
        <div className="mt-8 pt-8 border-t border-slate-100 text-center flex flex-col items-center gap-4">
            <button 
                onClick={() => setShowCloudSetup(true)}
                className="flex items-center gap-2 text-blue-600 hover:text-blue-800 transition-colors text-[10px] font-black uppercase tracking-widest py-2.5 px-5 bg-blue-50 rounded-2xl border border-blue-100"
            >
                <Cloud size={14} /> Ajustes de Nube Cloud
            </button>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                AviControl Pro &bull; {new Date().getFullYear()}
            </p>
        </div>
      </div>

      {showCloudSetup && (
          <div className="fixed inset-0 bg-blue-950/95 backdrop-blur-lg flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-lg shadow-2xl border-8 border-white max-h-[95vh] overflow-y-auto">
                  <div className="flex justify-between items-center mb-6">
                      <div className="flex items-center gap-4">
                          <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl"><Wifi size={24}/></div>
                          <div className="text-left">
                            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Parámetros Cloud</h3>
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Configuración Firebase</p>
                          </div>
                      </div>
                      <button onClick={() => setShowCloudSetup(false)} className="text-slate-300 hover:text-slate-600 transition-colors"><X size={24}/></button>
                  </div>
                  
                  <div className="space-y-3 mb-6">
                      <div className="relative">
                          <Database className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                          <input 
                            value={manualForm.projectId} 
                            onChange={e => setManualForm({...manualForm, projectId: e.target.value})}
                            placeholder="Project ID * (Ej: my-app-123)"
                            className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-[11px] font-bold outline-none focus:border-blue-500"
                          />
                      </div>
                      <div className="relative">
                          <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                          <input 
                            value={manualForm.apiKey} 
                            onChange={e => setManualForm({...manualForm, apiKey: e.target.value})}
                            placeholder="API Key *"
                            className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-[11px] font-bold outline-none focus:border-blue-500"
                          />
                      </div>
                      <div className="relative">
                          <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                          <input 
                            value={manualForm.databaseURL} 
                            onChange={e => setManualForm({...manualForm, databaseURL: e.target.value})}
                            placeholder="Database URL * (Ej: https://mi-app.firebaseio.com)"
                            className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-[11px] font-bold outline-none focus:border-blue-500"
                          />
                      </div>
                      <div className="relative">
                          <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                          <input 
                            value={manualForm.appId} 
                            onChange={e => setManualForm({...manualForm, appId: e.target.value})}
                            placeholder="App ID (Opcional)"
                            className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-[11px] font-bold outline-none focus:border-blue-500"
                          />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                         <div className="relative">
                            <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                            <input value={manualForm.authDomain} onChange={e => setManualForm({...manualForm, authDomain: e.target.value})} placeholder="Auth Domain" className="w-full pl-10 pr-3 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-[10px] font-bold outline-none focus:border-blue-500" />
                         </div>
                         <div className="relative">
                            <Box className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                            <input value={manualForm.storageBucket} onChange={e => setManualForm({...manualForm, storageBucket: e.target.value})} placeholder="Bucket" className="w-full pl-10 pr-3 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-[10px] font-bold outline-none focus:border-blue-500" />
                         </div>
                      </div>
                      <div className="relative">
                          <MessageSquare className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                          <input 
                            value={manualForm.messagingSenderId} 
                            onChange={e => setManualForm({...manualForm, messagingSenderId: e.target.value})}
                            placeholder="Messaging Sender ID"
                            className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-[11px] font-bold outline-none focus:border-blue-500"
                          />
                      </div>
                  </div>

                  {setupError && (
                      <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-2xl text-[10px] font-black uppercase border border-red-100 flex items-center gap-3 text-left">
                          <ShieldCheck size={16} className="text-red-400 shrink-0"/>
                          {setupError}
                      </div>
                  )}

                  <div className="flex gap-4">
                      <button 
                        onClick={() => setShowCloudSetup(false)} 
                        className="flex-1 py-4 text-slate-400 font-black text-xs uppercase tracking-widest hover:text-slate-600 transition-colors"
                      >
                        Cerrar
                      </button>
                      <button 
                        onClick={handleCloudConnect} 
                        disabled={isConnecting}
                        className="flex-[2] bg-blue-900 disabled:bg-slate-200 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-200 hover:bg-blue-800 transition-all flex items-center justify-center gap-2"
                      >
                        {isConnecting ? <Loader2 size={18} className="animate-spin"/> : <ShieldCheck size={18}/>}
                        {isConnecting ? 'Validando...' : 'Vincular Nube'}
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Login;

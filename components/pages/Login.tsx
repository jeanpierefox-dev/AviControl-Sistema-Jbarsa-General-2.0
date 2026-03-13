
import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../App';
import { login, getConfig, saveConfig } from '../../services/storage';
import { Scale, User, Lock } from 'lucide-react';

const Login: React.FC = () => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('1234');
  const [error, setError] = useState('');
  
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
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                AviControl Pro &bull; {new Date().getFullYear()}
            </p>
        </div>
      </div>
    </div>
  );
};

export default Login;

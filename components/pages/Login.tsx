import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../App';
import { login, getConfig, getUsers } from '../../services/storage';
import { Scale, User, Lock, Eye, EyeOff, ShieldCheck, ArrowRight } from 'lucide-react';

const Login: React.FC = () => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('1234');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  
  const { setUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const config = getConfig();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = username.trim();
    const cleanPass = password.trim();
    const authenticated = login(cleanUser, cleanPass);
    if (authenticated) {
      setUser(authenticated);
      navigate('/');
    } else {
      setError('Usuario o contraseña incorrectos. Verifica tus credenciales.');
    }
  };

  const usersList = getUsers();

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-950 p-4 relative overflow-hidden">
      {/* Background elements */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-500 rounded-full blur-[100px]"></div>
          <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-indigo-500 rounded-full blur-[100px]"></div>
      </div>

      <div className="bg-white p-6 sm:p-10 rounded-[2.5rem] shadow-2xl w-full max-w-md border border-white/20 relative z-10 text-left animate-fade-in">
        
        {/* Header Branding */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="bg-blue-900 p-4 sm:p-5 rounded-3xl mb-4 shadow-xl shadow-blue-900/20">
            {config.logoUrl ? (
               <img src={config.logoUrl} alt="Logo" className="h-12 w-12 sm:h-14 sm:w-14 object-contain" />
            ) : (
               <Scale size={40} className="text-white" />
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">
            {config.companyName || 'Sistema Barsa'}
          </h1>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mt-2">
            Acceso con Usuario y Contraseña
          </p>
          <div className="w-10 h-1 bg-blue-600 mt-3 rounded-full"></div>
        </div>
        
        {error && (
          <div className="w-full mb-5 p-3.5 bg-red-50 border-l-4 border-red-500 text-red-700 rounded-r-xl text-xs font-bold uppercase tracking-tight">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 w-full">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre de Usuario</label>
            <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setError(''); }}
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:bg-white outline-none transition-all font-bold text-sm"
                  placeholder="Ej. admin"
                  autoComplete="username"
                  required
                />
            </div>
          </div>
          
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Contraseña</label>
            <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  className="w-full pl-12 pr-12 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:bg-white outline-none transition-all font-bold text-sm font-digital"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-900 hover:bg-blue-800 text-white font-black py-4 rounded-2xl transition-all shadow-xl shadow-blue-900/20 active:scale-95 tracking-widest text-xs uppercase mt-4 flex items-center justify-center gap-2"
          >
            <span>Iniciar Sesión</span>
            <ArrowRight size={16} />
          </button>
        </form>

        {/* Quick select credentials if available */}
        {usersList.length > 0 && (
          <div className="mt-6 pt-5 border-t border-slate-100">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 text-center">
              Usuarios Disponibles en este Dispositivo
            </p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {usersList.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    setUsername(u.username || '');
                    setPassword(u.password || '');
                    setError('');
                  }}
                  className="text-[10px] font-black uppercase px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-900 text-slate-600 transition-all border border-slate-200"
                >
                  {u.username} ({u.role})
                </button>
              ))}
            </div>
          </div>
        )}
        
        <div className="mt-6 pt-4 border-t border-slate-100 text-center flex items-center justify-center gap-1.5 text-[9px] text-emerald-600 font-bold uppercase tracking-widest">
            <ShieldCheck size={14} />
            <span>Acceso Seguro Directo &bull; Sin Correo Electrónico</span>
        </div>
      </div>
    </div>
  );
};

export default Login;

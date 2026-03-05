
import React, { useState, useContext, useEffect } from 'react';
import { AuthContext } from '../../App';
import { User, UserRole, WeighingType } from '../../types';
import { getUsers, saveUser, deleteUser } from '../../services/storage';
import { Trash2, Plus, Shield, Edit, User as UserIcon, Database, X } from 'lucide-react';

const UserManagement: React.FC = () => {
  const { user: currentUser } = useContext(AuthContext);
  const [users, setUsers] = useState<User[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Form State
  const [newUser, setNewUser] = useState<Partial<User>>({ 
      role: UserRole.OPERATOR,
      allowedModes: [WeighingType.BATCH, WeighingType.SOLO_POLLO, WeighingType.SOLO_JABAS]
  });

  useEffect(() => {
    refreshUsers();
  }, [currentUser]);

  const refreshUsers = () => {
    const all = getUsers();
    if (currentUser?.role === UserRole.ADMIN) {
      setUsers(all);
    } else {
      setUsers(all.filter(u => u.parentId === currentUser?.id || u.id === currentUser?.id));
    }
  };

  const handleEdit = (u: User) => {
    setNewUser(u);
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!newUser.username || !newUser.name || !newUser.password) return;
    
    const u: User = {
      id: newUser.id || Date.now().toString(),
      username: newUser.username,
      password: newUser.password,
      name: newUser.name,
      role: newUser.role as UserRole,
      parentId: newUser.parentId || currentUser?.id,
      allowedModes: newUser.allowedModes || []
    };
    saveUser(u);
    setIsModalOpen(false);
    setNewUser({ role: UserRole.OPERATOR, allowedModes: [WeighingType.BATCH, WeighingType.SOLO_POLLO, WeighingType.SOLO_JABAS] });
    refreshUsers();
  };

  const toggleMode = (mode: WeighingType) => {
      const current = newUser.allowedModes || [];
      if (current.includes(mode)) {
          setNewUser({ ...newUser, allowedModes: current.filter(m => m !== mode) });
      } else {
          setNewUser({ ...newUser, allowedModes: [...current, mode] });
      }
  };

  const canDelete = (target: User) => {
    if (target.id === currentUser?.id) return false;
    if (currentUser?.role === UserRole.ADMIN) return true;
    if (currentUser?.role === UserRole.GENERAL && target.parentId === currentUser.id) return true;
    return false;
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Gestión de Usuarios</h2>
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest flex items-center">
                <Database size={12} className="text-slate-400 mr-1"/>
                {users.length} Cuentas Registradas
            </p>
        </div>
        <button 
          onClick={() => { 
              setNewUser({ role: UserRole.OPERATOR, allowedModes: [WeighingType.BATCH, WeighingType.SOLO_POLLO, WeighingType.SOLO_JABAS] }); 
              setIsModalOpen(true); 
          }}
          className="bg-blue-900 text-white px-5 py-3 rounded-xl flex items-center hover:bg-blue-800 shadow-lg font-black text-[10px] uppercase tracking-widest transition-all active:scale-95"
        >
          <Plus size={16} className="mr-2" /> Crear Usuario
        </button>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {users.map(u => (
          <div key={u.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 hover:shadow-md transition-all flex flex-col justify-between h-full relative overflow-hidden group">
            
            <div className={`absolute top-0 right-0 px-3 py-1 rounded-bl-xl text-[9px] font-black uppercase tracking-wider ${u.role === UserRole.ADMIN ? 'bg-purple-600 text-white' : u.role === UserRole.GENERAL ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                {u.role === UserRole.ADMIN ? 'ADMIN' : u.role === UserRole.GENERAL ? 'SUPERVISOR' : 'OPERADOR'}
            </div>

            <div className="flex items-start space-x-4 mb-4">
              <div className={`p-3 rounded-2xl mt-1 ${u.role === UserRole.ADMIN ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 text-slate-500'}`}>
                {u.role === UserRole.ADMIN ? <Shield size={20} /> : <UserIcon size={20} />}
              </div>
              <div>
                <p className="font-black text-gray-900 text-base leading-tight uppercase truncate max-w-[140px]">{u.name}</p>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">@{u.username}</p>
              </div>
            </div>
            
            <div className="border-t border-gray-100 pt-3 mt-auto">
                <div className="flex gap-1 mb-4 flex-wrap">
                    {u.allowedModes?.includes(WeighingType.BATCH) && <span className="text-[8px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-black uppercase border border-blue-100">Lotes</span>}
                    {u.allowedModes?.includes(WeighingType.SOLO_POLLO) && <span className="text-[8px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-black uppercase border border-amber-100">Pollo</span>}
                    {u.allowedModes?.includes(WeighingType.SOLO_JABAS) && <span className="text-[8px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-black uppercase border border-emerald-100">Jabas</span>}
                </div>

                <div className="flex justify-end space-x-1">
                    {(currentUser?.role === UserRole.ADMIN || u.parentId === currentUser?.id) && (
                        <button onClick={() => handleEdit(u)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            <Edit size={14}/>
                        </button>
                    )}
                    {canDelete(u) && (
                        <button onClick={() => { if(confirm('¿Eliminar usuario?')) { deleteUser(u.id); refreshUsers(); }}} className="p-2 text-red-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={14}/>
                        </button>
                    )}
                </div>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md border-4 border-white overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-6">
                <h3 className="font-black text-xl text-slate-900 uppercase tracking-tighter">{newUser.id ? 'Editar Usuario' : 'Nuevo Usuario'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-300 hover:text-slate-600 p-1"><X size={24}/></button>
            </div>
            
            <div className="space-y-5">
              <div>
                  <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Nombre Completo</label>
                  <input 
                    className="w-full border-2 border-slate-100 bg-slate-50 rounded-2xl px-4 py-4 font-bold text-sm text-slate-800 outline-none focus:border-blue-500 transition-all shadow-sm" 
                    placeholder="Ej: Juan Pérez"
                    value={newUser.name || ''}
                    onChange={e => setNewUser({...newUser, name: e.target.value})}
                  />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                      <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Nombre de Usuario</label>
                      <input 
                        className="w-full border-2 border-slate-100 bg-slate-50 rounded-2xl px-4 py-4 font-bold text-sm text-slate-800 outline-none focus:border-blue-500 transition-all shadow-sm" 
                        placeholder="Login"
                        value={newUser.username || ''}
                        onChange={e => setNewUser({...newUser, username: e.target.value})}
                      />
                  </div>
                  <div>
                      <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Contraseña</label>
                      <input 
                        type="text" 
                        className="w-full border-2 border-slate-100 bg-slate-50 rounded-2xl px-4 py-4 font-bold text-sm text-slate-800 outline-none focus:border-blue-500 transition-all shadow-sm" 
                        placeholder="••••••••"
                        value={newUser.password || ''}
                        onChange={e => setNewUser({...newUser, password: e.target.value})}
                      />
                  </div>
              </div>
              
              <div>
                  <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Nivel de Acceso</label>
                  <div className="relative">
                    <select 
                        className="w-full border-2 border-slate-100 bg-slate-50 rounded-2xl px-4 py-4 font-bold text-xs text-slate-800 outline-none focus:border-blue-500 transition-all appearance-none shadow-sm"
                        value={newUser.role}
                        onChange={e => setNewUser({...newUser, role: e.target.value as UserRole})}
                    >
                        <option value={UserRole.OPERATOR}>OPERADOR</option>
                        {currentUser?.role === UserRole.ADMIN && <option value={UserRole.GENERAL}>SUPERVISOR</option>}
                        {currentUser?.role === UserRole.ADMIN && <option value={UserRole.ADMIN}>ADMINISTRADOR</option>}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                  </div>
              </div>

              <div className="pt-5 border-t border-slate-100">
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">Módulos Habilitados</p>
                  <div className="grid grid-cols-1 gap-3">
                      {[
                        { id: WeighingType.BATCH, label: 'Gestión por Lotes' },
                        { id: WeighingType.SOLO_POLLO, label: 'Modo Solo Pollo' },
                        { id: WeighingType.SOLO_JABAS, label: 'Modo Solo Jabas' }
                      ].map(m => (
                        <label key={m.id} className={`flex items-center p-4 border-2 rounded-2xl cursor-pointer transition-all ${newUser.allowedModes?.includes(m.id) ? 'border-blue-100 bg-blue-50' : 'border-slate-50 bg-white hover:bg-slate-50'}`}>
                            <input type="checkbox" className="w-5 h-5 text-blue-900 border-slate-300 rounded focus:ring-blue-900" 
                                checked={newUser.allowedModes?.includes(m.id)}
                                onChange={() => toggleMode(m.id)}
                            /> 
                            <span className="ml-4 font-bold text-xs text-slate-700 uppercase tracking-tight">{m.label}</span>
                        </label>
                      ))}
                  </div>
              </div>
            </div>
            
            <button onClick={handleSave} className="w-full mt-8 bg-blue-900 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-900/10 hover:bg-blue-800 transition-all active:scale-95">
                {newUser.id ? 'Guardar Cambios' : 'Crear Usuario'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Simple icon for select decoration
const ChevronDown: React.FC<{className?: string, size?: number}> = ({className, size}) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
);

export default UserManagement;

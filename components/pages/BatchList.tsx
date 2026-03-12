import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Batch, WeighingType, UserRole } from '../../types';
import { getBatches, saveBatch, deleteBatch, getOrdersByBatch } from '../../services/storage';
import { Plus, Trash2, Edit, Scale, Calendar, Box, Activity } from 'lucide-react';
import { AuthContext } from '../../App';

const BatchList: React.FC = () => {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showModal, setShowModal] = useState(false);
  const [currentBatch, setCurrentBatch] = useState<Partial<Batch>>({});
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  useEffect(() => {
    refresh();
  }, [selectedDate]);

  const refresh = () => {
      const all = getBatches();
      // Filter by selected date
      const filteredByDate = all.filter(b => {
          const batchDate = new Date(b.createdAt).toISOString().split('T')[0];
          return batchDate === selectedDate;
      });

      setBatches(filteredByDate.sort((a, b) => b.createdAt - a.createdAt));
      
      // Filter: Admin sees all, others see only their own
      if (user?.role !== UserRole.ADMIN) {
          setBatches(prev => prev.filter(b => b.createdBy === user?.id));
      }
  };

  const handleSave = () => {
    if (!currentBatch.name || !currentBatch.totalCratesLimit) return;
    const batch: Batch = {
      id: currentBatch.id || Date.now().toString(),
      name: currentBatch.name,
      totalCratesLimit: Number(currentBatch.totalCratesLimit),
      createdAt: currentBatch.createdAt || Date.now(),
      status: 'ACTIVE',
      createdBy: currentBatch.createdBy || user?.id // Attach User ID
    };
    saveBatch(batch);
    setShowModal(false);
    refresh();
  };

  const handleDelete = (id: string) => {
    if (confirm('¿Eliminar este lote? Se eliminarán también las pesadas asociadas.')) {
      deleteBatch(id);
      refresh();
    }
  };

  const canEdit = user?.role === UserRole.ADMIN || user?.role === UserRole.GENERAL;

  const BatchCard: React.FC<{ batch: Batch }> = ({ batch }) => {
    const orders = getOrdersByBatch(batch.id);
    let totalFullCrates = 0; let totalFullWeight = 0;
    let totalEmptyCrates = 0; let totalEmptyWeight = 0;
    let totalMort = 0; let totalMortWeight = 0;

    orders.forEach(order => {
      order.records.forEach(r => {
        if (r.type === 'FULL') { totalFullCrates += r.quantity; totalFullWeight += r.weight; }
        if (r.type === 'EMPTY') { totalEmptyCrates += r.quantity; totalEmptyWeight += r.weight; }
        if (r.type === 'MORTALITY') { totalMort += r.quantity; totalMortWeight += r.weight; }
      });
    });

    const isOverLimit = totalFullCrates >= batch.totalCratesLimit;
    const percent = Math.min((totalFullCrates / batch.totalCratesLimit) * 100, 100);
    const netWeight = totalFullWeight - totalEmptyWeight - totalMortWeight;

    return (
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 hover:shadow-2xl hover:border-blue-400 transition-all duration-300 overflow-hidden flex flex-col h-full relative group">
          {/* Header */}
          <div className="bg-slate-900 p-4 flex justify-between items-start">
             <div className="flex items-center space-x-3">
                 <div className="bg-blue-600 p-2 rounded-lg text-white shadow-lg">
                     <Box size={24} />
                 </div>
                 <div>
                     <h3 className="font-black text-white text-lg leading-tight">{batch.name}</h3>
                     <p className="text-slate-400 text-xs font-medium flex items-center mt-1">
                         <Calendar size={12} className="mr-1"/> {new Date(batch.createdAt).toLocaleDateString()}
                     </p>
                 </div>
             </div>
             {canEdit && (
                <div className="flex space-x-2">
                    <button onClick={() => { setCurrentBatch(batch); setShowModal(true); }} className="bg-slate-800 p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"><Edit size={14} /></button>
                    <button onClick={() => handleDelete(batch.id)} className="bg-slate-800 p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-slate-700 transition-colors"><Trash2 size={14} /></button>
                </div>
             )}
          </div>

          {/* Body */}
          <div className="p-5 flex-1 flex flex-col justify-between">
              <div>
                  {/* Progress */}
                  <div className="mb-6">
                      <div className="flex justify-between text-xs font-bold uppercase tracking-wider mb-2">
                          <span className="text-slate-500">Capacidad</span>
                          <span className={`${isOverLimit ? 'text-red-600' : 'text-blue-600'}`}>{totalFullCrates} / {batch.totalCratesLimit}</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-500 ${isOverLimit ? 'bg-red-500' : 'bg-gradient-to-r from-blue-500 to-blue-400'}`} style={{ width: `${percent}%` }}></div>
                      </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-2 text-center mb-4">
                      <div className="bg-blue-50 p-2 rounded-xl border border-blue-100">
                          <p className="text-[10px] font-bold text-blue-400 uppercase">Llenas</p>
                          <p className="font-black text-slate-800 text-lg leading-none">{totalFullCrates}</p>
                          <p className="text-[10px] text-slate-500 font-bold mt-1">{totalFullWeight.toFixed(2)} kg</p>
                      </div>
                      <div className="bg-orange-50 p-2 rounded-xl border border-orange-100">
                          <p className="text-[10px] font-bold text-orange-400 uppercase">Vacías</p>
                          <p className="font-black text-slate-800 text-lg leading-none">{totalEmptyCrates}</p>
                           <p className="text-[10px] text-slate-500 font-bold mt-1">{totalEmptyWeight.toFixed(2)} kg</p>
                      </div>
                      <div className="bg-red-50 p-2 rounded-xl border border-red-100">
                          <p className="text-[10px] font-bold text-red-400 uppercase">Merma</p>
                          <p className="font-black text-slate-800 text-lg leading-none">{totalMort}</p>
                           <p className="text-[10px] text-slate-500 font-bold mt-1">{totalMortWeight.toFixed(2)} kg</p>
                      </div>
                      <div className="bg-emerald-50 p-2 rounded-xl border border-emerald-100">
                          <p className="text-[10px] font-bold text-emerald-600 uppercase">Peso Neto</p>
                          <p className="font-black text-slate-800 text-lg leading-none">{netWeight.toFixed(2)}</p>
                           <p className="text-[10px] text-slate-500 font-bold mt-1">KG</p>
                      </div>
                  </div>
              </div>

              <button 
                onClick={() => navigate(`/weigh/${WeighingType.BATCH}/${batch.id}`)}
                className="w-full mt-6 bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                <Scale size={18} className="mr-2" />
                INGRESAR AL PESAJE
              </button>
          </div>
      </div>
    );
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Gestión de Lotes</h2>
            <p className="text-slate-500 font-medium text-xs">Administre sus campañas de producción</p>
        </div>
        <div className="flex items-center gap-3">
            <button 
                onClick={() => navigate('/')}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl flex items-center transition-colors shadow-sm font-bold text-xs"
            >
                Volver al Menú
            </button>
            <div className="relative">
                <Calendar size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input 
                    type="date" 
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:border-blue-500 outline-none shadow-sm"
                />
            </div>
            {canEdit && (
                <button 
                onClick={() => { setCurrentBatch({}); setShowModal(true); }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl flex items-center transition-colors shadow-lg shadow-emerald-200 font-bold text-xs"
                >
                <Plus size={16} className="mr-2" />
                Nuevo Lote
                </button>
            )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
        {batches.map(b => <BatchCard key={b.id} batch={b} />)}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm border border-gray-100">
            <h3 className="text-2xl font-black mb-6 text-slate-900">{currentBatch.id ? 'Editar Lote' : 'Crear Nuevo Lote'}</h3>
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Nombre Identificador</label>
                <input 
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 focus:border-blue-500 focus:bg-white outline-none transition-all"
                  value={currentBatch.name || ''}
                  onChange={e => setCurrentBatch({...currentBatch, name: e.target.value})}
                  placeholder="Ej. Lote 25-A"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Meta de Jabas (Límite)</label>
                <input 
                  type="number"
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 focus:border-blue-500 focus:bg-white outline-none transition-all"
                  value={currentBatch.totalCratesLimit || ''}
                  onChange={e => setCurrentBatch({...currentBatch, totalCratesLimit: Number(e.target.value)})}
                  placeholder="Ej. 5000"
                />
                <p className="text-xs text-slate-400 mt-2 flex items-center"><Activity size={12} className="mr-1"/> Se bloqueará la creación de clientes si se supera.</p>
              </div>
            </div>
            <div className="mt-8 flex justify-end space-x-3">
              <button onClick={() => setShowModal(false)} className="text-slate-500 font-bold hover:text-slate-800 px-4 py-2 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
              <button onClick={handleSave} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition-colors">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BatchList;
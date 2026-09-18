import React, { useState, useContext, useEffect, useRef } from 'react';
import { AppConfig } from '../../types';
import { 
  getConfig, saveConfig, resetApp, 
  uploadLocalToCloud, downloadCloudToLocal, 
  getStorageOverview, importJsonBackup, exportAllDataAsJSON,
  getBatches, getOrders, getUsers
} from '../../services/storage';
import { 
  Save, Check, X, Layout, 
  Image as ImageIcon, Trash2, Printer, Scale, Bluetooth, AlertCircle,
  Cloud, CloudUpload, CloudDownload, Database, RefreshCw, Download, Upload,
  CheckCircle2, HardDrive, ShieldCheck
} from 'lucide-react';
import { AuthContext } from '../../App';

const Configuration: React.FC = () => {
  const [config, setConfig] = useState<AppConfig>(getConfig());
  const [saved, setSaved] = useState(false);
  const { user } = useContext(AuthContext);

  const [browserSupport, setBrowserSupport] = useState({ 
    bluetooth: false, 
    secure: window.isSecureContext
  });

  const logoInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  // Cloud & Migration state
  const [storageOverview, setStorageOverview] = useState<{
    local: { batches: number; orders: number; users: number };
    cloud: { batches: number; orders: number; users: number; connected: boolean };
  }>({
    local: { batches: getBatches().length, orders: getOrders().length, users: getUsers().length },
    cloud: { batches: 0, orders: 0, users: 0, connected: false }
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number; stage: string; percent: number } | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const refreshOverview = async () => {
    try {
      const overview = await getStorageOverview();
      setStorageOverview(overview);
    } catch (e) {
      console.warn('Overview error:', e);
    }
  };

  useEffect(() => {
    setBrowserSupport({
      bluetooth: 'bluetooth' in navigator,
      secure: window.isSecureContext
    });
    refreshOverview();

    const handleLocalUpdate = () => {
      setStorageOverview(prev => ({
        ...prev,
        local: { batches: getBatches().length, orders: getOrders().length, users: getUsers().length }
      }));
    };

    window.addEventListener('avi_data_batches', handleLocalUpdate);
    window.addEventListener('avi_data_orders', handleLocalUpdate);
    window.addEventListener('avi_data_users', handleLocalUpdate);

    return () => {
      window.removeEventListener('avi_data_batches', handleLocalUpdate);
      window.removeEventListener('avi_data_orders', handleLocalUpdate);
      window.removeEventListener('avi_data_users', handleLocalUpdate);
    };
  }, []);

  const handleUploadLocalToCloud = async () => {
    if (!confirm('¿Deseas subir y migrar todos los lotes, pedidos y usuarios de este dispositivo a la nueva nube? Los datos existentes en la nube se combinarán sin borrarse.')) {
      return;
    }
    setIsSyncing(true);
    setSyncFeedback(null);
    setSyncProgress({ current: 0, total: 100, stage: 'Iniciando subida a la nube...', percent: 5 });

    try {
      const res = await uploadLocalToCloud((prog) => {
        setSyncProgress(prog);
      });
      setSyncFeedback({
        type: 'success',
        message: `¡Migración exitosa! Se subieron ${res.countBatches} lotes, ${res.countOrders} pedidos y ${res.countUsers} usuarios a la nube.`
      });
      await refreshOverview();
    } catch (err: any) {
      setSyncFeedback({
        type: 'error',
        message: 'Error al subir los datos a la nube: ' + (err.message || 'Verifica tu conexión a internet.')
      });
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
    }
  };

  const handleDownloadCloudToLocal = async () => {
    if (!confirm('¿Deseas descargar y fusionar todos los datos históricos de la nube a este dispositivo? Esto te permitirá consultar todos los lotes y órdenes antiguas.')) {
      return;
    }
    setIsSyncing(true);
    setSyncFeedback(null);
    setSyncProgress({ current: 0, total: 100, stage: 'Conectando con la nube...', percent: 10 });

    try {
      const res = await downloadCloudToLocal((prog) => {
        setSyncProgress(prog);
      });
      setSyncFeedback({
        type: 'success',
        message: `¡Descarga completa! Se sincronizaron ${res.countBatches} lotes, ${res.countOrders} pedidos y ${res.countUsers} usuarios en este dispositivo.`
      });
      await refreshOverview();
    } catch (err: any) {
      setSyncFeedback({
        type: 'error',
        message: 'Error al descargar datos de la nube: ' + (err.message || 'Verifica tu conexión.')
      });
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
    }
  };

  const handleExportBackup = () => {
    try {
      const json = exportAllDataAsJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `avicontrol_respaldo_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Error exportando respaldo: ' + err.message);
    }
  };

  const handleImportBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      if (!confirm(`¿Importar archivo "${file.name}" y transferirlo directamente a la nueva nube?`)) {
        if (backupInputRef.current) backupInputRef.current.value = '';
        return;
      }

      setIsSyncing(true);
      setSyncFeedback(null);
      setSyncProgress({ current: 0, total: 100, stage: 'Procesando archivo JSON...', percent: 20 });

      try {
        const res = await importJsonBackup(content, (prog) => setSyncProgress(prog));
        setSyncFeedback({
          type: 'success',
          message: `¡Respaldo importado! Se restauraron ${res.countBatches} lotes, ${res.countOrders} pedidos y ${res.countUsers} usuarios en el dispositivo y en la nube.`
        });
        await refreshOverview();
      } catch (err: any) {
        setSyncFeedback({
          type: 'error',
          message: 'Error al importar: ' + err.message
        });
      } finally {
        setIsSyncing(false);
        setSyncProgress(null);
        if (backupInputRef.current) backupInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleSave = () => {
    saveConfig(config);
    setSaved(true);
    window.dispatchEvent(new Event('avi_data_config'));
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setConfig({ ...config, logoUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const startNativeConnect = async (type: 'PRINTER' | 'SCALE_BT') => {
    try {
      if (!browserSupport.bluetooth) {
        alert("❌ Bluetooth no soportado en este navegador.");
        return;
      }

      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
      });

      if (device) {
        const newConfig = type === 'PRINTER' 
          ? { ...config, printerConnected: true }
          : { ...config, scaleConnected: true };
        setConfig(newConfig);
        saveConfig(newConfig);
        alert(`✅ Vinculado con ${device.name}`);
      }
    } catch (error: any) {
      if (error.name !== 'NotFoundError') alert(`Error: ${error.message}`);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-fade-in text-left">
      {/* Identidad del Sistema */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
          <div className="flex-1 w-full space-y-6">
            <div className="flex items-center gap-4">
              <div className="bg-blue-900 p-3 rounded-2xl text-white shadow-lg">
                <Layout size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Identidad del Sistema</h2>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Personalización Corporativa</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre de la Empresa</label>
                <input 
                  type="text" 
                  value={config.companyName} 
                  onChange={e => setConfig({...config, companyName: e.target.value})}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 font-bold text-sm outline-none focus:border-blue-600 focus:bg-white transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Logo del Sistema</label>
                <div className="flex gap-4">
                  <button 
                    onClick={() => logoInputRef.current?.click()}
                    className="flex-1 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-4 flex items-center justify-center gap-2 hover:bg-slate-100 transition-all text-slate-400 hover:text-slate-600"
                  >
                    <ImageIcon size={20} />
                    <span className="text-[10px] font-black uppercase">Subir Imagen</span>
                  </button>
                  {config.logoUrl && (
                    <div className="w-16 h-16 bg-white border border-slate-200 rounded-2xl p-2 flex items-center justify-center">
                      <img src={config.logoUrl} className="max-h-full max-w-full object-contain" alt="Logo preview" />
                    </div>
                  )}
                </div>
                <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sincronización y Migración a la Nube */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-blue-700 to-indigo-800 p-3 rounded-2xl text-white shadow-lg shadow-blue-800/20">
              <Cloud size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">
                Base de Datos y Migración a la Nube
              </h2>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">
                Transferencia y Sincronización Firestore v2.0
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={refreshOverview}
            disabled={isSyncing}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95"
          >
            <RefreshCw size={13} className={isSyncing ? "animate-spin" : ""} />
            Actualizar Estado
          </button>
        </div>

        {/* Panel de Comparativa: Local vs Nube */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Tarjeta Local */}
          <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-slate-200 rounded-xl text-slate-700">
                  <HardDrive size={18} />
                </div>
                <div>
                  <h4 className="font-black text-slate-900 text-sm uppercase">En este Dispositivo</h4>
                  <p className="text-[10px] text-slate-500 font-medium">Memoria Local de este Navegador</p>
                </div>
              </div>
              <span className="text-[9px] font-black uppercase px-2.5 py-1 bg-slate-200 text-slate-700 rounded-full">
                Almacenado Aquí
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-slate-200/80">
              <div className="p-2 bg-white rounded-xl border border-slate-200/60 shadow-xs">
                <p className="text-xl font-black text-slate-900">{storageOverview.local.batches}</p>
                <p className="text-[9px] font-bold text-slate-400 uppercase">Lotes</p>
              </div>
              <div className="p-2 bg-white rounded-xl border border-slate-200/60 shadow-xs">
                <p className="text-xl font-black text-slate-900">{storageOverview.local.orders}</p>
                <p className="text-[9px] font-bold text-slate-400 uppercase">Pedidos</p>
              </div>
              <div className="p-2 bg-white rounded-xl border border-slate-200/60 shadow-xs">
                <p className="text-xl font-black text-slate-900">{storageOverview.local.users}</p>
                <p className="text-[9px] font-bold text-slate-400 uppercase">Usuarios</p>
              </div>
            </div>
          </div>

          {/* Tarjeta Nube Firestore */}
          <div className="p-6 bg-blue-50/50 rounded-[2rem] border border-blue-200/80">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-600 rounded-xl text-white shadow-xs">
                  <Database size={18} />
                </div>
                <div>
                  <h4 className="font-black text-blue-950 text-sm uppercase">En la Nube (Firestore)</h4>
                  <p className="text-[10px] text-blue-700 font-medium">Base de Datos Centralizada</p>
                </div>
              </div>
              <span className="text-[9px] font-black uppercase px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Conectado
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-blue-200/60">
              <div className="p-2 bg-white rounded-xl border border-blue-100 shadow-xs">
                <p className="text-xl font-black text-blue-950">{storageOverview.cloud.batches}</p>
                <p className="text-[9px] font-bold text-blue-500 uppercase">Lotes</p>
              </div>
              <div className="p-2 bg-white rounded-xl border border-blue-100 shadow-xs">
                <p className="text-xl font-black text-blue-950">{storageOverview.cloud.orders}</p>
                <p className="text-[9px] font-bold text-blue-500 uppercase">Pedidos</p>
              </div>
              <div className="p-2 bg-white rounded-xl border border-blue-100 shadow-xs">
                <p className="text-xl font-black text-blue-950">{storageOverview.cloud.users}</p>
                <p className="text-[9px] font-bold text-blue-500 uppercase">Usuarios</p>
              </div>
            </div>
          </div>
        </div>

        {/* Barra de Progreso en Vivo */}
        {isSyncing && syncProgress && (
          <div className="p-5 bg-blue-900 text-white rounded-2xl shadow-lg animate-pulse space-y-3">
            <div className="flex justify-between items-center text-xs font-black uppercase tracking-wider">
              <span>{syncProgress.stage}</span>
              <span>{syncProgress.percent}%</span>
            </div>
            <div className="w-full bg-blue-950 h-3 rounded-full overflow-hidden p-0.5 border border-blue-700">
              <div 
                className="bg-emerald-400 h-full rounded-full transition-all duration-300"
                style={{ width: `${syncProgress.percent}%` }}
              ></div>
            </div>
            <p className="text-[10px] text-blue-200 font-bold text-right">Por favor no cierres la pestaña mientras se procesan los datos...</p>
          </div>
        )}

        {/* Notificación de Resultado */}
        {syncFeedback && (
          <div className={`p-4 rounded-2xl flex items-start gap-3 border ${syncFeedback.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
            {syncFeedback.type === 'success' ? (
              <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={20} />
            ) : (
              <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={20} />
            )}
            <div className="flex-1">
              <p className="text-xs font-black uppercase">{syncFeedback.type === 'success' ? 'Operación Completada' : 'Aviso'}</p>
              <p className="text-xs mt-0.5 font-medium">{syncFeedback.message}</p>
            </div>
            <button onClick={() => setSyncFeedback(null)} className="p-1 hover:bg-black/5 rounded-lg text-slate-400">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Acciones Principales de Migración */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
          {/* Botón 1: Subir datos del dispositivo a la nube */}
          <div className="p-6 bg-gradient-to-br from-indigo-900 to-blue-900 text-white rounded-[2rem] shadow-xl flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 bg-white/10 rounded-xl text-emerald-400">
                  <CloudUpload size={24} />
                </div>
                <h3 className="text-base font-black uppercase tracking-tight">Subir Datos Locales a la Nube</h3>
              </div>
              <p className="text-xs text-blue-100/80 leading-relaxed font-medium">
                Transfiere y fusiona todos los lotes y pedidos que tienes guardados en este dispositivo directamente hacia la nueva base de datos en la nube.
              </p>
            </div>
            <button
              type="button"
              disabled={isSyncing}
              onClick={handleUploadLocalToCloud}
              className="w-full bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-black text-xs uppercase tracking-wider py-3.5 px-5 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <CloudUpload size={18} />
              Migrar Datos de este Dispositivo a la Nube
            </button>
          </div>

          {/* Botón 2: Descargar datos de la nube a este dispositivo */}
          <div className="p-6 bg-slate-900 text-white rounded-[2rem] shadow-xl flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 bg-white/10 rounded-xl text-blue-400">
                  <CloudDownload size={24} />
                </div>
                <h3 className="text-base font-black uppercase tracking-tight">Descargar Datos de la Nube</h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed font-medium">
                Descarga todos los lotes y pesajes históricos guardados en la nube para que aparezcan en este dispositivo y puedas consultarlos o trabajar con ellos.
              </p>
            </div>
            <button
              type="button"
              disabled={isSyncing}
              onClick={handleDownloadCloudToLocal}
              className="w-full bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-black text-xs uppercase tracking-wider py-3.5 px-5 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <CloudDownload size={18} />
              Descargar Datos Antiguos al Dispositivo
            </button>
          </div>
        </div>

        {/* Sección de Respaldo por Archivo JSON */}
        <div className="p-6 bg-slate-50 border border-slate-200 rounded-[2rem] space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-black text-slate-900 text-xs uppercase tracking-wider">Copias de Seguridad (Archivos .JSON)</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">Exporta o importa archivos de respaldo para transferir datos entre cualquier equipo.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleExportBackup}
              disabled={isSyncing}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-800 px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-wider shadow-xs transition-all active:scale-95 cursor-pointer"
            >
              <Download size={15} />
              Descargar Copia (.JSON)
            </button>

            <button
              type="button"
              onClick={() => backupInputRef.current?.click()}
              disabled={isSyncing}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white border-2 border-slate-200 hover:border-blue-500 hover:text-blue-700 text-slate-800 px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-wider shadow-xs transition-all active:scale-95 cursor-pointer"
            >
              <Upload size={15} />
              Importar Archivo (.JSON) y Subir a la Nube
            </button>
            <input 
              ref={backupInputRef} 
              type="file" 
              accept=".json" 
              onChange={handleImportBackupFile} 
              className="hidden" 
            />
          </div>
        </div>
      </div>

      {/* Dispositivos Bluetooth & Ajustes de Jabas */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm">
        <div className="flex items-center gap-4 mb-8">
          <div className="bg-emerald-100 p-3 rounded-2xl text-emerald-600">
            <Bluetooth size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Periféricos Bluetooth</h2>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Conectividad de Estación</p>
          </div>
        </div>

        {!browserSupport.bluetooth && (
          <div className="mb-8 p-5 bg-amber-50 border border-amber-100 rounded-3xl flex items-start gap-4">
            <AlertCircle className="text-amber-500 shrink-0 mt-1" size={20} />
            <div>
              <p className="text-xs font-black text-amber-900 uppercase tracking-tight">Navegador No Compatible</p>
              <p className="text-[11px] text-amber-700 mt-1">Tu navegador actual no permite la comunicación directa con impresoras o básculas Bluetooth.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-4 rounded-2xl ${config.printerConnected ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                <Printer size={24} />
              </div>
              <div>
                <p className="font-black text-slate-900 uppercase text-xs tracking-tight">Impresora Térmica</p>
                <p className={`text-[10px] font-bold uppercase ${config.printerConnected ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {config.printerConnected ? '● Vinculado' : '○ Desconectado'}
                </p>
              </div>
            </div>
            {config.printerConnected ? (
              <button onClick={() => setConfig({...config, printerConnected: false})} className="p-3 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"><X size={20}/></button>
            ) : (
              <button onClick={() => startNativeConnect('PRINTER')} className="bg-blue-900 text-white px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-800 transition-all">Enlazar</button>
            )}
          </div>

          <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-4 rounded-2xl ${config.scaleConnected ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                <Scale size={24} />
              </div>
              <div>
                <p className="font-black text-slate-900 uppercase text-xs tracking-tight">Báscula Digital</p>
                <p className={`text-[10px] font-bold uppercase ${config.scaleConnected ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {config.scaleConnected ? '● Vinculado' : '○ Desconectado'}
                </p>
              </div>
            </div>
            {config.scaleConnected ? (
              <button onClick={() => setConfig({...config, scaleConnected: false})} className="p-3 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"><X size={20}/></button>
            ) : (
              <button onClick={() => startNativeConnect('SCALE_BT')} className="bg-blue-900 text-white px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-800 transition-all">Enlazar</button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-200">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-2">Jabas por Defecto (Llenas)</label>
            <input 
              type="number" 
              inputMode="numeric"
              value={config.defaultFullCrateBatch} 
              onChange={e => setConfig({...config, defaultFullCrateBatch: parseInt(e.target.value) || 0})}
              className="w-full bg-white border-2 border-slate-100 rounded-2xl px-4 py-3 font-black text-sm text-slate-900 outline-none focus:border-blue-600 transition-all"
              placeholder="Ej. 5"
            />
            <p className="text-[9px] text-slate-400 font-medium mt-2">Cantidad de jabas sugerida al iniciar una pesada de pollos llenos.</p>
          </div>

          <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-200">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-2">Jabas por Defecto (Vacías)</label>
            <input 
              type="number" 
              inputMode="numeric"
              value={config.defaultEmptyCrateBatch} 
              onChange={e => setConfig({...config, defaultEmptyCrateBatch: parseInt(e.target.value) || 0})}
              className="w-full bg-white border-2 border-slate-100 rounded-2xl px-4 py-3 font-black text-sm text-slate-900 outline-none focus:border-blue-600 transition-all"
              placeholder="Ej. 10"
            />
            <p className="text-[9px] text-slate-400 font-medium mt-2">Cantidad de jabas sugerida al iniciar una pesada de tara (vacías).</p>
          </div>
        </div>
      </div>

      {/* Botones de Guardar y Reset */}
      <div className="flex flex-col md:flex-row gap-6">
        <button 
          onClick={handleSave}
          className="flex-1 bg-blue-900 text-white py-5 rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-900/10 hover:bg-blue-800 transition-all active:scale-95 flex items-center justify-center gap-3"
        >
          {saved ? <Check size={20}/> : <Save size={20}/>}
          {saved ? 'Cambios Guardados' : 'Guardar Configuración'}
        </button>
        <button 
          onClick={() => { if(confirm('¿BORRAR TODO? Esto restaurará el sistema a fábrica.')) resetApp(); }}
          className="md:w-64 bg-white text-red-500 border-2 border-red-50 py-5 rounded-[2rem] font-black text-xs uppercase tracking-widest hover:bg-red-50 transition-all flex items-center justify-center gap-3"
        >
          <Trash2 size={20}/> Formatear Sistema
        </button>
      </div>
    </div>
  );
};

export default Configuration;

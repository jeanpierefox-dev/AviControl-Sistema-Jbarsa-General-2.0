
import React, { useState, useContext, useEffect, useRef } from 'react';
import { AppConfig } from '../../types';
import { getConfig, saveConfig, resetApp, uploadLocalToCloud, onConnectionStateChange } from '../../services/storage';
import { 
  Save, Check, X, Layout, 
  Image as ImageIcon, Trash2, Printer, Scale, Bluetooth, AlertCircle,
  Apple, ExternalLink, Info, Smartphone, Wifi, Globe,
  Cloud, Upload, Loader2
} from 'lucide-react';
import { AuthContext } from '../../App';

const Configuration: React.FC = () => {
  const [config, setConfig] = useState<AppConfig>(getConfig());
  const [saved, setSaved] = useState(false);
  const { user } = useContext(AuthContext);
  
  const [isCloudOnline, setIsCloudOnline] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState(false);

  const [browserSupport, setBrowserSupport] = useState({ 
    bluetooth: false, 
    secure: window.isSecureContext,
    isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
  });

  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
      setBrowserSupport({
          bluetooth: 'bluetooth' in navigator,
          secure: window.isSecureContext,
          isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
      });

      const unsub = onConnectionStateChange((online) => {
        setIsCloudOnline(online);
      });
      return () => unsub();
  }, []);

  const handleSave = () => {
    saveConfig(config);
    setSaved(true);
    window.dispatchEvent(new Event('avi_data_config'));
    setTimeout(() => setSaved(false), 2000);
  };

  const handleUploadData = async () => {
      setIsUploading(true);
      try {
          await uploadLocalToCloud();
          setSyncSuccessMessage(true);
          setTimeout(() => setSyncSuccessMessage(false), 3000);
      } catch (e: any) {
          alert("Aviso de sincronización: " + (e?.message || 'Error al conectar'));
      } finally {
          setIsUploading(false);
      }
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
              alert("❌ Bluetooth no soportado en este navegador.\n\nSi estás en iPhone/iPad, revisa la tarjeta de Compatibilidad Apple de abajo.");
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

      {/* Dispositivos Bluetooth */}
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

      {/* Cloud Sync Directo */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
              <div className="flex items-center gap-4">
                  <div className={`p-3.5 rounded-2xl text-white shadow-lg ${isCloudOnline ? 'bg-emerald-600 shadow-emerald-600/20' : 'bg-amber-500 shadow-amber-500/20'}`}>
                      <Cloud size={24} />
                  </div>
                  <div>
                      <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Sincronización en la Nube Automática</h2>
                      <p className={`text-[10px] font-black uppercase tracking-widest mt-1 flex items-center gap-1.5 ${isCloudOnline ? 'text-emerald-600' : 'text-amber-600'}`}>
                          <span className={`w-2.5 h-2.5 rounded-full ${isCloudOnline ? 'bg-emerald-500 animate-ping' : 'bg-amber-400'}`}></span>
                          {isCloudOnline ? 'Conexión Directa en Tiempo Real Activa' : 'Conectando con Servidor Nube...'}
                      </p>
                  </div>
              </div>
              
              <div className="flex items-center gap-3">
                  <button 
                      onClick={handleUploadData}
                      disabled={isUploading}
                      className="bg-emerald-600 text-white px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 active:scale-95 disabled:opacity-50"
                  >
                      {isUploading ? <Loader2 size={16} className="animate-spin"/> : (syncSuccessMessage ? <Check size={16} className="text-emerald-200"/> : <Upload size={16}/>)}
                      {syncSuccessMessage ? '¡Sincronizado!' : 'Forzar Sincronización Ahora'}
                  </button>
              </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-emerald-50/70 border border-emerald-100 p-5 rounded-2xl space-y-1.5">
                  <div className="flex items-center gap-2 text-emerald-950 font-black text-xs uppercase tracking-tight">
                      <Wifi size={16} className="text-emerald-600"/> Multidispositivo Automático
                  </div>
                  <p className="text-xs text-emerald-800 font-medium leading-relaxed">
                      No necesitas registrar códigos ni contraseñas. Cada pesada, lote y cliente se sincroniza de forma instantánea entre balanzas, celulares y computadoras conectadas a este enlace.
                  </p>
              </div>
              <div className="bg-slate-50 border border-slate-200/80 p-5 rounded-2xl space-y-1.5">
                  <div className="flex items-center gap-2 text-slate-800 font-black text-xs uppercase tracking-tight">
                      <Globe size={16} className="text-blue-600"/> Modo Híbrido con Respaldo
                  </div>
                  <p className="text-xs text-slate-600 font-medium leading-relaxed">
                      El sistema guarda las pesadas de forma segura en la memoria local y las transmite al servidor en tiempo real con tolerancia a caídas temporales de red.
                  </p>
              </div>
          </div>
      </div>

      {/* Apple Compatibility Card */}
      {browserSupport.isIOS && (
        <div className="bg-white rounded-[2.5rem] border border-blue-200 p-8 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                <Apple size={160} />
            </div>
            <div className="flex items-center gap-4 mb-6">
                <div className="bg-blue-600 p-3 rounded-2xl text-white">
                    <Apple size={24} />
                </div>
                <div>
                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Compatibilidad Apple iOS</h2>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Guía para iPhone / iPad</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                <div className="space-y-4">
                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                        Safari y Chrome en iOS bloquean el acceso al Bluetooth. Para conectar impresoras o balanzas directamente desde el sistema, debes usar un navegador que habilite esta función.
                    </p>
                    <div className="flex flex-col gap-3">
                        <a 
                            href="https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055" 
                            target="_blank" 
                            className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-blue-400 transition-all group"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white rounded-xl shadow-sm"><Smartphone size={16} className="text-blue-600"/></div>
                                <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">Descargar Bluefy</span>
                            </div>
                            <ExternalLink size={16} className="text-slate-300 group-hover:text-blue-600" />
                        </a>
                        <a 
                            href="https://apps.apple.com/app/webble/id1193531073" 
                            target="_blank" 
                            className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-blue-400 transition-all group"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white rounded-xl shadow-sm"><Globe size={16} className="text-blue-600"/></div>
                                <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">Descargar WebBLE</span>
                            </div>
                            <ExternalLink size={16} className="text-slate-300 group-hover:text-blue-600" />
                        </a>
                    </div>
                </div>
                <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100">
                    <h4 className="flex items-center gap-2 text-[10px] font-black text-blue-900 uppercase tracking-widest mb-3">
                        <Info size={14}/> Alternativa de Impresión
                    </h4>
                    <p className="text-[10px] text-blue-800/80 leading-relaxed font-medium">
                        Si no deseas usar un navegador especial, puedes usar el botón "Reporte A4 PDF" para abrir el menú nativo de iOS y enviar el documento a aplicaciones puente como <span className="font-bold">RawBT</span> o <span className="font-bold">PrintHand</span> que ya tengas instaladas.
                    </p>
                </div>
            </div>
        </div>
      )}

      {/* Cloud & Reset */}
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

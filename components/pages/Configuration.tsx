
import React, { useState, useContext, useEffect, useRef } from 'react';
import { AppConfig } from '../../types';
import { getConfig, saveConfig, resetApp, isFirebaseConfigured, uploadLocalToCloud, testFirebaseConnection } from '../../services/storage';
import { 
  Save, Check, X, Layout, 
  Image as ImageIcon, Trash2, Printer, Scale, Bluetooth, AlertCircle,
  Apple, ExternalLink, Info, Smartphone, Wifi, BluetoothOff, Globe,
  Cloud, CloudOff, Database, Key, Upload, Loader2, Copy, ClipboardPaste
} from 'lucide-react';
import { AuthContext } from '../../App';

const Configuration: React.FC = () => {
  const [config, setConfig] = useState<AppConfig>(getConfig());
  const [saved, setSaved] = useState(false);
  const { user } = useContext(AuthContext);
  
  const [isConnected, setIsConnected] = useState(isFirebaseConfigured());
  const [isConnecting, setIsConnecting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [browserSupport, setBrowserSupport] = useState({ 
    bluetooth: false, 
    secure: window.isSecureContext,
    isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
  });

  const [manualForm, setManualForm] = useState({
      apiKey: '', 
      projectId: '', 
      authDomain: '', 
      databaseURL: '', 
      appId: '', 
      storageBucket: '', 
      messagingSenderId: ''
  });

  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
      setIsConnected(isFirebaseConfigured());
      setBrowserSupport({
          bluetooth: 'bluetooth' in navigator,
          secure: window.isSecureContext,
          isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
      });

      if (config.firebaseConfig) {
          setManualForm({
              apiKey: config.firebaseConfig.apiKey || '',
              projectId: config.firebaseConfig.projectId || '',
              authDomain: config.firebaseConfig.authDomain || '',
              databaseURL: config.firebaseConfig.databaseURL || '',
              appId: config.firebaseConfig.appId || '',
              storageBucket: config.firebaseConfig.storageBucket || '',
              messagingSenderId: config.firebaseConfig.messagingSenderId || ''
          });
      }
  }, [config]);

  const handleSave = () => {
    saveConfig(config);
    setSaved(true);
    setIsConnected(isFirebaseConfigured());
    window.dispatchEvent(new Event('avi_data_config'));
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLinkCloud = async () => {
      if (!manualForm.projectId || !manualForm.apiKey) {
          alert("❌ Error: Project ID y API Key son obligatorios.");
          return;
      }

      setIsConnecting(true);
      
      // Construct databaseURL if missing
      let dbUrl = manualForm.databaseURL;
      if (!dbUrl && manualForm.projectId) {
          dbUrl = `https://${manualForm.projectId}-default-rtdb.firebaseio.com`;
      }
      
      const configToSave = {
          ...manualForm,
          databaseURL: dbUrl
      };

      try {
          await testFirebaseConnection(configToSave);
          saveConfig({ ...config, firebaseConfig: configToSave });
          setIsConnected(true);
          alert("✅ Servidor vinculado. El sistema se reiniciará para aplicar los cambios.");
          window.location.reload();
      } catch (error: any) {
          alert(`❌ Error al conectar con Firebase:\n${error.message}\n\nRevisa que la URL de la base de datos y el Project ID sean correctos.`);
          setIsConnecting(false);
      }
  };

  const handleUploadData = async () => {
      if (!isConnected) return;
      setIsUploading(true);
      try {
          await uploadLocalToCloud();
          alert("✅ Sincronización Exitosa.");
      } catch (e: any) {
          alert("❌ Error: " + e.message);
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

      {/* Cloud Sync */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm">
          <div className="flex items-center gap-4 mb-8">
              <div className="bg-blue-900 p-3 rounded-2xl text-white shadow-lg">
                  <Cloud size={24} />
              </div>
              <div>
                  <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Cloud Sync</h2>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Sincronización en la Nube</p>
              </div>
          </div>

          <div className="space-y-6">
              {!isConnected && (
                  <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl space-y-3">
                      <div className="flex items-center gap-2 text-amber-800 font-black text-xs uppercase tracking-widest">
                         <AlertCircle size={16}/> Instrucciones para Realtime Database
                      </div>
                      <ol className="text-[11px] text-amber-900 font-medium space-y-2 list-decimal ml-4 leading-relaxed">
                          <li>Crea un proyecto en <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="text-blue-600 underline font-bold">Firebase Console</a>.</li>
                          <li>Ve a <b>Build &gt; Realtime Database</b> y haz clic en "Crear base de datos".</li>
                          <li>Ve a la pestaña <b>Reglas (Rules)</b> y configúralas así para desarrollo:
                              <pre className="bg-amber-100/50 p-2 rounded-lg mt-1 font-mono text-[10px] text-amber-900 border border-amber-200">
{`{
  "rules": {
    ".read": true,
    ".write": true
  }
}`}
                              </pre>
                          </li>
                          <li>Ve a <b>Configuración del proyecto</b>, añade una Web App ({"</>"}) y copia el objeto <code>firebaseConfig</code>.</li>
                          <li>Asegúrate de copiar la <b>Database URL</b> que aparece en la consola de Realtime Database.</li>
                      </ol>
                  </div>
              )}

              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-blue-50 p-4 rounded-2xl border border-blue-100">
                  <div>
                      <h3 className="text-sm font-black text-blue-900 uppercase tracking-tight">Configuración de Firebase</h3>
                      <p className="text-[11px] text-blue-600 font-medium mt-1">Copia y pega estos parámetros para vincular otros dispositivos rápidamente.</p>
                  </div>
                  <div className="flex gap-2 w-full md:w-auto">
                      <button 
                          onClick={() => {
                              navigator.clipboard.writeText(JSON.stringify(manualForm, null, 2));
                              alert("✅ Configuración copiada al portapapeles");
                          }}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white text-blue-700 rounded-xl hover:bg-blue-100 transition-all font-bold text-xs uppercase tracking-wider border border-blue-200"
                          title="Copiar Configuración"
                      >
                          <Copy size={16} /> Copiar
                      </button>
                      <button 
                          onClick={async () => {
                              try {
                                  const text = await navigator.clipboard.readText();
                                  
                                  // Intentar extraer JSON si está dentro de un bloque de código
                                  let jsonStr = text;
                                  const match = text.match(/\{[\s\S]*\}/);
                                  if (match) {
                                      jsonStr = match[0];
                                      // Convertir claves sin comillas a JSON válido (ej. apiKey: "..." -> "apiKey": "...")
                                      jsonStr = jsonStr.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":').replace(/'/g, '"');
                                  }
                                  
                                  const parsed = JSON.parse(jsonStr);
                                  if (parsed.apiKey || parsed.projectId) {
                                      setManualForm({
                                          apiKey: parsed.apiKey || '',
                                          projectId: parsed.projectId || '',
                                          authDomain: parsed.authDomain || '',
                                          databaseURL: parsed.databaseURL || '',
                                          appId: parsed.appId || '',
                                          storageBucket: parsed.storageBucket || '',
                                          messagingSenderId: parsed.messagingSenderId || ''
                                      });
                                      alert("✅ Configuración pegada correctamente");
                                  } else {
                                      alert("⚠️ El texto no parece contener una configuración válida de Firebase.");
                                  }
                              } catch (e) {
                                  alert("❌ Error al pegar: Asegúrate de copiar un objeto JSON válido.");
                              }
                          }}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-bold text-xs uppercase tracking-wider shadow-sm"
                          title="Pegar Configuración"
                      >
                          <ClipboardPaste size={16} /> Pegar
                      </button>
                  </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Project ID *</label>
                      <input 
                          type="text" 
                          value={manualForm.projectId} 
                          onChange={e => setManualForm({...manualForm, projectId: e.target.value})}
                          className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-600 focus:bg-white transition-all"
                          placeholder="mi-proyecto-123"
                      />
                  </div>
                  <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">API Key *</label>
                      <input 
                          type="text" 
                          value={manualForm.apiKey} 
                          onChange={e => setManualForm({...manualForm, apiKey: e.target.value})}
                          className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-600 focus:bg-white transition-all"
                          placeholder="AIzaSy..."
                      />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Database URL * (Muy Importante)</label>
                      <input 
                          type="text" 
                          value={manualForm.databaseURL} 
                          onChange={e => setManualForm({...manualForm, databaseURL: e.target.value})}
                          className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-600 focus:bg-white transition-all"
                          placeholder="https://mi-proyecto-default-rtdb.firebaseio.com"
                      />
                      <p className="text-[9px] text-amber-600 font-bold mt-1 leading-tight">
                          * Tip: En Firebase Console, ve a <span className="font-black">"Realtime Database"</span> (no Firestore) y copia la URL completa de arriba.
                      </p>
                      <p className="text-[9px] text-red-600 font-bold mt-1 leading-tight border-l-2 border-red-500 pl-2">
                          * SOLUCIÓN PERMISSION_DENIED: Ve a la pestaña "Reglas" en Realtime Database y usa este formato exacto:<br/>
                          <code className="bg-red-50 px-1 rounded select-all block mt-1 font-mono text-[8px]">{`{ "rules": { ".read": true, ".write": true } }`}</code>
                      </p>
                  </div>
                  <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Auth Domain</label>
                      <input 
                          type="text" 
                          value={manualForm.authDomain} 
                          onChange={e => setManualForm({...manualForm, authDomain: e.target.value})}
                          className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-600 focus:bg-white transition-all"
                          placeholder="mi-proyecto.firebaseapp.com"
                      />
                  </div>
                  <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">App ID</label>
                      <input 
                          type="text" 
                          value={manualForm.appId} 
                          onChange={e => setManualForm({...manualForm, appId: e.target.value})}
                          className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-600 focus:bg-white transition-all"
                          placeholder="1:1234567890:web:abcde..."
                      />
                  </div>
                  <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Storage Bucket</label>
                      <input 
                          type="text" 
                          value={manualForm.storageBucket} 
                          onChange={e => setManualForm({...manualForm, storageBucket: e.target.value})}
                          className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-600 focus:bg-white transition-all"
                          placeholder="mi-proyecto.appspot.com"
                      />
                  </div>
                  <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Messaging Sender ID</label>
                      <input 
                          type="text" 
                          value={manualForm.messagingSenderId} 
                          onChange={e => setManualForm({...manualForm, messagingSenderId: e.target.value})}
                          className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-600 focus:bg-white transition-all"
                          placeholder="1234567890"
                      />
                  </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 mt-4">
                  <button 
                      onClick={handleLinkCloud}
                      disabled={isConnecting}
                      className="flex-[2] bg-blue-900 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-blue-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                      {isConnecting ? <Loader2 size={16} className="animate-spin"/> : <Key size={16}/>}
                      {isConnecting ? 'Vinculando...' : 'Vincular Servidor'}
                  </button>

                  {isConnected && (
                      <>
                          <button 
                              onClick={handleUploadData}
                              disabled={isUploading}
                              className="flex-1 bg-emerald-600 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                              {isUploading ? <Loader2 size={16} className="animate-spin"/> : <Upload size={16}/>}
                              Subir Datos
                          </button>
                          <button 
                              onClick={() => {
                                  if (confirm("¿Estás seguro de desvincular el servidor? Se perderá la sincronización en la nube.")) {
                                      saveConfig({ ...config, firebaseConfig: undefined });
                                      alert("✅ Servidor desvinculado. El sistema se reiniciará.");
                                      window.location.reload();
                                  }
                              }}
                              className="flex-1 bg-red-100 text-red-700 py-4 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-red-200 transition-all flex items-center justify-center gap-2"
                          >
                              <CloudOff size={16}/>
                              Desvincular
                          </button>
                      </>
                  )}
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

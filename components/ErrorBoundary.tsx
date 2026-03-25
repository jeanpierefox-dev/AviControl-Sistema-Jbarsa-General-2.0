
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl border border-red-100 max-w-lg w-full text-center space-y-6">
            <div className="bg-red-50 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto text-red-500 shadow-inner">
              <AlertTriangle size={40} />
            </div>
            
            <div>
              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Conflicto de Renderizado</h2>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-2">Error Crítico Detectado</p>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-left overflow-hidden">
              <p className="text-[10px] font-mono text-red-600 break-words leading-relaxed">
                {this.state.error?.message || 'Error desconocido en el componente'}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-blue-900 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-blue-800 transition-all active:scale-95"
              >
                <RefreshCcw size={16} /> Reintentar Carga
              </button>
              
              <button
                onClick={() => {
                  localStorage.removeItem('avi_session');
                  window.location.href = '/';
                }}
                className="w-full bg-slate-100 text-slate-600 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-200 transition-all active:scale-95"
              >
                <Home size={16} /> Volver al Inicio
              </button>
            </div>
            
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em]">
              AviControl Pro &bull; Soporte Técnico
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

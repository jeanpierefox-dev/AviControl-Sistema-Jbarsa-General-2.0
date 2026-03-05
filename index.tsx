
import React, { Component, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AlertTriangle, Trash2, RefreshCw } from 'lucide-react';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error("Root element not found");

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

// Fix: Use Component directly and provide explicit property declarations to resolve property existence errors in class components
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // Fix: Explicitly declare props and state as properties to satisfy compiler checks for "Property 'props' does not exist" and "Property 'state' does not exist"
  public props: ErrorBoundaryProps;
  public state: ErrorBoundaryState = { hasError: false, error: null };

  constructor(props: ErrorBoundaryProps) {
    super(props);
    // Fix: Initialize props and state in constructor as well for robustness and to ensure property existence
    this.props = props;
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Critical Render Error:", error, errorInfo);
  }

  handleHardReset = () => {
    if (confirm("¿Estás seguro? Esto borrará la sesión actual y todos los datos locales para recuperar el acceso al sistema.")) {
      localStorage.clear();
      window.location.href = window.location.origin;
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    // Fix: Accessing state after defining it in the class hierarchy
    if (this.state.hasError) {
      const errorMessage = this.state.error instanceof Error 
        ? this.state.error.message 
        : typeof this.state.error === 'string' 
            ? this.state.error 
            : JSON.stringify(this.state.error);

      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl max-w-md w-full text-center border-2 border-red-50 animate-fade-in">
            <div className="bg-red-100 p-4 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6 shadow-inner">
                <AlertTriangle size={40} className="text-red-600"/>
            </div>
            <h1 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tighter leading-none">Conflicto de Renderizado</h1>
            <p className="text-slate-500 mb-6 text-[10px] font-black uppercase tracking-widest leading-relaxed">
              El motor de React detectó un objeto no válido o una colisión de versiones. Se ha restaurado la compatibilidad.
            </p>
            
            <div className="bg-slate-50 p-4 rounded-2xl text-left text-[10px] font-mono text-red-500 mb-6 overflow-auto max-h-32 border border-slate-200 break-words shadow-inner">
                {errorMessage || "Error de renderizado (React Error #31)"}
            </div>

            <div className="flex flex-col gap-3">
              <button 
                onClick={this.handleReload}
                className="w-full bg-blue-900 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-800 transition-all shadow-lg flex items-center justify-center"
              >
                <RefreshCw size={16} className="mr-2"/> Reintentar Carga
              </button>
              
              <button 
                onClick={this.handleHardReset}
                className="w-full bg-white text-red-600 border-2 border-red-50 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-red-50 transition-all flex items-center justify-center"
              >
                <Trash2 size={16} className="mr-2"/> Limpiar Sesión y Datos
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Fix: Return children from props, which is inherited from Component<ErrorBoundaryProps, ErrorBoundaryState>
    return this.props.children;
  }
}

const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
  </React.StrictMode>
);

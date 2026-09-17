const fs = require('fs');
let content = fs.readFileSync('components/pages/Reports.tsx', 'utf-8');

const replacement = `import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Batch, WeighingType, UserRole, ClientOrder, WeighingRecord } from '../../types';
import { getBatches, getOrders, getConfig, saveOrder, resetApp, getVisibleUserIds, getEffectiveBranding, uploadLocalToCloud } from '../../services/storage';
import { AuthContext } from '../../App';
import { getBatchName } from './Collections';
import { generateTicketPDF, generateSalesTicketPDF, generateSummaryTicketPDF, generateLameTicketPDF, generateA4ClientPDF, generateBankStatementPDF } from '../../services/pdfHelper';

import { 
  BarChart2, Calendar, Search, Filter, Package, Users, DollarSign, 
  ChevronDown, ChevronUp, FileText, Download, TrendingUp, TrendingDown,
  Scale, CheckCircle2, ShoppingCart, Eye, X, Printer, Receipt, Share2, Wallet
} from 'lucide-react';

export const calculateTotals = (order: ClientOrder) => {
  let qF = 0, qE = 0, wF = 0, wE = 0, qM = 0, wM = 0, qLame = 0, bF = 0;

  order.records?.forEach(r => {
    if (r.type === 'FULL') {
      qF += r.quantity;
      wF += r.weight;
      if (r.birds) bF += r.birds;
    } else if (r.type === 'EMPTY') {
      qE += r.quantity;
      wE += r.weight;
    } else if (r.type === 'MORTALITY') {
      qM += r.quantity;
      wM += r.weight;
    }
    if (r.isLame) {
      qLame += r.quantity;
    }
  });

  const net = wF - wE - wM;
  let totalAmount = net * order.pricePerKg;

  // Add extras
  if (order.additionalItems) {
    order.additionalItems.forEach(item => {
      totalAmount += (item.quantity * item.pricePerUnit);
    });
  }

  const totalPaid = (order.payments || []).reduce((acc, curr) => acc + curr.amount, 0);
  const balance = totalAmount - totalPaid;

  return { qF, qE, wF, wE, qM, wM, net, totalAmount, balance, totalPaid, bF, qLame };
};

const Reports = () => {
  const { user } = React.useContext(AuthContext);
  const navigate = useNavigate();
  
  const [orders, setOrders] = useState<ClientOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'balance_desc' | 'client_asc' | 'net_desc'>('balance_desc');
  
  const [expandedClients, setExpandedClients] = useState<Record<string, boolean>>({});
  const [showDetailModal, setShowDetailModal] = useState<ClientOrder | null>(null);

  const refresh = () => {
    const allOrders = getOrders();
    const visibleIds = getVisibleUserIds(user);
    if (visibleIds.includes('*')) {
      setOrders(allOrders);
    } else {
      setOrders(allOrders.filter(o => visibleIds.includes(o.createdBy || '')));
    }
  };

  useEffect(() => {
    refresh();
    const handleSync = () => refresh();
    window.addEventListener('avi_data_orders', handleSync);
    window.addEventListener('avi_data_batches', handleSync);
    return () => {
      window.removeEventListener('avi_data_orders', handleSync);
      window.removeEventListener('avi_data_batches', handleSync);
    };
  }, []);

  const toggleClientExpansion = (clientName: string) => {
    setExpandedClients(prev => ({
      ...prev,
      [clientName]: !prev[clientName]
    }));
  };

  // Group by client
  type ClientGroup = {
    clientName: string;
    clientDni: string;
    orders: ClientOrder[];
    totalNet: number;
    totalDue: number;
    totalPaid: number;
    balance: number;
    totalCrates: number;
    totalBirds: number;
  };

  const clientGroups = useMemo(() => {
    const groups: Record<string, ClientGroup> = {};

    orders.forEach(o => {
      if (searchTerm && !o.clientName.toLowerCase().includes(searchTerm.toLowerCase())) return;
      
      const key = (o.clientName || 'Cliente No Identificado').trim().toLowerCase();
      if (!groups[key]) {
        groups[key] = {
          clientName: (o.clientName || 'Cliente No Identificado').trim(),
          clientDni: o.clientDni || '',
          orders: [],
          totalNet: 0,
          totalDue: 0,
          totalPaid: 0,
          balance: 0,
          totalCrates: 0,
          totalBirds: 0
        };
      }
      
      const t = calculateTotals(o);
      groups[key].orders.push(o);
      groups[key].totalNet += t.net;
      groups[key].totalDue += t.totalAmount;
      groups[key].totalPaid += t.totalPaid;
      groups[key].balance += t.balance;
      groups[key].totalCrates += t.qF;
      groups[key].totalBirds += t.bF;
    });

    return Object.values(groups).sort((a,b) => {
       if (sortBy === 'balance_desc') return b.balance - a.balance;
       if (sortBy === 'client_asc') return a.clientName.localeCompare(b.clientName);
       if (sortBy === 'net_desc') return b.totalNet - a.totalNet;
       return b.totalNet - a.totalNet;
    });
  }, [orders, searchTerm, sortBy]);

  const overallStats = useMemo(() => {
    let net = 0;
    let due = 0;
    let paid = 0;
    clientGroups.forEach(g => {
      net += g.totalNet;
      due += g.totalDue;
      paid += g.totalPaid;
    });
    return { net, due, paid, balance: due - paid };
  }, [clientGroups]);

  const shareViaWhatsApp = (order: ClientOrder) => {
    const t = calculateTotals(order);
    const orderDate = order.date ? new Date(order.date).toLocaleDateString() : new Date(parseInt(order.id)).toLocaleDateString();
    
    let msg = \`*TICKET DE PESAJE - AVICONTROL*\n\n\`;
    msg += \`*Cliente:* \${order.clientName}\n\`;
    msg += \`*Fecha:* \${orderDate}\n\`;
    msg += \`*Lote:* \${getBatchName(order.batchId)}\n\n\`;
    
    msg += \`*RESUMEN DE PESO*\n\`;
    msg += \`- Jabas Llenas: \${t.qF}\n\`;
    msg += \`- Pollos: \${t.bF}\n\`;
    msg += \`- Jabas Vacías: \${t.qE}\n\`;
    msg += \`- Mortalidad: \${t.qM} pollos\n\`;
    msg += \`- Cojos: \${t.qLame} pollos\n\n\`;
    
    msg += \`*KILOS*\n\`;
    msg += \`- Bruto: \${t.wF.toFixed(1)} kg\n\`;
    msg += \`- Tara: \${t.wE.toFixed(1)} kg\n\`;
    msg += \`- Merma Muertos: \${t.wM.toFixed(1)} kg\n\`;
    msg += \`- *NETO TOTAL: \${t.net.toFixed(1)} kg*\n\n\`;
    
    msg += \`*FINANCIERO*\n\`;
    msg += \`- Precio/Kg: S/ \${order.pricePerKg.toFixed(2)}\n\`;
    msg += \`- Importe Total: S/ \${t.totalAmount.toFixed(2)}\n\`;
    if (t.totalPaid > 0) {
      msg += \`- Abonado: S/ \${t.totalPaid.toFixed(2)}\n\`;
    }
    msg += \`- *Saldo Restante: S/ \${t.balance.toFixed(2)}*\n\n\`;
    
    msg += \`Gracias por su compra.\`;
    
    const url = \`https://wa.me/?text=\${encodeURIComponent(msg)}\`;
    window.open(url, '_blank');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16 text-left">
      
      {/* 1. TOP HEADER & FINANCIAL SUMMARY CARDS */}
      <div className="bg-gradient-to-br from-blue-950 via-slate-900 to-blue-900 rounded-[2.5rem] p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full font-black text-[10px] uppercase tracking-widest border border-blue-400/30">
                Dashboard Analítico
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight text-white">
              Reportes por Cliente
            </h1>
            <p className="text-xs text-blue-200/70 font-medium mt-1">
              Historial completo de pesadas, kilos acumulados y deudas agrupado por cliente.
            </p>
          </div>
        </div>

        {/* FINANCIAL STATS CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8 relative z-10">
          
          <div className="bg-emerald-950/40 backdrop-blur-md rounded-2xl p-5 border border-emerald-500/30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Peso Neto General</span>
              <div className="p-2 bg-emerald-500/20 text-emerald-300 rounded-xl"><Scale size={18}/></div>
            </div>
            <p className="font-digital text-2xl md:text-3xl font-bold text-emerald-400 mt-2">
              {overallStats.net.toFixed(1)} <span className="text-sm font-sans">kg</span>
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-200">Facturación Histórica</span>
              <div className="p-2 bg-blue-500/20 text-blue-300 rounded-xl"><DollarSign size={18}/></div>
            </div>
            <p className="font-digital text-2xl md:text-3xl font-bold text-white mt-2">
              S/. {overallStats.due.toFixed(2)}
            </p>
          </div>

          <div className="bg-red-950/40 backdrop-blur-md rounded-2xl p-5 border border-red-500/30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-red-300">Deuda General Acumulada</span>
              <div className="p-2 bg-red-500/20 text-red-300 rounded-xl"><Wallet size={18}/></div>
            </div>
            <p className="font-digital text-2xl md:text-3xl font-bold text-red-400 mt-2">
              S/. {overallStats.balance.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* 2. SEARCH BAR */}
      <div className="bg-white rounded-[2rem] p-5 md:p-6 shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
          
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input 
              type="text" 
              placeholder="Buscar por cliente..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              className="w-full pl-12 pr-10 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm text-slate-900 outline-none focus:border-blue-600 focus:bg-white transition-all shadow-inner" 
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')} 
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest hidden sm:inline">Ordenar:</span>
            <select 
              value={sortBy} 
              onChange={e => setSortBy(e.target.value as any)}
              className="bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-bold text-xs text-slate-700 outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="balance_desc">Mayor Deuda</option>
              <option value="net_desc">Mayor Peso Comprado</option>
              <option value="client_asc">Cliente (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. MAIN CONTENT: LISTADO DE CLIENTES */}
      <div className="space-y-4">
        {clientGroups.map((group) => {
          const isExpanded = expandedClients[group.clientName];
          const isFullyPaid = group.balance <= 0.05;
          const isPartial = group.totalPaid > 0 && !isFullyPaid;

          // Group orders by month
          const monthlyStats: Record<string, { totalDue: number, totalPaid: number, balance: number, net: number, orders: ClientOrder[] }> = {};
          
          group.orders.forEach(order => {
             const orderDate = order.date ? new Date(order.date) : new Date(parseInt(order.id));
             const monthYear = orderDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
             if (!monthlyStats[monthYear]) {
               monthlyStats[monthYear] = { totalDue: 0, totalPaid: 0, balance: 0, net: 0, orders: [] };
             }
             const t = calculateTotals(order);
             monthlyStats[monthYear].totalDue += t.totalAmount;
             monthlyStats[monthYear].totalPaid += t.totalPaid;
             monthlyStats[monthYear].balance += t.balance;
             monthlyStats[monthYear].net += t.net;
             monthlyStats[monthYear].orders.push(order);
          });

          return (
            <div key={group.clientName} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div 
                onClick={() => toggleClientExpansion(group.clientName)}
                className={\`p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer transition-colors \${isExpanded ? 'bg-blue-50/50' : 'hover:bg-slate-50'}\`}
              >
                <div className="flex items-center gap-3">
                  <div className={\`w-10 h-10 rounded-xl flex items-center justify-center shadow-inner bg-blue-100 text-blue-600\`}>
                    <Users size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 uppercase text-sm md:text-base">{group.clientName}</h3>
                    <p className="text-[10px] md:text-xs font-bold text-slate-500 uppercase mt-0.5">
                      {group.totalCrates} Jabas • {group.totalBirds} Pollos • {group.orders.length} Órdenes
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto">
                  <div className="text-left md:text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Peso Total Acumulado</p>
                    <p className="font-digital font-bold text-lg md:text-xl text-slate-800">
                      {group.totalNet.toFixed(1)} <span className="text-sm">kg</span>
                    </p>
                  </div>
                  <div className="text-left md:text-right hidden sm:block">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Deuda Pendiente</p>
                    <p className={\`font-digital font-bold text-sm md:text-base \${isFullyPaid ? 'text-emerald-600' : 'text-red-600'}\`}>
                      S/. {group.balance.toFixed(2)}
                    </p>
                  </div>
                  <div className="p-2 bg-slate-100 text-slate-400 rounded-lg">
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-slate-100 bg-slate-50/50 p-3 md:p-5 animate-fade-in space-y-4">
                  {/* Monthly Breakdowns */}
                  {Object.entries(monthlyStats).map(([month, stats]) => (
                    <div key={month} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                      <div className="bg-slate-100/80 p-3 border-b border-slate-200 flex flex-col md:flex-row md:justify-between md:items-center gap-2">
                         <h4 className="font-black text-slate-800 uppercase text-[11px] tracking-wider capitalize">{month}</h4>
                         <div className="flex flex-wrap gap-4">
                           <span className="text-[10px] font-bold text-slate-500 uppercase">Peso Mes: <span className="text-slate-800">{stats.net.toFixed(1)} kg</span></span>
                           <span className="text-[10px] font-bold text-slate-500 uppercase">Facturado: <span className="text-slate-800">S/. {stats.totalDue.toFixed(2)}</span></span>
                           <span className="text-[10px] font-bold text-slate-500 uppercase">Deuda Mes: <span className={\`\${stats.balance <= 0.05 ? 'text-emerald-600' : 'text-red-600'}\`}>S/. {stats.balance.toFixed(2)}</span></span>
                         </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[700px]">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500 text-[9px] font-black uppercase tracking-widest border-b border-slate-100">
                              <th className="py-2.5 px-4">Fecha / Orden</th>
                              <th className="py-2.5 px-3">Lote</th>
                              <th className="py-2.5 px-3 text-right">Peso Neto</th>
                              <th className="py-2.5 px-3 text-right">Precio/Kg</th>
                              <th className="py-2.5 px-3 text-right">Monto Deuda</th>
                              <th className="py-2.5 px-4 text-center">Acciones y Tickets</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50 text-xs">
                            {stats.orders.map(order => {
                              const t = calculateTotals(order);
                              const batchName = getBatchName(order.batchId);
                              const orderDate = order.date ? new Date(order.date).toLocaleDateString() : new Date(parseInt(order.id)).toLocaleDateString();

                              return (
                                <tr key={order.id} className="hover:bg-blue-50/30 transition-colors bg-white">
                                  <td className="py-2.5 px-4">
                                    <div className="font-bold text-slate-800 text-[11px]">{orderDate}</div>
                                    <div className="text-[9px] text-slate-400 font-mono">ID: {order.id.slice(-6)}</div>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span className="text-[9px] bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded uppercase">{batchName}</span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-digital font-bold text-emerald-600">{t.net.toFixed(1)} kg</td>
                                  <td className="py-2.5 px-3 text-right font-digital font-bold text-slate-500">S/. {order.pricePerKg.toFixed(2)}</td>
                                  <td className="py-2.5 px-3 text-right font-digital font-black">
                                    <span className={t.balance <= 0.05 ? 'text-emerald-600' : 'text-red-600'}>S/. {t.balance.toFixed(2)}</span>
                                  </td>
                                  <td className="py-2.5 px-4 text-center">
                                    <div className="flex items-center justify-center gap-1.5">
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); setShowDetailModal(order); }}
                                        className="px-2 py-1 bg-blue-900 hover:bg-blue-800 text-white rounded text-[9px] font-black uppercase flex items-center gap-1 shadow-sm"
                                        title="Ver Detalle Pesadas"
                                      >
                                        <Eye size={10} /> Detalle
                                      </button>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); generateSalesTicketPDF(order, true); }}
                                        className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded border border-emerald-200"
                                        title="Ticket Venta"
                                      >
                                        <Receipt size={12} />
                                      </button>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); shareViaWhatsApp(order); }}
                                        className="p-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded border border-green-200"
                                        title="WhatsApp"
                                      >
                                        <Share2 size={12} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        
        {clientGroups.length === 0 && (
          <div className="p-16 text-center bg-white rounded-2xl shadow-sm border border-slate-200">
            <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
              <FileText size={28} />
            </div>
            <p className="text-sm font-black text-slate-700 uppercase tracking-wider">No se encontraron clientes</p>
            <p className="text-xs text-slate-400 mt-1">Prueba cambiando la búsqueda</p>
          </div>
        )}
      </div>

      {/* Modal de Detalle de Carga y Pesadas */}
      {showDetailModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-3xl p-8 w-full max-w-4xl shadow-2xl border border-slate-100 my-auto text-left mt-8 mb-8">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-4">
                <div className="bg-blue-900 p-3.5 rounded-2xl text-white shadow-lg">
                  <Eye size={24}/>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-black text-[9px] uppercase tracking-wider border border-blue-100">
                      Detalle de Pesadas y Tickets
                    </span>
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mt-0.5">
                    {showDetailModal.clientName}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    ID: {showDetailModal.id} • Modalidad: {showDetailModal.weighingMode === WeighingType.BATCH ? 'Pesaje por Lote' : showDetailModal.weighingMode === WeighingType.SOLO_POLLO ? 'Solo Pollos (Sacos)' : 'Control Muertos'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => { setShowDetailModal(null); }} 
                className="p-2 bg-slate-100 text-slate-500 hover:text-slate-900 rounded-xl transition-all"
              >
                <X size={20}/>
              </button>
            </div>

            {/* Metrics Breakdown Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Jabas Llenas</p>
                <p className="text-xl font-black text-slate-900">{calculateTotals(showDetailModal).qF}</p>
              </div>
              <div className="bg-orange-50 p-3 rounded-2xl border border-orange-200">
                <p className="text-[9px] font-black text-orange-500 uppercase tracking-widest mb-0.5">Jabas Vacías</p>
                <p className="text-xl font-black text-orange-700">{calculateTotals(showDetailModal).qE}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Total Pollos</p>
                <p className="text-xl font-black text-blue-600">{calculateTotals(showDetailModal).bF}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Peso Bruto</p>
                <p className="text-xl font-black text-slate-900 font-digital">{calculateTotals(showDetailModal).wF.toFixed(1)}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Tara Total</p>
                <p className="text-xl font-black text-orange-600 font-digital">-{calculateTotals(showDetailModal).wE.toFixed(1)}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Mortalidad</p>
                <p className="text-xl font-black text-red-600 font-digital">-{calculateTotals(showDetailModal).wM.toFixed(1)}</p>
              </div>
              <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-200 col-span-2 sm:col-span-1">
                <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-0.5">Peso Neto</p>
                <p className="text-xl font-black text-emerald-700 font-digital">{calculateTotals(showDetailModal).net.toFixed(1)} kg</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2.5 mb-6">
              <button 
                onClick={() => generateTicketPDF(showDetailModal, true)} 
                className="flex-1 min-w-[120px] bg-white text-slate-900 border-2 border-slate-200 px-3 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
              >
                <Printer size={14} /> Ticket Detallado
              </button>
              <button 
                onClick={() => generateSalesTicketPDF(showDetailModal, true)} 
                className="flex-1 min-w-[120px] bg-emerald-50 text-emerald-900 border-2 border-emerald-200 px-3 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-emerald-100 transition-all active:scale-95 shadow-sm"
              >
                <Receipt size={14} /> Ticket Venta
              </button>
              <button 
                onClick={() => generateSummaryTicketPDF(showDetailModal, true)} 
                className="flex-1 min-w-[120px] bg-indigo-600 text-white px-3 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all active:scale-95"
              >
                <FileText size={14} /> Ticket Resumen
              </button>
              <button 
                onClick={() => generateA4ClientPDF(showDetailModal)} 
                className="flex-1 min-w-[120px] bg-blue-950 text-white px-3 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-blue-900 shadow-md shadow-blue-950/20 transition-all active:scale-95"
              >
                <Download size={14} /> Reporte A4
              </button>
              <button 
                onClick={() => shareViaWhatsApp(showDetailModal)} 
                className="flex-1 min-w-[120px] bg-green-500 text-white px-3 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-green-600 shadow-md shadow-green-500/20 transition-all active:scale-95"
              >
                <Share2 size={14} /> Compartir WhatsApp
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Full */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
                <h5 className="text-[10px] font-black text-blue-900 uppercase tracking-widest mb-2 border-b border-slate-100 pb-1.5">
                  Jabas Llenas ({calculateTotals(showDetailModal).qF} jabas, {calculateTotals(showDetailModal).bF} pollos)
                </h5>
                <div className="max-h-40 overflow-y-auto pr-1">
                  <div className="grid grid-cols-3 gap-1.5">
                    {(showDetailModal.records || []).filter(r => r.type === 'FULL').map((r, i) => (
                      <div key={r.id} className="bg-blue-50 border border-blue-100 p-1.5 rounded-lg text-center">
                        <span className="text-[8px] font-black text-blue-400 uppercase">#{(showDetailModal.records || []).filter(rt => rt.type === 'FULL').length - i}</span>
                        <p className="font-digital font-bold text-blue-950 text-xs">{r.weight.toFixed(1)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Empty */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
                <h5 className="text-[10px] font-black text-orange-700 uppercase tracking-widest mb-2 border-b border-slate-100 pb-1.5">
                  Jabas Vacías ({calculateTotals(showDetailModal).qE} jabas)
                </h5>
                <div className="max-h-40 overflow-y-auto pr-1">
                  <div className="grid grid-cols-3 gap-1.5">
                    {(showDetailModal.records || []).filter(r => r.type === 'EMPTY').map((r, i) => (
                      <div key={r.id} className="bg-orange-50 border border-orange-200 p-1.5 rounded-lg text-center">
                        <span className="text-[8px] font-black text-orange-400 uppercase">#{(showDetailModal.records || []).filter(rt => rt.type === 'EMPTY').length - i}</span>
                        <p className="font-digital font-bold text-orange-950 text-xs">{r.weight.toFixed(1)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Mortality */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
                <h5 className="text-[10px] font-black text-red-700 uppercase tracking-widest mb-2 border-b border-slate-100 pb-1.5">
                  Mortalidad ({calculateTotals(showDetailModal).qM} pollos)
                </h5>
                <div className="max-h-40 overflow-y-auto pr-1">
                  <div className="grid grid-cols-3 gap-1.5">
                    {(showDetailModal.records || []).filter(r => r.type === 'MORTALITY').map((r, i) => (
                      <div key={r.id} className="bg-red-50 border border-red-100 p-1.5 rounded-lg text-center">
                        <span className="text-[8px] font-black text-red-400 uppercase">#{(showDetailModal.records || []).filter(rt => rt.type === 'MORTALITY').length - i}</span>
                        <p className="font-digital font-bold text-red-950 text-xs">{r.weight.toFixed(1)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
`;

fs.writeFileSync('components/pages/Reports.tsx', replacement);
console.log('Patched Reports.tsx entirely');

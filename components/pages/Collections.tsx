
import React, { useState, useEffect, useContext } from 'react';
import { getOrders, saveOrder, getConfig } from '../../services/storage';
import { ClientOrder, WeighingType, UserRole, Payment } from '../../types';
import { Search, Clock, History, Printer, Filter, CheckCircle, FileText, DollarSign, ArrowUpRight, X, Calendar } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AuthContext } from '../../App';

const Collections: React.FC = () => {
  const [orders, setOrders] = useState<ClientOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<ClientOrder | null>(null);
  const [viewHistoryOrder, setViewHistoryOrder] = useState<ClientOrder | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'PENDING' | 'PAID'>('ALL');
  const { user } = useContext(AuthContext);
  
  const config = getConfig();

  useEffect(() => {
    refresh();
  }, [user]);

  const refresh = () => {
      const all = getOrders();
      if (user?.role === UserRole.ADMIN) setOrders(all);
      else setOrders(all.filter(o => !o.createdBy || o.createdBy === user?.id));
  }

  const calculateBalance = (order: ClientOrder) => {
    const full = order.records.filter(r => r.type === 'FULL').reduce((a,b)=>a+b.weight,0);
    const empty = order.records.filter(r => r.type === 'EMPTY').reduce((a,b)=>a+b.weight,0);
    const mort = order.records.filter(r => r.type === 'MORTALITY').reduce((a,b)=>a+b.weight,0);
    let net = order.weighingMode === WeighingType.SOLO_POLLO ? full : full - empty - mort;
    const totalDue = net * order.pricePerKg;
    const totalPaid = order.payments.reduce((a,b) => a + b.amount, 0);
    return { totalDue, totalPaid, balance: totalDue - totalPaid };
  };

  const filteredOrders = orders.filter(o => {
    const matchesSearch = o.clientName.toLowerCase().includes(searchTerm.toLowerCase());
    const { balance } = calculateBalance(o);
    const isPaid = balance <= 0.1 || o.paymentStatus === 'PAID';
    if (filterMode === 'PENDING') return matchesSearch && !isPaid;
    if (filterMode === 'PAID') return matchesSearch && isPaid;
    return matchesSearch;
  });

  const handlePDFOutput = (doc: jsPDF, filename: string) => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const newWindow = window.open(url, '_blank');
      if (!newWindow) {
          window.location.href = url;
      }
    } else {
      doc.save(filename);
    }
  };

  const generateReceiptPDF = (order: ClientOrder, payment: Payment, balanceInfo: any) => {
    const doc = new jsPDF({ unit: 'mm', format: [80, 150] });
    const company = config.companyName || 'SISTEMA BARSA';

    doc.setFont("helvetica", "bold").setFontSize(12);
    doc.text(company.toUpperCase(), 40, 10, { align: 'center' });
    doc.setFontSize(8).setFont("helvetica", "normal");
    doc.text("RECIBO DE ABONO / PAGO", 40, 15, { align: 'center' });
    
    doc.line(5, 18, 75, 18);

    doc.setFontSize(9);
    doc.text(`Fecha: ${new Date(payment.timestamp).toLocaleString()}`, 5, 24);
    doc.text(`Cliente: ${order.clientName.toUpperCase()}`, 5, 29);

    doc.rect(5, 33, 70, 45); 
    doc.setFont("helvetica", "bold");
    doc.text("DETALLE DE CUENTA", 40, 39, { align: 'center' });
    doc.line(5, 41, 75, 41);

    doc.setFont("helvetica", "normal");
    doc.text("Total Deuda:", 7, 47);
    doc.text(`S/. ${balanceInfo.totalDue.toFixed(2)}`, 73, 47, { align: 'right' });

    doc.setFont("helvetica", "bold").setTextColor(22, 163, 74);
    doc.text("MONTO ABONADO:", 7, 54);
    doc.text(`S/. ${payment.amount.toFixed(2)}`, 73, 54, { align: 'right' });

    doc.setTextColor(0);
    doc.setFont("helvetica", "normal");
    doc.line(10, 58, 70, 58);

    doc.setFont("helvetica", "bold").setTextColor(220, 38, 38);
    doc.text("SALDO RESTANTE:", 7, 66);
    doc.text(`S/. ${balanceInfo.balance.toFixed(2)}`, 73, 66, { align: 'right' });

    doc.setTextColor(0).setFontSize(8).setFont("helvetica", "normal");
    doc.text(`Nota: ${payment.note || 'Abono Manual'}`, 7, 73);

    doc.text("Este documento es un comprobante de abono.", 40, 85, { align: 'center' });
    doc.text("Conserve este recibo.", 40, 89, { align: 'center' });

    handlePDFOutput(doc, `Recibo_Pago_${order.clientName}_${payment.id}.pdf`);
  };

  const handlePay = () => {
    if (!selectedOrder) return;
    const amount = parseFloat(payAmount);
    if (!amount) return;
    
    const payment: Payment = { 
      id: Date.now().toString(), 
      amount, 
      timestamp: Date.now(), 
      note: 'Abono Manual' 
    };

    const updatedOrder = { ...selectedOrder };
    updatedOrder.payments.push(payment);
    const bal = calculateBalance(updatedOrder);
    
    if (bal.balance <= 0.1) updatedOrder.paymentStatus = 'PAID';
    
    saveOrder(updatedOrder);
    generateReceiptPDF(updatedOrder, payment, bal);
    
    refresh(); 
    setSelectedOrder(null);
    setPayAmount('');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-200 flex flex-col xl:flex-row justify-between items-center gap-6">
          <div className="flex-1 w-full">
            <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">Caja y Cobranzas</h2>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-2">Control de Deudas y Liquidaciones</p>
            <div className="flex flex-wrap gap-2 mt-4">
                <button onClick={() => setFilterMode('ALL')} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterMode === 'ALL' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>Todos</button>
                <button onClick={() => setFilterMode('PENDING')} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterMode === 'PENDING' ? 'bg-red-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>Pendientes</button>
                <button onClick={() => setFilterMode('PAID')} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterMode === 'PAID' ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>Pagados</button>
            </div>
          </div>
          <div className="relative w-full xl:w-[450px]">
            <input type="text" placeholder="Buscar cliente por nombre..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-900 outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner" />
            <Search className="absolute left-4 top-4 text-slate-400" size={20} />
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredOrders.map(order => {
          const { totalDue, totalPaid, balance } = calculateBalance(order);
          const isPaid = balance <= 0.1 || order.paymentStatus === 'PAID';
          return (
            <div key={order.id} className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden hover:shadow-lg hover:border-blue-300 transition-all duration-300 flex flex-col group">
                <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
                    <div>
                        <h3 className="font-black text-slate-900 uppercase text-lg tracking-tight">{order.clientName}</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-widest">{order.weighingMode === WeighingType.BATCH ? 'Venta por Lote' : 'Venta Directa'}</p>
                    </div>
                    <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-1.5 shadow-sm ${isPaid ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${isPaid ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`}></div>
                        {isPaid ? 'Pagado' : 'Pendiente'}
                    </span>
                </div>
                
                <div className="p-6 flex-1">
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Importe Total</span>
                            <span className="font-digital font-bold text-slate-700 text-xl">S/. {totalDue.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Abonado</span>
                            <span className="font-digital font-bold text-emerald-600 text-xl">S/. {totalPaid.toFixed(2)}</span>
                        </div>
                        <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                            <span className="text-xs font-black text-slate-900 uppercase tracking-widest">Saldo Actual</span>
                            <span className={`font-digital font-black text-3xl ${isPaid ? 'text-emerald-600' : 'text-red-600'}`}>S/. {balance.toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-slate-900 flex gap-3">
                    <button 
                        onClick={() => setViewHistoryOrder(order)} 
                        className="flex-1 py-3.5 bg-slate-800 text-white rounded-xl hover:bg-slate-700 transition-all text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-slate-700"
                    >
                        <History size={16} className="text-blue-400"/> Historial
                    </button>
                    {!isPaid && (
                        <button 
                            onClick={() => { setSelectedOrder(order); setPayAmount(balance.toFixed(2)); }} 
                            className="flex-1 py-3.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 transition-all text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 border border-emerald-500"
                        >
                            <DollarSign size={16}/> Cobrar en S/.
                        </button>
                    )}
                </div>
            </div>
          );
        })}
        
        {filteredOrders.length === 0 && (
            <div className="col-span-full bg-white rounded-[2rem] border border-slate-200 p-24 text-center shadow-sm">
                <div className="flex flex-col items-center">
                    <div className="bg-slate-50 p-6 rounded-full mb-4">
                        <FileText size={48} className="text-slate-300"/>
                    </div>
                    <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-sm">No se encontraron movimientos financieros</p>
                    <p className="text-slate-400 text-xs mt-2">Intenta cambiar los filtros o el término de búsqueda</p>
                </div>
            </div>
        )}
      </div>

      {/* MODAL DE HISTORIAL DE PAGOS */}
      {viewHistoryOrder && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-[2rem] w-full max-w-4xl shadow-2xl border border-slate-200 overflow-hidden animate-scale-up flex flex-col max-h-[90vh]">
                  <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-500/20 text-blue-400 rounded-xl"><History size={24}/></div>
                        <div>
                            <h3 className="text-xl font-black uppercase tracking-widest">Estado de Cuenta</h3>
                            <p className="text-xs text-slate-400 font-medium mt-1">{viewHistoryOrder.clientName} - Lote: {viewHistoryOrder.batchId.slice(-6).toUpperCase()}</p>
                        </div>
                      </div>
                      <button onClick={() => setViewHistoryOrder(null)} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"><X size={24}/></button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                          <table className="w-full text-left text-sm">
                              <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] tracking-widest border-b border-slate-200">
                                  <tr>
                                      <th className="p-4">Fecha</th>
                                      <th className="p-4">Concepto</th>
                                      <th className="p-4 text-right">Cargo (S/.)</th>
                                      <th className="p-4 text-right">Abono (S/.)</th>
                                      <th className="p-4 text-right">Saldo (S/.)</th>
                                      <th className="p-4 text-center">Recibo</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 font-mono text-xs">
                                  {/* Initial Debt Row */}
                                  <tr className="hover:bg-slate-50 transition-colors">
                                      <td className="p-4 text-slate-500">{new Date(viewHistoryOrder.timestamp).toLocaleDateString()}</td>
                                      <td className="p-4 font-sans font-medium text-slate-700">Liquidación Inicial</td>
                                      <td className="p-4 text-right text-slate-900">{calculateBalance(viewHistoryOrder).totalDue.toFixed(2)}</td>
                                      <td className="p-4 text-right text-slate-400">-</td>
                                      <td className="p-4 text-right font-bold text-red-600">{calculateBalance(viewHistoryOrder).totalDue.toFixed(2)}</td>
                                      <td className="p-4 text-center text-slate-300">-</td>
                                  </tr>
                                  
                                  {/* Payment Rows */}
                                  {(() => {
                                      let runningBalance = calculateBalance(viewHistoryOrder).totalDue;
                                      return viewHistoryOrder.payments.sort((a,b) => a.timestamp - b.timestamp).map(pay => {
                                          runningBalance -= pay.amount;
                                          return (
                                              <tr key={pay.id} className="hover:bg-blue-50/50 transition-colors">
                                                  <td className="p-4 text-slate-500">{new Date(pay.timestamp).toLocaleDateString()} <span className="text-[10px] ml-1">{new Date(pay.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></td>
                                                  <td className="p-4 font-sans font-medium text-emerald-700">{pay.note || 'Abono en Efectivo'}</td>
                                                  <td className="p-4 text-right text-slate-400">-</td>
                                                  <td className="p-4 text-right text-emerald-600 font-bold">{pay.amount.toFixed(2)}</td>
                                                  <td className="p-4 text-right font-bold text-slate-900">{runningBalance.toFixed(2)}</td>
                                                  <td className="p-4 text-center">
                                                      <button 
                                                        onClick={() => generateReceiptPDF(viewHistoryOrder, pay, calculateBalance(viewHistoryOrder))}
                                                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-all inline-flex items-center justify-center"
                                                        title="Imprimir Recibo"
                                                      >
                                                        <Printer size={16}/>
                                                      </button>
                                                  </td>
                                              </tr>
                                          );
                                      });
                                  })()}
                              </tbody>
                          </table>
                      </div>
                  </div>
                  
                  <div className="p-6 bg-white border-t border-slate-200 shrink-0">
                      <div className="flex flex-wrap justify-between items-center gap-4">
                          <div className="flex gap-8">
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Cargos</p>
                                <p className="text-xl font-mono font-bold text-slate-900">S/. {calculateBalance(viewHistoryOrder).totalDue.toFixed(2)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Abonos</p>
                                <p className="text-xl font-mono font-bold text-emerald-600">S/. {calculateBalance(viewHistoryOrder).totalPaid.toFixed(2)}</p>
                              </div>
                          </div>
                          <div className="text-right bg-slate-50 px-6 py-3 rounded-2xl border border-slate-200">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Saldo Deudor Actual</p>
                            <p className="text-3xl font-mono font-black text-red-600">S/. {calculateBalance(viewHistoryOrder).balance.toFixed(2)}</p>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {selectedOrder && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-white p-8 rounded-[2rem] w-full max-w-md shadow-2xl border border-slate-200 animate-scale-up">
                  <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
                      <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center shadow-inner"><DollarSign size={24}/></div>
                      <div>
                          <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">Registrar Abono</h3>
                          <p className="text-slate-500 text-xs font-medium mt-1">{selectedOrder.clientName}</p>
                      </div>
                  </div>
                  
                  <div className="space-y-4 mb-8">
                      <div className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Deuda Actual</span>
                          <span className="font-mono font-bold text-red-600 text-lg">S/. {calculateBalance(selectedOrder).balance.toFixed(2)}</span>
                      </div>
                      
                      <div>
                          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2 ml-1">Monto a Abonar (S/.)</label>
                          <div className="relative">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xl">S/.</span>
                              <input 
                                  type="number" 
                                  className="w-full bg-white border-2 border-slate-200 rounded-xl py-4 pl-12 pr-4 font-mono font-black text-2xl text-slate-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" 
                                  value={payAmount} 
                                  onChange={e => setPayAmount(e.target.value)} 
                                  autoFocus 
                                  placeholder="0.00"
                              />
                          </div>
                      </div>

                      <div className="flex justify-between items-center p-4 bg-blue-50 rounded-xl border border-blue-100">
                          <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">Nuevo Saldo</span>
                          <span className="font-mono font-black text-blue-700 text-lg">
                              S/. {Math.max(0, calculateBalance(selectedOrder).balance - (parseFloat(payAmount) || 0)).toFixed(2)}
                          </span>
                      </div>
                  </div>

                  <div className="flex gap-3">
                    <button onClick={() => setSelectedOrder(null)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-colors">Cancelar</button>
                    <button 
                        onClick={handlePay} 
                        disabled={!parseFloat(payAmount) || parseFloat(payAmount) <= 0}
                        className="flex-[2] bg-emerald-600 text-white py-4 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-200 hover:bg-emerald-500 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        <Printer size={16}/> Procesar Abono
                    </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Collections;

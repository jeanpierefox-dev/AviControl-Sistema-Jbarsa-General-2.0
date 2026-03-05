
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

      <div className="bg-white rounded-[2rem] shadow-sm overflow-hidden border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[1000px]">
            <thead className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-[0.2em] border-b border-slate-800">
              <tr>
                <th className="p-6">Razón Social / Cliente</th>
                <th className="p-6 text-right">Importe Total</th>
                <th className="p-6 text-right">Total Abonado</th>
                <th className="p-6 text-right">Saldo Pendiente</th>
                <th className="p-6 text-center">Estado Pago</th>
                <th className="p-6 text-center">Gestión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.map(order => {
                const { totalDue, totalPaid, balance } = calculateBalance(order);
                const isPaid = balance <= 0.1 || order.paymentStatus === 'PAID';
                return (
                  <tr key={order.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="p-6">
                        <p className="font-black text-slate-900 uppercase text-sm tracking-tight">{order.clientName}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">{order.weighingMode === WeighingType.BATCH ? 'Venta por Lote' : 'Venta Directa'}</p>
                    </td>
                    <td className="p-6 text-right font-digital font-bold text-slate-600 text-base whitespace-nowrap">S/. {totalDue.toFixed(2)}</td>
                    <td className="p-6 text-right font-digital font-bold text-emerald-600 text-base whitespace-nowrap">S/. {totalPaid.toFixed(2)}</td>
                    <td className="p-6 text-right font-digital font-black text-red-600 text-lg whitespace-nowrap">S/. {balance.toFixed(2)}</td>
                    <td className="p-6 text-center">
                      <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-1.5 ${isPaid ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${isPaid ? 'bg-emerald-600' : 'bg-red-600'}`}></div>
                        {isPaid ? 'Totalmente Pagado' : 'Deuda Pendiente'}
                      </span>
                    </td>
                    <td className="p-6 text-center">
                        <div className="flex justify-center gap-2">
                            <button onClick={() => setViewHistoryOrder(order)} className="p-3 bg-slate-100 text-slate-600 rounded-2xl hover:bg-slate-200 hover:text-blue-600 transition-all shadow-sm" title="Ver Historial de Pagos">
                                <History size={18}/>
                            </button>
                            {!isPaid && (
                                <button onClick={() => { setSelectedOrder(order); setPayAmount(balance.toFixed(2)); }} className="bg-emerald-600 text-white px-6 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-500 shadow-lg active:scale-95 transition-all flex items-center gap-2">
                                    <DollarSign size={14}/> Cobrar
                                </button>
                            )}
                        </div>
                    </td>
                  </tr>
                );
              })}
              {filteredOrders.length === 0 && (
                  <tr>
                      <td colSpan={6} className="p-24 text-center">
                          <div className="flex flex-col items-center">
                              <FileText size={56} className="text-slate-200 mb-4"/>
                              <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-xs">No se encontraron movimientos financieros</p>
                          </div>
                      </td>
                  </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE HISTORIAL DE PAGOS */}
      {viewHistoryOrder && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-[3rem] w-full max-w-xl shadow-2xl border-8 border-white overflow-hidden animate-scale-up">
                  <div className="p-6 bg-slate-950 text-white flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-600 rounded-2xl text-white shadow-lg"><History size={20}/></div>
                        <div>
                            <h3 className="text-xl font-black uppercase tracking-tighter leading-none">Kardex de Cobranza</h3>
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1.5">{viewHistoryOrder.clientName}</p>
                        </div>
                      </div>
                      <button onClick={() => setViewHistoryOrder(null)} className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-all"><X size={20}/></button>
                  </div>
                  
                  <div className="p-8 max-h-[50vh] overflow-y-auto bg-slate-50/50">
                      <div className="space-y-4">
                          {viewHistoryOrder.payments.length > 0 ? (
                              viewHistoryOrder.payments.sort((a,b) => b.timestamp - a.timestamp).map(pay => (
                                  <div key={pay.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center group hover:border-blue-200 hover:shadow-md transition-all">
                                      <div className="flex items-center gap-4">
                                          <div className="bg-emerald-50 text-emerald-600 p-3 rounded-xl border border-emerald-100">
                                              <DollarSign size={18}/>
                                          </div>
                                          <div>
                                              <p className="text-lg font-black text-slate-800">S/. {pay.amount.toFixed(2)}</p>
                                              <div className="flex items-center gap-2 mt-1">
                                                  <Calendar size={10} className="text-slate-400"/>
                                                  <p className="text-[10px] text-slate-400 font-bold">{new Date(pay.timestamp).toLocaleDateString()} - {new Date(pay.timestamp).toLocaleTimeString()}</p>
                                              </div>
                                          </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                          <button 
                                            onClick={() => generateReceiptPDF(viewHistoryOrder, pay, calculateBalance(viewHistoryOrder))}
                                            className="p-3 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                                            title="Reimprimir Recibo"
                                          >
                                            <Printer size={18}/>
                                          </button>
                                          <span className="text-[9px] font-black text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg uppercase border border-slate-200">{pay.note || 'Abono'}</span>
                                      </div>
                                  </div>
                              ))
                          ) : (
                              <div className="py-12 text-center text-slate-300">
                                  <FileText size={56} className="mx-auto mb-4 opacity-10"/>
                                  <p className="font-black uppercase text-[10px] tracking-widest">Cuenta sin historial de abonos</p>
                              </div>
                          )}
                      </div>
                  </div>
                  
                  <div className="p-8 bg-white border-t border-slate-100">
                      <div className="flex justify-between items-center mb-6 bg-slate-50 p-5 rounded-[2rem] border border-slate-100">
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Monto Amortizado</p>
                            <p className="text-2xl font-digital font-black text-emerald-600">S/. {viewHistoryOrder.payments.reduce((a,b) => a + b.amount, 0).toFixed(2)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Saldo Restante</p>
                            <p className="text-2xl font-digital font-black text-red-600">S/. {calculateBalance(viewHistoryOrder).balance.toFixed(2)}</p>
                          </div>
                      </div>
                      <button onClick={() => setViewHistoryOrder(null)} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-slate-800 transition-all active:scale-95">Finalizar Consulta</button>
                  </div>
              </div>
          </div>
      )}

      {selectedOrder && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-white p-10 rounded-[4rem] w-full max-w-sm shadow-2xl border-8 border-white text-center animate-scale-up">
                  <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 shadow-inner border border-blue-200"><DollarSign size={36}/></div>
                  <h3 className="text-2xl font-black mb-1 uppercase tracking-tighter text-slate-900 leading-none">Registro de Cobro</h3>
                  <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-8">{selectedOrder.clientName}</p>
                  
                  <div className="mb-10 p-8 bg-slate-50 rounded-[3rem] border-2 border-slate-100 shadow-inner">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3">Ingresar Monto (S/.)</label>
                      <input type="number" className="w-full bg-transparent text-5xl font-digital font-black text-slate-950 text-center outline-none" value={payAmount} onChange={e => setPayAmount(e.target.value)} autoFocus />
                  </div>

                  <div className="flex flex-col gap-3">
                    <button onClick={handlePay} className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-emerald-200 hover:bg-emerald-500 active:scale-95 transition-all">Confirmar e Imprimir Recibo</button>
                    <button onClick={() => setSelectedOrder(null)} className="w-full py-4 text-slate-400 font-black text-[10px] uppercase hover:text-slate-600 transition-colors">Cancelar Operación</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Collections;

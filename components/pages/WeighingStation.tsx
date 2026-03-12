
import React, { useState, useEffect, useRef, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { WeighingType, ClientOrder, WeighingRecord, UserRole } from '../../types';
import { getOrders, saveOrder, getConfig, deleteOrder, getBatches } from '../../services/storage';
import { 
  ArrowLeft, Save, X, Eye, Package, PackageOpen, 
  User, Trash2, Box, UserPlus, Bird, Printer, Receipt, 
  Activity, Download, List, ChevronRight, Scale
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AuthContext } from '../../App';

const WeighingStation: React.FC = () => {
  const { mode, batchId } = useParams<{ mode: string; batchId?: string }>();
  const navigate = useNavigate();
  const [config] = useState(getConfig());
  const { user } = useContext(AuthContext);

  const [activeOrder, setActiveOrder] = useState<ClientOrder | null>(null);
  const [orders, setOrders] = useState<ClientOrder[]>([]);
  
  const [showClientModal, setShowClientModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [newClientName, setNewClientName] = useState('');
  const [targetCrates, setTargetCrates] = useState<string>(''); 
  const [newClientBirdsPerCrate, setNewClientBirdsPerCrate] = useState('10');

  const [weightInput, setWeightInput] = useState('');
  const [qtyInput, setQtyInput] = useState('');
  const [birdsPerCrate, setBirdsPerCrate] = useState('10'); // Default 10 birds per crate
  const [activeTab, setActiveTab] = useState<'FULL' | 'EMPTY' | 'MORTALITY'>('FULL');
  const weightInputRef = useRef<HTMLInputElement>(null);

  const [pricePerKg, setPricePerKg] = useState<number | string>('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CREDIT'>('CASH');

  useEffect(() => {
    loadOrders();
    const handleUpdate = () => loadOrders();
    window.addEventListener('avi_data_orders', handleUpdate);
    return () => window.removeEventListener('avi_data_orders', handleUpdate);
  }, [mode, batchId]);

  useEffect(() => {
    setDefaultQuantity();
    const timeout = setTimeout(() => weightInputRef.current?.focus(), 200);
    return () => clearTimeout(timeout);
  }, [activeTab, activeOrder]);

  const loadOrders = () => {
    const all = getOrders();
    let filtered = mode === WeighingType.BATCH && batchId 
      ? all.filter(o => o.batchId === batchId) 
      : all.filter(o => !o.batchId && o.weighingMode === mode);
    
    if (user?.role !== UserRole.ADMIN) {
      filtered = filtered.filter(o => !o.createdBy || o.createdBy === user?.id);
    }
    
    filtered.sort((a, b) => (a.status === 'OPEN' ? -1 : 1));
    setOrders(filtered);
  };

  const setDefaultQuantity = () => {
    if (mode === WeighingType.SOLO_POLLO) { setQtyInput('10'); setBirdsPerCrate('1'); }
    else if (mode === WeighingType.SOLO_JABAS) { setQtyInput('1'); setBirdsPerCrate('0'); }
    else {
      if (activeTab === 'FULL') { 
        setQtyInput(config.defaultFullCrateBatch.toString()); 
        setBirdsPerCrate(activeOrder?.birdsPerCrate?.toString() || '10'); 
      }
      if (activeTab === 'EMPTY') { setQtyInput('10'); setBirdsPerCrate('0'); }
      if (activeTab === 'MORTALITY') { setQtyInput('1'); setBirdsPerCrate('1'); }
    }
  };

  const handleOpenClientModal = (order?: ClientOrder) => {
    if (order) {
      setEditingOrderId(order.id);
      setNewClientName(order.clientName);
      setTargetCrates(order.targetCrates?.toString() || '');
      setNewClientBirdsPerCrate(order.birdsPerCrate?.toString() || '10');
    } else {
      setEditingOrderId(null);
      setNewClientName('');
      setTargetCrates('');
      setNewClientBirdsPerCrate('10');
    }
    setShowClientModal(true);
  };

  const handleSaveClient = () => {
    if (!newClientName || !targetCrates) return;
    const target = parseInt(targetCrates);
    const birds = parseInt(newClientBirdsPerCrate) || 10;

    // Check Batch Limit
    if (mode === WeighingType.BATCH && batchId) {
        const batch = getBatches().find(b => b.id === batchId);
        if (batch) {
            const currentOrders = getOrders().filter(o => o.batchId === batchId && o.id !== editingOrderId);
            const usedCrates = currentOrders.reduce((acc, o) => acc + (o.targetCrates || 0), 0);
            
            if (usedCrates + target > batch.totalCratesLimit) {
                alert(`¡Límite de Lote Excedido!\n\nCapacidad Total: ${batch.totalCratesLimit}\nUsado: ${usedCrates}\nIntentando agregar: ${target}\nDisponible: ${batch.totalCratesLimit - usedCrates}`);
                return;
            }
        }
    }

    if (editingOrderId) {
      const existing = getOrders().find(o => o.id === editingOrderId);
      if (existing) saveOrder({ ...existing, clientName: newClientName, targetCrates: target, birdsPerCrate: birds });
    } else {
      const newOrder: ClientOrder = {
        id: Date.now().toString(), clientName: newClientName, targetCrates: target, birdsPerCrate: birds,
        pricePerKg: 0, status: 'OPEN', records: [], batchId, weighingMode: mode as WeighingType,
        paymentStatus: 'PENDING', payments: [], createdBy: user?.id
      };
      saveOrder(newOrder);
    }
    loadOrders();
    setShowClientModal(false);
  };

  const getTotals = (order: ClientOrder) => {
    const full = order.records.filter(r => r.type === 'FULL');
    const empty = order.records.filter(r => r.type === 'EMPTY');
    const mort = order.records.filter(r => r.type === 'MORTALITY');
    
    const wF = full.reduce((a, b) => a + b.weight, 0);
    const wE = empty.reduce((a, b) => a + b.weight, 0);
    const wM = mort.reduce((a, b) => a + b.weight, 0);
    
    const qF = full.reduce((a, b) => a + b.quantity, 0); // Total Crates Full
    const qE = empty.reduce((a, b) => a + b.quantity, 0); // Total Crates Empty
    const qM = mort.reduce((a, b) => a + b.quantity, 0); // Total Mortality Count (birds usually)
    
    // Calculate total birds
    // If birds property exists, use it. Otherwise fallback to quantity * 10 (legacy) or just quantity if SOLO_POLLO
    const bF = full.reduce((a, b) => a + (b.birds !== undefined ? b.birds : (order.weighingMode === WeighingType.SOLO_POLLO ? b.quantity : b.quantity * 10)), 0);
    
    const net = order.weighingMode === WeighingType.SOLO_POLLO ? wF : wF - wE - wM;
    
    // Count of weights (records)
    const cF = full.length;
    const cE = empty.length;
    const cM = mort.length;

    return { wF, wE, wM, qF, qE, qM, bF, net, cF, cE, cM };
  };

  const addWeight = () => {
    if (!activeOrder || !weightInput || !qtyInput) return;
    
    const quantity = parseInt(qtyInput);
    
    // Check target crates limit
    if (activeOrder.targetCrates > 0) {
        if (activeTab === 'FULL') {
            const currentFull = activeOrder.records.filter(r => r.type === 'FULL').reduce((a, b) => a + b.quantity, 0);
            if (currentFull + quantity > activeOrder.targetCrates) {
                alert(`¡Límite de jabas llenas excedido! La meta es ${activeOrder.targetCrates} y ya tiene ${currentFull}.`);
                return;
            }
        }
        if (activeTab === 'EMPTY') {
            const currentEmpty = activeOrder.records.filter(r => r.type === 'EMPTY').reduce((a, b) => a + b.quantity, 0);
            if (currentEmpty + quantity > activeOrder.targetCrates) {
                alert(`¡Límite de jabas vacías excedido! La meta es ${activeOrder.targetCrates} y ya tiene ${currentEmpty}.`);
                return;
            }
        }
    }

    const birds = activeTab === 'FULL' ? quantity * parseInt(birdsPerCrate || '0') : (activeTab === 'MORTALITY' ? quantity : 0);

    const record: WeighingRecord = {
      id: Date.now().toString(), timestamp: Date.now(), weight: parseFloat(weightInput),
      quantity: quantity, 
      birds: birds,
      type: activeTab
    };
    const updated = { ...activeOrder, records: [record, ...activeOrder.records] };
    saveOrder(updated);
    setActiveOrder(updated);
    setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
    setWeightInput('');
    weightInputRef.current?.focus();
  };

  const deleteRecord = (id: string) => {
    if(!confirm('¿Eliminar registro?')) return;
    const updated = { ...activeOrder!, records: activeOrder!.records.filter(r => r.id !== id) };
    saveOrder(updated);
    setActiveOrder(updated);
    setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
  };

  const handlePDFOutput = (doc: jsPDF, filename: string) => {
    doc.save(filename);
  };

  const chunkArray = (array: any[], size: number) => {
    const chunked = [];
    for (let i = 0; i < array.length; i += size) {
      chunked.push(array.slice(i, i + size));
    }
    return chunked;
  };

  const generateSalesTicketPDF = (order: ClientOrder) => {
    const t = getTotals(order);
    const batch = getBatches().find(b => b.id === order.batchId);
    const batchName = batch ? batch.name : 'Venta Directa';
    
    const fullRecords = order.records.filter(r => r.type === 'FULL').sort((a, b) => b.timestamp - a.timestamp);
    const emptyRecords = order.records.filter(r => r.type === 'EMPTY').sort((a, b) => b.timestamp - a.timestamp);
    const mortRecords = order.records.filter(r => r.type === 'MORTALITY').sort((a, b) => b.timestamp - a.timestamp);
    
    const fullRows = Math.ceil(fullRecords.length / 3);
    const emptyRows = Math.ceil(emptyRecords.length / 3);
    const mortRows = Math.ceil(mortRecords.length / 3);

    // Calculate dynamic height
    let estimatedHeight = 160 + ((fullRows + emptyRows + mortRows) * 5) + (order.pricePerKg > 0 ? 30 : 0);

    const doc = new jsPDF({ unit: 'mm', format: [80, estimatedHeight] });
    
    let y = 10;
    
    // Header
    doc.setFontSize(14).setFont("helvetica", "bold");
    doc.text(config.companyName.toUpperCase(), 40, y, { align: 'center' });
    y += 5;
    
    doc.setFontSize(9).setFont("helvetica", "normal");
    doc.text("TICKET DE PESAJE", 40, y, { align: 'center' });
    y += 5;
    
    doc.setFontSize(8).setFont("helvetica", "italic");
    doc.text(`FECHA: ${new Date().toLocaleString()}`, 40, y, { align: 'center' });
    y += 5;
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(5, y, 75, y);
    y += 5;

    // Batch & Client Info
    doc.setFontSize(9).setFont("helvetica", "bold");
    doc.text(`LOTE:`, 5, y);
    doc.setFont("helvetica", "normal");
    doc.text(batchName.toUpperCase(), 20, y);
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.text(`CLIENTE:`, 5, y);
    doc.setFont("helvetica", "normal");
    doc.text(order.clientName.toUpperCase(), 22, y);
    y += 6;

    // Quantities Box
    autoTable(doc, {
        startY: y,
        head: [[{ content: 'RESUMEN DE CANTIDADES', colSpan: 2, styles: { halign: 'center', fillColor: [220, 226, 230], textColor: 0 } }]],
        body: [
            ['Jabas Llenas:', t.qF.toString()],
            ['Total Pollos:', t.bF.toString()],
            ['Jabas Vacías:', t.qE.toString()],
            ['Pollos Muertos:', t.qM.toString()]
        ],
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 1.5 },
        columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 40 },
            1: { halign: 'right', cellWidth: 30 }
        },
        margin: { left: 5, right: 5 }
    });
    y = (doc as any).lastAutoTable.finalY + 5;

    // DETAILED RECORDS TABLE
    doc.setFontSize(10).setFont("helvetica", "bold");
    doc.text("DETALLE DE PESOS", 40, y, { align: 'center' });
    y += 2;

    const renderCategory = (title: string, records: any[], totalWeight: number, qty?: number) => {
        if (records.length === 0) return;
        
        const headerText = qty !== undefined ? `${title} (Cant: ${qty})` : title;
        
        autoTable(doc, {
            startY: y,
            head: [[{ content: headerText, colSpan: 3, styles: { halign: 'center', fillColor: [220, 226, 230], textColor: 0 } }]],
            body: chunkArray(records.map(r => r.weight.toFixed(2)), 3),
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 1, halign: 'center' },
            margin: { left: 5, right: 5 },
            tableWidth: 70
        });
        y = (doc as any).lastAutoTable.finalY + 1;
        
        doc.setFontSize(8).setFont("helvetica", "bold");
        doc.text(`TOTAL ${title}:`, 40, y + 3, { align: 'right' });
        doc.text(`${totalWeight.toFixed(2)} kg`, 72, y + 3, { align: 'right' });
        y += 7;
    };

    renderCategory("LLENAS", fullRecords, t.wF, t.qF);
    renderCategory("VACÍAS", emptyRecords, t.wE, t.qE);
    renderCategory("MORTALIDAD", mortRecords, t.wM, t.qM);

    y += 2;
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(5, y, 75, y);
    y += 6;

    // Final Totals
    doc.setFontSize(9).setFont("helvetica", "normal");
    doc.text("Peso Bruto:", 8, y); doc.text(`${t.wF.toFixed(2)} kg`, 72, y, { align: 'right' }); y += 5;
    doc.text("Tara Total:", 8, y); doc.text(`-${t.wE.toFixed(2)} kg`, 72, y, { align: 'right' }); y += 5;
    doc.text("Mortalidad:", 8, y); doc.text(`-${t.wM.toFixed(2)} kg`, 72, y, { align: 'right' }); y += 5;
    
    doc.setFontSize(11).setFont("helvetica", "bold");
    doc.text("PESO NETO:", 8, y + 2);
    doc.text(`${t.net.toFixed(2)} kg`, 72, y + 2, { align: 'right' });
    y += 10;

    // Financials
    if (order.pricePerKg > 0) {
        doc.setFontSize(9).setFont("helvetica", "bold");
        doc.text(`PRECIO X KG: S/. ${order.pricePerKg.toFixed(2)}`, 5, y);
        y += 6;
        
        doc.setFillColor(15, 23, 42); // Slate 900
        doc.rect(5, y, 70, 12, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9).setFont("helvetica", "bold");
        doc.text("TOTAL A PAGAR", 35, y + 7, { align: 'right' });
        doc.setFontSize(12);
        doc.text(`S/. ${(t.net * order.pricePerKg).toFixed(2)}`, 72, y + 8, { align: 'right' });
        doc.setTextColor(0, 0, 0);
        y += 18;
    }

    doc.setFontSize(8).setFont("helvetica", "italic");
    doc.text("¡Gracias por su preferencia!", 40, y, { align: 'center' });

    handlePDFOutput(doc, `Ticket_${order.clientName}_${order.id.slice(-6)}.pdf`);
  };

  const generateDetailPDF = (order: ClientOrder) => {
    const t = getTotals(order);
    const batch = getBatches().find(b => b.id === order.batchId);
    const batchName = batch ? batch.name : 'Venta Directa';
    const doc = new jsPDF();
    
    // Header Background
    doc.setFillColor(15, 23, 42); // Slate 900
    doc.rect(0, 0, 210, 45, 'F');
    
    // Header Text
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22).setFont("helvetica", "bold");
    doc.text(config.companyName.toUpperCase(), 105, 20, { align: 'center' });
    
    doc.setFontSize(12).setFont("helvetica", "normal");
    doc.text("REPORTE DETALLADO DE PESAJE", 105, 30, { align: 'center' });
    
    doc.setTextColor(0, 0, 0);
    
    let y = 55;
    
    // Client Info
    doc.setFontSize(10).setFont("helvetica", "bold");
    doc.text(`LOTE:`, 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(batchName.toUpperCase(), 35, y);
    
    doc.setFont("helvetica", "bold");
    doc.text(`FECHA:`, 140, y);
    doc.setFont("helvetica", "normal");
    doc.text(new Date().toLocaleString(), 155, y);
    
    y += 7;
    doc.setFont("helvetica", "bold");
    doc.text(`CLIENTE:`, 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(order.clientName.toUpperCase(), 35, y);
    
    doc.setFont("helvetica", "bold");
    doc.text(`TICKET ID:`, 140, y);
    doc.setFont("helvetica", "normal");
    doc.text(order.id, 160, y);

    // Summary Table
    autoTable(doc, {
        startY: y + 10,
        head: [['CONCEPTO', 'CANTIDAD', 'DETALLE', 'PESO TOTAL (KG)']],
        body: [
            ['Jabas Llenas (Bruto)', t.qF, `${t.bF} Pollos`, t.wF.toFixed(2)],
            ['Jabas Vacías (Tara)', t.qE, '-', `-${t.wE.toFixed(2)}`],
            ['Mortalidad (Pollos Muertos)', t.qM, '-', `-${t.wM.toFixed(2)}`],
            [{ content: 'PESO NETO FINAL', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold', fontSize: 11 } }, { content: t.net.toFixed(2), styles: { fontStyle: 'bold', fontSize: 11, fillColor: [240, 253, 244], textColor: [21, 128, 61] } }]
        ],
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 10, cellPadding: 4 },
        columnStyles: {
            0: { fontStyle: 'bold' },
            3: { halign: 'right', fontStyle: 'bold' }
        }
    });

    y = (doc as any).lastAutoTable.finalY + 10;
    
    doc.setFontSize(11).setFont("helvetica", "bold");
    doc.text("DESGLOSE DE PESADAS", 14, y);
    y += 2;

    const fullRecords = order.records.filter(r => r.type === 'FULL').sort((a, b) => b.timestamp - a.timestamp);
    const emptyRecords = order.records.filter(r => r.type === 'EMPTY').sort((a, b) => b.timestamp - a.timestamp);
    const mortRecords = order.records.filter(r => r.type === 'MORTALITY').sort((a, b) => b.timestamp - a.timestamp);

    const renderCategoryGridA4 = (title: string, records: any[], totalWeight: number, qty?: number) => {
        if (records.length === 0) return;
        y = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : y + 5;
        if (y > 250) { doc.addPage(); y = 20; }
        
        const headerText = qty !== undefined 
            ? `${title} - CANTIDAD: ${qty} | TOTAL: ${totalWeight.toFixed(2)} KG`
            : `${title} - TOTAL: ${totalWeight.toFixed(2)} KG`;

        autoTable(doc, {
            startY: y,
            head: [[{ content: headerText, colSpan: 6, styles: { halign: 'left', fillColor: [241, 245, 249], textColor: 0, fontStyle: 'bold' } }]],
            body: chunkArray(records.map(r => r.weight.toFixed(2)), 6),
            theme: 'grid',
            styles: { fontSize: 9, halign: 'center', cellPadding: 2 },
            margin: { left: 14, right: 14 }
        });
    };

    renderCategoryGridA4("JABAS LLENAS", fullRecords, t.wF, t.qF);
    renderCategoryGridA4("JABAS VACÍAS", emptyRecords, t.wE, t.qE);
    renderCategoryGridA4("MORTALIDAD", mortRecords, t.wM, t.qM);
    
    // Footer
    const pageCount = (doc as any).internal.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8).setTextColor(150);
        doc.text(`Generado por AviControl Pro - Página ${i} de ${pageCount}`, 105, 290, { align: 'center' });
    }

    handlePDFOutput(doc, `Reporte_A4_${order.clientName}_${order.id}.pdf`);
  };

  const handlePayment = () => {
    if (!activeOrder || !pricePerKg) return;
    const price = parseFloat(pricePerKg.toString());
    const updatedOrder: ClientOrder = {
      ...activeOrder,
      pricePerKg: price,
      status: 'CLOSED',
      paymentMethod: paymentMethod,
    };
    saveOrder(updatedOrder);
    setActiveOrder(updatedOrder);
    generateSalesTicketPDF(updatedOrder); // Default to Sales Ticket on payment
    setShowPaymentModal(false);
    loadOrders();
  };

  const totals = getTotals(activeOrder || { records: [] } as any);

  if (!activeOrder) {
    return (
      <div className="p-4 max-w-7xl mx-auto animate-fade-in text-left">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-slate-200 pb-6">
          <div>
            <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Estación de Pesaje</h2>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mt-1 flex items-center gap-2">
                <Activity size={12} className="text-blue-600"/> Modo: {mode}
            </p>
          </div>
          <button onClick={() => handleOpenClientModal()} className="bg-blue-950 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-blue-900 transition-all flex items-center gap-3 active:scale-95">
            <UserPlus size={18} /> Registrar Nuevo Cliente
          </button>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {orders.map(o => {
              const t = getTotals(o);
              const isOverLimit = t.qF >= (o.targetCrates || 0);
              const percent = o.targetCrates ? Math.min((t.qF / o.targetCrates) * 100, 100) : 0;

              return (
              <div key={o.id} className="bg-white rounded-2xl shadow-lg border border-slate-200 hover:shadow-2xl hover:border-blue-400 transition-all duration-300 overflow-hidden flex flex-col h-full relative group">
                  <div className="bg-slate-900 p-4 flex justify-between items-start cursor-pointer" onClick={() => setActiveOrder(o)}>
                     <div className="flex items-center space-x-3">
                         <div className="bg-blue-600 p-2 rounded-lg text-white shadow-lg">
                             <User size={24} />
                         </div>
                         <div>
                             <h3 className="font-black text-white text-lg leading-tight truncate max-w-[150px]">{o.clientName}</h3>
                             <p className="text-slate-400 text-xs font-medium flex items-center mt-1">
                                 ID: {o.id.slice(-6)}
                             </p>
                         </div>
                     </div>
                     <span className={`text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider ${o.status === 'CLOSED' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                        {o.status === 'CLOSED' ? 'Cerrado' : 'Abierto'}
                     </span>
                  </div>

                  <div className="p-5 flex-1 flex flex-col justify-between cursor-pointer" onClick={() => setActiveOrder(o)}>
                      <div>
                          {/* Progress */}
                          {o.targetCrates > 0 && (
                            <div className="mb-6">
                                <div className="flex justify-between text-xs font-bold uppercase tracking-wider mb-2">
                                    <span className="text-slate-500">Meta Jabas</span>
                                    <span className={`${isOverLimit ? 'text-red-600' : 'text-blue-600'}`}>{t.qF} / {o.targetCrates}</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                                    <div className={`h-full rounded-full transition-all duration-500 ${isOverLimit ? 'bg-red-500' : 'bg-gradient-to-r from-blue-500 to-blue-400'}`} style={{ width: `${percent}%` }}></div>
                                </div>
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-2 mb-4">
                              <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                                  <p className="text-[8px] font-bold text-slate-400 uppercase">Bruto</p>
                                  <p className="font-black text-slate-800 text-sm leading-none">{t.wF.toFixed(1)}</p>
                              </div>
                              <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                                  <p className="text-[8px] font-bold text-slate-400 uppercase">Tara</p>
                                  <p className="font-black text-slate-800 text-sm leading-none text-orange-600">-{t.wE.toFixed(1)}</p>
                              </div>
                              <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                                  <p className="text-[8px] font-bold text-slate-400 uppercase">Merma</p>
                                  <p className="font-black text-slate-800 text-sm leading-none text-red-600">-{t.wM.toFixed(1)}</p>
                              </div>
                              <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                                  <p className="text-[8px] font-bold text-slate-400 uppercase">Pollos</p>
                                  <p className="font-black text-slate-800 text-sm leading-none">{t.bF}</p>
                              </div>
                          </div>
                          <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 text-center">
                              <p className="text-[10px] font-bold text-emerald-600 uppercase">Peso Neto</p>
                              <p className="font-black text-emerald-700 text-2xl leading-none">{t.net.toFixed(1)} kg</p>
                          </div>
                      </div>

                      <div className="flex justify-end gap-2 mt-4">
                        <div className="bg-blue-50 p-2 rounded-lg text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            <ChevronRight size={18} />
                        </div>
                      </div>
                  </div>
              </div>
              );
          })}
        </div>



        {showClientModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm border border-gray-100">
              <h3 className="text-2xl font-black mb-6 text-slate-900">Nuevo Cliente</h3>
              <div className="space-y-5">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Nombre del Cliente</label>
                    <input 
                        className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 focus:border-blue-500 focus:bg-white outline-none transition-all" 
                        value={newClientName} 
                        onChange={e => setNewClientName(e.target.value)} 
                        placeholder="Ej. Juan Perez" 
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Meta de Jabas</label>
                    <input 
                        type="number" 
                        className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 focus:border-blue-500 focus:bg-white outline-none transition-all" 
                        value={targetCrates} 
                        onChange={e => setTargetCrates(e.target.value)} 
                        placeholder="Ej. 100" 
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Pollos por Jaba (Promedio)</label>
                    <input 
                        type="number" 
                        className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 focus:border-blue-500 focus:bg-white outline-none transition-all" 
                        value={newClientBirdsPerCrate} 
                        onChange={e => setNewClientBirdsPerCrate(e.target.value)} 
                        placeholder="Ej. 10" 
                    />
                </div>
              </div>
              <div className="mt-8 flex justify-end space-x-3">
                <button onClick={() => setShowClientModal(false)} className="text-slate-500 font-bold hover:text-slate-800 px-4 py-2 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                <button onClick={handleSaveClient} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition-colors">Crear</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const isLocked = activeOrder.status === 'CLOSED';

  return (
    <>
    <div className="flex flex-col h-full space-y-4 max-w-full mx-auto animate-fade-in text-left pb-10">
      {/* Header HUD - Rediseñado para mostrar Ojo y Liquidar debajo de totales */}
      <div className="bg-blue-950 p-3 md:p-4 rounded-[1.5rem] shadow-2xl text-white relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none">
            <Activity size={200} className="scale-150 transform -translate-x-1/4 -translate-y-1/4" />
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setActiveOrder(null)} className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-all border border-white/10 active:scale-95">
                <ArrowLeft size={18}/>
            </button>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg md:text-2xl font-black uppercase leading-none truncate tracking-tighter">{activeOrder.clientName}</h2>
              <div className="flex items-center gap-2 mt-1">
                <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isLocked ? 'bg-red-500' : 'bg-emerald-500'}`}></div>
                <p className="text-blue-300 text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] truncate">{isLocked ? 'CONTROL CERRADO' : 'SISTEMA ACTIVO'}</p>
              </div>
            </div>
          </div>

          {/* Counts Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 md:gap-2 mb-1.5 md:mb-2">
              <div className="bg-blue-500/10 p-1.5 md:p-2 rounded-lg border border-blue-400/20 backdrop-blur-sm">
                  <p className="text-[7px] font-black text-blue-300 uppercase tracking-widest mb-0.5">Jabas Llenas</p>
                  <p className="text-lg md:text-xl font-black font-digital text-white">{totals.qF}</p>
              </div>
              <div className="bg-blue-400/10 p-1.5 md:p-2 rounded-lg border border-blue-400/20 backdrop-blur-sm">
                  <p className="text-[7px] font-black text-blue-200 uppercase tracking-widest mb-0.5">Cant. Pollos</p>
                  <p className="text-lg md:text-xl font-black font-digital text-blue-100">{totals.bF}</p>
              </div>
              <div className="bg-orange-500/10 p-1.5 md:p-2 rounded-lg border border-orange-400/20 backdrop-blur-sm">
                  <p className="text-[7px] font-black text-orange-300 uppercase tracking-widest mb-0.5">Jabas Vacías</p>
                  <p className="text-lg md:text-xl font-black font-digital text-orange-100">{totals.qE}</p>
              </div>
              <div className="bg-red-500/10 p-1.5 md:p-2 rounded-lg border border-red-400/20 backdrop-blur-sm">
                  <p className="text-[7px] font-black text-red-300 uppercase tracking-widest mb-0.5">Merma (Pollos)</p>
                  <p className="text-lg md:text-xl font-black font-digital text-red-100">{totals.qM}</p>
              </div>
          </div>

          {/* Weights Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 md:gap-2 text-center">
            <div className="bg-blue-600/20 p-1.5 md:p-2 rounded-lg border border-blue-400/30 backdrop-blur-sm">
              <p className="text-[7px] font-black text-blue-200 uppercase tracking-widest mb-0.5">Peso Bruto</p>
              <p className="text-lg md:text-xl font-black font-digital text-white">{totals.wF.toFixed(1)}</p>
            </div>
            <div className="bg-orange-600/20 p-1.5 md:p-2 rounded-lg border border-orange-400/30 backdrop-blur-sm">
              <p className="text-[7px] font-black text-orange-200 uppercase tracking-widest mb-0.5">Peso Tara</p>
              <p className="text-lg md:text-xl font-black font-digital text-orange-200">-{totals.wE.toFixed(1)}</p>
            </div>
            <div className="bg-red-600/20 p-1.5 md:p-2 rounded-lg border border-red-400/30 backdrop-blur-sm">
              <p className="text-[7px] font-black text-red-200 uppercase tracking-widest mb-0.5">Peso Merma</p>
              <p className="text-lg md:text-xl font-black font-digital text-red-200">-{totals.wM.toFixed(1)}</p>
            </div>
            <div className="bg-emerald-600 p-1.5 md:p-2 rounded-lg shadow-xl shadow-emerald-900/20 border border-emerald-400/50">
              <p className="text-[7px] font-black text-emerald-100 uppercase tracking-widest mb-0.5">Peso Neto</p>
              <p className="text-xl md:text-2xl font-black font-digital text-white">{totals.net.toFixed(1)} <span className="text-[8px]">KG</span></p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-row gap-2 mt-4 w-full">
            <button 
                type="button"
                onClick={() => setShowDetailModal(true)}
                className="flex-1 bg-blue-600 text-white p-3 md:p-4 rounded-xl font-black text-[9px] md:text-xs uppercase tracking-widest shadow-xl hover:bg-blue-500 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
                <List size={16} /> <span className="hidden xs:inline">Ver</span> Detalle
            </button>
            {!isLocked && (
                <button 
                  type="button"
                  onClick={() => setShowPaymentModal(true)} 
                  className="flex-[2] bg-white text-blue-950 p-3 md:p-4 rounded-xl font-black text-[9px] md:text-xs uppercase tracking-widest shadow-xl hover:bg-blue-50 active:scale-95 transition-all flex items-center justify-center gap-3"
                >
                    <Receipt size={16} /> Liquidar <span className="hidden xs:inline">Operación</span>
                </button>
            )}
             {isLocked && (
               <button 
                  type="button"
                  onClick={() => generateSalesTicketPDF(activeOrder)}
                  className="flex-[2] bg-emerald-500 text-white p-3 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-xl hover:bg-emerald-400 active:scale-95 transition-all flex items-center justify-center gap-2"
               >
                  <Receipt size={16} /> Ticket Venta
               </button>
            )}
          </div>
        </div>
      </div>

      {!isLocked && (
        <div className="bg-white p-4 md:p-5 rounded-[2rem] shadow-xl border border-slate-100">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1.5 w-full md:w-auto border border-slate-200">
              <button onClick={() => setActiveTab('FULL')} className={`flex-1 md:w-24 h-16 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all ${activeTab === 'FULL' ? 'bg-blue-900 text-white shadow-xl' : 'text-slate-400'}`}>
                <Package size={20}/><span className="text-[8px] font-black uppercase">Llenas</span>
              </button>
              <button onClick={() => setActiveTab('EMPTY')} className={`flex-1 md:w-24 h-16 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all ${activeTab === 'EMPTY' ? 'bg-slate-600 text-white shadow-xl' : 'text-slate-400'}`}>
                <PackageOpen size={20}/><span className="text-[8px] font-black uppercase">Vacías</span>
              </button>
              <button onClick={() => setActiveTab('MORTALITY')} className={`flex-1 md:w-24 h-16 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all ${activeTab === 'MORTALITY' ? 'bg-red-600 text-white shadow-xl' : 'text-slate-400'}`}>
                <Bird size={20}/><span className="text-[8px] font-black uppercase">Merma</span>
              </button>
            </div>
            <div className="flex-1 flex gap-3 h-16 w-full">
              <div className="w-20 bg-slate-50 border-2 border-slate-100 rounded-xl flex flex-col items-center justify-center shadow-inner">
                  <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-0.5 leading-none">
                    {activeTab === 'MORTALITY' ? 'POLLOS' : 'JABAS'}
                  </span>
                  <input 
                    type="number" 
                    value={qtyInput} 
                    onChange={e => setQtyInput(e.target.value)} 
                    className="w-full text-center bg-transparent font-black text-xl outline-none" 
                    placeholder="0" 
                  />
              </div>

              <div className="flex-1 bg-slate-50 border-2 border-slate-100 rounded-xl flex flex-col items-center justify-center shadow-inner">
                  <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-0.5 leading-none">PESO (KG)</span>
                  <input 
                    ref={weightInputRef} 
                    type="number" 
                    value={weightInput} 
                    onChange={e => setWeightInput(e.target.value)} 
                    onKeyDown={e => e.key === 'Enter' && addWeight()} 
                    className="w-full text-center bg-transparent font-black text-3xl outline-none" 
                    placeholder="0.00" 
                    step="0.01"
                  />
              </div>
              <button onClick={addWeight} className="w-20 md:w-32 bg-blue-950 text-white rounded-xl shadow-xl hover:bg-blue-900 transition-all flex items-center justify-center border-b-4 border-blue-800 active:scale-95">
                  <Save size={24}/>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 min-h-[400px]">
        {['FULL', 'EMPTY', 'MORTALITY'].map(type => (
          <div key={type} className="bg-white rounded-[2.5rem] border border-slate-200 flex flex-col overflow-hidden shadow-sm">
            <div className={`p-4 font-black text-[10px] text-center uppercase tracking-[0.2em] text-white flex items-center justify-center gap-2 ${type === 'FULL' ? 'bg-blue-950' : type === 'EMPTY' ? 'bg-slate-600' : 'bg-red-600'}`}>
              {type === 'FULL' ? 'Lista Brutos' : type === 'EMPTY' ? 'Lista Tara' : 'Lista Merma'}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
              {activeOrder.records.filter(r => r.type === type).map((r, idx) => (
                <div key={r.id} className="flex justify-between items-center bg-white p-5 rounded-2xl border border-slate-100 shadow-sm transition-all group hover:border-blue-200">
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] font-black text-slate-300">#{activeOrder.records.filter(rt => rt.type === type).length - idx}</span>
                    <p className="font-digital font-black text-slate-800 text-xl">{r.weight.toFixed(2)}</p>
                  </div>
                  {!isLocked && <button onClick={() => deleteRecord(r.id)} className="p-2 text-slate-300 hover:text-red-600 transition-all"><Trash2 size={16}/></button>}
                </div>
              ))}
              {activeOrder.records.filter(r => r.type === type).length === 0 && (
                 <div className="py-10 text-center text-slate-200 font-black uppercase text-[8px] tracking-widest opacity-50">Sin registros</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>

      {showPaymentModal && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[4rem] p-10 w-full max-w-md animate-scale-up shadow-2xl border-8 border-white">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                <Receipt size={36}/>
            </div>
            <h3 className="text-3xl font-black mb-2 text-slate-900 uppercase text-center tracking-tighter">Liquidar Carga</h3>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] text-center mb-10">Generación de Ticket Final</p>
            
            <div className="space-y-6">
                        <div className="bg-slate-50 p-8 rounded-[3rem] border-2 border-slate-100 shadow-inner text-center">
                            <div className="grid grid-cols-2 gap-2 mb-4 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                <div>Bruto: {totals.wF.toFixed(1)}</div>
                                <div>Tara: {totals.wE.toFixed(1)}</div>
                                <div>Merma: {totals.wM.toFixed(1)}</div>
                                <div>Neto: {totals.net.toFixed(1)}</div>
                            </div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Monto Estimado</p>
                            <p className="text-4xl font-digital font-black text-slate-950">S/. {(totals.net * (parseFloat(pricePerKg.toString()) || 0)).toFixed(2)}</p>
                            <p className="text-[9px] text-emerald-600 font-bold uppercase mt-2">{totals.net.toFixed(2)} KG TOTALES</p>
                        </div>
                        
                        <div className="flex gap-4">
                            <button 
                                onClick={() => setPaymentMethod('CASH')}
                                className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest border-2 transition-all ${paymentMethod === 'CASH' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-100 bg-slate-50 text-slate-400'}`}
                            >
                                Contado
                            </button>
                            <button 
                                onClick={() => setPaymentMethod('CREDIT')}
                                className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest border-2 transition-all ${paymentMethod === 'CREDIT' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-100 bg-slate-50 text-slate-400'}`}
                            >
                                Crédito
                            </button>
                        </div>

                        <div>
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-2">Precio por Kilogramo (S/.)</label>
                            <input type="number" value={pricePerKg} onChange={e => setPricePerKg(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-5 font-black text-2xl outline-none focus:border-emerald-500 focus:bg-white transition-all text-center" placeholder="0.00" step="0.01" autoFocus />
                        </div>
            </div>
            <div className="mt-12 flex flex-col gap-3">
              <button onClick={handlePayment} className="w-full bg-emerald-600 text-white py-6 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl shadow-emerald-200 hover:bg-emerald-500 active:scale-95 transition-all">Confirmar e Imprimir Ticket Venta</button>
              <button onClick={() => setShowPaymentModal(false)} className="w-full py-4 text-slate-400 font-black text-[11px] uppercase tracking-widest hover:text-slate-600 transition-colors">Volver</button>
            </div>
          </div>
        </div>
      )}

      {showClientModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm border border-gray-100">
              <h3 className="text-2xl font-black mb-6 text-slate-900">Nuevo Cliente</h3>
              <div className="space-y-5">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Nombre del Cliente</label>
                    <input 
                        className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 focus:border-blue-500 focus:bg-white outline-none transition-all" 
                        value={newClientName} 
                        onChange={e => setNewClientName(e.target.value)} 
                        placeholder="Ej. Juan Perez" 
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Meta de Jabas</label>
                    <input 
                        type="number" 
                        className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 focus:border-blue-500 focus:bg-white outline-none transition-all" 
                        value={targetCrates} 
                        onChange={e => setTargetCrates(e.target.value)} 
                        placeholder="Ej. 100" 
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Pollos por Jaba (Promedio)</label>
                    <input 
                        type="number" 
                        className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 focus:border-blue-500 focus:bg-white outline-none transition-all" 
                        value={newClientBirdsPerCrate} 
                        onChange={e => setNewClientBirdsPerCrate(e.target.value)} 
                        placeholder="Ej. 10" 
                    />
                </div>
              </div>
              <div className="mt-8 flex justify-end space-x-3">
                <button onClick={() => setShowClientModal(false)} className="text-slate-500 font-bold hover:text-slate-800 px-4 py-2 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                <button onClick={handleSaveClient} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition-colors">Crear</button>
              </div>
            </div>
          </div>
        )}

        {showDetailModal && activeOrder && (
            <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 backdrop-blur-sm overflow-y-auto">
                <div className="bg-white rounded-2xl p-8 w-full max-w-4xl shadow-2xl border border-gray-100 my-auto">
                    <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-4">
                            <div className="bg-blue-600 p-3 rounded-xl text-white shadow-lg">
                                <Eye size={24}/>
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Detalle de Carga</h3>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-1">{activeOrder.clientName}</p>
                            </div>
                        </div>
                        <button onClick={() => setShowDetailModal(false)} className="p-2 bg-slate-100 text-slate-500 hover:text-slate-900 rounded-lg transition-all">
                            <X size={20}/>
                        </button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Jabas</p>
                            <p className="text-2xl font-black text-slate-900">{totals.qF}</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Pollos</p>
                            <p className="text-2xl font-black text-blue-600">{totals.bF}</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Peso Bruto</p>
                            <p className="text-2xl font-black text-slate-900">{totals.wF.toFixed(2)}</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tara Total</p>
                            <p className="text-2xl font-black text-orange-600">-{totals.wE.toFixed(2)}</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Merma</p>
                            <p className="text-2xl font-black text-red-600">-{totals.wM.toFixed(2)}</p>
                        </div>
                        <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Peso Final</p>
                            <p className="text-2xl font-black text-emerald-700">{totals.net.toFixed(2)}</p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden flex flex-col shadow-sm">
                            <div className="p-3 font-bold text-[10px] text-center uppercase tracking-widest text-white bg-slate-800">
                                Desglose de Pesos
                            </div>
                            <div className="grid grid-cols-3 divide-x divide-slate-200">
                                {/* Full Crates */}
                                <div className="flex flex-col">
                                    <div className="bg-blue-100 p-2 text-center text-[9px] font-black text-blue-800 uppercase tracking-wider">
                                        Llenas
                                    </div>
                                    <div className="p-2 flex-1 max-h-60 overflow-y-auto space-y-1">
                                        {activeOrder.records.filter(r => r.type === 'FULL').map((r, i) => (
                                            <div key={r.id} className="flex justify-between items-center text-[9px] border-b border-slate-100 pb-1 group">
                                                <span className="text-slate-400 w-6">#{activeOrder.records.filter(rt => rt.type === 'FULL').length - i}</span>
                                                <span className="font-mono font-bold text-slate-700 flex-1 text-center">{r.weight.toFixed(1)}</span>
                                                {!isLocked && (
                                                    <button 
                                                        onClick={() => deleteRecord(r.id)}
                                                        className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-1"
                                                        title="Eliminar"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="bg-slate-50 p-2 border-t border-slate-200 text-center">
                                        <p className="text-[8px] font-bold text-slate-400 uppercase">Total</p>
                                        <p className="font-black text-slate-800 text-sm">{totals.wF.toFixed(1)}</p>
                                    </div>
                                </div>

                                {/* Empty Crates */}
                                <div className="flex flex-col">
                                    <div className="bg-slate-200 p-2 text-center text-[9px] font-black text-slate-700 uppercase tracking-wider">
                                        Vacías
                                    </div>
                                    <div className="p-2 flex-1 max-h-60 overflow-y-auto space-y-1">
                                        {activeOrder.records.filter(r => r.type === 'EMPTY').map((r, i) => (
                                            <div key={r.id} className="flex justify-between items-center text-[9px] border-b border-slate-100 pb-1 group">
                                                <span className="text-slate-400 w-6">#{activeOrder.records.filter(rt => rt.type === 'EMPTY').length - i}</span>
                                                <span className="font-mono font-bold text-slate-700 flex-1 text-center">{r.weight.toFixed(1)}</span>
                                                {!isLocked && (
                                                    <button 
                                                        onClick={() => deleteRecord(r.id)}
                                                        className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-1"
                                                        title="Eliminar"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="bg-slate-50 p-2 border-t border-slate-200 text-center">
                                        <p className="text-[8px] font-bold text-slate-400 uppercase">Total</p>
                                        <p className="font-black text-orange-600 text-sm">-{totals.wE.toFixed(1)}</p>
                                    </div>
                                </div>

                                {/* Mortality */}
                                <div className="flex flex-col">
                                    <div className="bg-red-100 p-2 text-center text-[9px] font-black text-red-800 uppercase tracking-wider">
                                        Merma
                                    </div>
                                    <div className="p-2 flex-1 max-h-60 overflow-y-auto space-y-1">
                                        {activeOrder.records.filter(r => r.type === 'MORTALITY').map((r, i) => (
                                            <div key={r.id} className="flex justify-between items-center text-[9px] border-b border-slate-100 pb-1 group">
                                                <span className="text-slate-400 w-6">#{activeOrder.records.filter(rt => rt.type === 'MORTALITY').length - i}</span>
                                                <span className="font-mono font-bold text-slate-700 flex-1 text-center">{r.weight.toFixed(1)}</span>
                                                {!isLocked && (
                                                    <button 
                                                        onClick={() => deleteRecord(r.id)}
                                                        className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-1"
                                                        title="Eliminar"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="bg-slate-50 p-2 border-t border-slate-200 text-center">
                                        <p className="text-[8px] font-bold text-slate-400 uppercase">Total</p>
                                        <p className="font-black text-red-600 text-sm">-{totals.wM.toFixed(1)}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 flex gap-4 justify-end border-t border-slate-100 pt-6">
                        <button 
                            onClick={() => generateSalesTicketPDF(activeOrder)}
                            className="bg-slate-900 text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-slate-800 transition-all shadow-lg active:scale-95"
                        >
                            <Printer size={18} /> Ticket Cliente (80mm)
                        </button>
                        <button 
                            onClick={() => generateDetailPDF(activeOrder)}
                            className="bg-blue-600 text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-blue-500 transition-all shadow-lg shadow-blue-200 active:scale-95"
                        >
                            <Download size={18} /> Reporte Detallado (A4)
                        </button>
                    </div>
                </div>
            </div>
        )}
    </>
  );
};

export default WeighingStation;

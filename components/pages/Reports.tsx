import React, { useEffect, useState, useContext } from 'react';
import { getBatches, getOrders, getConfig, saveOrder, resetApp, getVisibleUserIds, getEffectiveBranding, uploadLocalToCloud } from '../../services/storage';
import { addLogoToPdf, addAppWatermarkToPdf } from '../../services/pdfHelper';
import { Batch, ClientOrder, WeighingType, UserRole, WeighingRecord } from '../../types';
import { 
  ChevronDown, ChevronUp, Package, ShoppingCart, List, Printer, 
  Eye, FileText, Download, Table as TableIcon, FileCheck, Calendar, Search, X, Receipt, Trash2, Share2,
  Wifi, RefreshCw, Layers, Users, DollarSign, Scale, CheckCircle2, Clock, Sparkles, Filter, ChevronRight,
  TrendingUp, AlertTriangle, ArrowRight, ShieldCheck, PhoneCall
} from 'lucide-react';
import { AuthContext } from '../../App';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const Reports: React.FC = () => {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [orders, setOrders] = useState<ClientOrder[]>([]);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState<ClientOrder | null>(null);
  const [previewData, setPreviewData] = useState<{ url: string, filename: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [filterMode, setFilterMode] = useState<'all' | 'byDate'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'closed' | 'direct'>('all');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('En vivo');

  const { user } = useContext(AuthContext);
  const config = getConfig();

  useEffect(() => {
    refresh();
    const handleUpdate = () => {
      refresh();
      setLastSyncTime(new Date().toLocaleTimeString());
    };
    
    window.addEventListener('avi_data_orders', handleUpdate);
    window.addEventListener('avi_data_batches', handleUpdate);
    window.addEventListener('avi_data_users', handleUpdate);
    window.addEventListener('avi_data_config', handleUpdate);

    // Auto-refresh when coming back to tab
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('avi_data_orders', handleUpdate);
      window.removeEventListener('avi_data_batches', handleUpdate);
      window.removeEventListener('avi_data_users', handleUpdate);
      window.removeEventListener('avi_data_config', handleUpdate);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user, selectedDate, filterMode]);

  const refresh = () => {
    const allBatches = getBatches();
    const allOrders = getOrders();
    const visibleIds = getVisibleUserIds(user);

    let filteredBatches = allBatches.filter(b => visibleIds.includes(b.createdBy || ''));
    let filteredOrders = allOrders.filter(o => visibleIds.includes(o.createdBy || ''));

    if (filterMode === 'byDate') {
      filteredBatches = filteredBatches.filter(b => {
        const dateObj = new Date(b.createdAt);
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const batchDate = `${year}-${month}-${day}`;
        return batchDate === selectedDate;
      });

      filteredOrders = filteredOrders.filter(o => {
        const records = o.records || [];
        if (records.length > 0) {
          return records.some(r => {
            const dateObj = new Date(r.timestamp);
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            const recordDate = `${year}-${month}-${day}`;
            return recordDate === selectedDate;
          });
        }
        if (o.batchId) {
          return filteredBatches.some(b => b.id === o.batchId);
        }
        return false;
      });
    }

    setBatches(filteredBatches);
    setOrders(filteredOrders);
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await uploadLocalToCloud();
      refresh();
      setLastSyncTime(new Date().toLocaleTimeString());
    } catch (e) {
      console.warn("Sync triggered:", e);
    } finally {
      setTimeout(() => setIsSyncing(false), 600);
    }
  };

  const handlePDFOutput = (doc: jsPDF, filename: string, preview: boolean = false) => {
    if (preview) {
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      setPreviewData({ url, filename });
    } else {
      doc.save(filename);
    }
  };

  const chunkArray = (array: any[], size: number) => {
    const chunked = [];
    for (let i = 0; i < array.length; i += size) {
      chunked.push(array.slice(i, i + size));
    }
    return chunked;
  };

  const handleDeleteRecord = (recordId: string) => {
    if (!showDetailModal) return;
    if (!window.confirm("¿Estás seguro de eliminar este registro de peso?")) return;

    const records = showDetailModal.records || [];
    const updatedRecords = records.filter(r => r.id !== recordId);
    const updatedOrder = { ...showDetailModal, records: updatedRecords };
    
    saveOrder(updatedOrder);
    setShowDetailModal(updatedOrder);
    setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
  };

  const getTotals = (order: ClientOrder) => {
    const records = order.records || [];
    const full = records.filter(r => r.type === 'FULL');
    const empty = records.filter(r => r.type === 'EMPTY');
    const mort = records.filter(r => r.type === 'MORTALITY');
    
    const wF = full.reduce((a, b) => a + b.weight, 0);
    const wE = empty.reduce((a, b) => a + b.weight, 0);
    const wM = mort.reduce((a, b) => a + b.weight, 0);
    
    const qF = full.reduce((a, b) => a + b.quantity, 0);
    const qE = empty.reduce((a, b) => a + b.quantity, 0);
    const qM = mort.reduce((a, b) => a + b.quantity, 0);
    
    const bF = full.reduce((a, b) => a + (b.birds !== undefined ? b.birds : (order.weighingMode === WeighingType.SOLO_POLLO ? b.quantity : b.quantity * 10)), 0);
    
    const net = order.weighingMode === WeighingType.SOLO_POLLO ? wF : wF - wE - wM;
    
    // Lame Chickens (Pollos Cojos)
    const lame = mort.filter(r => r.isLame);
    const wLame = lame.reduce((a, b) => a + b.weight, 0);
    const qLame = lame.reduce((a, b) => a + b.quantity, 0);
    const lamePercWeight = wF > 0 ? (wLame / wF) * 100 : 0;
    const lamePercQty = bF > 0 ? (qLame / bF) * 100 : 0;

    // Averages
    const avgNet = bF > 0 ? net / bF : 0;
    const avgMort = qM > 0 ? wM / qM : 0;

    const price = order.pricePerKg || 0;
    const totalAmount = net * price;
    const totalPaid = order.payments?.reduce((sum, p) => sum + p.amount, 0) || 0;
    const balance = totalAmount - totalPaid;

    return { 
      wF, wE, wM, qF, qE, qM, bF, net, avgNet, avgMort, 
      wLame, qLame, lamePercWeight, lamePercQty,
      price, totalAmount, totalPaid, balance 
    };
  };

  const getBatchTotals = (filterFn: (o: ClientOrder) => boolean) => {
    const filteredOrders = orders.filter(filterFn);
    let totalFull = 0, totalEmpty = 0, totalNet = 0, totalMort = 0;
    let totalLameWeight = 0, totalLameQty = 0, totalBirds = 0, totalCrates = 0;
    let totalEmptyCrates = 0, totalMortQty = 0;
    let totalAmount = 0, totalPaid = 0, totalBalance = 0;
    
    filteredOrders.forEach(o => {
      const stats = getTotals(o);
      totalFull += stats.wF;
      totalEmpty += stats.wE;
      totalMort += stats.wM;
      totalNet += stats.net;
      totalLameWeight += stats.wLame;
      totalLameQty += stats.qLame;
      totalBirds += stats.bF;
      totalCrates += stats.qF;
      totalEmptyCrates += stats.qE;
      totalMortQty += stats.qM;
      totalAmount += stats.totalAmount;
      totalPaid += stats.totalPaid;
      totalBalance += stats.balance;
    });

    return { 
      totalFull, totalEmpty, totalMort, totalNet, 
      totalLameWeight, totalLameQty, totalBirds, totalCrates,
      totalEmptyCrates, totalMortQty,
      totalAmount, totalPaid, totalBalance,
      orderCount: filteredOrders.length, 
      batchOrders: filteredOrders 
    };
  };

  // PDF Ticket & Report Renderers
  const renderTicketContent = (doc: jsPDF, order: ClientOrder, isSalesTicket: boolean) => {
    const branding = getEffectiveBranding(order, user);
    addAppWatermarkToPdf(doc);
    const t = getTotals(order);
    const batch = getBatches().find(b => b.id === order.batchId);
    const batchName = batch ? batch.name : 'Venta Directa';
    
    let y = 10;
    
    // Header Logo
    if (branding.logoUrl) {
      y = addLogoToPdf(doc, branding.logoUrl, { maxWidth: 35, maxHeight: 22, y });
    }

    doc.setFontSize(14).setFont("helvetica", "bold");
    const splitTitle = doc.splitTextToSize(branding.companyName.toUpperCase(), 70);
    splitTitle.forEach((line: string) => {
      doc.text(line, 40, y, { align: 'center' });
      y += 6;
    });
    
    doc.setFontSize(9).setFont("helvetica", "normal");
    doc.text(isSalesTicket ? "TICKET DE VENTA" : "TICKET DE PESAJE", 40, y, { align: 'center' });
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
    doc.setFontSize(9).setFont("helvetica", "bold");
    doc.text(`CLIENTE:`, 5, y);
    doc.setFont("helvetica", "normal");
    doc.text(order.clientName.toUpperCase(), 22, y);
    y += 6;

    if (!isSalesTicket) {
      // Quantities Box
      autoTable(doc, {
        startY: y,
        head: [[{ content: 'RESUMEN DE CANTIDADES', colSpan: 2, styles: { halign: 'center', fillColor: [220, 226, 230], textColor: 0 } }]],
        body: [
          ['Jabas Llenas:', t.qF.toString()],
          ['Total Pollos:', t.bF.toString()],
          ['Jabas Vacías:', ((batch?.emptyCrates !== undefined && batch?.emptyCrates !== null) ? batch.emptyCrates : t.qE).toString()],
          ['Pollos Muertos:', t.qM.toString()],
          ['Prom. Peso Neto:', `${t.avgNet.toFixed(1)} kg`],
          ['Prom. P. Muerto:', `${t.avgMort.toFixed(1)} kg`]
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

      // DETAILED RECORDS - GROUPED
      doc.setFontSize(10).setFont("helvetica", "bold");
      doc.text("DETALLE DE PESOS", 40, y, { align: 'center' });
      y += 2;

      const allRecords = order.records || [];
      if (allRecords.length > 0) {
        const types: {id: string, label: string}[] = [
          { id: 'FULL', label: order.weighingMode === WeighingType.SOLO_POLLO ? 'SACOS' : 'LLENAS' },
          { id: 'EMPTY', label: 'VACÍAS' },
          { id: 'MORTALITY_GALPON', label: 'MUERTOS GALPÓN' },
          { id: 'MORTALITY_ACOPIO', label: 'MUERTOS ACOPIO' }
        ];
        
        types.forEach(tSpec => {
          const filtered = allRecords.filter(r => {
            if (tSpec.id === 'MORTALITY_GALPON') return r.type === 'MORTALITY' && (r.origin || 'GALPON') === 'GALPON';
            if (tSpec.id === 'MORTALITY_ACOPIO') return r.type === 'MORTALITY' && r.origin === 'ACOPIO';
            return r.type === tSpec.id;
          }).sort((a,b) => a.timestamp - b.timestamp);
          
          if (filtered.length === 0) return;

          const typeTotalWeight = filtered.reduce((acc, r) => acc + r.weight, 0);
          const typeTotalQty = filtered.reduce((acc, r) => acc + r.quantity, 0);
          const sectionTitle = `${tSpec.label} (${typeTotalQty}p)`;

          autoTable(doc, {
            startY: y,
            head: [[{ content: sectionTitle, colSpan: 4, styles: { halign: 'center', fillColor: [240, 240, 240], textColor: 0, fontSize: 6.5 } }]],
            body: chunkArray(filtered.flatMap(r => {
              let suffix = '';
              if (r.type === 'FULL') suffix = order.weighingMode === WeighingType.SOLO_POLLO ? `${r.birds}p` : `${r.quantity}j, ${r.birds}p`;
              else if (r.type === 'EMPTY') suffix = `${r.quantity}j`;
              else if (r.type === 'MORTALITY') {
                const originLabel = (r.origin || 'GALPON') === 'ACOPIO' ? 'AC' : 'GL';
                suffix = `${r.quantity}p${r.isLame ? ' PC' : ''} ${originLabel}`;
              }
              return [r.weight.toFixed(2), suffix];
            }), 4),
            theme: 'grid',
            styles: { fontSize: 6, cellPadding: 0.8, halign: 'center' },
            margin: { left: 5, right: 5 },
            tableWidth: 70
          });
          y = (doc as any).lastAutoTable.finalY + 2;

          doc.setFontSize(7).setFont("helvetica", "bold");
          doc.text(`TOTAL ${tSpec.label}: ${typeTotalWeight.toFixed(2)} kg`, 70, y, { align: 'right' });
          y += 5;
        });
        
        y += 2;
      }

      if (allRecords.some(r => r.type === 'MORTALITY')) {
        doc.setFontSize(7).setFont("helvetica", "italic");
        doc.text("* PC=Cojo, GL=Galpón, AC=Acopio", 5, y);
        y += 5;
      }
    } else {
      // General Weights Box
      autoTable(doc, {
        startY: y,
        head: [[{ content: 'RESUMEN DE PESOS', colSpan: 2, styles: { halign: 'center', fillColor: [220, 226, 230], textColor: 0 } }]],
        body: [
          ['Peso Bruto:', `${t.wF.toFixed(2)} kg`],
          ['Tara Total:', `-${t.wE.toFixed(2)} kg`],
          ['Mortalidad:', `-${t.wM.toFixed(2)} kg`],
          ['Prom. P. Neto:', `${t.avgNet.toFixed(1)} kg`],
          ['Prom. P. Muerto:', `${t.avgMort.toFixed(1)} kg`],
          ['PESO NETO:', `${t.net.toFixed(2)} kg`]
        ],
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 2 },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 35 },
          1: { halign: 'right', cellWidth: 35 }
        },
        margin: { left: 5, right: 5 }
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

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
    doc.setFontSize(8).setFont("helvetica", "italic");
    doc.text("Prom. Peso Neto:", 8, y); doc.text(`${t.avgNet.toFixed(1)} kg`, 72, y, { align: 'right' }); y += 4;
    doc.text("Prom. P. Muerto:", 8, y); doc.text(`${t.avgMort.toFixed(1)} kg`, 72, y, { align: 'right' }); y += 5;
    
    doc.setFontSize(11).setFont("helvetica", "bold");
    doc.text("PESO NETO:", 8, y + 2);
    doc.text(`${t.net.toFixed(2)} kg`, 72, y + 2, { align: 'right' });
    y += 10;

    // Financials
    if (order.pricePerKg > 0) {
      doc.setFontSize(9).setFont("helvetica", "bold");
      doc.text(`PRECIO X KG: S/. ${order.pricePerKg.toFixed(2)}`, 5, y);
      y += 6;
      
      doc.setFillColor(15, 23, 42);
      doc.rect(5, y, 70, 15, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10).setFont("helvetica", "bold");
      doc.text("TOTAL A PAGAR", 35, y + 9, { align: 'right' });
      doc.setFontSize(14);
      doc.text(`S/. ${(t.net * order.pricePerKg).toFixed(2)}`, 72, y + 10, { align: 'right' });
      doc.setTextColor(0, 0, 0);
      y += 22;
    }

    doc.setFontSize(8).setFont("helvetica", "italic");
    doc.text("¡Gracias por su preferencia!", 40, y, { align: 'center' });
    
    return y + 10;
  };

  const generateTicketPDF = (order: ClientOrder, preview: boolean = false) => {
    const dummyDoc = new jsPDF({ unit: 'mm', format: [80, 15000] });
    const finalY = renderTicketContent(dummyDoc, order, false);
    const doc = new jsPDF({ unit: 'mm', format: [80, finalY] });
    renderTicketContent(doc, order, false);
    handlePDFOutput(doc, `Ticket_Detallado_${order.id.slice(-6)}.pdf`, preview);
  };

  const generateSalesTicketPDF = (order: ClientOrder, preview: boolean = false) => {
    const dummyDoc = new jsPDF({ unit: 'mm', format: [80, 15000] });
    const finalY = renderTicketContent(dummyDoc, order, true);
    const doc = new jsPDF({ unit: 'mm', format: [80, finalY] });
    renderTicketContent(doc, order, true);
    handlePDFOutput(doc, `Venta_${order.clientName}_${order.id.slice(-6)}.pdf`, preview);
  };

  const renderSummaryTicketContent = (doc: jsPDF, order: ClientOrder) => {
    const branding = getEffectiveBranding(order, user);
    addAppWatermarkToPdf(doc);
    const t = getTotals(order);
    const batch = getBatches().find(b => b.id === order.batchId);
    
    let y = 10;
    
    if (branding.logoUrl) {
      y = addLogoToPdf(doc, branding.logoUrl, { maxWidth: 35, maxHeight: 22, y });
    }

    doc.setFontSize(14).setFont("helvetica", "bold");
    const splitTitle = doc.splitTextToSize(branding.companyName.toUpperCase(), 70);
    splitTitle.forEach((line: string) => {
      doc.text(line, 40, y, { align: 'center' });
      y += 6;
    });
    
    doc.setFontSize(10).setFont("helvetica", "bold");
    doc.text("TICKET DE RESUMEN", 40, y, { align: 'center' });
    y += 5;
    
    doc.setFontSize(8).setFont("helvetica", "italic");
    doc.text(`FECHA: ${new Date().toLocaleString()}`, 40, y, { align: 'center' });
    y += 5;
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(5, y, 75, y);
    y += 5;

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text(`ORIGEN DE CARGA:`, 5, y);
    doc.setFont("helvetica", "normal");
    doc.text((batch?.origin || 'GRANJA / GALPÓN').toUpperCase(), 36, y);
    y += 4;

    doc.setFont("helvetica", "bold");
    doc.text(`NRO PLACA CAMIÓN:`, 5, y);
    doc.setFont("helvetica", "normal");
    doc.text((batch?.truckPlate || 'S/N').toUpperCase(), 36, y);
    y += 4;

    doc.setFont("helvetica", "bold");
    doc.text(`CLIENTE:`, 5, y);
    doc.setFont("helvetica", "normal");
    doc.text(order.clientName.toUpperCase(), 36, y);
    y += 4;

    doc.setFont("helvetica", "bold");
    doc.text(`JABAS LLENAS:`, 5, y);
    doc.setFont("helvetica", "normal");
    doc.text(`${t.qF} jabas`, 36, y);
    y += 4;

    doc.setFont("helvetica", "bold");
    doc.text(`JABAS VACÍAS:`, 5, y);
    doc.setFont("helvetica", "normal");
    const displayEmptyCrates = (batch?.emptyCrates !== undefined && batch?.emptyCrates !== null) ? batch.emptyCrates : t.qE;
    doc.text(`${displayEmptyCrates} jabas`, 36, y);
    y += 4;

    doc.setFont("helvetica", "bold");
    doc.text(`POLLOS X JABA:`, 5, y);
    doc.setFont("helvetica", "normal");
    doc.text(`${order.birdsPerCrate || 10} pollos/jaba`, 36, y);
    y += 4;

    const pollosVivos = Math.max(0, t.bF - t.qM);

    autoTable(doc, {
      startY: y,
      head: [[
        { content: 'CONCEPTO', styles: { halign: 'left', fillColor: [220, 226, 230], textColor: 0 } },
        { content: 'JABAS', styles: { halign: 'center', fillColor: [220, 226, 230], textColor: 0 } },
        { content: 'POLLOS', styles: { halign: 'center', fillColor: [220, 226, 230], textColor: 0 } },
        { content: 'PESO (KG)', styles: { halign: 'right', fillColor: [220, 226, 230], textColor: 0 } }
      ]],
      body: [
        ['Jabas Llenas:', `${t.qF}`, `${t.bF}`, `${t.wF.toFixed(2)} kg`],
        ['Jabas Vacías:', `${displayEmptyCrates}`, `-`, `-${t.wE.toFixed(2)} kg`],
        ['Pollos Muertos:', `-`, `${t.qM}`, `-${t.wM.toFixed(2)} kg`],
        ['Pollos Vivos:', `-`, `${pollosVivos}`, `${t.net.toFixed(2)} kg`]
      ],
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.2 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 30 },
        1: { halign: 'center', cellWidth: 10 },
        2: { halign: 'center', cellWidth: 11 },
        3: { halign: 'right', cellWidth: 19 }
      },
      margin: { left: 5, right: 5 }
    });
    y = (doc as any).lastAutoTable.finalY + 4;

    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(5, y, 75, y);
    y += 5;

    // Totals
    doc.setFontSize(9).setFont("helvetica", "normal");
    doc.text("Peso Bruto Total:", 8, y); doc.text(`${t.wF.toFixed(2)} kg`, 72, y, { align: 'right' }); y += 5;
    doc.text("Tara Total:", 8, y); doc.text(`-${t.wE.toFixed(2)} kg`, 72, y, { align: 'right' }); y += 5;
    if (t.wM > 0) {
      doc.text("Merma Muertos:", 8, y); doc.text(`-${t.wM.toFixed(2)} kg`, 72, y, { align: 'right' }); y += 5;
    }

    doc.setFillColor(241, 245, 249);
    doc.rect(5, y, 70, 9, 'F');
    doc.setFontSize(9).setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("PESO NETO VIVO:", 8, y + 6);
    doc.setFontSize(11).setFont("helvetica", "bold");
    doc.text(`${t.net.toFixed(2)} kg`, 72, y + 6, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    y += 13;

    if (order.pricePerKg > 0) {
      doc.setFontSize(9).setFont("helvetica", "bold");
      doc.text(`PRECIO X KG: S/. ${order.pricePerKg.toFixed(2)}`, 5, y);
      y += 6;
      
      doc.setFillColor(15, 23, 42);
      doc.rect(5, y, 70, 14, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9).setFont("helvetica", "bold");
      doc.text("TOTAL A PAGAR", 35, y + 8, { align: 'right' });
      doc.setFontSize(12);
      doc.text(`S/. ${(t.net * order.pricePerKg).toFixed(2)}`, 72, y + 9, { align: 'right' });
      doc.setTextColor(0, 0, 0);
      y += 20;
    }

    y += 12;
    doc.setLineWidth(0.3);
    doc.setDrawColor(0);

    // Signatures
    doc.line(5, y, 36, y);
    doc.setFontSize(6.5).setFont("helvetica", "bold");
    doc.text("RESPONSABLE DESPACHO", 20.5, y + 3, { align: 'center' });
    doc.setFont("helvetica", "normal");
    const dispName = batch?.dispatcherName || '..............................';
    const dispDni = batch?.dispatcherDni ? `DNI: ${batch.dispatcherDni}` : 'DNI: ....................';
    doc.text(doc.splitTextToSize(dispName.toUpperCase(), 31), 20.5, y + 6, { align: 'center' });
    doc.text(dispDni, 20.5, y + 9.5, { align: 'center' });

    doc.line(44, y, 75, y);
    doc.setFontSize(6.5).setFont("helvetica", "bold");
    doc.text("FIRMA DEL CLIENTE", 59.5, y + 3, { align: 'center' });
    doc.setFont("helvetica", "normal");
    const cliName = order.clientName || '..............................';
    const cliDni = order.clientDni || batch?.clientDni ? `DNI: ${order.clientDni || batch?.clientDni}` : 'DNI: ....................';
    doc.text(doc.splitTextToSize(cliName.toUpperCase(), 31), 59.5, y + 6, { align: 'center' });
    doc.text(cliDni, 59.5, y + 9.5, { align: 'center' });

    y += 15;
    doc.setFontSize(8).setFont("helvetica", "italic");
    doc.text("¡Gracias por su preferencia!", 40, y, { align: 'center' });

    return y + 8;
  };

  const generateSummaryTicketPDF = (order: ClientOrder, preview: boolean = false) => {
    const dummyDoc = new jsPDF({ unit: 'mm', format: [80, 15000] });
    const finalY = renderSummaryTicketContent(dummyDoc, order);
    const doc = new jsPDF({ unit: 'mm', format: [80, finalY] });
    renderSummaryTicketContent(doc, order);
    handlePDFOutput(doc, `Resumen_${order.clientName}_${order.id.slice(-6)}.pdf`, preview);
  };

  const generateA4ClientPDF = (order: ClientOrder) => {
    const branding = getEffectiveBranding(order, user);
    const t = getTotals(order);
    const batch = getBatches().find(b => b.id === order.batchId);
    const batchName = batch ? batch.name : 'Venta Directa';
    const doc = new jsPDF();
    addAppWatermarkToPdf(doc);
    
    // Header Background
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 45, 'F');
    
    if (branding.logoUrl) {
      addLogoToPdf(doc, branding.logoUrl, { maxWidth: 28, maxHeight: 28, defaultX: 14, y: 8 });
    }

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22).setFont("helvetica", "bold");
    doc.text(branding.companyName.toUpperCase(), 105, 20, { align: 'center' });
    
    doc.setFontSize(12).setFont("helvetica", "normal");
    doc.text("REPORTE DETALLADO DE PESAJE", 105, 30, { align: 'center' });
    
    doc.setTextColor(0, 0, 0);
    let y = 55;
    
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

    autoTable(doc, {
      startY: y + 10,
      head: [['CONCEPTO', 'CANTIDAD', 'DETALLE', 'PESO TOTAL (KG)']],
      body: [
        ['Jabas Llenas (Bruto)', t.qF, `${t.bF} Pollos`, t.wF.toFixed(2)],
        ['Jabas Vacías (Tara)', (batch?.emptyCrates !== undefined && batch?.emptyCrates !== null ? batch.emptyCrates : t.qE), '-', `-${t.wE.toFixed(2)}`],
        ['Mortalidad (Pollos Muertos)', t.qM, '-', `-${t.wM.toFixed(2)}`],
        ['Promedio Peso Neto', '-', '-', `${t.avgNet.toFixed(1)} kg`],
        ['Promedio Peso Muerto', '-', '-', `${t.avgMort.toFixed(1)} kg`],
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

    y = (doc as any).lastAutoTable.finalY + 15;
    
    doc.setFontSize(14).setFont("helvetica", "bold");
    doc.text("DESGLOSE DE PESADAS", 14, y);
    y += 5;

    const records = order.records || [];
    const fullRecords = records.filter(r => r.type === 'FULL').sort((a, b) => b.timestamp - a.timestamp);
    const emptyRecords = records.filter(r => r.type === 'EMPTY').sort((a, b) => b.timestamp - a.timestamp);
    const mortRecords = records.filter(r => r.type === 'MORTALITY').sort((a, b) => b.timestamp - a.timestamp);

    const renderCategoryGridA4 = (title: string, records: any[], totalWeight: number, qty?: number) => {
      if (records.length === 0) return;
      y = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : y + 5;
      if (y > 250) { doc.addPage(); y = 20; }
      
      const headerText = qty !== undefined 
        ? `${title} - CANTIDAD: ${qty} | TOTAL: ${totalWeight.toFixed(2)} KG`
        : `${title} - TOTAL: ${totalWeight.toFixed(2)} KG`;

      autoTable(doc, {
        startY: y,
        head: [[{ content: headerText, colSpan: 8, styles: { halign: 'left', fillColor: [241, 245, 249], textColor: 0, fontStyle: 'bold' } }]],
        body: chunkArray(records.flatMap(r => {
          let suffix = '';
          if (r.type === 'FULL') suffix = `${r.quantity}j, ${r.birds}p`;
          else if (r.type === 'EMPTY') suffix = `${r.quantity}j`;
          else if (r.type === 'MORTALITY') suffix = `${r.quantity}p${r.isLame ? ' (PC)' : ''}`;
          return [r.weight.toFixed(2), suffix];
        }), 8),
        theme: 'grid',
        styles: { fontSize: 8, halign: 'center', cellPadding: 2, minCellHeight: 8 },
        margin: { left: 14, right: 14 }
      });
    };

    renderCategoryGridA4("JABAS LLENAS", fullRecords, t.wF, t.qF);
    renderCategoryGridA4("JABAS VACÍAS", emptyRecords, t.wE, t.qE);
    renderCategoryGridA4("MORTALIDAD", mortRecords, t.wM, t.qM);

    const pageCount = (doc as any).internal.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8).setTextColor(150);
      doc.text(`Generado por AviControl Pro - Página ${i} de ${pageCount}`, 105, 290, { align: 'center' });
    }

    handlePDFOutput(doc, `Reporte_A4_${order.clientName}_${order.id.slice(-6)}.pdf`, false);
  };

  const generateLameTicketPDF = (order: ClientOrder, preview: boolean = false) => {
    const branding = getEffectiveBranding(order, user);
    const t = getTotals(order);
    const doc = new jsPDF({ unit: 'mm', format: [80, 150] });
    addAppWatermarkToPdf(doc);
    const batch = getBatches().find(b => b.id === order.batchId);
    const batchName = batch ? batch.name : 'Venta Directa';
    
    let y = 10;
    
    if (branding.logoUrl) {
      y = addLogoToPdf(doc, branding.logoUrl, { maxWidth: 35, maxHeight: 22, y });
    }

    doc.setFontSize(14).setFont("helvetica", "bold");
    doc.text(branding.companyName.toUpperCase(), 40, y, { align: 'center' });
    y += 5;
    
    doc.setFontSize(10).setFont("helvetica", "bold");
    doc.text("REPORTE POLLOS COJOS", 40, y, { align: 'center' });
    y += 5;
    
    doc.setFontSize(8).setFont("helvetica", "italic");
    doc.text(`FECHA: ${new Date().toLocaleString()}`, 40, y, { align: 'center' });
    y += 5;
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(5, y, 75, y);
    y += 5;

    doc.setFontSize(9).setFont("helvetica", "bold");
    doc.text(`LOTE: ${batchName.toUpperCase()}`, 5, y);
    y += 5;
    doc.text(`CLIENTE: ${order.clientName.toUpperCase()}`, 5, y);
    y += 7;

    const lameRecords = (order.records || []).filter(r => r.isLame);
    
    autoTable(doc, {
      startY: y,
      head: [[
        { content: 'PESO (KG)', styles: { halign: 'center', fillColor: [249, 115, 22], textColor: 255 } },
        { content: 'CANT.', styles: { halign: 'center', fillColor: [249, 115, 22], textColor: 255 } },
        { content: 'ORIGEN', styles: { halign: 'center', fillColor: [249, 115, 22], textColor: 255 } }
      ]],
      body: lameRecords.map(r => [
        `${r.weight.toFixed(2)} kg`,
        `${r.quantity}p`,
        (r.origin || 'GALPON') === 'ACOPIO' ? 'Acopio' : 'Galpón'
      ]),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2, halign: 'center' },
      margin: { left: 5, right: 5 }
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    doc.setFontSize(9).setFont("helvetica", "bold");
    doc.text(`TOTAL COJOS: ${t.qLame} pollos`, 5, y); y += 5;
    doc.text(`PESO TOTAL COJOS: ${t.wLame.toFixed(2)} kg`, 5, y); y += 5;
    doc.text(`% DE CARGA (PESO): ${t.lamePercWeight.toFixed(2)}%`, 5, y);

    handlePDFOutput(doc, `Cojos_${order.clientName}_${order.id.slice(-6)}.pdf`, preview);
  };

  const generateBatchReportPDF = (batchName: string, stats: any, batchData?: Batch) => {
    const branding = getEffectiveBranding(batchData || null, user);
    const doc = new jsPDF('landscape');
    addAppWatermarkToPdf(doc);
    
    // Header Background
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 297, 40, 'F');
    
    if (branding.logoUrl) {
      addLogoToPdf(doc, branding.logoUrl, { maxWidth: 26, maxHeight: 26, defaultX: 14, y: 7 });
    }

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20).setFont("helvetica", "bold");
    doc.text(branding.companyName.toUpperCase(), 148.5, 18, { align: 'center' });
    
    doc.setFontSize(11).setFont("helvetica", "normal");
    doc.text(`REPORTE CONSOLIDADO DE LOTE: ${batchName.toUpperCase()}`, 148.5, 28, { align: 'center' });
    
    doc.setTextColor(0, 0, 0);
    let y = 48;

    doc.setFontSize(9).setFont("helvetica", "bold");
    doc.text(`FECHA DE EMISIÓN: ${new Date().toLocaleString()}`, 14, y);
    if (batchData?.truckPlate) {
      doc.text(`PLACA CAMIÓN: ${batchData.truckPlate.toUpperCase()}`, 120, y);
    }
    if (batchData?.origin) {
      doc.text(`ORIGEN: ${batchData.origin.toUpperCase()}`, 200, y);
    }
    y += 8;

    const tableData = stats.batchOrders.map((order: ClientOrder) => {
      const t = getTotals(order);
      return [
        order.clientName.toUpperCase(),
        t.qF.toString(),
        t.bF.toString(),
        t.wF.toFixed(2),
        t.wE.toFixed(2),
        t.wM.toFixed(2),
        t.net.toFixed(2),
        `S/ ${t.price.toFixed(2)}`,
        `S/ ${t.totalAmount.toFixed(2)}`,
        `S/ ${t.totalPaid.toFixed(2)}`,
        `S/ ${t.balance.toFixed(2)}`
      ];
    });

    tableData.push([
      { content: 'TOTALES CONSOLIDADOS', styles: { fontStyle: 'bold', halign: 'right' } },
      stats.totalCrates?.toString() || '-',
      stats.totalBirds.toString(),
      stats.totalFull.toFixed(2),
      stats.totalEmpty.toFixed(2),
      stats.totalMort.toFixed(2),
      { content: stats.totalNet.toFixed(2), styles: { fontStyle: 'bold' } },
      '-',
      { content: `S/ ${stats.totalAmount.toFixed(2)}`, styles: { fontStyle: 'bold' } },
      { content: `S/ ${stats.totalPaid.toFixed(2)}`, styles: { fontStyle: 'bold' } },
      { content: `S/ ${stats.totalBalance.toFixed(2)}`, styles: { fontStyle: 'bold' } }
    ]);

    autoTable(doc, {
      startY: y,
      head: [['CLIENTE', 'JABAS', 'POLLOS', 'BRUTO (KG)', 'TARA (KG)', 'MERMA (KG)', 'NETO (KG)', 'PRECIO/KG', 'MONTO TOTAL', 'ABONADO', 'SALDO']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', fontSize: 8, halign: 'center' },
      styles: { fontSize: 8, cellPadding: 3, halign: 'center' },
      columnStyles: {
        0: { halign: 'left', fontStyle: 'bold', cellWidth: 38 },
        6: { fontStyle: 'bold', textColor: [21, 128, 61] },
        8: { fontStyle: 'bold' },
        10: { fontStyle: 'bold', textColor: [185, 28, 28] }
      }
    });

    const pageCount = (doc as any).internal.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8).setTextColor(150);
      doc.text(`Generado por AviControl Pro - Página ${i} de ${pageCount}`, 148.5, 200, { align: 'center' });
    }

    handlePDFOutput(doc, `Reporte_Lote_${batchName.replace(/\s+/g, '_')}.pdf`, false);
  };

  const shareViaWhatsApp = (order: ClientOrder) => {
    const t = getTotals(order);
    const batch = getBatches().find(b => b.id === order.batchId);
    const batchName = batch ? batch.name : 'Venta Directa';
    const configData = getConfig();
    const company = configData.companyName || 'AVI CONTROL';

    let text = `*🐔 ${company.toUpperCase()} - REPORTE DE PESAJE*\n`;
    text += `*Lote:* ${batchName}\n`;
    text += `*Cliente:* ${order.clientName}\n`;
    text += `*Fecha:* ${new Date().toLocaleString()}\n\n`;
    text += `*📊 RESUMEN DE PESAJE:*\n`;
    text += `• *Jabas Llenas:* ${t.qF}\n`;
    text += `• *Total Pollos:* ${t.bF}\n`;
    text += `• *Peso Bruto:* ${t.wF.toFixed(2)} kg\n`;
    text += `• *Tara Total:* -${t.wE.toFixed(2)} kg\n`;
    if (t.wM > 0) text += `• *Mortalidad:* -${t.wM.toFixed(2)} kg (${t.qM} pollos)\n`;
    text += `• *PESO NETO:* *${t.net.toFixed(2)} kg*\n`;
    text += `• *Promedio por Pollo:* ${t.avgNet.toFixed(2)} kg\n`;

    if (t.price > 0) {
      text += `\n*💰 RESUMEN ECONÓMICO:*\n`;
      text += `• *Precio/kg:* S/ ${t.price.toFixed(2)}\n`;
      text += `• *Total a Pagar:* *S/ ${t.totalAmount.toFixed(2)}*\n`;
      text += `• *Total Abonado:* S/ ${t.totalPaid.toFixed(2)}\n`;
      text += `• *Saldo Pendiente:* *S/ ${t.balance.toFixed(2)}*\n`;
    }

    text += `\n_Emitido con AviControl Pro_`;

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Direct sales & Batch grouping
  const directSalesStats = getBatchTotals(o => !o.batchId);

  const filteredBatchesList = batches.filter(batch => {
    if (statusFilter === 'active' && batch.status === 'ARCHIVED') return false;
    if (statusFilter === 'closed' && batch.status !== 'ARCHIVED') return false;
    if (statusFilter === 'direct') return false;

    if (searchTerm) {
      const matchBatchName = batch.name.toLowerCase().includes(searchTerm.toLowerCase());
      const batchClients = orders.filter(o => o.batchId === batch.id);
      const matchClient = batchClients.some(o => o.clientName.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchBatchName || matchClient;
    }
    return true;
  });

  const showDirectSales = (statusFilter === 'all' || statusFilter === 'direct') && directSalesStats.orderCount > 0 && (!searchTerm || orders.some(o => !o.batchId && o.clientName.toLowerCase().includes(searchTerm.toLowerCase())));

  // Overall KPIs
  const totalNetKg = orders.reduce((sum, o) => sum + getTotals(o).net, 0);
  const totalBirds = orders.reduce((sum, o) => sum + getTotals(o).bF, 0);
  const totalBalanceDue = orders.reduce((sum, o) => sum + getTotals(o).balance, 0);

  return (
    <>
      <div className="space-y-6 animate-fade-in pb-16 text-left max-w-7xl mx-auto">
        
        {/* Real-time sync & System Banner */}
        <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 rounded-3xl p-6 text-white shadow-xl border border-blue-900/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-black text-[10px] uppercase tracking-wider border border-emerald-500/30">
                Sincronización en Tiempo Real Activa
              </span>
              <span className="text-[10px] text-blue-300/80 font-medium hidden sm:inline">
                • Conexión Directa Multidispositivo
              </span>
            </div>
            <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight">
              Reportes por Lote y Clientes
            </h2>
            <p className="text-xs text-blue-200/80 font-medium mt-1">
              Visualiza en vivo el pesaje, cantidades de jabas, mermas, tickets y estados de cuenta organizados por cada lote y sus clientes.
            </p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <button 
              onClick={handleManualSync}
              disabled={isSyncing}
              className="bg-white/10 hover:bg-white/20 border border-white/20 px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-wider text-white flex items-center gap-2 transition-all active:scale-95 shadow-md"
              title="Forzar actualización en la nube"
            >
              <RefreshCw size={16} className={isSyncing ? "animate-spin text-emerald-400" : "text-blue-300"} />
              <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar en Vivo'}</span>
            </button>
          </div>
        </div>

        {/* Executive Metrics Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="p-3.5 bg-blue-50 text-blue-600 rounded-2xl">
              <Package size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lotes Totales</p>
              <p className="text-2xl font-black text-slate-900">{batches.length}</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl">
              <Users size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Clientes Atendidos</p>
              <p className="text-2xl font-black text-indigo-600">{orders.length}</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-2xl">
              <Scale size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Peso Neto Acumulado</p>
              <p className="text-2xl font-black text-emerald-700 font-digital">{totalNetKg.toFixed(1)} <span className="text-sm font-sans font-bold">kg</span></p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="p-3.5 bg-amber-50 text-amber-600 rounded-2xl">
              <DollarSign size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo Pendiente Cobranza</p>
              <p className="text-2xl font-black text-amber-600">S/ {totalBalanceDue.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4">
            
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Buscar por nombre de Lote o Cliente..." 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-all text-slate-800 placeholder-slate-400"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Date Filtering Toggle */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
              <div className="bg-slate-100 p-1 rounded-2xl flex items-center">
                <button 
                  onClick={() => setFilterMode('all')}
                  className={`px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${filterMode === 'all' ? 'bg-white text-blue-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Todos los Lotes
                </button>
                <button 
                  onClick={() => setFilterMode('byDate')}
                  className={`px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 ${filterMode === 'byDate' ? 'bg-white text-blue-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <Calendar size={14}/> Por Fecha
                </button>
              </div>

              {filterMode === 'byDate' && (
                <input 
                  type="date" 
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none focus:border-blue-500 text-slate-700 shadow-sm"
                />
              )}
            </div>
          </div>

          {/* Quick status tabs */}
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 overflow-x-auto pb-1">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2 flex items-center gap-1">
              <Filter size={12}/> Filtrar:
            </span>
            <button 
              onClick={() => setStatusFilter('all')}
              className={`px-3.5 py-1.5 rounded-xl font-black text-[11px] uppercase tracking-wider whitespace-nowrap transition-all ${statusFilter === 'all' ? 'bg-blue-950 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
            >
              Todos ({batches.length + (directSalesStats.orderCount > 0 ? 1 : 0)})
            </button>
            <button 
              onClick={() => setStatusFilter('active')}
              className={`px-3.5 py-1.5 rounded-xl font-black text-[11px] uppercase tracking-wider whitespace-nowrap transition-all ${statusFilter === 'active' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
            >
              En Proceso ({batches.filter(b => b.status !== 'ARCHIVED').length})
            </button>
            <button 
              onClick={() => setStatusFilter('closed')}
              className={`px-3.5 py-1.5 rounded-xl font-black text-[11px] uppercase tracking-wider whitespace-nowrap transition-all ${statusFilter === 'closed' ? 'bg-slate-800 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
            >
              Cerrados ({batches.filter(b => b.status === 'ARCHIVED').length})
            </button>
            {directSalesStats.orderCount > 0 && (
              <button 
                onClick={() => setStatusFilter('direct')}
                className={`px-3.5 py-1.5 rounded-xl font-black text-[11px] uppercase tracking-wider whitespace-nowrap transition-all ${statusFilter === 'direct' ? 'bg-amber-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
              >
                Ventas Directas ({directSalesStats.orderCount})
              </button>
            )}
          </div>
        </div>

        {/* HIERARCHICAL REPORTS: BY EACH BATCH & RESPECTIVE CLIENTS */}
        <div className="space-y-6">
          
          {/* Direct Sales Group (if active) */}
          {showDirectSales && (
            <div className="bg-white rounded-[2.5rem] shadow-sm border-2 border-amber-200/80 overflow-hidden transition-all text-left">
              {/* Header Bar */}
              <div 
                className="p-6 bg-gradient-to-r from-amber-500/10 via-amber-50 to-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4 cursor-pointer hover:bg-amber-50/80 transition-colors"
                onClick={() => setExpandedBatch(expandedBatch === 'direct-sales' ? null : 'direct-sales')}
              >
                <div className="flex items-center space-x-4">
                  <div className="p-4 rounded-2xl bg-amber-500 text-white shadow-md shadow-amber-500/20">
                    <ShoppingCart size={28} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-black text-[9px] uppercase tracking-wider border border-amber-200">
                        Ventas Directas
                      </span>
                      <span className="text-xs font-black text-slate-500">
                        {directSalesStats.orderCount} Clientes Registrados
                      </span>
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mt-1">
                      Despacho sin Lote Asignado
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-right">
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Jabas Llenas / Vacías</p>
                      <p className="text-base font-black text-slate-800">{directSalesStats.totalCrates} ll / <span className="text-orange-600">{directSalesStats.totalEmptyCrates} vac</span></p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Peso Bruto / Tara</p>
                      <p className="text-base font-black text-slate-800 font-digital">{directSalesStats.totalFull.toFixed(1)} / -{directSalesStats.totalEmpty.toFixed(1)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Mortalidad ({directSalesStats.totalMortQty}p)</p>
                      <p className="text-base font-black text-red-600 font-digital">-{directSalesStats.totalMort.toFixed(1)} kg</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-emerald-600 uppercase font-black tracking-widest">Neto Total</p>
                      <p className="text-xl font-black text-emerald-700 font-digital">{directSalesStats.totalNet.toFixed(1)} kg</p>
                    </div>
                  </div>

                  <div className="p-2 rounded-xl bg-amber-100/50 text-amber-800">
                    {expandedBatch === 'direct-sales' ? <ChevronUp size={22} /> : <ChevronDown size={22} />}
                  </div>
                </div>
              </div>

              {/* Respective Clients Inside Direct Sales */}
              {expandedBatch === 'direct-sales' && (
                <div className="p-6 bg-slate-50/80 border-t border-slate-200 animate-fade-in space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                      <Users size={16} className="text-amber-600"/> Clientes en Ventas Directas ({directSalesStats.orderCount})
                    </h4>
                    <button 
                      onClick={() => generateBatchReportPDF('Ventas Directas', directSalesStats)}
                      className="px-4 py-2.5 bg-blue-950 text-white rounded-xl hover:bg-blue-900 transition-all font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-md shadow-blue-950/20 active:scale-95"
                    >
                      <Download size={14}/> Reporte Consolidado A4
                    </button>
                  </div>

                  <div className="space-y-4">
                    {directSalesStats.batchOrders
                      .filter(o => o.clientName.toLowerCase().includes(searchTerm.toLowerCase()))
                      .map((order: ClientOrder) => renderClientCard(order))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Batches List */}
          {filteredBatchesList.length === 0 && !showDirectSales ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-sm">
              <Package size={48} className="mx-auto text-slate-300 mb-3"/>
              <h4 className="text-lg font-black text-slate-700 uppercase tracking-tight">No se encontraron lotes</h4>
              <p className="text-xs text-slate-400 font-medium mt-1">
                {searchTerm ? 'Intenta buscando con otro término.' : 'No hay registros para la fecha o filtros seleccionados.'}
              </p>
            </div>
          ) : (
            filteredBatchesList.map(batch => {
              const stats = getBatchTotals(o => o.batchId === batch.id);
              const isExpanded = expandedBatch === batch.id;
              const isClosed = batch.status === 'ARCHIVED';
              const filteredBatchOrders = stats.batchOrders.filter((o: ClientOrder) => o.clientName.toLowerCase().includes(searchTerm.toLowerCase()));

              return (
                <div key={batch.id} className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden hover:border-blue-300 transition-all text-left">
                  
                  {/* Batch Master Header */}
                  <div 
                    className={`p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50/50 border-b border-blue-100' : 'hover:bg-slate-50'}`}
                    onClick={() => setExpandedBatch(isExpanded ? null : batch.id)}
                  >
                    <div className="flex items-start sm:items-center space-x-4">
                      <div className={`p-4 rounded-2xl text-white shadow-lg ${isClosed ? 'bg-slate-800' : 'bg-blue-900 shadow-blue-900/20'}`}>
                        <Package size={28} />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded-full font-black text-[9px] uppercase tracking-wider border ${isClosed ? 'bg-slate-100 text-slate-600 border-slate-300' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                            {isClosed ? 'Lote Cerrado' : '● En Proceso'}
                          </span>
                          <span className="text-xs font-black text-blue-900 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100">
                            {stats.orderCount} Clientes
                          </span>
                          <span className="text-[10px] text-slate-400 font-bold">
                            Iniciado el {new Date(batch.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mt-1">
                          {batch.name}
                        </h3>
                        <p className="text-xs text-slate-500 font-medium">
                          {batch.origin ? `Origen: ${batch.origin}` : 'Granja'} {batch.truckPlate ? `• Placa: ${batch.truckPlate}` : ''} {batch.dispatcherName ? `• Despachador: ${batch.dispatcherName}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-6 w-full lg:w-auto justify-between lg:justify-end">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-right">
                        <div>
                          <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Jabas Llenas / Vacías</p>
                          <p className="text-sm font-black text-slate-800">{stats.totalCrates} ll / <span className="text-orange-600">{stats.totalEmptyCrates} vac</span></p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Bruto / Tara</p>
                          <p className="text-sm font-black text-slate-800 font-digital">{stats.totalFull.toFixed(1)} / -{stats.totalEmpty.toFixed(1)}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Mortalidad ({stats.totalMortQty}p)</p>
                          <p className="text-sm font-black text-red-600 font-digital">-{stats.totalMort.toFixed(1)} kg</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-emerald-600 uppercase font-black tracking-widest">Neto Acumulado</p>
                          <p className="text-xl font-black text-emerald-700 font-digital">{stats.totalNet.toFixed(1)} <span className="text-xs font-sans font-bold">kg</span></p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button 
                          onClick={(e) => { e.stopPropagation(); generateBatchReportPDF(batch.name, stats, batch); }}
                          className="px-3.5 py-2.5 bg-blue-950 text-white rounded-xl hover:bg-blue-900 transition-all font-black text-[10px] uppercase tracking-wider flex items-center gap-1.5 shadow-sm active:scale-95"
                          title="Descargar Reporte Completo del Lote"
                        >
                          <Download size={14}/> Reporte Lote A4
                        </button>
                        <div className="p-2 rounded-xl bg-slate-100 text-slate-500">
                          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Respective Clients Container */}
                  {isExpanded && (
                    <div className="p-6 bg-slate-50/80 border-t border-slate-100 animate-fade-in space-y-4">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                          <Users size={16} className="text-blue-600"/> Clientes Registrados en este Lote ({stats.orderCount})
                        </h4>
                        <div className="text-[11px] font-bold text-slate-500">
                          Facturación Lote: <span className="text-slate-900 font-black">S/ {stats.totalAmount.toFixed(2)}</span> • Saldo Pendiente: <span className="text-red-600 font-black">S/ {stats.totalBalance.toFixed(2)}</span>
                        </div>
                      </div>

                      {filteredBatchOrders.length === 0 ? (
                        <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
                          <p className="text-xs font-black text-slate-400 uppercase">No hay clientes con pesajes en este lote</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {filteredBatchOrders.map((order: ClientOrder) => renderClientCard(order))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

        </div>

      </div>

      {/* Modal de Detalle de Carga y Pesadas */}
      {showDetailModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-3xl p-8 w-full max-w-4xl shadow-2xl border border-slate-100 my-auto text-left">
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
                onClick={() => { setShowDetailModal(null); setPreviewData(null); }} 
                className="p-2 bg-slate-100 text-slate-500 hover:text-slate-900 rounded-xl transition-all"
              >
                <X size={20}/>
              </button>
            </div>

            {/* Metrics Breakdown Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Jabas Llenas</p>
                <p className="text-xl font-black text-slate-900">{getTotals(showDetailModal).qF}</p>
              </div>
              <div className="bg-orange-50 p-3 rounded-2xl border border-orange-200">
                <p className="text-[9px] font-black text-orange-500 uppercase tracking-widest mb-0.5">Jabas Vacías</p>
                <p className="text-xl font-black text-orange-700">{getTotals(showDetailModal).qE}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Total Pollos</p>
                <p className="text-xl font-black text-blue-600">{getTotals(showDetailModal).bF}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Peso Bruto</p>
                <p className="text-xl font-black text-slate-900 font-digital">{getTotals(showDetailModal).wF.toFixed(1)}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Tara Total</p>
                <p className="text-xl font-black text-orange-600 font-digital">-{getTotals(showDetailModal).wE.toFixed(1)}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Mortalidad</p>
                <p className="text-xl font-black text-red-600 font-digital">-{getTotals(showDetailModal).wM.toFixed(1)}</p>
              </div>
              <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-200 col-span-2 sm:col-span-1">
                <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-0.5">Peso Neto</p>
                <p className="text-xl font-black text-emerald-700 font-digital">{getTotals(showDetailModal).net.toFixed(1)} kg</p>
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
                onClick={() => generateLameTicketPDF(showDetailModal, true)} 
                className="flex-1 min-w-[120px] bg-orange-500 text-white px-3 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-orange-600 shadow-md shadow-orange-500/20 transition-all active:scale-95"
              >
                <Receipt size={14} /> Ticket Cojos
              </button>
              <button 
                onClick={() => shareViaWhatsApp(showDetailModal)} 
                className="flex-1 min-w-[120px] bg-green-600 text-white px-3 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-green-700 shadow-md shadow-green-600/20 transition-all active:scale-95"
              >
                <Share2 size={14} /> WhatsApp
              </button>
            </div>

            {/* Embedded PDF Viewer */}
            {previewData && (
              <div className="mb-6 border-2 border-slate-200 rounded-2xl overflow-hidden bg-slate-100 p-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-black text-slate-700 uppercase text-xs tracking-wider">Vista Previa: {previewData.filename}</h4>
                  <div className="flex gap-2">
                    <a 
                      href={previewData.url} 
                      download={previewData.filename}
                      className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider hover:bg-emerald-500 transition-all flex items-center gap-1.5"
                    >
                      <Download size={14} /> Descargar
                    </a>
                    <button 
                      onClick={() => setPreviewData(null)}
                      className="bg-slate-200 text-slate-700 px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider hover:bg-slate-300 transition-all"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
                <div className="h-[450px] bg-white rounded-xl shadow-inner border border-slate-200">
                  <iframe src={previewData.url} className="w-full h-full rounded-xl" title="PDF Preview"></iframe>
                </div>
              </div>
            )}

            {/* Individual Weights Breakdown */}
            <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden flex flex-col shadow-sm">
              <div className="p-3 font-black text-[10px] text-center uppercase tracking-widest text-white bg-slate-900">
                Desglose de Pesos Individuales
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200">
                {/* Full Crates */}
                <div className="flex flex-col">
                  <div className="bg-blue-100 p-2.5 text-center text-[10px] font-black text-blue-900 uppercase tracking-wider">
                    Jabas Llenas ({showDetailModal.records?.filter(r => r.type === 'FULL').length || 0})
                  </div>
                  <div className="p-3 flex-1 max-h-52 overflow-y-auto space-y-1.5">
                    {(showDetailModal.records || []).filter(r => r.type === 'FULL').map((r, i) => (
                      <div key={r.id} className="flex justify-between items-center text-[11px] border-b border-slate-100 pb-1 group">
                        <span className="text-slate-400 font-bold w-6">#{(showDetailModal.records || []).filter(rt => rt.type === 'FULL').length - i}</span>
                        <span className="font-digital font-bold text-slate-800 flex-1 text-center text-sm">{r.weight.toFixed(1)} kg</span>
                        <span className="text-[9px] text-slate-400 font-bold mr-2">{r.quantity}j</span>
                        <button 
                          onClick={() => handleDeleteRecord(r.id)}
                          className="text-slate-300 hover:text-red-500 transition-colors p-1"
                          title="Eliminar registro"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="bg-slate-100 p-2.5 border-t border-slate-200 text-center">
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Total Bruto</p>
                    <p className="font-black text-slate-900 text-sm font-digital">{getTotals(showDetailModal).wF.toFixed(1)} kg</p>
                  </div>
                </div>

                {/* Empty Crates */}
                <div className="flex flex-col">
                  <div className="bg-orange-100 p-2.5 text-center text-[10px] font-black text-orange-900 uppercase tracking-wider">
                    Jabas Vacías ({showDetailModal.records?.filter(r => r.type === 'EMPTY').length || 0})
                  </div>
                  <div className="p-3 flex-1 max-h-52 overflow-y-auto space-y-1.5">
                    {(showDetailModal.records || []).filter(r => r.type === 'EMPTY').map((r, i) => (
                      <div key={r.id} className="flex justify-between items-center text-[11px] border-b border-slate-100 pb-1 group">
                        <span className="text-slate-400 font-bold w-6">#{(showDetailModal.records || []).filter(rt => rt.type === 'EMPTY').length - i}</span>
                        <span className="font-digital font-bold text-orange-800 flex-1 text-center text-sm">{r.weight.toFixed(1)} kg</span>
                        <span className="text-[9px] text-slate-400 font-bold mr-2">{r.quantity}j</span>
                        <button 
                          onClick={() => handleDeleteRecord(r.id)}
                          className="text-slate-300 hover:text-red-500 transition-colors p-1"
                          title="Eliminar registro"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="bg-slate-100 p-2.5 border-t border-slate-200 text-center">
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Total Tara</p>
                    <p className="font-black text-orange-600 text-sm font-digital">-{getTotals(showDetailModal).wE.toFixed(1)} kg</p>
                  </div>
                </div>

                {/* Mortality */}
                <div className="flex flex-col">
                  <div className="bg-red-100 p-2.5 text-center text-[10px] font-black text-red-900 uppercase tracking-wider">
                    Mortalidad ({showDetailModal.records?.filter(r => r.type === 'MORTALITY').length || 0})
                  </div>
                  <div className="p-3 flex-1 max-h-52 overflow-y-auto space-y-1.5">
                    {(showDetailModal.records || []).filter(r => r.type === 'MORTALITY').map((r, i) => (
                      <div key={r.id} className="flex justify-between items-center text-[11px] border-b border-slate-100 pb-1 group">
                        <span className="text-slate-400 font-bold w-6">#{(showDetailModal.records || []).filter(rt => rt.type === 'MORTALITY').length - i}</span>
                        <span className="font-digital font-bold text-red-800 flex-1 text-center text-sm">{r.weight.toFixed(1)} kg</span>
                        <span className="text-[9px] text-red-500 font-bold mr-2">{r.quantity}p{r.isLame ? ' (PC)' : ''}</span>
                        <button 
                          onClick={() => handleDeleteRecord(r.id)}
                          className="text-slate-300 hover:text-red-500 transition-colors p-1"
                          title="Eliminar registro"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="bg-slate-100 p-2.5 border-t border-slate-200 text-center">
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Total Merma</p>
                    <p className="font-black text-red-600 text-sm font-digital">-{getTotals(showDetailModal).wM.toFixed(1)} kg</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );

  // Helper render for client cards
  function renderClientCard(order: ClientOrder) {
    const t = getTotals(order);
    const isExpanded = expandedOrder === order.id;

    return (
      <div key={order.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:border-blue-300 transition-all text-left">
        <div 
          className="p-5 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
          onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className={`text-[8px] px-2 py-0.5 rounded-full font-black uppercase border ${order.status === 'CLOSED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                {order.status === 'CLOSED' ? 'Cerrado' : 'Abierto'}
              </span>
              <span className="text-[8px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-black uppercase">
                {order.weighingMode === WeighingType.BATCH ? 'Pesaje por Lote' : order.weighingMode === WeighingType.SOLO_POLLO ? 'Solo Sacos' : 'Control Muertos'}
              </span>
            </div>
            <p className="font-black text-slate-900 uppercase text-lg tracking-tight mt-1">
              {order.clientName}
            </p>
            <p className="text-xs text-slate-400 font-medium">
              Precio: S/ {t.price.toFixed(2)}/kg • Total Venta: <span className="font-bold text-slate-800">S/ {t.totalAmount.toFixed(2)}</span> • Saldo: <span className={`font-bold ${t.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>S/ {t.balance.toFixed(2)}</span>
            </p>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-6 w-full lg:w-auto justify-between lg:justify-end">
            <div className="grid grid-cols-3 gap-4 text-right">
              <div>
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Jabas / Pollos</p>
                <p className="font-black text-slate-800 text-sm">{t.qF} j / {t.bF} p</p>
              </div>
              <div>
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Tara / Merma</p>
                <p className="font-black text-slate-700 text-sm font-digital">-{t.wE.toFixed(1)} / -{t.wM.toFixed(1)}</p>
              </div>
              <div>
                <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest">Neto Final</p>
                <p className="font-digital font-black text-emerald-700 text-lg">{t.net.toFixed(2)} <span className="text-xs font-sans font-bold">kg</span></p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={(e) => { e.stopPropagation(); setShowDetailModal(order); }}
                className="p-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl transition-all shadow-sm active:scale-95"
                title="Ver Pesadas y Generar Tickets"
              >
                <Eye size={18} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); generateSalesTicketPDF(order, true); }}
                className="p-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl transition-all active:scale-95"
                title="Ticket de Venta"
              >
                <Receipt size={18} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); shareViaWhatsApp(order); }}
                className="p-2.5 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-xl transition-all active:scale-95"
                title="Enviar por WhatsApp"
              >
                <Share2 size={18} />
              </button>
              <div className="p-1.5 text-slate-400">
                {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
            </div>
          </div>
        </div>

        {/* Expandable Inner Pesadas Preview */}
        {isExpanded && (
          <div className="p-5 bg-slate-50 border-t border-slate-100 animate-fade-in">
            <div className="flex flex-wrap gap-2 mb-4">
              <button 
                onClick={() => generateTicketPDF(order, true)}
                className="px-3 py-1.5 bg-white border border-slate-200 text-slate-800 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-slate-100 flex items-center gap-1.5"
              >
                <Printer size={12}/> Ticket Pesaje
              </button>
              <button 
                onClick={() => generateSummaryTicketPDF(order, true)}
                className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-indigo-100 flex items-center gap-1.5"
              >
                <FileText size={12}/> Ticket Resumen
              </button>
              <button 
                onClick={() => generateA4ClientPDF(order)}
                className="px-3 py-1.5 bg-blue-950 text-white rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-blue-900 flex items-center gap-1.5"
              >
                <Download size={12}/> Reporte A4
              </button>
              {t.qLame > 0 && (
                <button 
                  onClick={() => generateLameTicketPDF(order, true)}
                  className="px-3 py-1.5 bg-orange-50 border border-orange-200 text-orange-800 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-orange-100 flex items-center gap-1.5"
                >
                  <Receipt size={12}/> Ticket Cojos ({t.qLame}p)
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Full */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
                <h5 className="text-[10px] font-black text-blue-900 uppercase tracking-widest mb-2 border-b border-slate-100 pb-1.5">
                  Jabas Llenas ({t.qF} jabas, {t.bF} pollos)
                </h5>
                <div className="max-h-40 overflow-y-auto pr-1">
                  <div className="grid grid-cols-3 gap-1.5">
                    {(order.records || []).filter(r => r.type === 'FULL').map((r, i) => (
                      <div key={r.id} className="bg-blue-50 border border-blue-100 p-1.5 rounded-lg text-center">
                        <span className="text-[8px] font-black text-blue-400 uppercase">#{(order.records || []).filter(rt => rt.type === 'FULL').length - i}</span>
                        <p className="font-digital font-bold text-blue-950 text-xs">{r.weight.toFixed(1)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Empty */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
                <h5 className="text-[10px] font-black text-slate-700 uppercase tracking-widest mb-2 border-b border-slate-100 pb-1.5">
                  Jabas Vacías ({t.qE} jabas)
                </h5>
                <div className="max-h-40 overflow-y-auto pr-1">
                  <div className="grid grid-cols-3 gap-1.5">
                    {(order.records || []).filter(r => r.type === 'EMPTY').map((r, i) => (
                      <div key={r.id} className="bg-orange-50 border border-orange-100 p-1.5 rounded-lg text-center">
                        <span className="text-[8px] font-black text-orange-400 uppercase">#{(order.records || []).filter(rt => rt.type === 'EMPTY').length - i}</span>
                        <p className="font-digital font-bold text-orange-950 text-xs">{r.weight.toFixed(1)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Mortality */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
                <h5 className="text-[10px] font-black text-red-900 uppercase tracking-widest mb-2 border-b border-slate-100 pb-1.5">
                  Mortalidad ({t.qM} pollos, {t.wM.toFixed(1)} kg)
                </h5>
                <div className="max-h-40 overflow-y-auto pr-1">
                  <div className="grid grid-cols-3 gap-1.5">
                    {(order.records || []).filter(r => r.type === 'MORTALITY').map((r, i) => (
                      <div key={r.id} className="bg-red-50 border border-red-100 p-1.5 rounded-lg text-center">
                        <span className="text-[8px] font-black text-red-400 uppercase">#{(order.records || []).filter(rt => rt.type === 'MORTALITY').length - i}</span>
                        <p className="font-digital font-bold text-red-950 text-xs">{r.weight.toFixed(1)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
};

export default Reports;

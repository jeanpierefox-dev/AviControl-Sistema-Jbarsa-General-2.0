
import React, { useEffect, useState, useContext } from 'react';
import { getBatches, getOrders, getConfig, saveOrder, resetApp } from '../../services/storage';
import { Batch, ClientOrder, WeighingType, UserRole, WeighingRecord } from '../../types';
import { 
  ChevronDown, ChevronUp, Package, ShoppingCart, List, Printer, 
  Eye, FileText, Download, Table as TableIcon, FileCheck, Calendar, Search, X, Receipt, Trash2, Share2
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
  const { user } = useContext(AuthContext);
  const config = getConfig();

  useEffect(() => {
    refresh();
    const handleUpdate = () => refresh();
    window.addEventListener('avi_data_orders', handleUpdate);
    window.addEventListener('avi_data_batches', handleUpdate);
    return () => {
      window.removeEventListener('avi_data_orders', handleUpdate);
      window.removeEventListener('avi_data_batches', handleUpdate);
    };
  }, [user, selectedDate]);

  const refresh = () => {
      const allBatches = getBatches();
      const allOrders = getOrders();
      
      // Filter batches by selected date
      const filteredBatchesByDate = allBatches.filter(b => {
          const dateObj = new Date(b.createdAt);
          const year = dateObj.getFullYear();
          const month = String(dateObj.getMonth() + 1).padStart(2, '0');
          const day = String(dateObj.getDate()).padStart(2, '0');
          const batchDate = `${year}-${month}-${day}`;
          return batchDate === selectedDate;
      });

      // Filter orders by selected date
      const filteredOrdersByDate = allOrders.filter(o => {
          // Check if any record in the order matches the selected date
          if (o.records.length > 0) {
              return o.records.some(r => {
                  const dateObj = new Date(r.timestamp);
                  const year = dateObj.getFullYear();
                  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                  const day = String(dateObj.getDate()).padStart(2, '0');
                  const recordDate = `${year}-${month}-${day}`;
                  return recordDate === selectedDate;
              });
          }
          // If no records, check if it belongs to a batch from today
          if (o.batchId) {
              return filteredBatchesByDate.some(b => b.id === o.batchId);
          }
          return false;
      });

      if (user?.role === UserRole.ADMIN) {
          setBatches(filteredBatchesByDate);
          setOrders(filteredOrdersByDate);
      } else {
          setBatches(filteredBatchesByDate.filter(b => !b.createdBy || b.createdBy === user?.id));
          setOrders(filteredOrdersByDate.filter(o => !o.createdBy || o.createdBy === user?.id));
      }
  }

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

    const updatedRecords = showDetailModal.records.filter(r => r.id !== recordId);
    const updatedOrder = { ...showDetailModal, records: updatedRecords };
    
    saveOrder(updatedOrder);
    setShowDetailModal(updatedOrder);
    setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
  };

  const getTotals = (order: ClientOrder) => {
    const full = order.records.filter(r => r.type === 'FULL');
    const empty = order.records.filter(r => r.type === 'EMPTY');
    const mort = order.records.filter(r => r.type === 'MORTALITY');
    
    const wF = full.reduce((a, b) => a + b.weight, 0);
    const wE = empty.reduce((a, b) => a + b.weight, 0);
    const wM = mort.reduce((a, b) => a + b.weight, 0);
    
    const qF = full.reduce((a, b) => a + b.quantity, 0);
    const qE = empty.reduce((a, b) => a + b.quantity, 0);
    const qM = mort.reduce((a, b) => a + b.quantity, 0);
    
    const bF = full.reduce((a, b) => a + (b.birds !== undefined ? b.birds : (order.weighingMode === WeighingType.SOLO_POLLO ? b.quantity : b.quantity * 10)), 0);
    
    const net = order.weighingMode === WeighingType.SOLO_POLLO ? wF : wF - wE - wM;
    return { wF, wE, wM, qF, qE, qM, bF, net };
  };

  const renderTicketContent = (doc: jsPDF, order: ClientOrder, isSalesTicket: boolean) => {
    const t = getTotals(order);
    const batch = getBatches().find(b => b.id === order.batchId);
    const batchName = batch ? batch.name : 'Venta Directa';
    
    let y = 10;
    
    // Header
    if (config.logoUrl) {
        doc.addImage(config.logoUrl, 'PNG', 25, y, 30, 30);
        y += 35;
    }

    doc.setFontSize(14).setFont("helvetica", "bold");
    doc.text(config.companyName.toUpperCase(), 40, y, { align: 'center' });
    y += 5;
    
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
    doc.setFont("helvetica", "bold");
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

        const fullRecords = order.records.filter(r => r.type === 'FULL').sort((a, b) => b.timestamp - a.timestamp);
        const emptyRecords = order.records.filter(r => r.type === 'EMPTY').sort((a, b) => b.timestamp - a.timestamp);
        const mortRecords = order.records.filter(r => r.type === 'MORTALITY').sort((a, b) => b.timestamp - a.timestamp);

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
    } else {
        // General Weights Box
        autoTable(doc, {
            startY: y,
            head: [[{ content: 'RESUMEN DE PESOS', colSpan: 2, styles: { halign: 'center', fillColor: [220, 226, 230], textColor: 0 } }]],
            body: [
                ['Peso Bruto:', `${t.wF.toFixed(2)} kg`],
                ['Tara Total:', `-${t.wE.toFixed(2)} kg`],
                ['Mortalidad:', `-${t.wM.toFixed(2)} kg`],
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
    // Pass 1: Calculate height
    const dummyDoc = new jsPDF({ unit: 'mm', format: [80, 1000] });
    const finalY = renderTicketContent(dummyDoc, order, false);
    
    // Pass 2: Render with exact height
    const doc = new jsPDF({ unit: 'mm', format: [80, finalY] });
    renderTicketContent(doc, order, false);
    handlePDFOutput(doc, `Ticket_Detallado_${order.id}.pdf`, preview);
  };

  const generateSalesTicketPDF = (order: ClientOrder, preview: boolean = false) => {
    // Pass 1: Calculate height
    const dummyDoc = new jsPDF({ unit: 'mm', format: [80, 1000] });
    const finalY = renderTicketContent(dummyDoc, order, true);
    
    // Pass 2: Render with exact height
    const doc = new jsPDF({ unit: 'mm', format: [80, finalY] });
    renderTicketContent(doc, order, true);
    handlePDFOutput(doc, `Venta_${order.clientName}_${order.id.slice(-6)}.pdf`, preview);
  };

  const generateA4ClientPDF = (order: ClientOrder) => {
    const t = getTotals(order);
    const batch = getBatches().find(b => b.id === order.batchId);
    const batchName = batch ? batch.name : 'Venta Directa';
    const doc = new jsPDF();
    
    // Header Background
    doc.setFillColor(15, 23, 42); // Slate 900
    doc.rect(0, 0, 210, 45, 'F');
    
    // Header Text
    if (config.logoUrl) {
        doc.addImage(config.logoUrl, 'PNG', 14, 10, 25, 25);
    }

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

    y = (doc as any).lastAutoTable.finalY + 15;
    
    doc.setFontSize(14).setFont("helvetica", "bold");
    doc.text("DESGLOSE DE PESADAS", 14, y);
    y += 5;

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

    handlePDFOutput(doc, `Reporte_A4_${order.clientName}_${order.id}.pdf`, false);
  };

  const shareViaWhatsApp = (order: ClientOrder) => {
    const t = getTotals(order);
    const text = `*${config.companyName.toUpperCase()}*
🧾 *TICKET DE PESAJE*
📅 ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}
👤 Cliente: ${order.clientName}
--------------------------------
📦 Jabas: ${t.qF}
🐔 Pollos: ${t.bF}
⚖️ Peso Bruto: ${t.wF.toFixed(2)} kg
🪣 Tara: -${t.wE.toFixed(2)} kg
📉 Merma: -${t.wM.toFixed(2)} kg
--------------------------------
✅ *PESO NETO: ${t.net.toFixed(2)} kg*
--------------------------------
Gracias por su preferencia!`;

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const generateBatchReportPDF = (batchName: string, stats: any) => {
    const doc = new jsPDF('landscape');
    
    // Header Background
    doc.setFillColor(15, 23, 42); // Slate 900
    doc.rect(0, 0, 297, 40, 'F');
    
    // Header Text
    if (config.logoUrl) {
        doc.addImage(config.logoUrl, 'PNG', 14, 8, 24, 24);
    }

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20).setFont("helvetica", "bold");
    doc.text(config.companyName.toUpperCase(), 148.5, 18, { align: 'center' });
    
    doc.setFontSize(12).setFont("helvetica", "normal");
    doc.text("ESTADO DE CUENTA GENERAL DEL LOTE", 148.5, 28, { align: 'center' });
    
    doc.setTextColor(0, 0, 0);
    
    let y = 50;
    
    // Batch Info
    doc.setFontSize(10).setFont("helvetica", "bold");
    doc.text(`LOTE:`, 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(batchName.toUpperCase(), 30, y);
    
    doc.setFont("helvetica", "bold");
    doc.text(`FECHA DE REPORTE:`, 220, y);
    doc.setFont("helvetica", "normal");
    doc.text(new Date().toLocaleString(), 260, y);
    
    y += 10;

    // Table Data Preparation
    const tableData = stats.batchOrders.map((order: ClientOrder) => {
        const t = getTotals(order);
        const price = order.pricePerKg || 0;
        const totalAmount = t.net * price;
        const totalPaid = order.payments?.reduce((sum, p) => sum + p.amount, 0) || 0;
        const balance = totalAmount - totalPaid;

        return [
            order.clientName.toUpperCase(),
            t.qF.toString(),
            t.bF.toString(),
            t.wF.toFixed(2),
            t.wE.toFixed(2),
            t.wM.toFixed(2),
            t.net.toFixed(2),
            `S/ ${price.toFixed(2)}`,
            `S/ ${totalAmount.toFixed(2)}`,
            `S/ ${totalPaid.toFixed(2)}`,
            `S/ ${balance.toFixed(2)}`
        ];
    });

    // Calculate totals for footer
    let sumNet = 0, sumAmount = 0, sumPaid = 0, sumBalance = 0;
    stats.batchOrders.forEach((order: ClientOrder) => {
        const t = getTotals(order);
        const price = order.pricePerKg || 0;
        const totalAmount = t.net * price;
        const totalPaid = order.payments?.reduce((sum, p) => sum + p.amount, 0) || 0;
        sumNet += t.net;
        sumAmount += totalAmount;
        sumPaid += totalPaid;
        sumBalance += totalAmount - totalPaid;
    });

    tableData.push([
        { content: 'TOTALES', styles: { fontStyle: 'bold', halign: 'right' } },
        '-',
        '-',
        stats.totalFull.toFixed(2),
        stats.totalEmpty.toFixed(2),
        stats.totalMort.toFixed(2),
        { content: sumNet.toFixed(2), styles: { fontStyle: 'bold' } },
        '-',
        { content: `S/ ${sumAmount.toFixed(2)}`, styles: { fontStyle: 'bold' } },
        { content: `S/ ${sumPaid.toFixed(2)}`, styles: { fontStyle: 'bold' } },
        { content: `S/ ${sumBalance.toFixed(2)}`, styles: { fontStyle: 'bold' } }
    ]);

    autoTable(doc, {
        startY: y,
        head: [['CLIENTE', 'JABAS', 'POLLOS', 'BRUTO (KG)', 'TARA (KG)', 'MERMA (KG)', 'NETO (KG)', 'PRECIO/KG', 'MONTO TOTAL', 'ABONADO', 'SALDO']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', fontSize: 8, halign: 'center' },
        styles: { fontSize: 8, cellPadding: 3, halign: 'center' },
        columnStyles: {
            0: { halign: 'left', fontStyle: 'bold', cellWidth: 40 },
            6: { fontStyle: 'bold', textColor: [21, 128, 61] }, // Neto
            8: { fontStyle: 'bold' }, // Monto Total
            10: { fontStyle: 'bold', textColor: [185, 28, 28] } // Saldo
        }
    });

    // Footer
    const pageCount = (doc as any).internal.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8).setTextColor(150);
        doc.text(`Generado por AviControl Pro - Página ${i} de ${pageCount}`, 148.5, 200, { align: 'center' });
    }

    handlePDFOutput(doc, `Reporte_Lote_${batchName.replace(/\s+/g, '_')}.pdf`, false);
  };

  const getStats = (filterFn: (o: ClientOrder) => boolean) => {
    const filteredOrders = orders.filter(filterFn);
    let totalFull = 0, totalEmpty = 0, totalNet = 0, totalMort = 0;
    
    filteredOrders.forEach(o => {
      const stats = getTotals(o);
      totalFull += stats.wF;
      totalEmpty += stats.wE;
      totalMort += stats.wM;
      totalNet += stats.net;
    });

    return { totalFull, totalEmpty, totalMort, totalNet, orderCount: filteredOrders.length, batchOrders: filteredOrders };
  };

  const ReportCard = ({ id, title, subtitle, icon, stats }: any) => {
      const isExpanded = expandedBatch === id;
      const filteredBatchOrders = stats.batchOrders.filter((o: ClientOrder) => o.clientName.toLowerCase().includes(searchTerm.toLowerCase()));

      return (
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden mb-6 text-left">
            <div className="p-6 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setExpandedBatch(isExpanded ? null : id)}>
                <div className="flex items-center space-x-5">
                    <div className={`p-4 rounded-2xl ${id === 'direct-sales' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-800'}`}>
                    {icon}
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">{title}</h3>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">{subtitle} • {stats.orderCount} Clientes</p>
                    </div>
                </div>
                <div className="flex items-center space-x-8">
                    <div className="text-right hidden md:flex gap-6">
                        <div>
                            <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Bruto</p>
                            <p className="text-lg font-black font-digital text-slate-700">{stats.totalFull.toFixed(1)} kg</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Tara</p>
                            <p className="text-lg font-black font-digital text-slate-700">{stats.totalEmpty.toFixed(1)} kg</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Mortalidad</p>
                            <p className="text-lg font-black font-digital text-slate-700">{stats.totalMort.toFixed(1)} kg</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-emerald-600 uppercase font-black tracking-widest">Neto Acumulado</p>
                            <p className="text-2xl font-black font-digital text-emerald-700">{stats.totalNet.toFixed(1)} kg</p>
                        </div>
                    </div>
                    {isExpanded ? <ChevronUp className="text-slate-400" /> : <ChevronDown className="text-slate-400" />}
                </div>
            </div>

            {isExpanded && (
            <div className="bg-slate-50 border-t border-slate-100 p-6 animate-fade-in">
                <div className="flex justify-between items-center mb-6">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Clientes en este grupo</h4>
                    <button 
                        onClick={() => generateBatchReportPDF(title, stats)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-xl hover:bg-blue-800 transition-colors shadow-sm text-xs font-bold uppercase tracking-widest"
                    >
                        <Download size={14} /> Reporte General
                    </button>
                </div>

                <div className="space-y-4">
                    {filteredBatchOrders.map((order: ClientOrder) => {
                        const t = getTotals(order);

                        return (
                            <div key={order.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:border-blue-300 transition-all">
                                <div 
                                    className="p-5 flex flex-col md:flex-row justify-between items-center gap-4 cursor-pointer"
                                    onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                                >
                                    <div className="flex-1 w-full md:w-auto">
                                        <p className="font-black text-slate-900 uppercase text-base tracking-tight">{order.clientName}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className={`text-[8px] px-2 py-1 rounded font-black uppercase border ${order.status === 'CLOSED' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                                                {order.status === 'CLOSED' ? 'CERRADO' : 'ABIERTO'}
                                            </span>
                                            <span className="text-[8px] bg-slate-50 text-slate-400 px-2 py-1 rounded font-black uppercase border border-slate-100">
                                                {order.weighingMode}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-8 w-full md:w-auto justify-between md:justify-end">
                                        <div className="text-right hidden sm:block">
                                            <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Jabas</p>
                                            <p className="font-black text-slate-900 text-lg">{t.qF}</p>
                                        </div>
                                        <div className="text-right hidden sm:block">
                                            <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Pollos</p>
                                            <p className="font-black text-slate-900 text-lg">{t.bF}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Total Neto</p>
                                            <p className="font-digital font-black text-slate-900 text-xl">{t.net.toFixed(2)} kg</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); setShowDetailModal(order); }} 
                                                className="p-3 rounded-xl transition-all shadow-sm bg-blue-900 text-white hover:bg-blue-800"
                                                title="Ver Pesas y Generar PDF"
                                            >
                                                <Eye size={22} />
                                            </button>
                                            {expandedOrder === order.id ? <ChevronUp className="text-slate-400" /> : <ChevronDown className="text-slate-400" />}
                                        </div>
                                    </div>
                                </div>
                                
                                {expandedOrder === order.id && (
                                    <div className="p-5 bg-slate-50 border-t border-slate-100">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {/* Full Crates */}
                                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                                <h5 className="text-[10px] font-black text-blue-800 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">Jabas Llenas</h5>
                                                <div className="max-h-40 overflow-y-auto space-y-1">
                                                    {order.records.filter(r => r.type === 'FULL').map((r, i) => (
                                                        <div key={r.id} className="flex justify-between text-xs border-b border-slate-50 pb-1">
                                                            <span className="text-slate-400">#{order.records.filter(rt => rt.type === 'FULL').length - i}</span>
                                                            <span className="font-mono font-bold text-slate-700">{r.weight.toFixed(1)} kg</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            {/* Empty Crates */}
                                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                                <h5 className="text-[10px] font-black text-slate-700 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">Jabas Vacías</h5>
                                                <div className="max-h-40 overflow-y-auto space-y-1">
                                                    {order.records.filter(r => r.type === 'EMPTY').map((r, i) => (
                                                        <div key={r.id} className="flex justify-between text-xs border-b border-slate-50 pb-1">
                                                            <span className="text-slate-400">#{order.records.filter(rt => rt.type === 'EMPTY').length - i}</span>
                                                            <span className="font-mono font-bold text-slate-700">{r.weight.toFixed(1)} kg</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            {/* Mortality */}
                                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                                <h5 className="text-[10px] font-black text-red-800 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">Mortalidad</h5>
                                                <div className="max-h-40 overflow-y-auto space-y-1">
                                                    {order.records.filter(r => r.type === 'MORTALITY').map((r, i) => (
                                                        <div key={r.id} className="flex justify-between text-xs border-b border-slate-50 pb-1">
                                                            <span className="text-slate-400">#{order.records.filter(rt => rt.type === 'MORTALITY').length - i}</span>
                                                            <span className="font-mono font-bold text-slate-700">{r.weight.toFixed(1)} kg</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
            )}
        </div>
      );
  }

  const directSalesStats = getStats(o => !o.batchId);

  return (
    <>
    <div className="space-y-8 animate-fade-in pb-10 text-left max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
            <h2 className="text-4xl font-black text-blue-950 uppercase tracking-tighter">Historial de Reportes</h2>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mt-2 flex items-center gap-2">
                <FileCheck size={14} className="text-blue-600"/> Registros Consolidados
            </p>
        </div>
        <div className="relative w-full md:w-auto flex flex-col md:flex-row gap-2">
            <div className="relative">
                <Calendar size={20} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-300" />
                <input 
                    type="date" 
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full md:w-auto pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-blue-500 shadow-sm transition-all text-slate-700"
                />
            </div>
            <div className="relative flex-1">
                <input 
                    type="text" 
                    placeholder="Buscar cliente..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-blue-500 shadow-sm transition-all"
                />
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-300" size={20} />
            </div>
            <button 
                onClick={() => { if(confirm('¿Reiniciar sistema a 0 datos? Esto borrará toda la información.')) resetApp(); }}
                className="px-6 py-4 md:py-0 bg-red-50 text-red-500 rounded-2xl hover:bg-red-100 transition-colors shadow-sm border border-red-100 flex items-center justify-center gap-2 font-black text-xs uppercase tracking-widest"
                title="Reiniciar Sistema (Borrar Todo)"
            >
                <Trash2 size={18} /> Borrar Todo
            </button>
        </div>
      </div>
      
      <div>
        {directSalesStats.orderCount > 0 && (
            <ReportCard 
                id="direct-sales" 
                title="Ventas Directas" 
                subtitle="Sin lote asignado" 
                icon={<ShoppingCart size={32}/>}
                stats={directSalesStats}
            />
        )}

        {batches.map(batch => (
             <ReportCard 
                key={batch.id} 
                id={batch.id} 
                title={batch.name} 
                subtitle={`Iniciado el ${new Date(batch.createdAt).toLocaleDateString()}`}
                icon={<Package size={32}/>}
                stats={getStats(o => o.batchId === batch.id)}
             />
        ))}
      </div>
    </div>

      {/* Modal de Detalle */}
      {showDetailModal && (
            <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 backdrop-blur-sm overflow-y-auto">
                <div className="bg-white rounded-2xl p-8 w-full max-w-4xl shadow-2xl border border-gray-100 my-auto">
                    <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-4">
                            <div className="bg-blue-600 p-3 rounded-xl text-white shadow-lg">
                                <Eye size={24}/>
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Detalle de Carga</h3>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-1">{showDetailModal.clientName}</p>
                            </div>
                        </div>
                        <button onClick={() => { setShowDetailModal(null); setPreviewData(null); }} className="p-2 bg-slate-100 text-slate-500 hover:text-slate-900 rounded-lg transition-all">
                            <X size={20}/>
                        </button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Jabas</p>
                            <p className="text-2xl font-black text-slate-900">{getTotals(showDetailModal).qF}</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Pollos</p>
                            <p className="text-2xl font-black text-blue-600">{getTotals(showDetailModal).bF}</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Peso Bruto</p>
                            <p className="text-2xl font-black text-slate-900">{getTotals(showDetailModal).wF.toFixed(2)}</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tara Total</p>
                            <p className="text-2xl font-black text-orange-600">-{getTotals(showDetailModal).wE.toFixed(2)}</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Merma</p>
                            <p className="text-2xl font-black text-red-600">-{getTotals(showDetailModal).wM.toFixed(2)}</p>
                        </div>
                        <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Peso Final</p>
                            <p className="text-2xl font-black text-emerald-700">{getTotals(showDetailModal).net.toFixed(2)}</p>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-3 mb-6">
                        <button onClick={() => generateTicketPDF(showDetailModal, true)} className="flex-1 bg-white text-slate-900 border-2 border-slate-200 px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-50 transition-all">
                            <Printer size={14} /> Ticket Detallado
                        </button>
                        <button onClick={() => generateSalesTicketPDF(showDetailModal, true)} className="flex-1 bg-emerald-50 text-emerald-900 border-2 border-emerald-200 px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-100 transition-all">
                            <Receipt size={14} /> Ticket Venta
                        </button>
                        <button onClick={() => generateA4ClientPDF(showDetailModal)} className="flex-1 bg-blue-900 text-white px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-blue-800 shadow-lg transition-all">
                            <Download size={14} /> Reporte A4
                        </button>
                        <button onClick={() => shareViaWhatsApp(showDetailModal)} className="flex-1 bg-green-500 text-white px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-green-600 shadow-lg transition-all">
                            <Share2 size={14} /> WhatsApp
                        </button>
                    </div>

                    {previewData && (
                        <div className="mb-8 border-2 border-slate-200 rounded-xl overflow-hidden bg-slate-100 p-4">
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="font-bold text-slate-700 uppercase text-xs tracking-wider">Vista Previa: {previewData.filename}</h4>
                                <div className="flex gap-2">
                                    <a 
                                        href={previewData.url} 
                                        download={previewData.filename}
                                        className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold text-[10px] uppercase tracking-widest hover:bg-emerald-500 transition-all flex items-center gap-2"
                                    >
                                        <Download size={14} /> Descargar
                                    </a>
                                    <button 
                                        onClick={() => setPreviewData(null)}
                                        className="bg-slate-200 text-slate-600 px-4 py-2 rounded-lg font-bold text-[10px] uppercase tracking-widest hover:bg-slate-300 transition-all"
                                    >
                                        Cerrar
                                    </button>
                                </div>
                            </div>
                            <div className="h-[500px] bg-white rounded-lg shadow-inner border border-slate-200">
                                <iframe src={previewData.url} className="w-full h-full" title="PDF Preview"></iframe>
                            </div>
                        </div>
                    )}

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
                                        {showDetailModal.records.filter(r => r.type === 'FULL').map((r, i) => (
                                            <div key={r.id} className="flex justify-between items-center text-[9px] border-b border-slate-100 pb-1 group">
                                                <span className="text-slate-400 w-6">#{showDetailModal.records.filter(rt => rt.type === 'FULL').length - i}</span>
                                                <span className="font-mono font-bold text-slate-700 flex-1 text-center">{r.weight.toFixed(1)}</span>
                                                <button 
                                                    onClick={() => handleDeleteRecord(r.id)}
                                                    className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-1"
                                                    title="Eliminar"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="bg-slate-50 p-2 border-t border-slate-200 text-center">
                                        <p className="text-[8px] font-bold text-slate-400 uppercase">Total</p>
                                        <p className="font-black text-slate-800 text-sm">{getTotals(showDetailModal).wF.toFixed(1)}</p>
                                    </div>
                                </div>

                                {/* Empty Crates */}
                                <div className="flex flex-col">
                                    <div className="bg-slate-200 p-2 text-center text-[9px] font-black text-slate-700 uppercase tracking-wider">
                                        Vacías
                                    </div>
                                    <div className="p-2 flex-1 max-h-60 overflow-y-auto space-y-1">
                                        {showDetailModal.records.filter(r => r.type === 'EMPTY').map((r, i) => (
                                            <div key={r.id} className="flex justify-between items-center text-[9px] border-b border-slate-100 pb-1 group">
                                                <span className="text-slate-400 w-6">#{showDetailModal.records.filter(rt => rt.type === 'EMPTY').length - i}</span>
                                                <span className="font-mono font-bold text-slate-700 flex-1 text-center">{r.weight.toFixed(1)}</span>
                                                <button 
                                                    onClick={() => handleDeleteRecord(r.id)}
                                                    className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-1"
                                                    title="Eliminar"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="bg-slate-50 p-2 border-t border-slate-200 text-center">
                                        <p className="text-[8px] font-bold text-slate-400 uppercase">Total</p>
                                        <p className="font-black text-orange-600 text-sm">-{getTotals(showDetailModal).wE.toFixed(1)}</p>
                                    </div>
                                </div>

                                {/* Mortality */}
                                <div className="flex flex-col">
                                    <div className="bg-red-100 p-2 text-center text-[9px] font-black text-red-800 uppercase tracking-wider">
                                        Merma
                                    </div>
                                    <div className="p-2 flex-1 max-h-60 overflow-y-auto space-y-1">
                                        {showDetailModal.records.filter(r => r.type === 'MORTALITY').map((r, i) => (
                                            <div key={r.id} className="flex justify-between items-center text-[9px] border-b border-slate-100 pb-1 group">
                                                <span className="text-slate-400 w-6">#{showDetailModal.records.filter(rt => rt.type === 'MORTALITY').length - i}</span>
                                                <span className="font-mono font-bold text-slate-700 flex-1 text-center">{r.weight.toFixed(1)}</span>
                                                <button 
                                                    onClick={() => handleDeleteRecord(r.id)}
                                                    className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-1"
                                                    title="Eliminar"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="bg-slate-50 p-2 border-t border-slate-200 text-center">
                                        <p className="text-[8px] font-bold text-slate-400 uppercase">Total</p>
                                        <p className="font-black text-red-600 text-sm">-{getTotals(showDetailModal).wM.toFixed(1)}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </>
  );
};

export default Reports;

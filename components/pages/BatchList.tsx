import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Batch, WeighingType, UserRole, ClientOrder } from '../../types';
import { getBatches, saveBatch, deleteBatch, getOrdersByBatch, getVisibleUserIds, getConfig } from '../../services/storage';
import { Plus, Trash2, Edit, Scale, Calendar, Box, Activity, FileText, Receipt } from 'lucide-react';
import { AuthContext } from '../../App';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const BatchList: React.FC = () => {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [showModal, setShowModal] = useState(false);
  const [currentBatch, setCurrentBatch] = useState<Partial<Batch>>({});
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const refresh = () => {
      const all = getBatches();
      // Filter by selected date
      const filteredByDate = all.filter(b => {
          if (b.date) return b.date === selectedDate;
          if (!b.createdAt) return false;
          const dateObj = new Date(Number(b.createdAt));
          if (isNaN(dateObj.getTime())) return false;
          
          const year = dateObj.getFullYear();
          const month = String(dateObj.getMonth() + 1).padStart(2, '0');
          const day = String(dateObj.getDate()).padStart(2, '0');
          const batchDate = `${year}-${month}-${day}`;
          return batchDate === selectedDate;
      });

      // Filter: Admin sees all, General sees self + operators, others see only their own
      let finalBatches = filteredByDate;
      const visibleIds = getVisibleUserIds(user);
      finalBatches = finalBatches.filter(b => visibleIds.includes(b.createdBy || ''));
      
      setBatches(finalBatches.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
  };

  useEffect(() => {
    refresh();
    const handleUpdate = () => refresh();
    window.addEventListener('avi_data_batches', handleUpdate);
    window.addEventListener('avi_data_orders', handleUpdate);
    return () => {
      window.removeEventListener('avi_data_batches', handleUpdate);
      window.removeEventListener('avi_data_orders', handleUpdate);
    };
  }, [selectedDate, user]);

  const handleSave = () => {
    if (!currentBatch.name || !currentBatch.totalCratesLimit) return;
    const timestamp = currentBatch.createdAt || Date.now();
    const d = new Date(timestamp);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    
    const batch: Batch = {
      id: currentBatch.id || Date.now().toString(),
      name: currentBatch.name,
      date: dateStr,
      totalCratesLimit: Number(currentBatch.totalCratesLimit),
      createdAt: timestamp,
      status: 'ACTIVE',
      createdBy: currentBatch.createdBy || user?.id // Attach User ID
    };
    saveBatch(batch);
    setShowModal(false);
    refresh();
  };

  const handleDelete = (id: string) => {
    if (confirm('¿Eliminar este lote? Se eliminarán también las pesadas asociadas.')) {
      deleteBatch(id);
      refresh();
    }
  };

  const canEdit = user?.role === UserRole.ADMIN || user?.role === UserRole.GENERAL;

  const BatchCard: React.FC<{ batch: Batch }> = ({ batch }) => {
    const orders = getOrdersByBatch(batch.id);
    let totalFullCrates = 0; let totalFullWeight = 0;
    let totalEmptyCrates = 0; let totalEmptyWeight = 0;
    let totalMort = 0; let totalMortWeight = 0;

    orders.forEach(order => {
      const records = order.records || [];
      records.forEach(r => {
        if (r.type === 'FULL') { totalFullCrates += r.quantity; totalFullWeight += r.weight; }
        if (r.type === 'EMPTY') { totalEmptyCrates += r.quantity; totalEmptyWeight += r.weight; }
        if (r.type === 'MORTALITY') { totalMort += r.quantity; totalMortWeight += r.weight; }
      });
    });

    const isOverLimit = totalFullCrates >= batch.totalCratesLimit;
    const percent = Math.min((totalFullCrates / batch.totalCratesLimit) * 100, 100);
    const netWeight = totalFullWeight - totalEmptyWeight - totalMortWeight;

    const chunkArray = (array: any[], size: number) => {
        const chunked = [];
        for (let i = 0; i < array.length; i += size) {
            chunked.push(array.slice(i, i + size));
        }
        return chunked;
    };

    const generateBatchSummaryTicket = () => {
        const dummyDoc = new jsPDF({ unit: 'mm', format: [80, 15000] }); 
        const finalHeight = renderSummaryTicketContent(dummyDoc);
        
        const doc = new jsPDF({ unit: 'mm', format: [80, finalHeight] });
        renderSummaryTicketContent(doc);
        
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Resumen_Lote_${batch.name}_${new Date().getTime()}.pdf`;
        link.click();
    };

    const renderSummaryTicketContent = (doc: jsPDF) => {
        const config = getConfig();
        let y = 10;
        
        // Header Logo
        if (config.logoUrl) {
            doc.addImage(config.logoUrl, 'PNG', 25, y, 30, 30);
            y += 35;
        }

        doc.setFontSize(14).setFont("helvetica", "bold");
        const splitTitle = doc.splitTextToSize(config.companyName.toUpperCase(), 70);
        splitTitle.forEach((line: string) => {
            doc.text(line, 40, y, { align: 'center' });
            y += 6;
        });
        
        doc.setFontSize(10).setFont("helvetica", "bold");
        doc.text("TICKET DE RESUMEN DE LOTE", 40, y, { align: 'center' });
        y += 5;
        
        doc.setFontSize(8).setFont("helvetica", "italic");
        doc.text(`FECHA: ${new Date().toLocaleString()}`, 40, y, { align: 'center' });
        y += 5;
        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        doc.line(5, y, 75, y);
        y += 5;

        // Batch Info
        doc.setFontSize(9).setFont("helvetica", "bold");
        doc.text(`LOTE:`, 5, y);
        doc.setFont("helvetica", "normal");
        doc.text(batch.name.toUpperCase(), 20, y);
        y += 6;

        // Calculate Totals by origin for mortality
        let qM_Galpon = 0; let wM_Galpon = 0;
        let qM_Acopio = 0; let wM_Acopio = 0;
        let totalBirds = 0;
        let totalAmount = 0;

        orders.forEach(o => {
            const records = o.records || [];
            records.forEach(r => {
                if (r.type === 'MORTALITY') {
                    if ((r.origin || 'GALPON') === 'GALPON') {
                        qM_Galpon += r.quantity; wM_Galpon += r.weight;
                    } else {
                        qM_Acopio += r.quantity; wM_Acopio += r.weight;
                    }
                }
                if (r.type === 'FULL') {
                    totalBirds += (r.birds !== undefined ? r.birds : (o.weighingMode === WeighingType.SOLO_POLLO ? r.quantity : r.quantity * 10));
                }
            });
            
            const fR = records.filter(r => r.type === 'FULL');
            const eR = records.filter(r => r.type === 'EMPTY');
            const mR = records.filter(r => r.type === 'MORTALITY');
            const netO = o.weighingMode === WeighingType.SOLO_POLLO ? 
                fR.reduce((a, b) => a + b.weight, 0) : 
                fR.reduce((a, b) => a + b.weight, 0) - eR.reduce((a, b) => a + b.weight, 0) - mR.reduce((a, b) => a + b.weight, 0);
            
            totalAmount += netO * (o.pricePerKg || 0);
        });

        const avgNet = totalBirds > 0 ? netWeight / totalBirds : 0;
        const avgMort = totalMort > 0 ? totalMortWeight / totalMort : 0;

        // 1. Table for JABAS / CONTENEDORES
        autoTable(doc, {
            startY: y,
            head: [[
                { content: 'JABAS / CONTENEDORES', styles: { halign: 'left', fillColor: [220, 226, 230], textColor: 0 } },
                { content: 'CANT.', styles: { halign: 'center', fillColor: [220, 226, 230], textColor: 0 } },
                { content: 'PESO (KG)', styles: { halign: 'right', fillColor: [220, 226, 230], textColor: 0 } }
            ]],
            body: [
                ['Jabas Llenas:', `${totalFullCrates}`, `${totalFullWeight.toFixed(2)} kg`],
                ['Jabas Vacías:', `${totalEmptyCrates}`, `-${totalEmptyWeight.toFixed(2)} kg`]
            ],
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2 },
            columnStyles: {
                0: { fontStyle: 'bold', cellWidth: 32 },
                1: { halign: 'center', cellWidth: 18 },
                2: { halign: 'right', cellWidth: 20 }
            },
            margin: { left: 5, right: 5 }
        });
        y = (doc as any).lastAutoTable.finalY + 4;

        // 2. Table for POLLOS (CANT Y PESO)
        const pollosBody = [
            ['Pollos Vivos:', `${totalBirds}`, `${netWeight.toFixed(2)} kg`],
            ['Pollos Muertos:', `${totalMort}`, `-${totalMortWeight.toFixed(2)} kg`]
        ];

        autoTable(doc, {
            startY: y,
            head: [[
                { content: 'POLLOS (CANT Y PESO)', styles: { halign: 'left', fillColor: [220, 226, 230], textColor: 0 } },
                { content: 'CANT.', styles: { halign: 'center', fillColor: [220, 226, 230], textColor: 0 } },
                { content: 'PESO (KG)', styles: { halign: 'right', fillColor: [220, 226, 230], textColor: 0 } }
            ]],
            body: pollosBody,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2 },
            columnStyles: {
                0: { fontStyle: 'bold', cellWidth: 32 },
                1: { halign: 'center', cellWidth: 18 },
                2: { halign: 'right', cellWidth: 20 }
            },
            margin: { left: 5, right: 5 }
        });
        y = (doc as any).lastAutoTable.finalY + 4;

        // 3. Table for PROMEDIOS CALCULADOS
        autoTable(doc, {
            startY: y,
            head: [[
                { content: 'PROMEDIOS CALCULADOS', colSpan: 2, styles: { halign: 'center', fillColor: [240, 240, 240], textColor: 0 } }
            ]],
            body: [
                ['Prom. Peso Pollo Vivo:', `${avgNet.toFixed(2)} kg/p`],
                ['Prom. Peso Pollo Muerto:', `${avgMort.toFixed(2)} kg/p`]
            ],
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2 },
            columnStyles: {
                0: { fontStyle: 'bold', cellWidth: 46 },
                1: { halign: 'right', cellWidth: 24 }
            },
            margin: { left: 5, right: 5 }
        });
        y = (doc as any).lastAutoTable.finalY + 6;

        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        doc.line(5, y, 75, y);
        y += 5;

        // Totals Box
        doc.setFontSize(9).setFont("helvetica", "normal");
        doc.text("Peso Bruto Total:", 8, y); doc.text(`${totalFullWeight.toFixed(2)} kg`, 72, y, { align: 'right' }); y += 5;
        doc.text("Tara Total:", 8, y); doc.text(`-${totalEmptyWeight.toFixed(2)} kg`, 72, y, { align: 'right' }); y += 5;
        if (totalMortWeight > 0) {
            doc.text("Merma Muertos:", 8, y); doc.text(`-${totalMortWeight.toFixed(2)} kg`, 72, y, { align: 'right' }); y += 5;
        }

        doc.setFillColor(241, 245, 249);
        doc.rect(5, y, 70, 9, 'F');
        doc.setFontSize(9).setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text("PESO NETO TOTAL:", 8, y + 6);
        doc.setFontSize(11).setFont("helvetica", "bold");
        doc.text(`${netWeight.toFixed(2)} kg`, 72, y + 6, { align: 'right' });
        doc.setTextColor(0, 0, 0);
        y += 13;

        // Financials
        if (totalAmount > 0) {
            doc.setFillColor(15, 23, 42); // Slate 900
            doc.rect(5, y, 70, 14, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(9).setFont("helvetica", "bold");
            doc.text("VALOR TOTAL LOTE", 35, y + 8, { align: 'right' });
            doc.setFontSize(12);
            doc.text(`S/. ${totalAmount.toFixed(2)}`, 72, y + 9, { align: 'right' });
            doc.setTextColor(0, 0, 0);
            y += 20;
        }

        doc.setFontSize(8).setFont("helvetica", "italic");
        doc.text("Resumen General de Lote", 40, y, { align: 'center' });

        return y + 10;
    };

    const generateBatchTicket = () => {
        // Pass 1: Calculate height on a very tall dummy doc to prevent paging
        const dummyDoc = new jsPDF({ unit: 'mm', format: [80, 15000] }); 
        const finalHeight = renderTicketContent(dummyDoc);
        
        // Pass 2: Final rendering on a single continuous page
        const doc = new jsPDF({ unit: 'mm', format: [80, finalHeight] });
        renderTicketContent(doc);
        
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Total_Carga_${batch.name}_${new Date().getTime()}.pdf`;
        link.click();
    };

    const renderTicketContent = (doc: jsPDF) => {
        const config = getConfig();
        let y = 10;
        
        // Header
        if (config.logoUrl) {
            doc.addImage(config.logoUrl, 'PNG', 25, y, 30, 30);
            y += 35;
        }

        doc.setFontSize(14).setFont("helvetica", "bold");
        const splitTitle = doc.splitTextToSize(config.companyName.toUpperCase(), 70);
        splitTitle.forEach((line: string) => {
            doc.text(line, 40, y, { align: 'center' });
            y += 6;
        });
        
        doc.setFontSize(9).setFont("helvetica", "normal");
        doc.text("RESUMEN TOTAL DE CARGA", 40, y, { align: 'center' });
        y += 5;
        
        doc.setFontSize(8).setFont("helvetica", "italic");
        doc.text(`FECHA: ${new Date().toLocaleString()}`, 40, y, { align: 'center' });
        y += 5;
        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        doc.line(5, y, 75, y);
        y += 5;

        // Batch Info
        doc.setFontSize(9).setFont("helvetica", "bold");
        doc.text(`LOTE:`, 5, y);
        doc.setFont("helvetica", "normal");
        doc.text(batch.name.toUpperCase(), 20, y);
        y += 7;

        // Calculate Totals by origin for mortality
        let qM_Galpon = 0; let wM_Galpon = 0;
        let qM_Acopio = 0; let wM_Acopio = 0;
        let totalBirds = 0;
        let totalAmount = 0;

        orders.forEach(o => {
            const records = o.records || [];
            records.forEach(r => {
                if (r.type === 'MORTALITY') {
                    if ((r.origin || 'GALPON') === 'GALPON') {
                        qM_Galpon += r.quantity; wM_Galpon += r.weight;
                    } else {
                        qM_Acopio += r.quantity; wM_Acopio += r.weight;
                    }
                }
                if (r.type === 'FULL') {
                    totalBirds += (r.birds !== undefined ? r.birds : (o.weighingMode === WeighingType.SOLO_POLLO ? r.quantity : r.quantity * 10));
                }
            });
            
            // Calculate individual order net to sum financial
            const fR = records.filter(r => r.type === 'FULL');
            const eR = records.filter(r => r.type === 'EMPTY');
            const mR = records.filter(r => r.type === 'MORTALITY');
            const netO = o.weighingMode === WeighingType.SOLO_POLLO ? 
                fR.reduce((a, b) => a + b.weight, 0) : 
                fR.reduce((a, b) => a + b.weight, 0) - eR.reduce((a, b) => a + b.weight, 0) - mR.reduce((a, b) => a + b.weight, 0);
            
            totalAmount += netO * o.pricePerKg;
        });

        // Summary Table
        autoTable(doc, {
            startY: y,
            head: [[{ content: 'RESUMEN DE CARGA', colSpan: 2, styles: { halign: 'center', fillColor: [220, 226, 230], textColor: 0 } }]],
            body: [
                ['Total Jabas Llenas:', totalFullCrates.toString()],
                ['Total Pollos:', totalBirds.toString()],
                ['Total Jabas Vacías:', totalEmptyCrates.toString()],
                ['Total Muertos:', totalMort.toString()],
                ['  - Galpón:', qM_Galpon.toString()],
                ['  - Acopio:', qM_Acopio.toString()],
                ['Prom. Peso Neto:', `${(totalBirds > 0 ? netWeight / totalBirds : 0).toFixed(2)} kg`],
                ['Prom. P. Muerto:', `${(totalMort > 0 ? totalMortWeight / totalMort : 0).toFixed(2)} kg`],
                ['PESO NETO TOTAL:', `${netWeight.toFixed(2)} kg`]
            ],
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 1.5 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 }, 1: { halign: 'right', cellWidth: 30 } },
            margin: { left: 5, right: 5 }
        });
        y = (doc as any).lastAutoTable.finalY + 8;

        // Clients Table
        doc.setFontSize(9).setFont("helvetica", "bold");
        doc.text("DESGLOSE POR CLIENTES", 40, y, { align: 'center' });
        y += 2;

        const clientRows = orders.map(o => {
            const fR = (o.records || []).filter(r => r.type === 'FULL');
            const eR = (o.records || []).filter(r => r.type === 'EMPTY');
            const mR = (o.records || []).filter(r => r.type === 'MORTALITY');
            const netO = o.weighingMode === WeighingType.SOLO_POLLO ? 
                fR.reduce((a, b) => a + b.weight, 0) : 
                fR.reduce((a, b) => a + b.weight, 0) - eR.reduce((a, b) => a + b.weight, 0) - mR.reduce((a, b) => a + b.weight, 0);
            
            return [
                o.clientName.substring(0, 15),
                netO.toFixed(2),
                (netO * o.pricePerKg).toFixed(2)
            ];
        });

        autoTable(doc, {
            startY: y,
            head: [['Cliente', 'Neto (kg)', 'S/. Total']],
            body: clientRows,
            theme: 'grid',
            styles: { fontSize: 7, cellPadding: 1.5 },
            columnStyles: { 0: { cellWidth: 30 }, 1: { halign: 'right', cellWidth: 20 }, 2: { halign: 'right', cellWidth: 20 } },
            margin: { left: 5, right: 5 }
        });
        y = (doc as any).lastAutoTable.finalY + 10;

        // DETAILED RECORDS PER CLIENT - GROUPED
        doc.setFontSize(9).setFont("helvetica", "bold");
        doc.text("DETALLE DE PESAS POR CLIENTE", 40, y, { align: 'center' });
        y += 5;

        orders.forEach(o => {
            doc.setFontSize(8).setFont("helvetica", "bold");
            doc.text(`CLIENTE: ${o.clientName.toUpperCase()}`, 5, y);
            y += 4;

            const records = o.records || [];
            if (records.length > 0) {
                const types: {id: string, label: string}[] = [
                    { id: 'FULL', label: o.weighingMode === WeighingType.SOLO_POLLO ? 'SACOS' : 'LLENAS' },
                    { id: 'EMPTY', label: 'VACÍAS' },
                    { id: 'MORTALITY_GALPON', label: 'MUERTOS GALPÓN' },
                    { id: 'MORTALITY_ACOPIO', label: 'MUERTOS ACOPIO' }
                ];
                
                types.forEach(tSpec => {
                    const filtered = records.filter(r => {
                        if (tSpec.id === 'MORTALITY_GALPON') return r.type === 'MORTALITY' && (r.origin || 'GALPON') === 'GALPON';
                        if (tSpec.id === 'MORTALITY_ACOPIO') return r.type === 'MORTALITY' && r.origin === 'ACOPIO';
                        return r.type === tSpec.id;
                    });
                    if (filtered.length === 0) return;

                    const typeTotalWeight = filtered.reduce((acc, r) => acc + r.weight, 0);
                    const typeTotalQty = filtered.reduce((acc, r) => acc + r.quantity, 0);
                    const sectionTitle = `${tSpec.label} (${typeTotalQty}p)`;

                    autoTable(doc, {
                        startY: y,
                        head: [[{ content: sectionTitle, colSpan: 4, styles: { halign: 'center', fillColor: [240, 240, 240], textColor: 0, fontSize: 6.5 } }]],
                        body: chunkArray(filtered.flatMap(r => {
                            let suffix = '';
                            if (r.type === 'FULL') suffix = o.weighingMode === WeighingType.SOLO_POLLO ? `${r.birds}p` : `${r.quantity}j, ${r.birds}p`;
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
            }
        });

        if (orders.some(o => (o.records || []).some(r => r.type === 'MORTALITY'))) {
            doc.setFontSize(7).setFont("helvetica", "italic");
            doc.text("* PC=Cojo, GL=Galpón, AC=Acopio", 5, y);
            y += 5;
        }

        // Grand Totals
        doc.setFontSize(10).setFont("helvetica", "bold");
        doc.text("TOTALES GENERALES", 5, y);
        y += 5;
        doc.setFontSize(9).setFont("helvetica", "normal");
        doc.text("Peso Neto Carga:", 8, y); doc.text(`${netWeight.toFixed(2)} kg`, 72, y, { align: 'right' }); y += 5;
        doc.text("Mortalidad Total:", 8, y); doc.text(`${totalMortWeight.toFixed(2)} kg`, 72, y, { align: 'right' }); y += 5;
        
        if (totalAmount > 0) {
            doc.setFontSize(11).setFont("helvetica", "bold");
            doc.text("VALOR TOTAL:", 8, y + 2);
            doc.text(`S/. ${totalAmount.toFixed(2)}`, 72, y + 2, { align: 'right' });
            y += 12;
        }

        doc.setFontSize(8).setFont("helvetica", "italic");
        doc.text("Reporte de Fin de Carga", 40, y, { align: 'center' });

        return y + 15;
    };

    return (
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 hover:shadow-2xl hover:border-blue-400 transition-all duration-300 overflow-hidden flex flex-col h-full relative group">
          {/* Header */}
          <div className="bg-slate-900 p-4 flex justify-between items-start">
             <div className="flex items-center space-x-3">
                 <div className="bg-blue-600 p-2 rounded-lg text-white shadow-lg">
                     <Box size={24} />
                 </div>
                 <div>
                     <h3 className="font-black text-white text-lg leading-tight">{batch.name}</h3>
                     <p className="text-slate-400 text-xs font-medium flex items-center mt-1">
                         <Calendar size={12} className="mr-1"/> {new Date(batch.createdAt).toLocaleDateString()}
                     </p>
                 </div>
             </div>
              <div className="flex space-x-1.5 items-center">
                  <button onClick={generateBatchSummaryTicket} className="bg-indigo-600 p-1.5 rounded-lg text-white hover:bg-indigo-500 transition-colors" title="Ticket Resumen (General Lote)"><Receipt size={14} /></button>
                  <button onClick={generateBatchTicket} className="bg-slate-800 p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition-colors" title="Ticket Carga (Detallado)"><FileText size={14} /></button>
                  {canEdit && (
                      <>
                          <button onClick={() => { setCurrentBatch(batch); setShowModal(true); }} className="bg-slate-800 p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition-colors" title="Editar Lote"><Edit size={14} /></button>
                          <button onClick={() => handleDelete(batch.id)} className="bg-slate-800 p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-slate-700 transition-colors" title="Eliminar Lote"><Trash2 size={14} /></button>
                      </>
                  )}
              </div>
          </div>

          {/* Body */}
          <div className="p-5 flex-1 flex flex-col justify-between">
              <div>
                  {/* Progress */}
                  <div className="mb-6">
                      <div className="flex justify-between text-xs font-bold uppercase tracking-wider mb-2">
                          <span className="text-slate-500">Capacidad</span>
                          <span className={`${isOverLimit ? 'text-red-600' : 'text-blue-600'}`}>{totalFullCrates} / {batch.totalCratesLimit}</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-500 ${isOverLimit ? 'bg-red-500' : 'bg-gradient-to-r from-blue-500 to-blue-400'}`} style={{ width: `${percent}%` }}></div>
                      </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-2 text-center mb-4">
                      <div className="bg-blue-50 p-2 rounded-xl border border-blue-100">
                          <p className="text-[10px] font-bold text-blue-400 uppercase">Llenas</p>
                          <p className="font-black text-slate-800 text-lg leading-none">{totalFullCrates}</p>
                          <p className="text-[10px] text-slate-500 font-bold mt-1">{totalFullWeight.toFixed(2)} kg</p>
                      </div>
                      <div className="bg-orange-50 p-2 rounded-xl border border-orange-100">
                          <p className="text-[10px] font-bold text-orange-400 uppercase">Vacías</p>
                          <p className="font-black text-slate-800 text-lg leading-none">{totalEmptyCrates}</p>
                           <p className="text-[10px] text-slate-500 font-bold mt-1">{totalEmptyWeight.toFixed(2)} kg</p>
                      </div>
                      <div className="bg-red-50 p-2 rounded-xl border border-red-100">
                          <p className="text-[10px] font-bold text-red-400 uppercase">Merma</p>
                          <p className="font-black text-slate-800 text-lg leading-none">{totalMort}</p>
                           <p className="text-[10px] text-slate-500 font-bold mt-1">{totalMortWeight.toFixed(2)} kg</p>
                      </div>
                      <div className="bg-emerald-50 p-2 rounded-xl border border-emerald-100">
                          <p className="text-[10px] font-bold text-emerald-600 uppercase">Peso Neto</p>
                          <p className="font-black text-slate-800 text-lg leading-none">{netWeight.toFixed(2)}</p>
                           <p className="text-[10px] text-slate-500 font-bold mt-1">KG</p>
                      </div>
                  </div>
              </div>

              <div className="space-y-2 mt-4">
                  <div className="grid grid-cols-2 gap-2">
                      <button 
                          onClick={generateBatchSummaryTicket}
                          className="bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 py-2.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95"
                          title="Descargar Ticket de Resumen General del Lote"
                      >
                          <Receipt size={14} /> Ticket Resumen
                      </button>
                      <button 
                          onClick={generateBatchTicket}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 py-2.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95"
                          title="Descargar Ticket Detallado de Carga"
                      >
                          <FileText size={14} /> Ticket Carga
                      </button>
                  </div>

                  <button 
                    onClick={() => navigate(`/weigh/${WeighingType.BATCH}/${batch.id}`)}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                  >
                    <Scale size={18} className="mr-2" />
                    INGRESAR AL PESAJE
                  </button>
              </div>
          </div>
      </div>
    );
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Gestión de Lotes</h2>
            <p className="text-slate-500 font-medium text-xs">Administre sus campañas de producción</p>
        </div>
        <div className="flex items-center gap-3">
            <button 
                onClick={() => navigate('/')}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl flex items-center transition-colors shadow-sm font-bold text-xs"
            >
                Volver al Menú
            </button>
            <div className="relative">
                <Calendar size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input 
                    type="date" 
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:border-blue-500 outline-none shadow-sm"
                />
            </div>
            {canEdit && (
                <button 
                onClick={() => { 
                  const [year, month, day] = selectedDate.split('-');
                  const date = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0);
                  setCurrentBatch({ createdAt: date.getTime() }); 
                  setShowModal(true); 
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl flex items-center transition-colors shadow-lg shadow-emerald-200 font-bold text-xs"
                >
                <Plus size={16} className="mr-2" />
                Nuevo Lote
                </button>
            )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
        {batches.map(b => <BatchCard key={b.id} batch={b} />)}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm border border-gray-100">
            <h3 className="text-2xl font-black mb-6 text-slate-900">{currentBatch.id ? 'Editar Lote' : 'Crear Nuevo Lote'}</h3>
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Nombre Identificador (Lote)</label>
                <input 
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 focus:border-blue-500 focus:bg-white outline-none transition-all"
                  value={currentBatch.name || ''}
                  onChange={e => setCurrentBatch({...currentBatch, name: e.target.value})}
                  placeholder="Ej. Lote 25-A"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Meta de Jabas (Límite)</label>
                <input 
                  type="number"
                  inputMode="numeric"
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 focus:border-blue-500 focus:bg-white outline-none transition-all"
                  value={currentBatch.totalCratesLimit || ''}
                  onChange={e => setCurrentBatch({...currentBatch, totalCratesLimit: Number(e.target.value)})}
                  placeholder="Ej. 5000"
                />
                <p className="text-xs text-slate-400 mt-2 flex items-center"><Activity size={12} className="mr-1"/> Se bloqueará la creación de clientes si se supera.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Fecha del Lote</label>
                <input 
                  type="date"
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 focus:border-blue-500 focus:bg-white outline-none transition-all"
                  value={currentBatch.createdAt ? (() => {
                    const d = new Date(currentBatch.createdAt);
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                  })() : selectedDate}
                  onChange={e => {
                    const [year, month, day] = e.target.value.split('-');
                    const date = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0);
                    setCurrentBatch({...currentBatch, createdAt: date.getTime()});
                  }}
                />
              </div>
            </div>
            <div className="mt-8 flex justify-end space-x-3">
              <button onClick={() => setShowModal(false)} className="text-slate-500 font-bold hover:text-slate-800 px-4 py-2 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
              <button onClick={handleSave} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition-colors">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BatchList;
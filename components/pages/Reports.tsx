import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Batch, WeighingType, UserRole, ClientOrder, WeighingRecord } from '../../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addLogoToPdf, addAppWatermarkToPdf } from '../../services/pdfHelper';
import { getBatches, getOrders, getConfig, saveOrder, resetApp, getVisibleUserIds, getEffectiveBranding, uploadLocalToCloud } from '../../services/storage';
import { AuthContext } from '../../App';



import { 
  ArrowLeft, BarChart2, Calendar, Search, Filter, Package, Users, DollarSign, 
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

export const getOrderTotals = (order: ClientOrder) => {
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
  
  const mortGalpon = mort.filter(r => (r.origin || 'GALPON') === 'GALPON');
  const mortAcopio = mort.filter(r => r.origin === 'ACOPIO');
  const wM_Galpon = mortGalpon.reduce((a, b) => a + b.weight, 0);
  const qM_Galpon = mortGalpon.reduce((a, b) => a + b.quantity, 0);
  const wM_Acopio = mortAcopio.reduce((a, b) => a + b.weight, 0);
  const qM_Acopio = mortAcopio.reduce((a, b) => a + b.quantity, 0);

  const bF = full.reduce((a, b) => a + (b.birds !== undefined ? b.birds : (order.weighingMode === WeighingType.SOLO_POLLO ? b.quantity : b.quantity * 10)), 0);
  const net = order.weighingMode === WeighingType.SOLO_POLLO ? wF : wF - wE - wM;
  
  const lame = mort.filter(r => r.isLame);
  const wLame = lame.reduce((a, b) => a + b.weight, 0);
  const qLame = lame.reduce((a, b) => a + b.quantity, 0);

  const avgNet = bF > 0 ? net / bF : 0;
  const avgMort = qM > 0 ? wM / qM : 0;

  let totalAmount = net * (order.pricePerKg || 0);
  if (order.additionalItems) {
    order.additionalItems.forEach(item => {
      totalAmount += (item.quantity * item.pricePerUnit);
    });
  }
  const totalPaid = (order.payments || []).reduce((acc, curr) => acc + curr.amount, 0);
  const balance = totalAmount - totalPaid;

  return {
    wF, wE, wM, qF, qE, qM,
    wM_Galpon, qM_Galpon, wM_Acopio, qM_Acopio,
    bF, net, wLame, qLame,
    avgNet, avgMort,
    totalAmount, totalPaid, balance
  };
};

const chunkArray = (arr: any[], size: number) => {
  const chunked = [];
  for (let i = 0; i < arr.length; i += size) {
    const chunk = arr.slice(i, i + size);
    while (chunk.length < size) {
      chunk.push('');
    }
    chunked.push(chunk);
  }
  return chunked;
};


const Reports = () => {
  const { user } = React.useContext(AuthContext);
  

  const handlePDFOutput = (doc: jsPDF, filename: string) => {
    doc.save(filename);
  };

  const getSafeDateString = (order: ClientOrder) => {
    if (order.date) {
      const d = new Date(order.date);
      if (!isNaN(d.getTime())) return d.toLocaleDateString();
    }
    const idNum = parseInt(order.id);
    if (!isNaN(idNum)) {
      const d = new Date(idNum);
      if (!isNaN(d.getTime())) return d.toLocaleDateString();
    }
    return new Date().toLocaleDateString();
  };

  
  
  const renderTicketContent = (doc: jsPDF, order: ClientOrder, isSalesTicket: boolean) => {
    const branding = getEffectiveBranding(order, user);
    addAppWatermarkToPdf(doc);
    const t = getOrderTotals(order);
    const mode = order.weighingMode || WeighingType.BATCH;
    const batch = getBatches().find(b => b.id === order.batchId);
    const batchName = batch ? batch.name : (mode === WeighingType.SOLO_POLLO ? 'Venta de Sacos' : (mode === WeighingType.SOLO_JABAS ? 'Control Muertos' : 'Venta Directa'));
    
    let y = 10;
    
    // Header
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
    doc.text(`FECHA: ${getSafeDateString(order)}`, 40, y, { align: 'center' });
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
                mode !== WeighingType.SOLO_JABAS ? [mode === WeighingType.SOLO_POLLO ? 'Cant. Sacos:' : 'Jabas Llenas:', t.qF.toString()] : null,
                mode !== WeighingType.SOLO_JABAS ? ['Total Pollos:', t.bF.toString()] : null,
                mode === WeighingType.BATCH ? ['Jabas Vacías:', ((batch?.emptyCrates !== undefined && batch?.emptyCrates !== null) ? batch.emptyCrates : t.qE).toString()] : null,
                t.qM_Galpon > 0 ? ['Muertos Galpón:', t.qM_Galpon.toString()] : null,
                t.qM_Acopio > 0 ? ['Muertos Acopio:', t.qM_Acopio.toString()] : null,
                mode !== WeighingType.SOLO_POLLO ? ['TOTAL MUERTOS:', t.qM.toString()] : null,
                mode !== WeighingType.SOLO_JABAS ? ['Prom. Peso Neto:', `${t.avgNet.toFixed(1)} kg`] : null,
                mode !== WeighingType.SOLO_POLLO ? ['Prom. P. Muerto:', `${t.avgMort.toFixed(1)} kg`] : null
            ].filter(Boolean) as any,
            theme: 'grid',
            styles: { fontSize: 7.5, cellPadding: 1.2 },
            columnStyles: {
                0: { fontStyle: 'bold', cellWidth: 42 },
                1: { halign: 'right', cellWidth: 28 }
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
                { id: 'FULL', label: mode === WeighingType.SOLO_POLLO ? 'SACOS' : 'LLENAS' },
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
                const typeTotalBirds = filtered.reduce((acc, r) => acc + (r.birds || 0), 0);
                let sectionTitle = `${tSpec.label} (${typeTotalQty}j)`;
                if (tSpec.id === 'FULL') {
                    sectionTitle = mode === WeighingType.SOLO_POLLO ? `${tSpec.label} (${typeTotalQty} sacos, ${typeTotalBirds}p)` : `${tSpec.label} (${typeTotalQty}j, ${typeTotalBirds}p)`;
                } else if (tSpec.id.startsWith('MORTALITY')) {
                    sectionTitle = `${tSpec.label} (${typeTotalQty}p)`;
                }

                autoTable(doc, {
                    startY: y,
                    head: [[{ content: sectionTitle, colSpan: 4, styles: { halign: 'center', fillColor: [240, 240, 240], textColor: 0, fontSize: 6.5 } }]],
                    body: chunkArray(filtered.flatMap(r => {
                        let suffix = '';
                        if (r.type === 'FULL') suffix = mode === WeighingType.SOLO_POLLO ? `${r.birds}p` : `${r.quantity}j, ${r.birds}p`;
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
    
    if (t.wM_Galpon > 0) {
        doc.text("Merma Galpón:", 8, y); doc.text(`-${t.wM_Galpon.toFixed(2)} kg`, 72, y, { align: 'right' }); y += 5;
    }
    if (t.wM_Acopio > 0) {
        doc.text("Merma Acopio:", 8, y); doc.text(`-${t.wM_Acopio.toFixed(2)} kg`, 72, y, { align: 'right' }); y += 5;
    }
    
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL MERMA:", 8, y); doc.text(`-${t.wM.toFixed(2)} kg`, 72, y, { align: 'right' }); y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8).setFont("helvetica", "italic");
    doc.text("Prom. Peso Neto:", 8, y); doc.text(`${t.avgNet.toFixed(2)} kg`, 72, y, { align: 'right' }); y += 4;
    doc.text("Prom. P. Muerto:", 8, y); doc.text(`${t.avgMort.toFixed(2)} kg`, 72, y, { align: 'right' }); y += 5;
    
    doc.setFontSize(11).setFont("helvetica", "bold");
    doc.text("PESO NETO:", 8, y + 2);
    doc.text(`${t.net.toFixed(2)} kg`, 72, y + 2, { align: 'right' });
    y += 10;

    // Financials
    if (order.pricePerKg > 0 || (order.additionalItems && order.additionalItems.length > 0)) {
        let currentY = y;
        let finalNetCost = 0;
        
        if (order.pricePerKg > 0) {
            finalNetCost = t.net * order.pricePerKg;
            doc.setFontSize(9).setFont("helvetica", "bold");
            doc.text(`PRECIO X KG: S/. ${order.pricePerKg.toFixed(2)}`, 5, currentY);
            currentY += 6;
            doc.setFontSize(9).setFont("helvetica", "normal");
            doc.text("Total Aves:", 5, currentY);
            doc.text(`S/. ${finalNetCost.toFixed(2)}`, 75, currentY, { align: 'right' });
            currentY += 6;
        }

        let additionalTotal = 0;
        if (order.additionalItems && order.additionalItems.length > 0) {
            doc.setFontSize(9).setFont("helvetica", "bold");
            doc.text("CARGOS EXTRAS:", 5, currentY);
            currentY += 5;
            doc.setFontSize(8).setFont("helvetica", "normal");
            order.additionalItems.forEach(item => {
                const itemTotal = item.quantity * item.pricePerUnit;
                additionalTotal += itemTotal;
                doc.text(`${item.quantity} x ${item.name}`, 5, currentY);
                doc.text(`S/. ${itemTotal.toFixed(2)}`, 75, currentY, { align: 'right' });
                currentY += 4;
            });
            currentY += 2;
        }
        
        const finalTotal = finalNetCost + additionalTotal;

        doc.setFillColor(15, 23, 42); // Slate 900
        doc.rect(5, currentY, 70, 12, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9).setFont("helvetica", "bold");
        doc.text("TOTAL A PAGAR", 35, currentY + 7, { align: 'right' });
        doc.setFontSize(12);
        doc.text(`S/. ${finalTotal.toFixed(2)}`, 72, currentY + 8, { align: 'right' });
        doc.setTextColor(0, 0, 0);
        y = currentY + 18;
    }

    // Signatures Block
    y += 4;
    const dispSig = batch?.dispatcherSignature;
    const clientSig = order.clientSignature || batch?.clientSignature;
    if (dispSig) {
      try { doc.addImage(dispSig, 'PNG', 6, y - 9, 28, 9); } catch (e) {}
    }
    if (clientSig) {
      try { doc.addImage(clientSig, 'PNG', 45, y - 9, 28, 9); } catch (e) {}
    }
    doc.setLineWidth(0.3);
    doc.setDrawColor(0);
    // Firma Responsable
    doc.line(5, y, 36, y);
    doc.setFontSize(6).setFont("helvetica", "bold");
    doc.text("RESPONSABLE DESPACHO", 20.5, y + 3, { align: 'center' });
    const dispName = batch?.dispatcherName || '..............................';
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(dispName.toUpperCase(), 31), 20.5, y + 5.8, { align: 'center' });
    // Firma Cliente
    doc.line(44, y, 75, y);
    doc.setFontSize(6).setFont("helvetica", "bold");
    doc.text("CLIENTE / RECIBE", 59.5, y + 3, { align: 'center' });
    const cliName = order.recipientName || batch?.recipientName || order.clientName || '..............................';
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(cliName.toUpperCase(), 31), 59.5, y + 5.8, { align: 'center' });

    y += 14;
    doc.setFontSize(8).setFont("helvetica", "italic");
    doc.text("¡Gracias por su preferencia!", 40, y, { align: 'center' });
    
    return y + 10;
  };

  const renderSalesTicketContent = (doc: jsPDF, order: ClientOrder) => {
    const branding = getEffectiveBranding(order, user);
    addAppWatermarkToPdf(doc);
    const t = getOrderTotals(order);
    const mode = order.weighingMode || WeighingType.BATCH;
    const batch = getBatches().find(b => b.id === order.batchId);
    const batchName = batch ? batch.name : (mode === WeighingType.SOLO_POLLO ? 'Venta de Sacos' : (mode === WeighingType.SOLO_JABAS ? 'Control Muertos' : 'Venta Directa'));
    
    let y = 10;
    
    // Header
    if (branding.logoUrl) {
        y = addLogoToPdf(doc, branding.logoUrl, { maxWidth: 35, maxHeight: 22, y });
    }

    doc.setFontSize(14).setFont("helvetica", "bold");
    const splitTitleVenta = doc.splitTextToSize(branding.companyName.toUpperCase(), 70);
    splitTitleVenta.forEach((line: string) => {
        doc.text(line, 40, y, { align: 'center' });
        y += 6;
    });
    
    doc.setFontSize(10).setFont("helvetica", "bold");
    doc.text("TICKET DE VENTA", 40, y, { align: 'center' });
    y += 5;
    
    doc.setFontSize(8).setFont("helvetica", "italic");
    doc.text(`FECHA: ${getSafeDateString(order)}`, 40, y, { align: 'center' });
    y += 5;
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(5, y, 75, y);
    y += 5;

    // Batch & Client Info (Sales Ticket)
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

    // General Weights Box
    autoTable(doc, {
        startY: y,
        head: [[{ content: 'RESUMEN DE PESOS', colSpan: 2, styles: { halign: 'center', fillColor: [220, 226, 230], textColor: 0 } }]],
        body: [
            mode !== WeighingType.SOLO_JABAS ? ['Peso Bruto:', `${t.wF.toFixed(2)} kg`] : null,
            mode === WeighingType.BATCH ? ['Tara Total:', `-${t.wE.toFixed(2)} kg`] : null,
            t.wM_Galpon > 0 ? ['Merma Galpón:', `-${t.wM_Galpon.toFixed(2)} kg`] : null,
            t.wM_Acopio > 0 ? ['Merma Acopio:', `-${t.wM_Acopio.toFixed(2)} kg`] : null,
            mode !== WeighingType.SOLO_POLLO ? ['TOTAL MERMA:', `-${t.wM.toFixed(2)} kg`] : null,
            mode !== WeighingType.SOLO_JABAS ? ['Prom. P. Neto:', `${t.avgNet.toFixed(1)} kg`] : null,
            mode !== WeighingType.SOLO_POLLO ? ['Prom. P. Muerto:', `${t.avgMort.toFixed(1)} kg`] : null,
            mode !== WeighingType.SOLO_JABAS ? ['PESO NETO:', `${t.net.toFixed(2)} kg`] : null
        ].filter(Boolean) as any[],
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 2 },
        columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 35 },
            1: { halign: 'right', cellWidth: 35 }
        },
        margin: { left: 5, right: 5 }
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // Financials
    if (order.pricePerKg > 0 || (order.additionalItems && order.additionalItems.length > 0)) {
        let currentY = y;
        let finalNetCost = 0;
        
        if (order.pricePerKg > 0) {
            finalNetCost = t.net * order.pricePerKg;
            doc.setFontSize(9).setFont("helvetica", "bold");
            doc.text(`PRECIO X KG: S/. ${order.pricePerKg.toFixed(2)}`, 5, currentY);
            currentY += 6;
            doc.setFontSize(9).setFont("helvetica", "normal");
            doc.text("Total Aves:", 5, currentY);
            doc.text(`S/. ${finalNetCost.toFixed(2)}`, 75, currentY, { align: 'right' });
            currentY += 6;
        }

        let additionalTotal = 0;
        if (order.additionalItems && order.additionalItems.length > 0) {
            doc.setFontSize(9).setFont("helvetica", "bold");
            doc.text("CARGOS EXTRAS:", 5, currentY);
            currentY += 5;
            doc.setFontSize(8).setFont("helvetica", "normal");
            order.additionalItems.forEach(item => {
                const itemTotal = item.quantity * item.pricePerUnit;
                additionalTotal += itemTotal;
                doc.text(`${item.quantity} x ${item.name}`, 5, currentY);
                doc.text(`S/. ${itemTotal.toFixed(2)}`, 75, currentY, { align: 'right' });
                currentY += 4;
            });
            currentY += 2;
        }
        
        const finalTotal = finalNetCost + additionalTotal;

        doc.setFillColor(15, 23, 42); // Slate 900
        doc.rect(5, currentY, 70, 15, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10).setFont("helvetica", "bold");
        doc.text("TOTAL A PAGAR", 35, currentY + 9, { align: 'right' });
        doc.setFontSize(14);
        doc.text(`S/. ${finalTotal.toFixed(2)}`, 72, currentY + 10, { align: 'right' });
        doc.setTextColor(0, 0, 0);
        y = currentY + 22;
    }

    // Signatures
    y += 4;
    const dispSig = batch?.dispatcherSignature;
    const clientSig = order.clientSignature || batch?.clientSignature;
    if (dispSig) {
      try { doc.addImage(dispSig, 'PNG', 6, y - 9, 28, 9); } catch (e) {}
    }
    if (clientSig) {
      try { doc.addImage(clientSig, 'PNG', 45, y - 9, 28, 9); } catch (e) {}
    }
    doc.setLineWidth(0.3);
    doc.setDrawColor(0);
    doc.line(5, y, 36, y);
    doc.setFontSize(6).setFont("helvetica", "bold");
    doc.text("RESPONSABLE DESPACHO", 20.5, y + 3, { align: 'center' });
    doc.line(44, y, 75, y);
    doc.text("CLIENTE / RECIBE", 59.5, y + 3, { align: 'center' });
    y += 14;

    doc.setFontSize(8).setFont("helvetica", "italic");
    doc.text("¡Gracias por su compra!", 40, y, { align: 'center' });
    
    return y + 10;
  };

  const renderSummaryTicketContent = (doc: jsPDF, order: ClientOrder) => {
    const branding = getEffectiveBranding(order, user);
    addAppWatermarkToPdf(doc);
    const t = getOrderTotals(order);
    const mode = order.weighingMode || WeighingType.BATCH;
    const batch = getBatches().find(b => b.id === order.batchId);
    const batchName = batch ? batch.name : (mode === WeighingType.SOLO_POLLO ? 'Venta de Sacos' : (mode === WeighingType.SOLO_JABAS ? 'Control Muertos' : 'Venta Directa'));
    
    let y = 10;
    
    // Header Logo in natural aspect ratio
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
    doc.text(`FECHA: ${getSafeDateString(order)}`, 40, y, { align: 'center' });
    y += 5;
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(5, y, 75, y);
    y += 5;

    // Batch & Client Info
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
    doc.text(`CLIENTE / RECIBE:`, 5, y);
    doc.setFont("helvetica", "normal");
    const cliDisplayName = order.recipientName || batch?.recipientName || order.clientName || 'PUBLICO GENERAL';
    doc.text(cliDisplayName.toUpperCase(), 36, y);
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

    doc.setFont("helvetica", "bold");
    doc.text(`TIPO DE AVE:`, 5, y);
    doc.setFont("helvetica", "normal");
    doc.text((order.birdType || batch?.birdType || 'POLLO DE CARNE').toUpperCase(), 36, y);
    y += 4;

    doc.setFont("helvetica", "bold");
    doc.text(`SEXO DE AVE:`, 5, y);
    doc.setFont("helvetica", "normal");
    doc.text((order.birdSex || batch?.birdSex || 'MIXTO').toUpperCase(), 36, y);
    y += 5.5;

    // Single Table for DETALLE DE CARGA
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

    // Table for PROMEDIOS CALCULADOS
    const promJabaLlena = t.bF > 0 ? t.wF / t.bF : 0;
    const promJabaVacia = t.qE > 0 ? t.wE / t.qE : 0;
    const promPolloTotal = t.bF > 0 ? (t.wF - t.wE) / t.bF : 0;
    const promPolloMuerto = t.qM > 0 ? t.wM / t.qM : 0;
    const promPesoNetoVivo = pollosVivos > 0 ? t.net / pollosVivos : 0;

    autoTable(doc, {
        startY: y,
        head: [[
            { content: 'PROMEDIOS CALCULADOS', colSpan: 2, styles: { halign: 'center', fillColor: [240, 240, 240], textColor: 0 } }
        ]],
        body: [
            ['Prom. Jaba Llena:', `${promJabaLlena.toFixed(1)} kg/p`],
            ['Prom. Jaba Vacía:', `${promJabaVacia.toFixed(1)} kg/j`],
            ['Prom. Pollo Total:', `${promPolloTotal.toFixed(1)} kg/p`],
            ['Prom. Pollo Muerto:', `${promPolloMuerto.toFixed(1)} kg/p`],
            ['Prom. Peso Neto Vivo:', `${promPesoNetoVivo.toFixed(1)} kg/p`]
        ],
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 1.2 },
        columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 40 },
            1: { halign: 'right', cellWidth: 30 }
        },
        margin: { left: 5, right: 5 }
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    // Financials
    if (order.pricePerKg > 0 || (order.additionalItems && order.additionalItems.length > 0)) {
        let currentY = y;
        let finalNetCost = 0;
        
        if (order.pricePerKg > 0) {
            finalNetCost = t.net * order.pricePerKg;
            doc.setFontSize(8.5).setFont("helvetica", "bold");
            doc.text(`PRECIO X KG: S/. ${order.pricePerKg.toFixed(2)}`, 5, currentY);
            currentY += 5;
            doc.setFontSize(8.5).setFont("helvetica", "normal");
            doc.text("Total Aves:", 5, currentY);
            doc.text(`S/. ${finalNetCost.toFixed(2)}`, 75, currentY, { align: 'right' });
            currentY += 5;
        }

        let additionalTotal = 0;
        if (order.additionalItems && order.additionalItems.length > 0) {
            doc.setFontSize(8.5).setFont("helvetica", "bold");
            doc.text("CARGOS EXTRAS:", 5, currentY);
            currentY += 5;
            doc.setFontSize(8.5).setFont("helvetica", "normal");
            order.additionalItems.forEach(item => {
                const itemTotal = item.quantity * item.pricePerUnit;
                additionalTotal += itemTotal;
                doc.text(`${item.quantity} x ${item.name}`, 5, currentY);
                doc.text(`S/. ${itemTotal.toFixed(2)}`, 75, currentY, { align: 'right' });
                currentY += 4;
            });
            currentY += 2;
        }
        
        const finalTotal = finalNetCost + additionalTotal;

        doc.setFillColor(15, 23, 42); // Slate 900
        doc.rect(5, currentY, 70, 14, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9).setFont("helvetica", "bold");
        doc.text("TOTAL A PAGAR", 35, currentY + 8, { align: 'right' });
        doc.setFontSize(12);
        doc.text(`S/. ${finalTotal.toFixed(2)}`, 72, currentY + 9, { align: 'right' });
        doc.setTextColor(0, 0, 0);
        y = currentY + 20;
    }

    // Signatures Block
    y += 8;

    const dispSig = batch?.dispatcherSignature;
    const clientSig = order.clientSignature || batch?.clientSignature;

    if (dispSig) {
      try {
        doc.addImage(dispSig, 'PNG', 6, y - 9, 28, 9);
      } catch (e) {}
    }
    if (clientSig) {
      try {
        doc.addImage(clientSig, 'PNG', 45, y - 9, 28, 9);
      } catch (e) {}
    }

    doc.setLineWidth(0.3);
    doc.setDrawColor(0);

    // Firma Responsable Despacho (Left)
    doc.line(5, y, 36, y);
    doc.setFontSize(6).setFont("helvetica", "bold");
    doc.text("RESPONSABLE DESPACHO", 20.5, y + 3, { align: 'center' });
    doc.setFont("helvetica", "normal");
    const dispName = batch?.dispatcherName || '..............................';
    const dispDni = batch?.dispatcherDni ? `DNI: ${batch.dispatcherDni}` : 'DNI: ....................';
    doc.text(doc.splitTextToSize(dispName.toUpperCase(), 31), 20.5, y + 5.8, { align: 'center' });
    doc.text(dispDni, 20.5, y + 9, { align: 'center' });

    // Firma Cliente / Recibió (Right)
    doc.line(44, y, 75, y);
    doc.setFontSize(6).setFont("helvetica", "bold");
    const labelFirma = (order.recipientName || batch?.recipientName) ? "RECIBIDO POR" : "FIRMA DEL CLIENTE";
    doc.text(labelFirma, 59.5, y + 3, { align: 'center' });
    doc.setFont("helvetica", "normal");
    const cliName = order.recipientName || batch?.recipientName || order.clientName || '..............................';
    const cliDniVal = order.recipientDni || batch?.recipientDni || order.clientDni || batch?.clientDni;
    const cliDni = cliDniVal ? `DNI: ${cliDniVal}` : 'DNI: ....................';
    doc.text(doc.splitTextToSize(cliName.toUpperCase(), 31), 59.5, y + 5.8, { align: 'center' });
    doc.text(cliDni, 59.5, y + 9, { align: 'center' });

    y += 15;

    doc.setFontSize(8).setFont("helvetica", "italic");
    doc.text("¡Gracias por su preferencia!", 40, y, { align: 'center' });

    return y + 8;
  };

  const generateTicketPDF = (order: ClientOrder, show: boolean = false) => {
    const dummyDoc = new jsPDF({ unit: 'mm', format: [80, 15000] });
    const finalY = renderTicketContent(dummyDoc, order, false);
    
    const doc = new jsPDF({ unit: 'mm', format: [80, Math.max(120, finalY)] });
    renderTicketContent(doc, order, false);
    handlePDFOutput(doc, `Pesaje_${order.clientName.replace(/\s+/g, '_')}_${order.id.slice(-6)}.pdf`);
  };

  const generateSalesTicketPDF = (order: ClientOrder, show: boolean = false) => {
    const dummyDoc = new jsPDF({ unit: 'mm', format: [80, 15000] });
    const finalY = renderSalesTicketContent(dummyDoc, order);
    
    const doc = new jsPDF({ unit: 'mm', format: [80, Math.max(120, finalY)] });
    renderSalesTicketContent(doc, order);
    handlePDFOutput(doc, `Venta_${order.clientName.replace(/\s+/g, '_')}_${order.id.slice(-6)}.pdf`);
  };

  const generateSummaryTicketPDF = (order: ClientOrder, show: boolean = false) => {
    const dummyDoc = new jsPDF({ unit: 'mm', format: [80, 15000] });
    const finalY = renderSummaryTicketContent(dummyDoc, order);
    
    const doc = new jsPDF({ unit: 'mm', format: [80, Math.max(120, finalY)] });
    renderSummaryTicketContent(doc, order);
    handlePDFOutput(doc, `Resumen_${order.clientName.replace(/\s+/g, '_')}_${order.id.slice(-6)}.pdf`);
  };


  const drawA4Header = (doc: any, title: string) => {
    const branding = getEffectiveBranding({} as any, user);
    addAppWatermarkToPdf(doc);
    
    // Header Background
    doc.setFillColor(15, 23, 42); // Slate 900
    doc.rect(0, 0, 210, 45, 'F');
    
    // Header Text
    let currentY = 8;
    if (branding.logoUrl) {
        currentY = addLogoToPdf(doc, branding.logoUrl, { maxWidth: 28, maxHeight: 28, defaultX: 14, y: currentY });
    }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22).setFont("helvetica", "bold");
    const splitTitle = doc.splitTextToSize(branding.companyName.toUpperCase(), 180);
    splitTitle.forEach((line: string, i: number) => {
        doc.text(line, 105, 20 + (i * 8), { align: 'center' });
    });
    
    doc.setFontSize(12).setFont("helvetica", "normal");
    doc.text(title, 105, 32 + ((splitTitle.length - 1) * 8), { align: 'center' });
    
    doc.setTextColor(0, 0, 0);
    return 55;
  };

  const drawA4Signatures = (doc: any, orders: ClientOrder[], y: number) => {
    let clientSig = '';
    let dispSig = '';
    for(const o of orders) {
       if (!clientSig && o.clientSignature) clientSig = o.clientSignature;
       const b = getBatches().find(bx => bx.id === o.batchId);
       if (b) {
          if (!clientSig && b.clientSignature) clientSig = b.clientSignature;
          if (!dispSig && b.dispatcherSignature) dispSig = b.dispatcherSignature;
       }
       if (clientSig && dispSig) break;
    }

    if (y > 250) {
       doc.addPage();
       addAppWatermarkToPdf(doc);
       y = 20;
    }
    
    y += 20;
    if (dispSig) {
      try { doc.addImage(dispSig, 'PNG', 20, y - 15, 40, 15); } catch (e) {}
    }
    if (clientSig) {
      try { doc.addImage(clientSig, 'PNG', 150, y - 15, 40, 15); } catch (e) {}
    }
    
    doc.setLineWidth(0.5);
    doc.setDrawColor(0);
    
    // Firma Responsable
    doc.line(15, y, 65, y);
    doc.setFontSize(8).setFont("helvetica", "bold");
    doc.text("RESPONSABLE DESPACHO", 40, y + 4, { align: 'center' });
    doc.setFont("helvetica", "normal");
    doc.text("Firma o Sello", 40, y + 8, { align: 'center' });
    
    // Firma Cliente
    doc.line(145, y, 195, y);
    doc.setFontSize(8).setFont("helvetica", "bold");
    doc.text("CLIENTE / RECIBE", 170, y + 4, { align: 'center' });
    doc.setFont("helvetica", "normal");
    doc.text("Firma de Conformidad", 170, y + 8, { align: 'center' });
  };

  const renderCategoryGridA4 = (doc: any, title: string, records: any[], totalWeight: number, qty?: number, startY?: number) => {
    if (records.length === 0) return startY || 50;
    let y = startY !== undefined ? startY : ((doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : 50);
    if (y > 250) { 
      doc.addPage(); 
      addAppWatermarkToPdf(doc); 
      y = 20; 
    }
    
    const headerText = qty !== undefined 
        ? `${title} - CANTIDAD: ${qty} | TOTAL: ${totalWeight.toFixed(2)} KG`
        : `${title} - TOTAL: ${totalWeight.toFixed(2)} KG`;

    autoTable(doc, {
        startY: y,
        head: [[{ content: headerText, colSpan: 8, styles: { halign: 'left', fillColor: [241, 245, 249], textColor: 0, fontStyle: 'bold' } }]],
        body: chunkArray(records.flatMap(r => {
            let suffix = '';
            if (r.type === 'FULL') suffix = `${r.quantity}j, ${r.birds || 0}p`;
            else if (r.type === 'EMPTY') suffix = `${r.quantity}j`;
            else if (r.type === 'MORTALITY') suffix = `${r.quantity}p${r.isLame ? ' (PC)' : ''}`;
            return [r.weight.toFixed(2), suffix];
        }), 8),
        theme: 'grid',
        styles: { fontSize: 8, halign: 'center', cellPadding: 2, minCellHeight: 8 },
        margin: { left: 14, right: 14 }
    });
    return (doc as any).lastAutoTable.finalY;
  };

  const renderTicketWeightsForOrders = (doc: any, orders: ClientOrder[], startY: number) => {
    let y = startY;
    orders.forEach((order, oIdx) => {
      const allRecords = order.records || [];
      if (allRecords.length === 0) return;
      
      const mode = order.weighingMode || WeighingType.BATCH;
      if (orders.length > 1) {
        doc.setFillColor(241, 245, 249);
        doc.rect(5, y, 70, 5, 'F');
        doc.setFontSize(7).setFont("helvetica", "bold");
        doc.setTextColor(30, 41, 59);
        const oHeader = `ORDEN #${oIdx + 1}: ${getSafeDateString(order)} - ${getBatchName(order.batchId || '')}`;
        doc.text(doc.splitTextToSize(oHeader, 68), 6, y + 3.5);
        doc.setTextColor(0, 0, 0);
        y += 7;
      }

      const types: {id: string, label: string}[] = [
          { id: 'FULL', label: mode === WeighingType.SOLO_POLLO ? 'SACOS' : 'LLENAS' },
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
          const typeTotalBirds = filtered.reduce((acc, r) => acc + (r.birds || 0), 0);
          let sectionTitle = `${tSpec.label} (${typeTotalQty}j)`;
          if (tSpec.id === 'FULL') {
              sectionTitle = mode === WeighingType.SOLO_POLLO ? `${tSpec.label} (${typeTotalQty} sacos, ${typeTotalBirds}p)` : `${tSpec.label} (${typeTotalQty}j, ${typeTotalBirds}p)`;
          } else if (tSpec.id.startsWith('MORTALITY')) {
              sectionTitle = `${tSpec.label} (${typeTotalQty}p)`;
          }

          autoTable(doc, {
              startY: y,
              head: [[{ content: sectionTitle, colSpan: 4, styles: { halign: 'center', fillColor: [240, 240, 240], textColor: 0, fontSize: 6.5 } }]],
              body: chunkArray(filtered.flatMap(r => {
                  let suffix = '';
                  if (r.type === 'FULL') suffix = mode === WeighingType.SOLO_POLLO ? `${r.birds}p` : `${r.quantity}j, ${r.birds}p`;
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

      const oTot = calculateTotals(order);
      doc.setFontSize(7.5).setFont("helvetica", "bold");
      doc.text(`SUBTOTAL NETO: ${oTot.net.toFixed(2)} kg | IMPORTE: S/. ${oTot.totalAmount.toFixed(2)}`, 70, y, { align: 'right' });
      y += 6;
    });

    return y;
  };

  const renderTicketSignatures = (doc: any, orders: ClientOrder[], startY: number) => {
    let y = startY + 12;
    let clientSig = '';
    let dispSig = '';
    let clientDniVal = '';
    let clientNameVal = '';

    for (const o of orders) {
      if (!clientSig && o.clientSignature) clientSig = o.clientSignature;
      if (!clientDniVal && o.clientDni) clientDniVal = o.clientDni;
      if (!clientNameVal && o.clientName) clientNameVal = o.clientName;
      const b = getBatches().find(bx => bx.id === o.batchId);
      if (b) {
        if (!clientSig && b.clientSignature) clientSig = b.clientSignature;
        if (!dispSig && b.dispatcherSignature) dispSig = b.dispatcherSignature;
        if (!clientDniVal && b.clientDni) clientDniVal = b.clientDni;
      }
    }

    if (dispSig) {
      try { doc.addImage(dispSig, 'PNG', 7, y - 10, 25, 10); } catch (e) {}
    }
    if (clientSig) {
      try { doc.addImage(clientSig, 'PNG', 47, y - 10, 25, 10); } catch (e) {}
    }

    doc.setLineWidth(0.3);
    doc.setDrawColor(0);

    // Responsable Despacho
    doc.line(5, y, 36, y);
    doc.setFontSize(6).setFont("helvetica", "bold");
    doc.text("RESPONSABLE DESPACHO", 20.5, y + 3, { align: 'center' });
    doc.setFont("helvetica", "normal");
    doc.text((user?.name || 'DESPACHADOR').toUpperCase(), 20.5, y + 5.8, { align: 'center' });

    // Cliente / Recibió
    doc.line(44, y, 75, y);
    doc.setFontSize(6).setFont("helvetica", "bold");
    doc.text("CLIENTE / RECIBE", 59.5, y + 3, { align: 'center' });
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize((clientNameVal || 'CLIENTE').toUpperCase(), 31), 59.5, y + 5.8, { align: 'center' });
    if (clientDniVal) {
      doc.text(`DNI: ${clientDniVal}`, 59.5, y + 9, { align: 'center' });
    }

    y += 16;
    doc.setFontSize(7).setFont("helvetica", "italic");
    doc.text("¡Gracias por su preferencia!", 40, y, { align: 'center' });
    return y + 8;
  };

  const generateA4ClientPDF = (order: ClientOrder) => {
     const doc = new jsPDF();
     let y = drawA4Header(doc, "REPORTE DETALLADO DE PESAJE");
     const t = calculateTotals(order);
     
     doc.setFontSize(10).setFont("helvetica", "bold");
     doc.text(`LOTE:`, 14, y);
     doc.setFont("helvetica", "normal");
     doc.text(getBatchName(order.batchId || "").toUpperCase(), 35, y);
     
     doc.setFont("helvetica", "bold");
     doc.text(`FECHA:`, 140, y);
     doc.setFont("helvetica", "normal");
     doc.text(getSafeDateString(order), 155, y);
     
     y += 7;
     doc.setFont("helvetica", "bold");
     doc.text(`CLIENTE:`, 14, y);
     doc.setFont("helvetica", "normal");
     doc.text(order.clientName.toUpperCase(), 35, y);

     autoTable(doc, {
         startY: y + 10,
         head: [['Total Jabas', 'Total Pollos', 'Bruto (kg)', 'Tara (kg)', 'Mort. (kg)', 'Neto (kg)']],
         body: [
             [t.qF, t.bF, t.wF.toFixed(1), t.wE.toFixed(1), t.wM.toFixed(1), t.net.toFixed(1)]
         ],
         theme: 'grid',
         headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' }
     });

     autoTable(doc, {
         startY: (doc as any).lastAutoTable.finalY + 10,
         head: [['Finanzas', 'Monto']],
         body: [
             ['Precio por Kg', `S/ ${order.pricePerKg.toFixed(2)}`],
             ['Total Facturado', `S/ ${t.totalAmount.toFixed(2)}`],
             ['Total Abonado', `S/ ${t.totalPaid.toFixed(2)}`],
             ['Saldo Restante', `S/ ${t.balance.toFixed(2)}`]
         ],
         theme: 'grid',
         headStyles: { fillColor: [30, 41, 59] }
     });

     // Detalle de pesadas en A4
     const records = order.records || [];
     if (records.length > 0) {
       let curY = (doc as any).lastAutoTable.finalY + 12;
       if (curY > 240) { doc.addPage(); addAppWatermarkToPdf(doc); curY = 20; }
       doc.setFontSize(12).setFont("helvetica", "bold");
       doc.text("DESGLOSE DE PESADAS", 14, curY);
       curY += 4;

       const fullRecords = records.filter(r => r.type === 'FULL');
       const emptyRecords = records.filter(r => r.type === 'EMPTY');
       const mortRecords = records.filter(r => r.type === 'MORTALITY');

       if (fullRecords.length > 0) {
         curY = renderCategoryGridA4(doc, order.weighingMode === WeighingType.SOLO_POLLO ? "SACOS" : "JABAS LLENAS", fullRecords, t.wF, t.qF, curY);
       }
       if (emptyRecords.length > 0) {
         curY = renderCategoryGridA4(doc, "JABAS VACÍAS", emptyRecords, t.wE, t.qE, curY + 6);
       }
       if (mortRecords.length > 0) {
         curY = renderCategoryGridA4(doc, "MORTALIDAD", mortRecords, t.wM, t.qM, curY + 6);
       }
     }

     drawA4Signatures(doc, [order], (doc as any).lastAutoTable.finalY);
     handlePDFOutput(doc, `ReporteA4_${order.clientName.replace(/\s+/g, '_')}.pdf`);
  };

  const generateMonthlyDetailedTicketPDF = (group: ClientGroup, month: string, stats: { totalDue: number, totalPaid: number, balance: number, net: number, orders: ClientOrder[] }) => {
    const branding = getEffectiveBranding({} as any, user);
    const dummyDoc = new jsPDF({ unit: 'mm', format: [80, 20000] });
    
    const renderContent = (targetDoc: any) => {
      let y = 8;
      if (branding.logoUrl) {
        y = addLogoToPdf(targetDoc, branding.logoUrl, { maxWidth: 22, maxHeight: 22, defaultX: 29, y });
      }
      targetDoc.setFontSize(11).setFont("helvetica", "bold");
      const splitTitle = targetDoc.splitTextToSize(branding.companyName.toUpperCase(), 70);
      splitTitle.forEach((line: string) => {
        targetDoc.text(line, 40, y, { align: 'center' });
        y += 4;
      });
      targetDoc.setFontSize(8).setFont("helvetica", "bold");
      targetDoc.text("TICKET DETALLADO DE PESAS", 40, y, { align: 'center' });
      y += 3.5;
      targetDoc.setFontSize(7).setFont("helvetica", "normal");
      targetDoc.text(`MES: ${month.toUpperCase()}`, 40, y, { align: 'center' });
      y += 3.5;
      targetDoc.text(`EMISIÓN: ${new Date().toLocaleDateString()}`, 40, y, { align: 'center' });
      y += 2;

      targetDoc.setLineWidth(0.3);
      targetDoc.line(5, y, 75, y);
      y += 4;

      targetDoc.setFontSize(7.5).setFont("helvetica", "bold");
      targetDoc.text("CLIENTE:", 5, y);
      targetDoc.setFont("helvetica", "normal");
      targetDoc.text(group.clientName.toUpperCase(), 25, y);
      y += 3.5;
      if (group.clientDni) {
        targetDoc.setFont("helvetica", "bold");
        targetDoc.text("DNI/RUC:", 5, y);
        targetDoc.setFont("helvetica", "normal");
        targetDoc.text(group.clientDni, 25, y);
        y += 3.5;
      }
      targetDoc.setFont("helvetica", "bold");
      targetDoc.text("CANT. ÓRDENES:", 5, y);
      targetDoc.setFont("helvetica", "normal");
      targetDoc.text(`${stats.orders.length}`, 25, y);
      y += 4;

      // Resumen acumulado de cantidades
      let totalQF = 0, totalBF = 0, totalQE = 0, totalQM = 0, totalWF = 0, totalWE = 0, totalWM = 0;
      stats.orders.forEach(o => {
        const oT = calculateTotals(o);
        totalQF += oT.qF;
        totalBF += oT.bF;
        totalQE += oT.qE;
        totalQM += oT.qM;
        totalWF += oT.wF;
        totalWE += oT.wE;
        totalWM += oT.wM;
      });

      autoTable(targetDoc, {
        startY: y,
        head: [[{ content: 'RESUMEN DE CARGA DEL MES', colSpan: 2, styles: { halign: 'center', fillColor: [220, 226, 230], textColor: 0 } }]],
        body: [
          ['Jabas Llenas Totales:', totalQF.toString()],
          ['Total Pollos:', totalBF.toString()],
          ['Jabas Vacías Totales:', totalQE.toString()],
          ['Total Muertos:', totalQM.toString()],
          ['Peso Bruto Total:', `${totalWF.toFixed(1)} kg`],
          ['Tara Total:', `${totalWE.toFixed(1)} kg`],
          ['Merma Muertos:', `${totalWM.toFixed(1)} kg`],
          ['PESO NETO TOTAL MES:', `${stats.net.toFixed(1)} kg`]
        ],
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 1 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 }, 1: { halign: 'right', cellWidth: 28 } },
        margin: { left: 5, right: 5 }
      });
      y = (targetDoc as any).lastAutoTable.finalY + 4;

      // Detalle de pesos
      targetDoc.setFontSize(8.5).setFont("helvetica", "bold");
      targetDoc.text("DETALLE DE PESAS POR ORDEN", 40, y, { align: 'center' });
      y += 3;

      y = renderTicketWeightsForOrders(targetDoc, stats.orders, y);

      // Totales financieros del mes
      autoTable(targetDoc, {
        startY: y,
        head: [[{ content: 'TOTALES FINANCIEROS DEL MES', colSpan: 2, styles: { halign: 'center', fillColor: [220, 226, 230], textColor: 0 } }]],
        body: [
          ['Total Facturado Mes:', `S/ ${stats.totalDue.toFixed(2)}`],
          ['Total Abonado Mes:', `S/ ${stats.totalPaid.toFixed(2)}`],
          ['Saldo Pendiente Mes:', `S/ ${stats.balance.toFixed(2)}`]
        ],
        theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 1.2 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 }, 1: { halign: 'right', cellWidth: 28 } },
        margin: { left: 5, right: 5 }
      });
      y = (targetDoc as any).lastAutoTable.finalY + 3;

      y = renderTicketSignatures(targetDoc, stats.orders, y);
      return y;
    };

    const finalY = renderContent(dummyDoc);
    const doc = new jsPDF({ unit: 'mm', format: [80, Math.max(140, finalY)] });
    renderContent(doc);
    handlePDFOutput(doc, `TicketPesas_${month}_${group.clientName.replace(/\s+/g, '_')}.pdf`);
  };

  const generateMonthlySummaryTicketPDF = (group: ClientGroup, month: string, stats: { totalDue: number, totalPaid: number, balance: number, net: number, orders: ClientOrder[] }) => {
    const branding = getEffectiveBranding({} as any, user);
    const dummyDoc = new jsPDF({ unit: 'mm', format: [80, 20000] });

    const renderContent = (targetDoc: any) => {
      let y = 8;
      if (branding.logoUrl) {
        y = addLogoToPdf(targetDoc, branding.logoUrl, { maxWidth: 22, maxHeight: 22, defaultX: 29, y });
      }
      targetDoc.setFontSize(11).setFont("helvetica", "bold");
      const splitTitle = targetDoc.splitTextToSize(branding.companyName.toUpperCase(), 70);
      splitTitle.forEach((line: string) => {
        targetDoc.text(line, 40, y, { align: 'center' });
        y += 4;
      });
      targetDoc.setFontSize(8).setFont("helvetica", "bold");
      targetDoc.text("TICKET DE RESUMEN MENSUAL", 40, y, { align: 'center' });
      y += 3.5;
      targetDoc.setFontSize(7).setFont("helvetica", "normal");
      targetDoc.text(`MES: ${month.toUpperCase()}`, 40, y, { align: 'center' });
      y += 3.5;
      targetDoc.text(`EMISIÓN: ${new Date().toLocaleDateString()}`, 40, y, { align: 'center' });
      y += 2;

      targetDoc.setLineWidth(0.3);
      targetDoc.line(5, y, 75, y);
      y += 4;

      targetDoc.setFontSize(7.5).setFont("helvetica", "bold");
      targetDoc.text("CLIENTE:", 5, y);
      targetDoc.setFont("helvetica", "normal");
      targetDoc.text(group.clientName.toUpperCase(), 25, y);
      y += 3.5;
      if (group.clientDni) {
        targetDoc.setFont("helvetica", "bold");
        targetDoc.text("DNI/RUC:", 5, y);
        targetDoc.setFont("helvetica", "normal");
        targetDoc.text(group.clientDni, 25, y);
        y += 3.5;
      }
      targetDoc.setFont("helvetica", "bold");
      targetDoc.text("ÓRDENES:", 5, y);
      targetDoc.setFont("helvetica", "normal");
      targetDoc.text(`${stats.orders.length} pesajes realizados`, 25, y);
      y += 4;

      let totalQF = 0, totalBF = 0, totalQE = 0, totalQM = 0, totalWF = 0, totalWE = 0, totalWM = 0;
      stats.orders.forEach(o => {
        const oT = calculateTotals(o);
        totalQF += oT.qF;
        totalBF += oT.bF;
        totalQE += oT.qE;
        totalQM += oT.qM;
        totalWF += oT.wF;
        totalWE += oT.wE;
        totalWM += oT.wM;
      });

      const avgNet = totalBF > 0 ? stats.net / totalBF : 0;
      const avgMort = totalQM > 0 ? totalWM / totalQM : 0;
      const avgFullCrate = totalQF > 0 ? totalWF / totalQF : 0;
      const avgEmptyCrate = totalQE > 0 ? totalWE / totalQE : 0;

      autoTable(targetDoc, {
        startY: y,
        head: [['DETALLE DE CARGA', 'JABAS', 'POLLOS', 'PESO KG']],
        body: [
          ['Jabas Llenas', totalQF.toString(), totalBF.toString(), totalWF.toFixed(1)],
          ['Jabas Vacías', totalQE.toString(), '-', `-${totalWE.toFixed(1)}`],
          ['Pollos Muertos', '-', totalQM.toString(), `-${totalWM.toFixed(1)}`],
          ['Pollos Vivos', totalQF.toString(), (totalBF - totalQM).toString(), stats.net.toFixed(1)]
        ],
        theme: 'grid',
        headStyles: { fillColor: [220, 226, 230], textColor: 0, fontSize: 6.5, fontStyle: 'bold', halign: 'center' },
        styles: { fontSize: 6.5, cellPadding: 1, halign: 'center' },
        columnStyles: { 0: { halign: 'left', fontStyle: 'bold', cellWidth: 26 }, 3: { halign: 'right', fontStyle: 'bold', cellWidth: 18 } },
        margin: { left: 5, right: 5 }
      });
      y = (targetDoc as any).lastAutoTable.finalY + 3;

      autoTable(targetDoc, {
        startY: y,
        head: [['PROMEDIOS CALCULADOS', 'VALOR']],
        body: [
          ['Promedio Jaba Llena', `${avgFullCrate.toFixed(2)} kg`],
          ['Promedio Jaba Vacía', `${avgEmptyCrate.toFixed(2)} kg`],
          ['Promedio Pollo Vivo', `${avgNet.toFixed(2)} kg`],
          ['Promedio Pollo Muerto', `${avgMort.toFixed(2)} kg`]
        ],
        theme: 'grid',
        headStyles: { fillColor: [220, 226, 230], textColor: 0, fontSize: 6.5, fontStyle: 'bold', halign: 'center' },
        styles: { fontSize: 6.5, cellPadding: 1 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 }, 1: { halign: 'right', fontStyle: 'bold', cellWidth: 25 } },
        margin: { left: 5, right: 5 }
      });
      y = (targetDoc as any).lastAutoTable.finalY + 3;

      // Totales
      autoTable(targetDoc, {
        startY: y,
        head: [[{ content: 'TOTALES Y ESTADO DE CUENTA', colSpan: 2, styles: { halign: 'center', fillColor: [220, 226, 230], textColor: 0 } }]],
        body: [
          ['PESO NETO TOTAL:', `${stats.net.toFixed(1)} kg`],
          ['Total Facturado:', `S/ ${stats.totalDue.toFixed(2)}`],
          ['Total Abonado:', `S/ ${stats.totalPaid.toFixed(2)}`],
          ['SALDO PENDIENTE:', `S/ ${stats.balance.toFixed(2)}`]
        ],
        theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 1.2 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 }, 1: { halign: 'right', cellWidth: 28 } },
        margin: { left: 5, right: 5 }
      });
      y = (targetDoc as any).lastAutoTable.finalY + 3;

      y = renderTicketSignatures(targetDoc, stats.orders, y);
      return y;
    };

    const finalY = renderContent(dummyDoc);
    const doc = new jsPDF({ unit: 'mm', format: [80, Math.max(140, finalY)] });
    renderContent(doc);
    handlePDFOutput(doc, `TicketResumen_${month}_${group.clientName.replace(/\s+/g, '_')}.pdf`);
  };

  const generateClientDetailedTicketPDF = (group: ClientGroup) => {
    const branding = getEffectiveBranding({} as any, user);
    const dummyDoc = new jsPDF({ unit: 'mm', format: [80, 25000] });

    const renderContent = (targetDoc: any) => {
      let y = 8;
      if (branding.logoUrl) {
        y = addLogoToPdf(targetDoc, branding.logoUrl, { maxWidth: 22, maxHeight: 22, defaultX: 29, y });
      }
      targetDoc.setFontSize(11).setFont("helvetica", "bold");
      const splitTitle = targetDoc.splitTextToSize(branding.companyName.toUpperCase(), 70);
      splitTitle.forEach((line: string) => {
        targetDoc.text(line, 40, y, { align: 'center' });
        y += 4;
      });
      targetDoc.setFontSize(8).setFont("helvetica", "bold");
      targetDoc.text("TICKET DETALLADO DE PESAS", 40, y, { align: 'center' });
      y += 3.5;
      targetDoc.setFontSize(7).setFont("helvetica", "normal");
      targetDoc.text("HISTÓRICO GENERAL DE CLIENTE", 40, y, { align: 'center' });
      y += 3.5;
      targetDoc.text(`EMISIÓN: ${new Date().toLocaleDateString()}`, 40, y, { align: 'center' });
      y += 2;

      targetDoc.setLineWidth(0.3);
      targetDoc.line(5, y, 75, y);
      y += 4;

      targetDoc.setFontSize(7.5).setFont("helvetica", "bold");
      targetDoc.text("CLIENTE:", 5, y);
      targetDoc.setFont("helvetica", "normal");
      targetDoc.text(group.clientName.toUpperCase(), 25, y);
      y += 3.5;
      if (group.clientDni) {
        targetDoc.setFont("helvetica", "bold");
        targetDoc.text("DNI/RUC:", 5, y);
        targetDoc.setFont("helvetica", "normal");
        targetDoc.text(group.clientDni, 25, y);
        y += 3.5;
      }
      targetDoc.setFont("helvetica", "bold");
      targetDoc.text("TOTAL ÓRDENES:", 5, y);
      targetDoc.setFont("helvetica", "normal");
      targetDoc.text(`${group.orders.length}`, 25, y);
      y += 4;

      // Resumen acumulado de cantidades
      let totalQF = 0, totalBF = 0, totalQE = 0, totalQM = 0, totalWF = 0, totalWE = 0, totalWM = 0;
      group.orders.forEach(o => {
        const oT = calculateTotals(o);
        totalQF += oT.qF;
        totalBF += oT.bF;
        totalQE += oT.qE;
        totalQM += oT.qM;
        totalWF += oT.wF;
        totalWE += oT.wE;
        totalWM += oT.wM;
      });

      autoTable(targetDoc, {
        startY: y,
        head: [[{ content: 'RESUMEN HISTÓRICO DE CARGA', colSpan: 2, styles: { halign: 'center', fillColor: [220, 226, 230], textColor: 0 } }]],
        body: [
          ['Jabas Llenas Totales:', totalQF.toString()],
          ['Total Pollos:', totalBF.toString()],
          ['Jabas Vacías Totales:', totalQE.toString()],
          ['Total Muertos:', totalQM.toString()],
          ['Peso Bruto Total:', `${totalWF.toFixed(1)} kg`],
          ['Tara Total:', `${totalWE.toFixed(1)} kg`],
          ['Merma Muertos:', `${totalWM.toFixed(1)} kg`],
          ['PESO NETO TOTAL:', `${group.totalNet.toFixed(1)} kg`]
        ],
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 1 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 }, 1: { halign: 'right', cellWidth: 28 } },
        margin: { left: 5, right: 5 }
      });
      y = (targetDoc as any).lastAutoTable.finalY + 4;

      // Detalle de pesos
      targetDoc.setFontSize(8.5).setFont("helvetica", "bold");
      targetDoc.text("DETALLE DE TODAS LAS PESAS", 40, y, { align: 'center' });
      y += 3;

      y = renderTicketWeightsForOrders(targetDoc, group.orders, y);

      // Totales financieros históricos
      autoTable(targetDoc, {
        startY: y,
        head: [[{ content: 'TOTALES FINANCIEROS ACUMULADOS', colSpan: 2, styles: { halign: 'center', fillColor: [220, 226, 230], textColor: 0 } }]],
        body: [
          ['Total Facturado Histórico:', `S/ ${group.totalDue.toFixed(2)}`],
          ['Total Abonado Histórico:', `S/ ${group.totalPaid.toFixed(2)}`],
          ['Saldo Pendiente Total:', `S/ ${group.balance.toFixed(2)}`]
        ],
        theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 1.2 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 }, 1: { halign: 'right', cellWidth: 28 } },
        margin: { left: 5, right: 5 }
      });
      y = (targetDoc as any).lastAutoTable.finalY + 3;

      y = renderTicketSignatures(targetDoc, group.orders, y);
      return y;
    };

    const finalY = renderContent(dummyDoc);
    const doc = new jsPDF({ unit: 'mm', format: [80, Math.max(140, finalY)] });
    renderContent(doc);
    handlePDFOutput(doc, `TicketPesas_General_${group.clientName.replace(/\s+/g, '_')}.pdf`);
  };

  const generateClientSummaryTicketPDF = (group: ClientGroup) => {
    const branding = getEffectiveBranding({} as any, user);
    const dummyDoc = new jsPDF({ unit: 'mm', format: [80, 20000] });

    const renderContent = (targetDoc: any) => {
      let y = 8;
      if (branding.logoUrl) {
        y = addLogoToPdf(targetDoc, branding.logoUrl, { maxWidth: 22, maxHeight: 22, defaultX: 29, y });
      }
      targetDoc.setFontSize(11).setFont("helvetica", "bold");
      const splitTitle = targetDoc.splitTextToSize(branding.companyName.toUpperCase(), 70);
      splitTitle.forEach((line: string) => {
        targetDoc.text(line, 40, y, { align: 'center' });
        y += 4;
      });
      targetDoc.setFontSize(8).setFont("helvetica", "bold");
      targetDoc.text("TICKET DE RESUMEN GENERAL", 40, y, { align: 'center' });
      y += 3.5;
      targetDoc.setFontSize(7).setFont("helvetica", "normal");
      targetDoc.text("HISTÓRICO ACUMULADO", 40, y, { align: 'center' });
      y += 3.5;
      targetDoc.text(`EMISIÓN: ${new Date().toLocaleDateString()}`, 40, y, { align: 'center' });
      y += 2;

      targetDoc.setLineWidth(0.3);
      targetDoc.line(5, y, 75, y);
      y += 4;

      targetDoc.setFontSize(7.5).setFont("helvetica", "bold");
      targetDoc.text("CLIENTE:", 5, y);
      targetDoc.setFont("helvetica", "normal");
      targetDoc.text(group.clientName.toUpperCase(), 25, y);
      y += 3.5;
      if (group.clientDni) {
        targetDoc.setFont("helvetica", "bold");
        targetDoc.text("DNI/RUC:", 5, y);
        targetDoc.setFont("helvetica", "normal");
        targetDoc.text(group.clientDni, 25, y);
        y += 3.5;
      }
      targetDoc.setFont("helvetica", "bold");
      targetDoc.text("ÓRDENES:", 5, y);
      targetDoc.setFont("helvetica", "normal");
      targetDoc.text(`${group.orders.length} pesajes realizados`, 25, y);
      y += 4;

      let totalQF = 0, totalBF = 0, totalQE = 0, totalQM = 0, totalWF = 0, totalWE = 0, totalWM = 0;
      group.orders.forEach(o => {
        const oT = calculateTotals(o);
        totalQF += oT.qF;
        totalBF += oT.bF;
        totalQE += oT.qE;
        totalQM += oT.qM;
        totalWF += oT.wF;
        totalWE += oT.wE;
        totalWM += oT.wM;
      });

      const avgNet = totalBF > 0 ? group.totalNet / totalBF : 0;
      const avgMort = totalQM > 0 ? totalWM / totalQM : 0;
      const avgFullCrate = totalQF > 0 ? totalWF / totalQF : 0;
      const avgEmptyCrate = totalQE > 0 ? totalWE / totalQE : 0;

      autoTable(targetDoc, {
        startY: y,
        head: [['DETALLE DE CARGA', 'JABAS', 'POLLOS', 'PESO KG']],
        body: [
          ['Jabas Llenas', totalQF.toString(), totalBF.toString(), totalWF.toFixed(1)],
          ['Jabas Vacías', totalQE.toString(), '-', `-${totalWE.toFixed(1)}`],
          ['Pollos Muertos', '-', totalQM.toString(), `-${totalWM.toFixed(1)}`],
          ['Pollos Vivos', totalQF.toString(), (totalBF - totalQM).toString(), group.totalNet.toFixed(1)]
        ],
        theme: 'grid',
        headStyles: { fillColor: [220, 226, 230], textColor: 0, fontSize: 6.5, fontStyle: 'bold', halign: 'center' },
        styles: { fontSize: 6.5, cellPadding: 1, halign: 'center' },
        columnStyles: { 0: { halign: 'left', fontStyle: 'bold', cellWidth: 26 }, 3: { halign: 'right', fontStyle: 'bold', cellWidth: 18 } },
        margin: { left: 5, right: 5 }
      });
      y = (targetDoc as any).lastAutoTable.finalY + 3;

      autoTable(targetDoc, {
        startY: y,
        head: [['PROMEDIOS CALCULADOS', 'VALOR']],
        body: [
          ['Promedio Jaba Llena', `${avgFullCrate.toFixed(2)} kg`],
          ['Promedio Jaba Vacía', `${avgEmptyCrate.toFixed(2)} kg`],
          ['Promedio Pollo Vivo', `${avgNet.toFixed(2)} kg`],
          ['Promedio Pollo Muerto', `${avgMort.toFixed(2)} kg`]
        ],
        theme: 'grid',
        headStyles: { fillColor: [220, 226, 230], textColor: 0, fontSize: 6.5, fontStyle: 'bold', halign: 'center' },
        styles: { fontSize: 6.5, cellPadding: 1 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 }, 1: { halign: 'right', fontStyle: 'bold', cellWidth: 25 } },
        margin: { left: 5, right: 5 }
      });
      y = (targetDoc as any).lastAutoTable.finalY + 3;

      autoTable(targetDoc, {
        startY: y,
        head: [[{ content: 'TOTALES Y ESTADO HISTÓRICO', colSpan: 2, styles: { halign: 'center', fillColor: [220, 226, 230], textColor: 0 } }]],
        body: [
          ['PESO NETO TOTAL:', `${group.totalNet.toFixed(1)} kg`],
          ['Total Facturado:', `S/ ${group.totalDue.toFixed(2)}`],
          ['Total Abonado:', `S/ ${group.totalPaid.toFixed(2)}`],
          ['SALDO PENDIENTE:', `S/ ${group.balance.toFixed(2)}`]
        ],
        theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 1.2 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 }, 1: { halign: 'right', cellWidth: 28 } },
        margin: { left: 5, right: 5 }
      });
      y = (targetDoc as any).lastAutoTable.finalY + 3;

      y = renderTicketSignatures(targetDoc, group.orders, y);
      return y;
    };

    const finalY = renderContent(dummyDoc);
    const doc = new jsPDF({ unit: 'mm', format: [80, Math.max(140, finalY)] });
    renderContent(doc);
    handlePDFOutput(doc, `TicketResumen_General_${group.clientName.replace(/\s+/g, '_')}.pdf`);
  };

  const groupOrdersByMonth = (orders: ClientOrder[]) => {
      const stats: Record<string, { totalDue: number, totalPaid: number, balance: number, net: number, orders: ClientOrder[] }> = {};
      orders.forEach(order => {
          let orderDate = new Date();
          if (order.date) {
            const d = new Date(order.date);
            if (!isNaN(d.getTime())) orderDate = d;
          } else {
            const idNum = parseInt(order.id);
            if (!isNaN(idNum)) {
                const d = new Date(idNum);
                if (!isNaN(d.getTime())) orderDate = d;
            }
          }
          const monthYear = orderDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
          if (!stats[monthYear]) {
            stats[monthYear] = { totalDue: 0, totalPaid: 0, balance: 0, net: 0, orders: [] };
          }
          const t = calculateTotals(order);
          stats[monthYear].totalDue += t.totalAmount;
          stats[monthYear].totalPaid += t.totalPaid;
          stats[monthYear].balance += t.balance;
          stats[monthYear].net += t.net;
          stats[monthYear].orders.push(order);
      });
      return stats;
  };

  const generateGeneralClientPDF = (group: ClientGroup) => {
     const doc = new jsPDF();
     let y = drawA4Header(doc, "REPORTE FINANCIERO GENERAL");
     
     doc.setFontSize(10).setFont("helvetica", "bold");
     doc.text(`CLIENTE:`, 14, y);
     doc.setFont("helvetica", "normal");
     doc.text(group.clientName.toUpperCase(), 35, y);
     
     doc.setFont("helvetica", "bold");
     doc.text(`FECHA EMISIÓN:`, 140, y);
     doc.setFont("helvetica", "normal");
     doc.text(new Date().toLocaleDateString(), 172, y);

     y += 7;
     doc.setFont("helvetica", "bold");
     doc.text(`DNI/RUC:`, 14, y);
     doc.setFont("helvetica", "normal");
     doc.text(group.clientDni || 'N/A', 35, y);

     const stats = groupOrdersByMonth(group.orders);
     const bodyData = Object.entries(stats).map(([month, s]) => [
         month.toUpperCase(),
         `${s.orders.length}`,
         `${s.net.toFixed(1)} kg`,
         `S/ ${s.totalDue.toFixed(2)}`,
         `S/ ${s.totalPaid.toFixed(2)}`,
         `S/ ${s.balance.toFixed(2)}`
     ]);

     autoTable(doc, {
         startY: y + 10,
         head: [['Mes', 'Cant. Pesas', 'Peso Neto', 'Total Facturado', 'Total Abonado', 'Saldo Deuda']],
         body: bodyData,
         theme: 'grid',
         headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
         styles: { fontSize: 9 }
     });

     autoTable(doc, {
         startY: (doc as any).lastAutoTable.finalY + 10,
         head: [['Resumen General Acumulado', 'Total']],
         body: [
             ['Total Órdenes Históricas', `${group.orders.length}`],
             ['Peso Neto Total Histórico', `${group.totalNet.toFixed(1)} kg`],
             ['Total Facturado Histórico', `S/ ${group.totalDue.toFixed(2)}`],
             ['Total Abonado Histórico', `S/ ${group.totalPaid.toFixed(2)}`],
             ['Deuda General Pendiente', `S/ ${group.balance.toFixed(2)}`]
         ],
         theme: 'grid',
         headStyles: { fillColor: [30, 41, 59] },
         styles: { fontSize: 10 }
     });

     // Desglose de pesadas por orden en el reporte general
     group.orders.forEach((order, idx) => {
        const oRecords = order.records || [];
        if (oRecords.length === 0) return;
        const oT = calculateTotals(order);
        let curY = (doc as any).lastAutoTable.finalY + 12;
        if (curY > 230) { doc.addPage(); addAppWatermarkToPdf(doc); curY = 20; }
        
        doc.setFontSize(10).setFont("helvetica", "bold");
        doc.text(`ORDEN #${idx + 1}: ${getSafeDateString(order)} - LOTE: ${getBatchName(order.batchId || '').toUpperCase()} (PESO NETO: ${oT.net.toFixed(1)} KG)`, 14, curY);
        curY += 3;

        const fullRecords = oRecords.filter(r => r.type === 'FULL');
        const emptyRecords = oRecords.filter(r => r.type === 'EMPTY');
        const mortRecords = oRecords.filter(r => r.type === 'MORTALITY');

        if (fullRecords.length > 0) {
          curY = renderCategoryGridA4(doc, order.weighingMode === WeighingType.SOLO_POLLO ? "SACOS" : "JABAS LLENAS", fullRecords, oT.wF, oT.qF, curY);
        }
        if (emptyRecords.length > 0) {
          curY = renderCategoryGridA4(doc, "JABAS VACÍAS", emptyRecords, oT.wE, oT.qE, curY + 4);
        }
        if (mortRecords.length > 0) {
          curY = renderCategoryGridA4(doc, "MORTALIDAD", mortRecords, oT.wM, oT.qM, curY + 4);
        }
     });

     drawA4Signatures(doc, group.orders, (doc as any).lastAutoTable.finalY);
     handlePDFOutput(doc, `ReporteGeneral_${group.clientName.replace(/\s+/g, '_')}.pdf`);
  };

  const generateMonthlyClientPDF = (group: ClientGroup, month: string, stats: { totalDue: number, totalPaid: number, balance: number, net: number, orders: ClientOrder[] }) => {
     const doc = new jsPDF();
     let y = drawA4Header(doc, "REPORTE FINANCIERO MENSUAL");
     
     doc.setFontSize(10).setFont("helvetica", "bold");
     doc.text(`CLIENTE:`, 14, y);
     doc.setFont("helvetica", "normal");
     doc.text(group.clientName.toUpperCase(), 35, y);
     
     doc.setFont("helvetica", "bold");
     doc.text(`FECHA EMISIÓN:`, 140, y);
     doc.setFont("helvetica", "normal");
     doc.text(new Date().toLocaleDateString(), 172, y);

     y += 7;
     doc.setFont("helvetica", "bold");
     doc.text(`MES LÍQ:`, 14, y);
     doc.setFont("helvetica", "normal");
     doc.text(month.toUpperCase(), 35, y);

     const bodyData = stats.orders.map(o => {
         const d = getSafeDateString(o);
         const t = calculateTotals(o);
         return [
             d,
             getBatchName(o.batchId || ""),
             `${t.net.toFixed(1)} kg`,
             `S/ ${o.pricePerKg.toFixed(2)}`,
             `S/ ${t.totalAmount.toFixed(2)}`,
             `S/ ${t.totalPaid.toFixed(2)}`,
             `S/ ${t.balance.toFixed(2)}`
         ];
     });

     autoTable(doc, {
         startY: y + 10,
         head: [['Fecha', 'Lote', 'Neto (kg)', 'Precio/kg', 'Deuda/Costo', 'Abonado', 'Saldo']],
         body: bodyData,
         theme: 'grid',
         headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
         styles: { fontSize: 8 },
         margin: { left: 14, right: 14 }
     });

     autoTable(doc, {
         startY: (doc as any).lastAutoTable.finalY + 10,
         head: [['Resumen del Mes', 'Monto / Peso']],
         body: [
             ['Total Peso Neto Mes', `${stats.net.toFixed(1)} kg`],
             ['Total Facturado Mes', `S/ ${stats.totalDue.toFixed(2)}`],
             ['Total Abonado Mes', `S/ ${stats.totalPaid.toFixed(2)}`],
             ['Saldo Restante del Mes', `S/ ${stats.balance.toFixed(2)}`]
         ],
         theme: 'grid',
         headStyles: { fillColor: [30, 41, 59] },
         styles: { fontSize: 10 },
         margin: { left: 14, right: 14 }
     });

     // Detalle de pesadas por orden en el reporte mensual A4
     stats.orders.forEach((order, idx) => {
        const oRecords = order.records || [];
        if (oRecords.length === 0) return;
        const oT = calculateTotals(order);
        let curY = (doc as any).lastAutoTable.finalY + 12;
        if (curY > 230) { doc.addPage(); addAppWatermarkToPdf(doc); curY = 20; }
        
        doc.setFontSize(10).setFont("helvetica", "bold");
        doc.text(`ORDEN #${idx + 1}: ${getSafeDateString(order)} - LOTE: ${getBatchName(order.batchId || '').toUpperCase()} (PESO NETO: ${oT.net.toFixed(1)} KG)`, 14, curY);
        curY += 3;

        const fullRecords = oRecords.filter(r => r.type === 'FULL');
        const emptyRecords = oRecords.filter(r => r.type === 'EMPTY');
        const mortRecords = oRecords.filter(r => r.type === 'MORTALITY');

        if (fullRecords.length > 0) {
          curY = renderCategoryGridA4(doc, order.weighingMode === WeighingType.SOLO_POLLO ? "SACOS" : "JABAS LLENAS", fullRecords, oT.wF, oT.qF, curY);
        }
        if (emptyRecords.length > 0) {
          curY = renderCategoryGridA4(doc, "JABAS VACÍAS", emptyRecords, oT.wE, oT.qE, curY + 4);
        }
        if (mortRecords.length > 0) {
          curY = renderCategoryGridA4(doc, "MORTALIDAD", mortRecords, oT.wM, oT.qM, curY + 4);
        }
     });

     drawA4Signatures(doc, stats.orders, (doc as any).lastAutoTable.finalY);
     handlePDFOutput(doc, `Liquidacion_${month}_${group.clientName.replace(/\s+/g, '_')}.pdf`);
  };

  const getBatchName = (batchId: string) => {
    if (batchId === 'direct-sales') return 'Ventas Directas';
    const b = getBatches().find(b => b.id === batchId);
    return b ? b.name : batchId;
  };
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

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowDetailModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
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
    const orderDate = getSafeDateString(order);
    
    let msg = `*TICKET DE PESAJE - AVICONTROL*

`;
    msg += `*Cliente:* ${order.clientName}
`;
    msg += `*Fecha:* ${orderDate}
`;
    msg += `*Lote:* ${getBatchName(order.batchId || "")}

`;
    
    msg += `*RESUMEN DE PESO*
`;
    msg += `- Jabas Llenas: ${t.qF}
`;
    msg += `- Pollos: ${t.bF}
`;
    msg += `- Jabas Vacías: ${t.qE}
`;
    msg += `- Mortalidad: ${t.qM} pollos
`;
    msg += `- Cojos: ${t.qLame} pollos

`;
    
    msg += `*KILOS*
`;
    msg += `- Bruto: ${t.wF.toFixed(1)} kg
`;
    msg += `- Tara: ${t.wE.toFixed(1)} kg
`;
    msg += `- Merma Muertos: ${t.wM.toFixed(1)} kg
`;
    msg += `- *NETO TOTAL: ${t.net.toFixed(1)} kg*

`;
    
    msg += `*FINANCIERO*
`;
    msg += `- Precio/Kg: S/ ${order.pricePerKg.toFixed(2)}
`;
    msg += `- Importe Total: S/ ${t.totalAmount.toFixed(2)}
`;
    if (t.totalPaid > 0) {
      msg += `- Abonado: S/ ${t.totalPaid.toFixed(2)}
`;
    }
    msg += `- *Saldo Restante: S/ ${t.balance.toFixed(2)}*

`;
    
    msg += `Gracias por su compra.`;
    
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
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
             let orderDate = new Date();
             if (order.date) {
                const d = new Date(order.date);
                if (!isNaN(d.getTime())) orderDate = d;
             } else {
                const idNum = parseInt(order.id);
                if (!isNaN(idNum)) {
                   const d = new Date(idNum);
                   if (!isNaN(d.getTime())) orderDate = d;
                }
             }
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
                className={`p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-inner bg-blue-100 text-blue-600`}>
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
                    <p className={`font-digital font-bold text-sm md:text-base ${isFullyPaid ? 'text-emerald-600' : 'text-red-600'}`}>
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
                  
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm mb-4">
                     <button 
                         onClick={() => toggleClientExpansion(group.clientName)} 
                         className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-black uppercase tracking-wider transition-all shadow-sm"
                     >
                         <ArrowLeft size={14} /> Volver a Todos los Clientes
                     </button>
                     <div className="flex items-center gap-2 flex-wrap">
                       <button 
                           onClick={(e) => { e.stopPropagation(); generateClientDetailedTicketPDF(group); }} 
                           className="bg-blue-900 text-white px-3 py-2 rounded-lg font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-blue-800 shadow-sm transition-all"
                           title="Ticket 80mm con todas las pesas del cliente"
                       >
                           <Scale size={13} /> Ticket Pesas Cliente
                       </button>
                       <button 
                           onClick={(e) => { e.stopPropagation(); generateClientSummaryTicketPDF(group); }} 
                           className="bg-indigo-800 text-white px-3 py-2 rounded-lg font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-indigo-700 shadow-sm transition-all"
                           title="Ticket 80mm con resumen general del cliente"
                       >
                           <Receipt size={13} /> Ticket Resumen Cliente
                       </button>
                       <button 
                           onClick={(e) => { e.stopPropagation(); generateGeneralClientPDF(group); }} 
                           className="bg-slate-900 text-white px-3 py-2 rounded-lg font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-slate-800 shadow-sm transition-all"
                           title="Reporte A4 General con todas las pesas y finanzas"
                       >
                           <Download size={13} /> Reporte General A4
                       </button>
                     </div>
                  </div>
                  {/* Monthly Breakdowns */}

                  {Object.entries(monthlyStats).map(([month, stats]) => (
                    
                    <div key={month} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                      <div className="bg-slate-100/80 p-3 border-b border-slate-200 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                         <div className="flex flex-col gap-1">
                             <h4 className="font-black text-slate-800 uppercase text-[11px] tracking-wider capitalize">{month}</h4>
                             <div className="flex flex-wrap gap-4">
                               <span className="text-[10px] font-bold text-slate-500 uppercase">Peso Mes: <span className="text-slate-800">{stats.net.toFixed(1)} kg</span></span>
                               <span className="text-[10px] font-bold text-slate-500 uppercase">Facturado: <span className="text-slate-800">S/. {stats.totalDue.toFixed(2)}</span></span>
                               <span className="text-[10px] font-bold text-slate-500 uppercase">Deuda Mes: <span className={`${stats.balance <= 0.05 ? 'text-emerald-600' : 'text-red-600'}`}>S/. {stats.balance.toFixed(2)}</span></span>
                             </div>
                         </div>
                         <div className="flex items-center gap-2 flex-wrap self-start md:self-auto">
                           <button 
                               onClick={(e) => { e.stopPropagation(); generateMonthlyDetailedTicketPDF(group, month, stats); }}
                               className="bg-blue-800 text-white px-2.5 py-1.5 rounded-lg font-black text-[9px] uppercase tracking-wider flex items-center justify-center gap-1 hover:bg-blue-900 shadow-sm transition-all whitespace-nowrap"
                               title="Ticket 80mm con todas las pesas del mes"
                           >
                               <Scale size={12} /> Ticket Pesas Mes
                           </button>
                           <button 
                               onClick={(e) => { e.stopPropagation(); generateMonthlySummaryTicketPDF(group, month, stats); }}
                               className="bg-indigo-700 text-white px-2.5 py-1.5 rounded-lg font-black text-[9px] uppercase tracking-wider flex items-center justify-center gap-1 hover:bg-indigo-800 shadow-sm transition-all whitespace-nowrap"
                               title="Ticket 80mm con resumen de cargas del mes"
                           >
                               <Receipt size={12} /> Ticket Resumen Mes
                           </button>
                           <button 
                               onClick={(e) => { e.stopPropagation(); generateMonthlyClientPDF(group, month, stats); }}
                               className="bg-slate-800 text-white px-2.5 py-1.5 rounded-lg font-black text-[9px] uppercase tracking-wider flex items-center justify-center gap-1 hover:bg-slate-900 shadow-sm transition-all whitespace-nowrap"
                               title="Reporte A4 Financiero del Mes con Pesas"
                           >
                               <Printer size={12} /> Reporte A4 Mes
                           </button>
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
                              const batchName = getBatchName(order.batchId || "");
                              const orderDate = getSafeDateString(order);

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
                                    <div className="flex items-center justify-center gap-1">
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); generateTicketPDF(order, true); }}
                                        className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-900 rounded-lg border border-blue-200 transition-colors"
                                        title="Ticket Pesas (Detallado con todas las pesas)"
                                      >
                                        <Scale size={13} />
                                      </button>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); generateSummaryTicketPDF(order, true); }}
                                        className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 rounded-lg border border-indigo-200 transition-colors"
                                        title="Ticket Resumen (Carga y Promedios)"
                                      >
                                        <Receipt size={13} />
                                      </button>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); generateSalesTicketPDF(order, true); }}
                                        className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 rounded-lg border border-emerald-200 transition-colors"
                                        title="Ticket Venta"
                                      >
                                        <DollarSign size={13} />
                                      </button>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); generateA4ClientPDF(order); }}
                                        className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-300 transition-colors"
                                        title="Reporte A4 Completo"
                                      >
                                        <Printer size={13} />
                                      </button>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); setShowDetailModal(order); }}
                                        className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[9px] font-black uppercase flex items-center gap-1 shadow-sm transition-colors"
                                        title="Ver Detalle Pesadas en Pantalla"
                                      >
                                        <Eye size={11} /> Detalle
                                      </button>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); shareViaWhatsApp(order); }}
                                        className="p-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg border border-green-200 transition-colors"
                                        title="WhatsApp"
                                      >
                                        <Share2 size={13} />
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
                  
                  <div className="flex justify-start pt-2 border-t border-slate-200">
                    <button 
                      onClick={() => toggleClientExpansion(group.clientName)} 
                      className="flex items-center gap-2 px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm"
                    >
                      <ArrowLeft size={14} /> Volver al Listado de Clientes
                    </button>
                  </div>
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
        <div 
          onClick={() => setShowDetailModal(null)}
          className="fixed inset-0 bg-slate-950/80 z-50 backdrop-blur-sm overflow-y-auto p-2 sm:p-4 md:p-6 flex justify-center items-start animate-fade-in"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl p-4 sm:p-7 w-full max-w-4xl shadow-2xl border border-slate-200 text-left my-2 sm:my-6 relative"
          >
            {/* Sticky Top Header with Guaranteed Navigation */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-md z-30 pt-1 pb-3 mb-5 border-b border-slate-100 flex items-center justify-between gap-3 -mx-4 sm:-mx-7 px-4 sm:px-7">
              <button 
                onClick={() => setShowDetailModal(null)} 
                className="flex items-center gap-2 px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-md transition-all active:scale-95 cursor-pointer"
                title="Volver al Reporte"
              >
                <ArrowLeft size={16} /> Volver al Reporte
              </button>

              <div className="flex items-center gap-2">
                <span className="hidden sm:inline text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Esc para cerrar
                </span>
                <button 
                  onClick={() => setShowDetailModal(null)} 
                  className="p-2 bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 rounded-xl transition-all active:scale-90 cursor-pointer"
                  title="Cerrar ventana"
                >
                  <X size={20}/>
                </button>
              </div>
            </div>

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

            <div className="mt-8 flex flex-wrap justify-between items-center gap-3 border-t border-slate-100 pt-5">
              <button 
                onClick={() => setShowDetailModal(null)} 
                className="bg-blue-900 hover:bg-blue-800 text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md active:scale-95 flex items-center gap-2 cursor-pointer"
              >
                <ArrowLeft size={16}/> Volver al Reporte
              </button>

              <div className="flex items-center gap-2 flex-wrap">
                <button 
                  onClick={() => generateTicketPDF(showDetailModal, true)}
                  className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-900 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 border border-blue-200 shadow-sm transition-all"
                  title="Ticket 80mm con desglose completo de pesas"
                >
                  <Scale size={14} /> Ticket Pesas
                </button>
                <button 
                  onClick={() => generateSummaryTicketPDF(showDetailModal, true)}
                  className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 border border-indigo-200 shadow-sm transition-all"
                  title="Ticket 80mm con resumen y promedios"
                >
                  <Receipt size={14} /> Ticket Resumen
                </button>
                <button 
                  onClick={() => generateSalesTicketPDF(showDetailModal, true)}
                  className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 border border-emerald-200 shadow-sm transition-all"
                  title="Ticket Venta"
                >
                  <DollarSign size={14} /> Ticket Venta
                </button>
                <button 
                  onClick={() => generateA4ClientPDF(showDetailModal)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-black uppercase flex items-center gap-1.5 shadow-sm transition-all"
                  title="Reporte A4 Completo con pesadas y firmas"
                >
                  <Printer size={14} /> Reporte A4
                </button>
                <button 
                  onClick={() => setShowDetailModal(null)} 
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-sm active:scale-95 flex items-center gap-1.5 cursor-pointer"
                >
                  <X size={15}/> Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;

const fs = require('fs');
let content = fs.readFileSync('components/pages/Reports.tsx', 'utf-8');

const stubsStart = content.indexOf('const generateTicketPDF = (order: ClientOrder, show: boolean = false) => {');
const stubsEnd = content.indexOf('const getBatchName =');

if (stubsStart === -1 || stubsEnd === -1) {
    console.error("Could not find stubs");
    process.exit(1);
}

const newPdfs = `
  const drawTicketHeader = (doc: any, title: string) => {
    const branding = getEffectiveBranding({} as any, user);
    addAppWatermarkToPdf(doc);
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
    doc.text(title, 40, y, { align: 'center' });
    y += 6;
    return y;
  };

  const drawTicketSignatures = (doc: any, order: ClientOrder, y: number) => {
    y += 10;
    const batch = batches.find(b => b.id === order.batchId);
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
    // Firma Cliente
    doc.line(44, y, 75, y);
    doc.text("CLIENTE / RECIBE", 59.5, y + 3, { align: 'center' });
  };

  const generateTicketPDF = (order: ClientOrder, show: boolean = false) => {
     const doc = new jsPDF({ unit: 'mm', format: [80, 250] });
     let y = drawTicketHeader(doc, "TICKET DETALLADO");
     const t = calculateTotals(order);
     doc.setFontSize(9).setFont("helvetica", "normal");
     doc.text(\`Cliente: \${order.clientName}\`, 5, y); y += 5;
     doc.text(\`Fecha: \${getSafeDateString(order)}\`, 5, y); y += 8;

     autoTable(doc, {
         startY: y,
         head: [['Llenas', 'Vacías', 'Muertos']],
         body: [
             [\`\${t.wF.toFixed(1)} kg\`, \`\${t.wE.toFixed(1)} kg\`, \`\${t.wM.toFixed(1)} kg\`]
         ],
         theme: 'grid',
         styles: { fontSize: 8, cellPadding: 2, halign: 'center' }
     });
     y = (doc as any).lastAutoTable.finalY + 10;

     doc.setFont("helvetica", "bold");
     doc.text(\`PESO NETO: \${t.net.toFixed(1)} kg\`, 5, y);
     
     drawTicketSignatures(doc, order, y + 5);
     handlePDFOutput(doc, \`Ticket_\${order.clientName}.pdf\`);
  };

  const generateSalesTicketPDF = (order: ClientOrder, show: boolean = false) => {
     const doc = new jsPDF({ unit: 'mm', format: [80, 200] });
     let y = drawTicketHeader(doc, "TICKET DE VENTA");
     const t = calculateTotals(order);
     
     doc.setFontSize(9).setFont("helvetica", "normal");
     doc.text(\`Cliente: \${order.clientName}\`, 5, y); y += 5;
     doc.text(\`Fecha: \${getSafeDateString(order)}\`, 5, y); y += 8;

     autoTable(doc, {
         startY: y,
         head: [['Concepto', 'Total']],
         body: [
             ['Peso Neto', \`\${t.net.toFixed(1)} kg\`],
             ['Precio / Kg', \`S/ \${order.pricePerKg.toFixed(2)}\`],
             ['TOTAL', \`S/ \${t.totalAmount.toFixed(2)}\`]
         ],
         theme: 'grid',
         styles: { fontSize: 8, cellPadding: 2 }
     });
     y = (doc as any).lastAutoTable.finalY + 5;
     drawTicketSignatures(doc, order, y);
     handlePDFOutput(doc, \`Venta_\${order.clientName}.pdf\`);
  };

  const generateSummaryTicketPDF = (order: ClientOrder, show: boolean = false) => {
     const doc = new jsPDF({ unit: 'mm', format: [80, 180] });
     let y = drawTicketHeader(doc, "RESUMEN DE PESAJE");
     const t = calculateTotals(order);
     
     doc.setFontSize(9).setFont("helvetica", "normal");
     doc.text(\`Cliente: \${order.clientName}\`, 5, y); y += 5;
     doc.text(\`Fecha: \${getSafeDateString(order)}\`, 5, y); y += 8;

     doc.text(\`Total Pollos: \${t.bF}\`, 5, y); y += 5;
     doc.text(\`Jabas: \${t.qF}\`, 5, y); y += 5;
     doc.text(\`Peso Neto: \${t.net.toFixed(1)} kg\`, 5, y); y += 10;

     drawTicketSignatures(doc, order, y);
     handlePDFOutput(doc, \`Resumen_\${order.clientName}.pdf\`);
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
       const b = batches.find(bx => bx.id === o.batchId);
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

  const generateA4ClientPDF = (order: ClientOrder) => {
     const doc = new jsPDF();
     let y = drawA4Header(doc, "REPORTE DETALLADO DE PESAJE");
     const t = calculateTotals(order);
     
     doc.setFontSize(10).setFont("helvetica", "bold");
     doc.text(\`LOTE:\`, 14, y);
     doc.setFont("helvetica", "normal");
     doc.text(getBatchName(order.batchId || "").toUpperCase(), 35, y);
     
     doc.setFont("helvetica", "bold");
     doc.text(\`FECHA:\`, 140, y);
     doc.setFont("helvetica", "normal");
     doc.text(getSafeDateString(order), 155, y);
     
     y += 7;
     doc.setFont("helvetica", "bold");
     doc.text(\`CLIENTE:\`, 14, y);
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
         startY: (doc as any).lastAutoTable.finalY + 15,
         head: [['Finanzas', 'Monto']],
         body: [
             ['Precio por Kg', \`S/ \${order.pricePerKg.toFixed(2)}\`],
             ['Total Facturado', \`S/ \${t.totalAmount.toFixed(2)}\`],
             ['Total Abonado', \`S/ \${t.totalPaid.toFixed(2)}\`],
             ['Saldo Restante', \`S/ \${t.balance.toFixed(2)}\`]
         ],
         theme: 'grid',
         headStyles: { fillColor: [30, 41, 59] }
     });

     drawA4Signatures(doc, [order], (doc as any).lastAutoTable.finalY);
     handlePDFOutput(doc, \`ReporteA4_\${order.clientName}.pdf\`);
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
     doc.text(\`CLIENTE:\`, 14, y);
     doc.setFont("helvetica", "normal");
     doc.text(group.clientName.toUpperCase(), 35, y);
     
     doc.setFont("helvetica", "bold");
     doc.text(\`FECHA EMISIÓN:\`, 140, y);
     doc.setFont("helvetica", "normal");
     doc.text(new Date().toLocaleDateString(), 172, y);

     y += 7;
     doc.setFont("helvetica", "bold");
     doc.text(\`DNI/RUC:\`, 14, y);
     doc.setFont("helvetica", "normal");
     doc.text(group.clientDni || 'N/A', 35, y);

     const stats = groupOrdersByMonth(group.orders);
     const bodyData = Object.entries(stats).map(([month, s]) => [
         month.toUpperCase(),
         \`\${s.orders.length}\`,
         \`\${s.net.toFixed(1)} kg\`,
         \`S/ \${s.totalDue.toFixed(2)}\`,
         \`S/ \${s.totalPaid.toFixed(2)}\`,
         \`S/ \${s.balance.toFixed(2)}\`
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
             ['Total Órdenes Históricas', \`\${group.orders.length}\`],
             ['Peso Neto Total Histórico', \`\${group.totalNet.toFixed(1)} kg\`],
             ['Total Facturado Histórico', \`S/ \${group.totalDue.toFixed(2)}\`],
             ['Total Abonado Histórico', \`S/ \${group.totalPaid.toFixed(2)}\`],
             ['Deuda General Pendiente', \`S/ \${group.balance.toFixed(2)}\`]
         ],
         theme: 'grid',
         headStyles: { fillColor: [30, 41, 59] },
         styles: { fontSize: 10 }
     });

     drawA4Signatures(doc, group.orders, (doc as any).lastAutoTable.finalY);
     handlePDFOutput(doc, \`ReporteGeneral_\${group.clientName.replace(/\\s+/g, '_')}.pdf\`);
  };

  const generateMonthlyClientPDF = (group: ClientGroup, month: string, stats: { totalDue: number, totalPaid: number, balance: number, net: number, orders: ClientOrder[] }) => {
     const doc = new jsPDF();
     let y = drawA4Header(doc, "REPORTE FINANCIERO MENSUAL");
     
     doc.setFontSize(10).setFont("helvetica", "bold");
     doc.text(\`CLIENTE:\`, 14, y);
     doc.setFont("helvetica", "normal");
     doc.text(group.clientName.toUpperCase(), 35, y);
     
     doc.setFont("helvetica", "bold");
     doc.text(\`FECHA EMISIÓN:\`, 140, y);
     doc.setFont("helvetica", "normal");
     doc.text(new Date().toLocaleDateString(), 172, y);

     y += 7;
     doc.setFont("helvetica", "bold");
     doc.text(\`MES LÍQ:\`, 14, y);
     doc.setFont("helvetica", "normal");
     doc.text(month.toUpperCase(), 35, y);

     const bodyData = stats.orders.map(o => {
         const d = getSafeDateString(o);
         const t = calculateTotals(o);
         return [
             d,
             getBatchName(o.batchId || ""),
             \`\${t.net.toFixed(1)} kg\`,
             \`S/ \${o.pricePerKg.toFixed(2)}\`,
             \`S/ \${t.totalAmount.toFixed(2)}\`,
             \`S/ \${t.totalPaid.toFixed(2)}\`,
             \`S/ \${t.balance.toFixed(2)}\`
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
             ['Total Peso Neto Mes', \`\${stats.net.toFixed(1)} kg\`],
             ['Total Facturado Mes', \`S/ \${stats.totalDue.toFixed(2)}\`],
             ['Total Abonado Mes', \`S/ \${stats.totalPaid.toFixed(2)}\`],
             ['Saldo Restante del Mes', \`S/ \${stats.balance.toFixed(2)}\`]
         ],
         theme: 'grid',
         headStyles: { fillColor: [30, 41, 59] },
         styles: { fontSize: 10 },
         margin: { left: 14, right: 14 }
     });

     drawA4Signatures(doc, stats.orders, (doc as any).lastAutoTable.finalY);
     handlePDFOutput(doc, \`Liquidacion_\${month}_\${group.clientName.replace(/\\s+/g, '_')}.pdf\`);
  };
`;

content = content.substring(0, stubsStart) + newPdfs + '\n  ' + content.substring(stubsEnd);

fs.writeFileSync('components/pages/Reports.tsx', content);
console.log('Headers and signatures added');

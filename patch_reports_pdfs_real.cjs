const fs = require('fs');
let content = fs.readFileSync('components/pages/Reports.tsx', 'utf-8');

const stubsStart = content.indexOf('  const handlePDFOutput = (doc: jsPDF, filename: string) => {');
const stubsEnd = content.indexOf('const [batches, setBatches] = useState<Batch[]>([]);');

if (stubsStart === -1 || stubsEnd === -1) {
    console.error("Could not find stubs");
    process.exit(1);
}

const realPdfs = `
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

  const generateTicketPDF = (order: ClientOrder, show: boolean = false) => {
     const doc = new jsPDF({ unit: 'mm', format: [80, 250] });
     const t = calculateTotals(order);
     let y = 10;
     doc.setFontSize(12).setFont("helvetica", "bold");
     doc.text("TICKET DETALLADO", 40, y, { align: 'center' });
     y += 8;
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
     
     handlePDFOutput(doc, \`Ticket_\${order.clientName}.pdf\`);
  };

  const generateSalesTicketPDF = (order: ClientOrder, show: boolean = false) => {
     const doc = new jsPDF({ unit: 'mm', format: [80, 200] });
     const t = calculateTotals(order);
     let y = 10;
     doc.setFontSize(12).setFont("helvetica", "bold");
     doc.text("TICKET DE VENTA", 40, y, { align: 'center' });
     y += 8;
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
     
     handlePDFOutput(doc, \`Venta_\${order.clientName}.pdf\`);
  };

  const generateSummaryTicketPDF = (order: ClientOrder, show: boolean = false) => {
     const doc = new jsPDF({ unit: 'mm', format: [80, 180] });
     const t = calculateTotals(order);
     let y = 10;
     doc.setFontSize(12).setFont("helvetica", "bold");
     doc.text("RESUMEN DE PESAJE", 40, y, { align: 'center' });
     y += 8;
     doc.setFontSize(9).setFont("helvetica", "normal");
     doc.text(\`Cliente: \${order.clientName}\`, 5, y); y += 5;
     doc.text(\`Fecha: \${getSafeDateString(order)}\`, 5, y); y += 8;

     doc.text(\`Total Pollos: \${t.bF}\`, 5, y); y += 5;
     doc.text(\`Jabas: \${t.qF}\`, 5, y); y += 5;
     doc.text(\`Peso Neto: \${t.net.toFixed(1)} kg\`, 5, y); y += 5;

     handlePDFOutput(doc, \`Resumen_\${order.clientName}.pdf\`);
  };

  const generateA4ClientPDF = (order: ClientOrder) => {
     const doc = new jsPDF();
     const t = calculateTotals(order);
     doc.setFontSize(18).setFont("helvetica", "bold");
     doc.text("REPORTE DETALLADO DE PESAJE", 105, 20, { align: 'center' });
     
     doc.setFontSize(12).setFont("helvetica", "normal");
     doc.text(\`Cliente: \${order.clientName}\`, 20, 35);
     doc.text(\`Fecha: \${getSafeDateString(order)}\`, 20, 42);
     doc.text(\`Lote: \${getBatchName(order.batchId || "")}\`, 20, 49);

     autoTable(doc, {
         startY: 60,
         head: [['Total Jabas', 'Total Pollos', 'Bruto (kg)', 'Tara (kg)', 'Mort. (kg)', 'Neto (kg)']],
         body: [
             [t.qF, t.bF, t.wF.toFixed(1), t.wE.toFixed(1), t.wM.toFixed(1), t.net.toFixed(1)]
         ],
         theme: 'striped',
         headStyles: { fillColor: [30, 58, 138] }
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
         headStyles: { fillColor: [15, 23, 42] }
     });

     handlePDFOutput(doc, \`ReporteA4_\${order.clientName}.pdf\`);
  };

  `;

content = content.substring(0, stubsStart) + realPdfs + content.substring(stubsEnd);

// Fix date issues replacing toLocaleDateString
content = content.replace(/const orderDate = order\.date \? new Date\(order\.date\)\.toLocaleDateString\(\) : new Date\(parseInt\(order\.id\)\)\.toLocaleDateString\(\);/g, "const orderDate = getSafeDateString(order);");
content = content.replace(/const orderDate = order\.date \? new Date\(order\.date\) : new Date\(parseInt\(order\.id\)\);/g, `let orderDate = new Date();
             if (order.date) {
                const d = new Date(order.date);
                if (!isNaN(d.getTime())) orderDate = d;
             } else {
                const idNum = parseInt(order.id);
                if (!isNaN(idNum)) {
                   const d = new Date(idNum);
                   if (!isNaN(d.getTime())) orderDate = d;
                }
             }`);

fs.writeFileSync('components/pages/Reports.tsx', content);
console.log('Patched Reports.tsx PDFs and dates');

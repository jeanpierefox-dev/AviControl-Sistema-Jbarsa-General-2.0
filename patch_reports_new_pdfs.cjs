const fs = require('fs');
let content = fs.readFileSync('components/pages/Reports.tsx', 'utf-8');

// The new implementation for the PDF generators
const newPdfs = `
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
     doc.setFontSize(18).setFont("helvetica", "bold");
     doc.text("REPORTE FINANCIERO GENERAL", 105, 20, { align: 'center' });
     
     doc.setFontSize(10).setFont("helvetica", "normal");
     doc.text(\`Cliente: \${group.clientName}\`, 15, 30);
     doc.text(\`DNI/RUC: \${group.clientDni || 'N/A'}\`, 15, 36);
     doc.text(\`Fecha de Emisión: \${new Date().toLocaleDateString()}\`, 140, 30);

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
         startY: 45,
         head: [['Mes', 'Cant. Pesas', 'Peso Neto', 'Total Facturado', 'Total Abonado', 'Saldo Deuda']],
         body: bodyData,
         theme: 'striped',
         headStyles: { fillColor: [30, 58, 138] },
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
         headStyles: { fillColor: [15, 23, 42] },
         styles: { fontSize: 10 }
     });

     handlePDFOutput(doc, \`ReporteGeneral_\${group.clientName.replace(/\\s+/g, '_')}.pdf\`);
  };

  const generateMonthlyClientPDF = (group: ClientGroup, month: string, stats: { totalDue: number, totalPaid: number, balance: number, net: number, orders: ClientOrder[] }) => {
     const doc = new jsPDF();
     doc.setFontSize(18).setFont("helvetica", "bold");
     doc.text("REPORTE FINANCIERO MENSUAL", 105, 20, { align: 'center' });
     
     doc.setFontSize(10).setFont("helvetica", "normal");
     doc.text(\`Cliente: \${group.clientName}\`, 15, 30);
     doc.text(\`Mes de Liquidación: \${month.toUpperCase()}\`, 15, 36);
     doc.text(\`Fecha de Emisión: \${new Date().toLocaleDateString()}\`, 140, 30);

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
         startY: 45,
         head: [['Fecha', 'Lote', 'Neto (kg)', 'Precio/kg', 'Deuda/Costo', 'Abonado', 'Saldo']],
         body: bodyData,
         theme: 'striped',
         headStyles: { fillColor: [30, 58, 138] },
         styles: { fontSize: 8 },
         margin: { left: 10, right: 10 }
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
         headStyles: { fillColor: [15, 23, 42] },
         styles: { fontSize: 10 },
         margin: { left: 10, right: 10 }
     });

     handlePDFOutput(doc, \`Liquidacion_\${month}_\${group.clientName.replace(/\\s+/g, '_')}.pdf\`);
  };

`;

const startIdx = content.indexOf('const generateGeneralClientPDF');
const endIdx = content.indexOf('const getBatchName =');
if (startIdx !== -1 && endIdx !== -1) {
    content = content.substring(0, startIdx) + newPdfs + content.substring(endIdx);
} else {
    console.error('Could not find replace range');
}

// Now replace the Monthly Breakdown header to include the PDF button
const newMonthlyHeader = `
                    <div key={month} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                      <div className="bg-slate-100/80 p-3 border-b border-slate-200 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                         <div className="flex flex-col gap-1">
                             <h4 className="font-black text-slate-800 uppercase text-[11px] tracking-wider capitalize">{month}</h4>
                             <div className="flex flex-wrap gap-4">
                               <span className="text-[10px] font-bold text-slate-500 uppercase">Peso Mes: <span className="text-slate-800">{stats.net.toFixed(1)} kg</span></span>
                               <span className="text-[10px] font-bold text-slate-500 uppercase">Facturado: <span className="text-slate-800">S/. {stats.totalDue.toFixed(2)}</span></span>
                               <span className="text-[10px] font-bold text-slate-500 uppercase">Deuda Mes: <span className={\`\${stats.balance <= 0.05 ? 'text-emerald-600' : 'text-red-600'}\`}>S/. {stats.balance.toFixed(2)}</span></span>
                             </div>
                         </div>
                         <button 
                             onClick={(e) => { e.stopPropagation(); generateMonthlyClientPDF(group, month, stats); }}
                             className="bg-slate-800 text-white px-3 py-2 rounded-lg font-black text-[9px] uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-slate-900 shadow-sm transition-all whitespace-nowrap self-start md:self-auto"
                         >
                             <Printer size={12} /> Detallado del Mes
                         </button>
                      </div>
`;

content = content.replace(/<div key=\{month\} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">[\s\S]*?<\/div>\n                      <div className="overflow-x-auto">/, newMonthlyHeader + '\n                      <div className="overflow-x-auto">');

fs.writeFileSync('components/pages/Reports.tsx', content);
console.log('Done');

const fs = require('fs');
let content = fs.readFileSync('components/pages/Reports.tsx', 'utf-8');

const stubsStart = content.indexOf('const generateA4ClientPDF = (order: ClientOrder) => {');
const stubsEnd = content.indexOf('return (', stubsStart);

const newPdfMethod = `
  const generateGeneralClientPDF = (group: ClientGroup) => {
     const doc = new jsPDF();
     doc.setFontSize(18).setFont("helvetica", "bold");
     doc.text("REPORTE GENERAL DE CLIENTE", 105, 20, { align: 'center' });
     
     doc.setFontSize(12).setFont("helvetica", "normal");
     doc.text(\`Cliente: \${group.clientName}\`, 20, 35);
     doc.text(\`DNI: \${group.clientDni || 'N/A'}\`, 20, 42);
     doc.text(\`Fecha de Emisión: \${new Date().toLocaleDateString()}\`, 20, 49);

     autoTable(doc, {
         startY: 60,
         head: [['Total Órdenes', 'Total Jabas', 'Total Pollos', 'Peso Neto (kg)']],
         body: [
             [group.orders.length, group.totalCrates, group.totalBirds, group.totalNet.toFixed(1)]
         ],
         theme: 'striped',
         headStyles: { fillColor: [30, 58, 138] }
     });

     autoTable(doc, {
         startY: (doc as any).lastAutoTable.finalY + 15,
         head: [['Resumen Financiero', 'Monto']],
         body: [
             ['Total Facturado Histórico', \`S/ \${group.totalDue.toFixed(2)}\`],
             ['Total Abonado', \`S/ \${group.totalPaid.toFixed(2)}\`],
             ['Deuda General Pendiente', \`S/ \${group.balance.toFixed(2)}\`]
         ],
         theme: 'grid',
         headStyles: { fillColor: [15, 23, 42] }
     });

     handlePDFOutput(doc, \`ReporteGeneral_\${group.clientName}.pdf\`);
  };

`;

content = content.replace('  const getBatchName = (batchId: string) => {', newPdfMethod + '  const getBatchName = (batchId: string) => {');

const buttonHtml = `
                  <div className="flex justify-end mb-4">
                     <button 
                         onClick={(e) => { e.stopPropagation(); generateGeneralClientPDF(group); }} 
                         className="bg-blue-900 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-blue-800 shadow-sm transition-all"
                     >
                         <Download size={14} /> Descargar Reporte General del Cliente
                     </button>
                  </div>
                  {/* Monthly Breakdowns */}
`;

content = content.replace('{/* Monthly Breakdowns */}', buttonHtml);

const modalCloseBtnHtml = `
            <div className="mt-8 flex justify-end border-t border-slate-100 pt-5">
              <button 
                onClick={() => { setShowDetailModal(null); }} 
                className="bg-slate-800 text-white px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-900 transition-all shadow-md active:scale-95 flex items-center gap-2"
              >
                <X size={16}/> Cerrar Detalle
              </button>
            </div>
          </div>
        </div>
`;

content = content.replace(`          </div>\n        </div>\n      )}`, modalCloseBtnHtml + `\n      )}`);

fs.writeFileSync('components/pages/Reports.tsx', content);
console.log('Patched general PDF and close buttons');

const fs = require('fs');
let content = fs.readFileSync('components/pages/WeighingStation.tsx', 'utf-8');

const targetFooter = `
    const pageCount = (doc as any).internal.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8).setTextColor(150);
        doc.text(\`Generado por AviControl Pro - Página \${i} de \${pageCount}\`, 148.5, 200, { align: 'center' });
    }

    handlePDFOutput(doc, \`Reporte_Lote_\${batchName.replace(/\\s+/g, '_')}.pdf\`);
`;

const replaceFooter = `
    y = (doc as any).lastAutoTable.finalY + 15;
    if (y > 170) { doc.addPage(); y = 20; }
    
    const dispSig = currentBatch?.dispatcherSignature;
    const clientSig = currentBatch?.clientSignature;
    if (dispSig) {
      try { doc.addImage(dispSig, 'PNG', 40, y - 15, 40, 15); } catch (e) {}
    }
    if (clientSig) {
      try { doc.addImage(clientSig, 'PNG', 215, y - 15, 40, 15); } catch (e) {}
    }
    
    doc.setLineWidth(0.5);
    doc.setDrawColor(0);
    
    // Firma Responsable
    doc.line(30, y, 90, y);
    doc.setFontSize(8).setFont("helvetica", "bold");
    doc.text("RESPONSABLE DESPACHO", 60, y + 4, { align: 'center' });
    doc.setFont("helvetica", "normal");
    doc.text("Firma o Sello", 60, y + 8, { align: 'center' });
    
    // Firma Cliente
    doc.line(205, y, 265, y);
    doc.setFontSize(8).setFont("helvetica", "bold");
    doc.text("CLIENTE / RECIBE", 235, y + 4, { align: 'center' });
    doc.setFont("helvetica", "normal");
    doc.text("Firma de Conformidad", 235, y + 8, { align: 'center' });

    const pageCount = (doc as any).internal.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8).setTextColor(150);
        doc.text(\`Generado por AviControl Pro - Página \${i} de \${pageCount}\`, 148.5, 200, { align: 'center' });
    }

    handlePDFOutput(doc, \`Reporte_Lote_\${batchName.replace(/\\s+/g, '_')}.pdf\`);
`;

if (content.indexOf(targetFooter.trim()) !== -1) {
    content = content.replace(targetFooter.trim(), replaceFooter.trim());
} else {
    const regex = /const pageCount = \(doc as any\)\.internal\.getNumberOfPages\(\);[\s\S]*?handlePDFOutput\(doc, `Reporte_Lote_\$\{batchName\.replace\(\/\\s\+\/g, '_'\)\}\.pdf`\);/;
    content = content.replace(regex, replaceFooter.trim());
}

fs.writeFileSync('components/pages/WeighingStation.tsx', content);
console.log("Batch Report PDF updated");

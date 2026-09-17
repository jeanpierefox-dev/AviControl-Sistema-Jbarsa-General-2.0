const fs = require('fs');
let content = fs.readFileSync('components/pages/WeighingStation.tsx', 'utf-8');

const targetStr = `
    const pageCount = (doc as any).internal.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8).setTextColor(150);
        doc.text(\`Generado por AviControl Pro - Página \${i} de \${pageCount}\`, 105, 290, { align: 'center' });
    }

    handlePDFOutput(doc, \`Reporte_A4_\${order.clientName}_\${order.id}.pdf\`);
`;

const replaceStr = `
    if (y > 250) {
       doc.addPage();
       addAppWatermarkToPdf(doc);
       y = 20;
    }
    
    y += 20;
    const dispSig = batch?.dispatcherSignature;
    const clientSig = order.clientSignature || batch?.clientSignature;
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

    const pageCount = (doc as any).internal.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8).setTextColor(150);
        doc.text(\`Generado por AviControl Pro - Página \${i} de \${pageCount}\`, 105, 290, { align: 'center' });
    }

    handlePDFOutput(doc, \`Reporte_A4_\${order.clientName}_\${order.id}.pdf\`);
`;

if (content.indexOf(targetStr.trim()) !== -1) {
    content = content.replace(targetStr.trim(), replaceStr.trim());
} else {
    console.error("Target string not found in WeighingStation");
    // let's try a regex
    content = content.replace(/const pageCount = \(doc as any\)\.internal\.getNumberOfPages\(\);[\s\S]*?handlePDFOutput\(doc, `Reporte_A4_\$\{order\.clientName\}_\$\{order\.id\}\.pdf`\);/, replaceStr.trim());
}

fs.writeFileSync('components/pages/WeighingStation.tsx', content);
console.log("WeighingStation updated");

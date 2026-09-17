const fs = require('fs');
let content = fs.readFileSync('components/pages/Collections.tsx', 'utf-8');

// Replace the bank statement header
const targetHeader = `
    const doc = new jsPDF({ format: 'a4', unit: 'mm' });
    addAppWatermarkToPdf(doc);

    const branding = getEffectiveBranding(order, user);
    const balanceInfo = calculateBalance(order);

    let y = 18;

    // 1. CORPORATE HEADER (Bank Style)
    // ==========================================
    if (branding.logoUrl) {
      addLogoToPdf(doc, branding.logoUrl, { maxWidth: 35, maxHeight: 35, defaultX: 14, y: 12 });
    }

    doc.setFontSize(22).setFont("helvetica", "bold").setTextColor(15, 23, 42); // Slate 900
    doc.text("ESTADO DE CUENTA", 200, y, { align: 'right' });
    doc.setFontSize(10).setFont("helvetica", "normal").setTextColor(100, 116, 139); // Slate 500
    doc.text(\`Documento de Liquidación y Cobranza\`, 200, y + 5, { align: 'right' });

    y += 18;
    // Branding Name Line
    doc.setDrawColor(226, 232, 240); // Slate 200
    doc.setLineWidth(0.5);
    doc.line(14, y, 200, y);
    doc.setFontSize(9).setFont("helvetica", "bold").setTextColor(71, 85, 105);
    doc.text(branding.companyName.toUpperCase(), 14, y - 3);
`;

const replaceHeader = `
    const doc = new jsPDF({ format: 'a4', unit: 'mm' });
    addAppWatermarkToPdf(doc);

    const branding = getEffectiveBranding(order, user);
    const balanceInfo = calculateBalance(order);

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
    doc.text("ESTADO DE CUENTA FINANCIERO", 105, 32 + ((splitTitle.length - 1) * 8), { align: 'center' });
    
    doc.setTextColor(0, 0, 0);

    let y = 55;
`;

if (content.indexOf(targetHeader.trim()) !== -1) {
    content = content.replace(targetHeader.trim(), replaceHeader.trim());
} else {
    // If not found exactly, try regex
    const reHeader = /const doc = new jsPDF\(\{ format: 'a4', unit: 'mm' \}\);[\s\S]*?doc\.text\(branding\.companyName\.toUpperCase\(\), 14, y - 3\);/;
    content = content.replace(reHeader, replaceHeader.trim());
}

// Replace the bank statement footer
const targetFooter = `
    // Signatures
    doc.setLineWidth(0.4);
    doc.setDrawColor(100, 116, 139);
    doc.line(25, endY, 85, endY);
    doc.line(125, endY, 185, endY);

    doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(15, 23, 42);
    doc.text("RESPONSABLE DE TESORERÍA / CAJA", 55, endY + 5, { align: 'center' });
    doc.setFontSize(7).setFont("helvetica", "normal").setTextColor(100, 116, 139);
    doc.text(branding.companyName.toUpperCase(), 55, endY + 9, { align: 'center' });

    doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(15, 23, 42);
    doc.text("CONFORMIDAD DEL CLIENTE / TITULAR", 155, endY + 5, { align: 'center' });
    doc.setFontSize(7).setFont("helvetica", "normal").setTextColor(100, 116, 139);
    doc.text(order.clientName.toUpperCase(), 155, endY + 9, { align: 'center' });
`;

const replaceFooter = `
    const batch = getBatches().find(b => b.id === order.batchId);
    const dispSig = batch?.dispatcherSignature;
    const clientSig = order.clientSignature || batch?.clientSignature;
    
    if (dispSig) {
      try { doc.addImage(dispSig, 'PNG', 25, endY - 20, 40, 15); } catch (e) {}
    }
    if (clientSig) {
      try { doc.addImage(clientSig, 'PNG', 135, endY - 20, 40, 15); } catch (e) {}
    }

    // Signatures
    doc.setLineWidth(0.5);
    doc.setDrawColor(0);
    doc.line(15, endY, 65, endY);
    doc.line(135, endY, 185, endY);

    doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(15, 23, 42);
    doc.text("RESPONSABLE DESPACHO", 40, endY + 4, { align: 'center' });
    doc.setFontSize(7).setFont("helvetica", "normal").setTextColor(100, 116, 139);
    doc.text(branding.companyName.toUpperCase(), 40, endY + 8, { align: 'center' });

    doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(15, 23, 42);
    doc.text("CLIENTE / RECIBE", 160, endY + 4, { align: 'center' });
    doc.setFontSize(7).setFont("helvetica", "normal").setTextColor(100, 116, 139);
    doc.text("Firma de Conformidad", 160, endY + 8, { align: 'center' });
`;

if (content.indexOf(targetFooter.trim()) !== -1) {
    content = content.replace(targetFooter.trim(), replaceFooter.trim());
} else {
    // If not found exactly, try regex
    const reFooter = /\/\/ Signatures[\s\S]*?doc\.text\(order\.clientName\.toUpperCase\(\), 155, endY \+ 9, \{ align: 'center' \}\);/;
    content = content.replace(reFooter, replaceFooter.trim());
}

fs.writeFileSync('components/pages/Collections.tsx', content);
console.log("Collections updated");

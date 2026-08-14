import { jsPDF } from 'jspdf';

function drawCurvedText(
  ctx: CanvasRenderingContext2D, 
  text: string, 
  cx: number, 
  cy: number, 
  radius: number, 
  startAngle: number, 
  clockwise: boolean
) {
  ctx.save();
  const step = 0.082;
  const totalAngle = (text.length - 1) * step;
  let currentAngle = clockwise ? startAngle - totalAngle / 2 : startAngle + totalAngle / 2;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    ctx.save();
    const x = cx + radius * Math.cos(currentAngle);
    const y = cy + radius * Math.sin(currentAngle);
    ctx.translate(x, y);
    ctx.rotate(currentAngle + (clockwise ? Math.PI / 2 : -Math.PI / 2));
    ctx.fillText(char, 0, 0);
    ctx.restore();
    currentAngle += clockwise ? step : -step;
  }
  ctx.restore();
}

function generateAppWatermarkBase64(): string {
  if (typeof document === 'undefined') return '';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const cx = 300;
    const cy = 300;

    ctx.save();
    ctx.clearRect(0, 0, 600, 600);

    const strokeColor = 'rgba(30, 58, 138, 0.09)'; // Elegant slate-blue subtle line
    const fillColor = 'rgba(30, 58, 138, 0.03)';
    const solidTone = 'rgba(15, 23, 42, 0.085)'; // Watermark depth

    // 1. Outer Ring
    ctx.beginPath();
    ctx.arc(cx, cy, 272, 0, Math.PI * 2);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 5;
    ctx.stroke();

    // Outer dashed accent ring
    ctx.beginPath();
    ctx.arc(cx, cy, 258, 0, Math.PI * 2);
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.setLineDash([]);

    // Inner ring
    ctx.beginPath();
    ctx.arc(cx, cy, 212, 0, Math.PI * 2);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 4;
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.stroke();

    // Circular text
    ctx.font = '900 20px Arial, sans-serif';
    ctx.fillStyle = solidTone;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    drawCurvedText(ctx, "★  A V I C O N T R O L   P R O  ★", cx, cy, 236, Math.PI * 1.5, true);
    drawCurvedText(ctx, "• SISTEMA DE PESAJE Y DESPACHO •", cx, cy, 236, Math.PI * 0.5, false);

    // Center Shield / Emblem
    ctx.beginPath();
    ctx.moveTo(cx, cy - 145);
    ctx.lineTo(cx + 125, cy - 85);
    ctx.lineTo(cx + 125, cy + 45);
    ctx.quadraticCurveTo(cx + 105, cy + 135, cx, cy + 165);
    ctx.quadraticCurveTo(cx - 105, cy + 135, cx - 125, cy + 45);
    ctx.lineTo(cx - 125, cy - 85);
    ctx.closePath();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Chicken / Broiler Vector Silhouette
    ctx.fillStyle = solidTone;
    ctx.beginPath();
    // Rooster comb
    ctx.moveTo(cx - 20, cy - 90);
    ctx.quadraticCurveTo(cx - 15, cy - 110, cx - 5, cy - 93);
    ctx.quadraticCurveTo(cx + 10, cy - 113, cx + 18, cy - 90);
    ctx.quadraticCurveTo(cx + 35, cy - 107, cx + 32, cy - 80);
    // Head & Beak
    ctx.lineTo(cx + 45, cy - 75);
    ctx.lineTo(cx + 70, cy - 65); // beak tip
    ctx.lineTo(cx + 45, cy - 55); // beak bottom
    // Wattle
    ctx.quadraticCurveTo(cx + 42, cy - 40, cx + 32, cy - 43);
    // Breast
    ctx.quadraticCurveTo(cx + 65, cy, cx + 55, cy + 40);
    // Belly to platform
    ctx.quadraticCurveTo(cx + 30, cy + 60, cx + 10, cy + 55);
    // Platform scale
    ctx.lineTo(cx + 50, cy + 60);
    ctx.lineTo(cx + 50, cy + 70);
    ctx.lineTo(cx - 50, cy + 70);
    ctx.lineTo(cx - 50, cy + 60);
    ctx.lineTo(cx - 10, cy + 55);
    // Tail feathers
    ctx.quadraticCurveTo(cx - 55, cy + 45, cx - 75, cy + 15);
    ctx.quadraticCurveTo(cx - 95, cy - 25, cx - 85, cy - 60);
    ctx.quadraticCurveTo(cx - 65, cy - 45, cx - 50, cy - 25);
    ctx.quadraticCurveTo(cx - 55, cy - 55, cx - 40, cy - 40);
    ctx.quadraticCurveTo(cx - 30, cy - 70, cx - 20, cy - 90);
    ctx.closePath();
    ctx.fill();

    // Eye
    ctx.beginPath();
    ctx.arc(cx + 25, cy - 71, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fill();

    // Industrial scale base
    ctx.fillStyle = solidTone;
    ctx.fillRect(cx - 65, cy + 75, 130, 8);
    ctx.fillRect(cx - 35, cy + 83, 70, 6);
    ctx.fillRect(cx - 50, cy + 89, 100, 4);

    // Digital readout badge
    ctx.font = '900 15px monospace, sans-serif';
    ctx.fillStyle = solidTone;
    ctx.fillText("00.00 KG", cx, cy + 115);
    ctx.font = 'bold 11px Arial, sans-serif';
    ctx.fillText("PESAJE DE PRECISIÓN", cx, cy + 130);

    ctx.restore();
    return canvas.toDataURL('image/png');
  } catch (e) {
    console.warn("Watermark canvas generation fallback:", e);
    return '';
  }
}

let cachedWatermarkBase64 = '';

export function getAppWatermarkDataUrl(): string {
  if (!cachedWatermarkBase64) {
    cachedWatermarkBase64 = generateAppWatermarkBase64();
  }
  return cachedWatermarkBase64;
}

/**
 * Adds the AviControl Pro official watermark to all or specific pages of the document.
 */
export function addAppWatermarkToPdf(doc: jsPDF, pageNumber?: number): void {
  const watermarkUrl = getAppWatermarkDataUrl();
  if (!watermarkUrl) return;

  const totalPages = doc.getNumberOfPages();
  const startPage = pageNumber || 1;
  const endPage = pageNumber || totalPages;

  const originalPage = (doc as any).getCurrentPageInfo ? (doc as any).getCurrentPageInfo().pageNumber : 1;

  for (let p = startPage; p <= endPage; p++) {
    doc.setPage(p);
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    if (pageW <= 90) {
      // 80mm thermal ticket format (e.g. 80mm x 150-320mm)
      const size = Math.min(pageW * 0.72, 56);
      if (pageH > 220) {
        // Double watermark for elongated thermal tickets
        const y1 = pageH * 0.30 - size / 2;
        const y2 = pageH * 0.70 - size / 2;
        const x = (pageW - size) / 2;
        doc.addImage(watermarkUrl, 'PNG', x, y1, size, size);
        doc.addImage(watermarkUrl, 'PNG', x, y2, size, size);
      } else {
        const x = (pageW - size) / 2;
        const y = (pageH - size) / 2;
        doc.addImage(watermarkUrl, 'PNG', x, y, size, size);
      }
    } else {
      // A4 format (210mm x 297mm) or Letter
      const size = Math.min(pageW * 0.62, 135);
      const x = (pageW - size) / 2;
      const y = (pageH - size) / 2;
      doc.addImage(watermarkUrl, 'PNG', x, y, size, size);
    }
  }

  if (doc.setPage && originalPage) {
    doc.setPage(originalPage);
  }
}

/**
 * Renders the logo image in its original aspect ratio inside jsPDF document.
 * Returns the new Y position below the rendered logo.
 */
export function addLogoToPdf(
  doc: jsPDF, 
  logoUrl: string | undefined, 
  options: { 
    maxWidth?: number; 
    maxHeight?: number; 
    defaultX?: number; 
    y: number;
  }
): number {
  if (!logoUrl) return options.y;
  
  const maxWidth = options.maxWidth || 32;
  const maxHeight = options.maxHeight || 22;
  
  try {
    const imgProps = doc.getImageProperties(logoUrl);
    const aspect = imgProps.width / imgProps.height;
    
    let imgW = maxWidth;
    let imgH = imgW / aspect;
    
    if (imgH > maxHeight) {
      imgH = maxHeight;
      imgW = imgH * aspect;
    }
    
    const pageW = doc.internal.pageSize.getWidth();
    const x = options.defaultX !== undefined ? options.defaultX : (pageW - imgW) / 2;
    
    const format = imgProps.fileType ? imgProps.fileType.toUpperCase() : 'PNG';
    doc.addImage(logoUrl, format, x, options.y, imgW, imgH);
    return options.y + imgH + 4;
  } catch (e) {
    // Fallback if image parsing fails
    const pageW = doc.internal.pageSize.getWidth();
    const fallbackW = Math.min(maxWidth, 28);
    const fallbackH = Math.min(maxHeight, 20);
    const x = options.defaultX !== undefined ? options.defaultX : (pageW - fallbackW) / 2;
    doc.addImage(logoUrl, 'PNG', x, options.y, fallbackW, fallbackH);
    return options.y + fallbackH + 4;
  }
}

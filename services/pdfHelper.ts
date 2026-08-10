import { jsPDF } from 'jspdf';

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

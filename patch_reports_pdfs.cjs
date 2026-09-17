const fs = require('fs');
let content = fs.readFileSync('components/pages/Reports.tsx', 'utf-8');

// Remove the import from pdfHelper
content = content.replace("import { generateTicketPDF, generateSalesTicketPDF, generateSummaryTicketPDF, generateLameTicketPDF, generateA4ClientPDF, generateBankStatementPDF } from '../../services/pdfHelper';", "");

// Add jsPDF import
if (!content.includes('import jsPDF')) {
  content = content.replace("import { getBatches", "import jsPDF from 'jspdf';\nimport autoTable from 'jspdf-autotable';\nimport { addLogoToPdf, addAppWatermarkToPdf } from '../../services/pdfHelper';\nimport { getBatches");
}

const stubs = `
  const handlePDFOutput = (doc: jsPDF, filename: string) => {
    // try to use capacitor if needed, else save
    doc.save(filename);
  };

  const generateTicketPDF = (order: ClientOrder, show: boolean = false) => {
     const doc = new jsPDF();
     doc.text("Ticket Detallado", 10, 10);
     handlePDFOutput(doc, "ticket.pdf");
  };
  const generateSalesTicketPDF = (order: ClientOrder, show: boolean = false) => {
     const doc = new jsPDF();
     doc.text("Ticket de Venta", 10, 10);
     handlePDFOutput(doc, "ticket_venta.pdf");
  };
  const generateSummaryTicketPDF = (order: ClientOrder, show: boolean = false) => {
     const doc = new jsPDF();
     doc.text("Ticket Resumen", 10, 10);
     handlePDFOutput(doc, "ticket_resumen.pdf");
  };
  const generateA4ClientPDF = (order: ClientOrder) => {
     const doc = new jsPDF();
     doc.text("Reporte A4", 10, 10);
     handlePDFOutput(doc, "reporte_a4.pdf");
  };
`;

content = content.replace("const [batches, setBatches] = useState<Batch[]>([]);", stubs + "\n  const [batches, setBatches] = useState<Batch[]>([]);");

fs.writeFileSync('components/pages/Reports.tsx', content);
console.log('Fixed PDF stubs in Reports.tsx');

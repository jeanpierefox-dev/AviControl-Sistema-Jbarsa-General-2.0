import React, { useState, useEffect, useContext, useMemo } from 'react';
import { getOrders, saveOrder, getConfig, getVisibleUserIds, getBatches, getEffectiveBranding } from '../../services/storage';
import { addLogoToPdf, addAppWatermarkToPdf } from '../../services/pdfHelper';
import { ClientOrder, WeighingType, UserRole, Payment } from '../../types';
import { 
  Search, Clock, History, Printer, Filter, CheckCircle, FileText, 
  DollarSign, ArrowUpRight, X, Calendar, User, CreditCard, Building2, 
  Receipt, ArrowDownRight, AlertTriangle, CheckCircle2, ChevronRight,
  TrendingDown, TrendingUp, Wallet, Eye, Download, ShieldCheck,
  Smartphone, Landmark, FileSpreadsheet, RefreshCw, Layers
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AuthContext } from '../../App';

type FilterStatus = 'ALL' | 'PENDING' | 'PARTIAL' | 'PAID';
type ViewMode = 'LIST' | 'GRID';

interface BalanceCalculation {
  netKg: number;
  pricePerKg: number;
  totalDue: number;
  totalPaid: number;
  balance: number;
  paymentCount: number;
  percentPaid: number;
}

const Collections: React.FC = () => {
  const [orders, setOrders] = useState<ClientOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('ALL');
  const [viewMode, setViewMode] = useState<ViewMode>('LIST');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'balance_desc' | 'client_asc'>('date_desc');
  
  // Modals
  const [selectedOrderForPay, setSelectedOrderForPay] = useState<ClientOrder | null>(null);
  const [viewHistoryOrder, setViewHistoryOrder] = useState<ClientOrder | null>(null);
  
  // Payment Form State
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'EFECTIVO' | 'TRANSFERENCIA' | 'YAPE_PLIN' | 'DEPOSITO' | 'CHEQUE'>('EFECTIVO');
  const [payOpNumber, setPayOpNumber] = useState('');
  const [payNote, setPayNote] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));

  const { user } = useContext(AuthContext);

  useEffect(() => {
    refresh();
  }, [user]);

  // Listen to external data updates
  useEffect(() => {
    const handleDataUpdate = () => refresh();
    window.addEventListener('avi_data_orders', handleDataUpdate);
    window.addEventListener('avi_data_batches', handleDataUpdate);
    return () => {
      window.removeEventListener('avi_data_orders', handleDataUpdate);
      window.removeEventListener('avi_data_batches', handleDataUpdate);
    };
  }, [user]);

  const refresh = () => {
    const all = getOrders();
    const visibleIds = getVisibleUserIds(user);
    setOrders(all.filter(o => visibleIds.includes(o.createdBy || '')));
  };

  const calculateBalance = (order: ClientOrder): BalanceCalculation => {
    const records = order.records || [];
    const full = records.filter(r => r.type === 'FULL').reduce((a, b) => a + b.weight, 0);
    const empty = records.filter(r => r.type === 'EMPTY').reduce((a, b) => a + b.weight, 0);
    const mort = records.filter(r => r.type === 'MORTALITY').reduce((a, b) => a + b.weight, 0);
    
    let net = order.weighingMode === WeighingType.SOLO_POLLO ? full : full - empty - mort;
    if (net < 0) net = 0;
    
    const price = order.pricePerKg || 0;
    const totalDue = Math.round((net * price) * 100) / 100;
    const payments = order.payments || [];
    const totalPaid = Math.round(payments.reduce((a, b) => a + b.amount, 0) * 100) / 100;
    const balance = Math.max(0, Math.round((totalDue - totalPaid) * 100) / 100);
    const percentPaid = totalDue > 0 ? Math.min(100, Math.round((totalPaid / totalDue) * 100)) : 100;

    return { 
      netKg: net,
      pricePerKg: price,
      totalDue, 
      totalPaid, 
      balance, 
      paymentCount: payments.length,
      percentPaid
    };
  };

  const batches = useMemo(() => getBatches(), [orders]);

  const getBatchName = (batchId?: string) => {
    if (!batchId) return 'Venta Directa';
    const b = batches.find(x => x.id === batchId);
    return b ? b.name : `Lote #${batchId.slice(-4).toUpperCase()}`;
  };

  // Filter and Sort Orders
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const { balance, totalPaid, totalDue } = calculateBalance(o);
      const isFullyPaid = balance <= 0.05 || o.paymentStatus === 'PAID';
      const isPartial = totalPaid > 0 && balance > 0.05;
      const isPending = totalPaid === 0 && balance > 0.05;

      const batchName = getBatchName(o.batchId).toLowerCase();
      const clientName = (o.clientName || '').toLowerCase();
      const clientDni = (o.clientDni || '').toLowerCase();
      const search = searchTerm.toLowerCase();

      const matchesSearch = clientName.includes(search) || 
                            clientDni.includes(search) || 
                            batchName.includes(search) ||
                            o.id.toLowerCase().includes(search);

      if (!matchesSearch) return false;

      if (statusFilter === 'PENDING') return isPending;
      if (statusFilter === 'PARTIAL') return isPartial;
      if (statusFilter === 'PAID') return isFullyPaid;
      return true;
    }).sort((a, b) => {
      const balA = calculateBalance(a);
      const balB = calculateBalance(b);
      const dateA = a.date ? new Date(a.date).getTime() : parseInt(a.id) || 0;
      const dateB = b.date ? new Date(b.date).getTime() : parseInt(b.id) || 0;

      if (sortBy === 'date_desc') return dateB - dateA;
      if (sortBy === 'date_asc') return dateA - dateB;
      if (sortBy === 'balance_desc') return balB.balance - balA.balance;
      if (sortBy === 'client_asc') return a.clientName.localeCompare(b.clientName);
      return 0;
    });
  }, [orders, searchTerm, statusFilter, sortBy, batches]);

  // Overall Financial KPIs
  const kpiStats = useMemo(() => {
    let totalBilled = 0;
    let totalCollected = 0;
    let totalPendingDebt = 0;
    let debtorsCount = 0;

    orders.forEach(o => {
      const { totalDue, totalPaid, balance } = calculateBalance(o);
      totalBilled += totalDue;
      totalCollected += totalPaid;
      totalPendingDebt += balance;
      if (balance > 0.05) {
        debtorsCount++;
      }
    });

    return {
      totalBilled,
      totalCollected,
      totalPendingDebt,
      debtorsCount,
      totalOrders: orders.length
    };
  }, [orders]);

  const handlePDFOutput = (doc: jsPDF, filename: string) => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const newWindow = window.open(url, '_blank');
      if (!newWindow) {
        window.location.href = url;
      }
    } else {
      doc.save(filename);
    }
  };

  // ==========================================
  // 1. TICKET TÉRMICO DE ABONO (80mm)
  // ==========================================
  const generateReceiptPDF = (order: ClientOrder, payment: Payment, prevBalance: number, newBalance: number) => {
    const doc = new jsPDF({ unit: 'mm', format: [80, 190] });
    addAppWatermarkToPdf(doc);
    
    const branding = getEffectiveBranding(order, user);
    let y = 8;

    // Header Logo in natural aspect ratio
    if (branding.logoUrl) {
      y = addLogoToPdf(doc, branding.logoUrl, { maxWidth: 35, maxHeight: 22, y });
    }

    // Company Name
    doc.setFont("helvetica", "bold").setFontSize(13);
    const splitTitle = doc.splitTextToSize(branding.companyName.toUpperCase(), 70);
    splitTitle.forEach((line: string) => {
      doc.text(line, 40, y, { align: 'center' });
      y += 5;
    });

    doc.setFontSize(8).setFont("helvetica", "normal").setTextColor(70, 70, 70);
    doc.text("SISTEMA DE GESTIÓN Y PESAJE AVÍCOLA", 40, y, { align: 'center' });
    y += 4;
    doc.text("COMPROBANTE OFICIAL DE ABONO", 40, y, { align: 'center' });
    y += 5;

    // Double Separator
    doc.setLineWidth(0.5);
    doc.line(5, y, 75, y);
    y += 1.5;
    doc.line(5, y, 75, y);
    y += 5;

    // Payment Meta
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(0, 0, 0);
    doc.text(`RECIBO N°:`, 5, y);
    doc.setFont("helvetica", "normal");
    doc.text(`REC-${payment.id.slice(-6).toUpperCase()}`, 75, y, { align: 'right' });
    y += 4.5;

    doc.setFont("helvetica", "bold");
    doc.text(`FECHA / HORA:`, 5, y);
    doc.setFont("helvetica", "normal");
    doc.text(new Date(payment.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }), 75, y, { align: 'right' });
    y += 4.5;

    doc.setFont("helvetica", "bold");
    doc.text(`CLIENTE:`, 5, y);
    doc.setFont("helvetica", "bold");
    doc.text(order.clientName.toUpperCase(), 75, y, { align: 'right' });
    y += 4.5;

    if (order.clientDni) {
      doc.setFont("helvetica", "bold");
      doc.text(`DNI / RUC:`, 5, y);
      doc.setFont("helvetica", "normal");
      doc.text(order.clientDni, 75, y, { align: 'right' });
      y += 4.5;
    }

    const batchName = getBatchName(order.batchId);
    doc.setFont("helvetica", "bold");
    doc.text(`REFERENCIA:`, 5, y);
    doc.setFont("helvetica", "normal");
    doc.text(batchName, 75, y, { align: 'right' });
    y += 6;

    // Box: Financial Breakdown
    doc.setFillColor(248, 250, 252);
    doc.rect(5, y, 70, 52, 'F');
    doc.rect(5, y, 70, 52, 'S');

    let boxY = y + 5;
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(15, 23, 42);
    doc.text("ESTADO FINANCIERO DE LA CUENTA", 40, boxY, { align: 'center' });
    boxY += 3;
    doc.line(7, boxY, 73, boxY);
    boxY += 5;

    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(60, 60, 60);
    doc.text("Saldo Anterior:", 8, boxY);
    doc.setFont("helvetica", "bold").setTextColor(0, 0, 0);
    doc.text(`S/. ${prevBalance.toFixed(2)}`, 72, boxY, { align: 'right' });
    boxY += 6;

    // Highlighted payment amount
    doc.setFillColor(236, 253, 245);
    doc.rect(7, boxY - 3.5, 66, 8, 'F');
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(5, 150, 105);
    doc.text("MONTO ABONADO:", 9, boxY + 2);
    doc.text(`S/. ${payment.amount.toFixed(2)}`, 71, boxY + 2, { align: 'right' });
    boxY += 10;

    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(60, 60, 60);
    doc.text("Medio de Pago:", 8, boxY);
    doc.setFont("helvetica", "bold").setTextColor(0, 0, 0);
    doc.text(payment.method || 'EFECTIVO', 72, boxY, { align: 'right' });
    boxY += 5.5;

    if (payment.operationNumber) {
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(60, 60, 60);
      doc.text("N° Operación:", 8, boxY);
      doc.setFont("helvetica", "normal").setTextColor(0, 0, 0);
      doc.text(payment.operationNumber, 72, boxY, { align: 'right' });
      boxY += 5.5;
    }

    doc.line(8, boxY - 1, 72, boxY - 1);
    boxY += 3.5;

    doc.setFont("helvetica", "bold").setFontSize(9.5);
    if (newBalance <= 0.05) {
      doc.setTextColor(5, 150, 105);
      doc.text("SALDO PENDIENTE:", 8, boxY);
      doc.text("S/. 0.00 (CANCELADO)", 72, boxY, { align: 'right' });
    } else {
      doc.setTextColor(220, 38, 38);
      doc.text("SALDO PENDIENTE:", 8, boxY);
      doc.text(`S/. ${newBalance.toFixed(2)}`, 72, boxY, { align: 'right' });
    }

    y += 56;

    if (payment.note) {
      doc.setFont("helvetica", "italic").setFontSize(8).setTextColor(80, 80, 80);
      doc.text(`Nota: ${payment.note}`, 5, y);
      y += 5;
    }

    if (payment.registeredByName) {
      doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(100, 100, 100);
      doc.text(`Cajero / Registrado por: ${payment.registeredByName}`, 5, y);
      y += 5;
    }

    // Signatures
    y += 7;
    doc.setLineWidth(0.3);
    doc.line(10, y + 10, 35, y + 10);
    doc.line(45, y + 10, 70, y + 10);

    doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(80, 80, 80);
    doc.text("Firma de Caja", 22.5, y + 13.5, { align: 'center' });
    doc.text("Firma del Cliente", 57.5, y + 13.5, { align: 'center' });

    y += 18;
    doc.setFontSize(7).setFont("helvetica", "normal").setTextColor(120, 120, 120);
    doc.text("Comprobante oficial válido para control de cobranza.", 40, y, { align: 'center' });
    y += 3.5;
    doc.text("Conserve este recibo como constancia de pago.", 40, y, { align: 'center' });

    handlePDFOutput(doc, `Ticket_Abono_${order.clientName.replace(/\s+/g, '_')}_${payment.id.slice(-6)}.pdf`);
  };

  // =========================================================================
  // 2. ESTADO DE CUENTA BANCARIO CORPORATIVO FORMAL (A4 CORPORATE STATEMENT)
  // =========================================================================
  const generateBankStatementPDF = (order: ClientOrder) => {
    const doc = new jsPDF({ format: 'a4', unit: 'mm' });
    addAppWatermarkToPdf(doc);

    const branding = getEffectiveBranding(order, user);
    const balanceInfo = calculateBalance(order);
    const batchName = getBatchName(order.batchId);
    const sortedPayments = [...(order.payments || [])].sort((a, b) => a.timestamp - b.timestamp);

    // 1. CORPORATE NAVY HEADER BAR
    doc.setFillColor(15, 23, 42); // Slate 900
    doc.rect(0, 0, 210, 38, 'F');

    // Header Logo in natural aspect ratio
    if (branding.logoUrl) {
      addLogoToPdf(doc, branding.logoUrl, { maxWidth: 28, maxHeight: 26, defaultX: 14, y: 6 });
    }

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold").setFontSize(16);
    doc.text(branding.companyName.toUpperCase(), 48, 16);

    doc.setFontSize(9).setFont("helvetica", "normal").setTextColor(203, 213, 225);
    doc.text("SISTEMA CENTRAL DE LIQUIDACIONES Y COBRANZAS", 48, 22);
    doc.text("GESTIÓN INTEGRAL DE CUENTAS CORRIENTES COMERCIALES", 48, 27);

    // Right Statement Badge
    doc.setFillColor(30, 41, 59);
    doc.roundedRect(135, 6, 62, 26, 2, 2, 'F');
    doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(56, 189, 248);
    doc.text("ESTADO DE CUENTA OFICIAL", 166, 12, { align: 'center' });
    doc.setFontSize(10).setTextColor(255, 255, 255);
    doc.text(`N° EC-${order.id.slice(-6).toUpperCase()}`, 166, 18, { align: 'center' });
    doc.setFontSize(7.5).setFont("helvetica", "normal").setTextColor(148, 163, 184);
    doc.text(`Emisión: ${new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`, 166, 25, { align: 'center' });

    let y = 46;

    // 2. CLIENT & ACCOUNT INFORMATION PANEL (Formal Bank Box)
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.roundedRect(14, y, 182, 36, 2, 2, 'FD');

    doc.setFontSize(10).setFont("helvetica", "bold").setTextColor(15, 23, 42);
    doc.text("DATOS DEL TITULAR / CLIENTE", 20, y + 7);
    doc.line(20, y + 9, 100, y + 9);

    doc.setFontSize(8.5);
    // Columna 1
    doc.setFont("helvetica", "bold").setTextColor(100, 116, 139);
    doc.text("Razón Social / Cliente:", 20, y + 15);
    doc.setFont("helvetica", "bold").setTextColor(15, 23, 42);
    doc.text(order.clientName.toUpperCase(), 62, y + 15);

    doc.setFont("helvetica", "bold").setTextColor(100, 116, 139);
    doc.text("Documento DNI / RUC:", 20, y + 21);
    doc.setFont("helvetica", "normal").setTextColor(15, 23, 42);
    doc.text(order.clientDni || 'No registrado', 62, y + 21);

    doc.setFont("helvetica", "bold").setTextColor(100, 116, 139);
    doc.text("Fecha Liquidación Venta:", 20, y + 27);
    doc.setFont("helvetica", "normal").setTextColor(15, 23, 42);
    doc.text(order.date ? new Date(order.date).toLocaleDateString() : new Date(parseInt(order.id)).toLocaleDateString(), 62, y + 27);

    // Columna 2
    doc.setFont("helvetica", "bold").setTextColor(100, 116, 139);
    doc.text("Lote / Referencia:", 110, y + 15);
    doc.setFont("helvetica", "bold").setTextColor(15, 23, 42);
    doc.text(batchName, 146, y + 15);

    doc.setFont("helvetica", "bold").setTextColor(100, 116, 139);
    doc.text("Tipo de Despacho:", 110, y + 21);
    doc.setFont("helvetica", "normal").setTextColor(15, 23, 42);
    doc.text(order.weighingMode === WeighingType.BATCH ? 'Venta por Lote' : (order.weighingMode === WeighingType.SOLO_POLLO ? 'Venta Sacos' : 'Venta Directa'), 146, y + 21);

    doc.setFont("helvetica", "bold").setTextColor(100, 116, 139);
    doc.text("Condición de Cuenta:", 110, y + 27);
    
    if (balanceInfo.balance <= 0.05) {
      doc.setFont("helvetica", "bold").setTextColor(5, 150, 105);
      doc.text("PAGADA / AL DÍA", 146, y + 27);
    } else {
      doc.setFont("helvetica", "bold").setTextColor(220, 38, 38);
      doc.text(`PENDIENTE DE PAGO (${balanceInfo.percentPaid}% amortizado)`, 146, y + 27);
    }

    y += 42;

    // 3. FINANCIAL SUMMARY METRIC CARDS (Bank Dashboard Strip)
    const cardW = 42.5;
    const cardH = 22;
    const gap = 4;
    let cardX = 14;

    // Card 1: Total Cargo
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(cardX, y, cardW, cardH, 2, 2, 'F');
    doc.setFontSize(7).setFont("helvetica", "bold").setTextColor(100, 116, 139);
    doc.text("CARGO TOTAL FACTURADO", cardX + cardW / 2, y + 6, { align: 'center' });
    doc.setFontSize(12).setFont("helvetica", "bold").setTextColor(15, 23, 42);
    doc.text(`S/. ${balanceInfo.totalDue.toFixed(2)}`, cardX + cardW / 2, y + 15, { align: 'center' });

    // Card 2: Total Abonos
    cardX += cardW + gap;
    doc.setFillColor(236, 253, 245);
    doc.roundedRect(cardX, y, cardW, cardH, 2, 2, 'F');
    doc.setFontSize(7).setFont("helvetica", "bold").setTextColor(5, 150, 105);
    doc.text("TOTAL AMORTIZADO / ABONOS", cardX + cardW / 2, y + 6, { align: 'center' });
    doc.setFontSize(12).setFont("helvetica", "bold").setTextColor(5, 150, 105);
    doc.text(`S/. ${balanceInfo.totalPaid.toFixed(2)}`, cardX + cardW / 2, y + 15, { align: 'center' });

    // Card 3: Saldo Actual
    cardX += cardW + gap;
    doc.setFillColor(balanceInfo.balance <= 0.05 ? 240 : 254, balanceInfo.balance <= 0.05 ? 253 : 242, balanceInfo.balance <= 0.05 ? 244 : 242);
    doc.roundedRect(cardX, y, cardW, cardH, 2, 2, 'F');
    doc.setFontSize(7).setFont("helvetica", "bold").setTextColor(balanceInfo.balance <= 0.05 ? 5 : 220, balanceInfo.balance <= 0.05 ? 150 : 38, balanceInfo.balance <= 0.05 ? 105 : 38);
    doc.text("SALDO DEUDOR AL CORTE", cardX + cardW / 2, y + 6, { align: 'center' });
    doc.setFontSize(13).setFont("helvetica", "bold").setTextColor(balanceInfo.balance <= 0.05 ? 5 : 220, balanceInfo.balance <= 0.05 ? 150 : 38, balanceInfo.balance <= 0.05 ? 105 : 38);
    doc.text(`S/. ${balanceInfo.balance.toFixed(2)}`, cardX + cardW / 2, y + 15, { align: 'center' });

    // Card 4: Peso y Precio Base
    cardX += cardW + gap;
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(cardX, y, cardW, cardH, 2, 2, 'F');
    doc.setFontSize(7).setFont("helvetica", "bold").setTextColor(100, 116, 139);
    doc.text("PESO NETO / PRECIO", cardX + cardW / 2, y + 6, { align: 'center' });
    doc.setFontSize(9).setFont("helvetica", "bold").setTextColor(15, 23, 42);
    doc.text(`${balanceInfo.netKg.toFixed(2)} KG`, cardX + cardW / 2, y + 12, { align: 'center' });
    doc.setFontSize(8).setFont("helvetica", "normal").setTextColor(71, 85, 105);
    doc.text(`@ S/. ${balanceInfo.pricePerKg.toFixed(2)} / kg`, cardX + cardW / 2, y + 17, { align: 'center' });

    y += 28;

    // 4. DETAILED CHRONOLOGICAL STATEMENT TABLE (Bank Ledger Table)
    doc.setFontSize(10).setFont("helvetica", "bold").setTextColor(15, 23, 42);
    doc.text("EXTRACTO CRONOLÓGICO DE MOVIMIENTOS Y PAGOS", 14, y);
    doc.setFontSize(8).setFont("helvetica", "normal").setTextColor(100, 116, 139);
    doc.text("Historial detallado de cargos iniciales y amortizaciones efectuadas en cuenta", 14, y + 4.5);

    y += 7;

    // Prepare ledger rows
    const tableRows: any[] = [];

    // Row 0: Initial cargo
    const initialDate = order.date ? new Date(order.date).toLocaleDateString() : new Date(parseInt(order.id)).toLocaleDateString();
    let currentBalance = balanceInfo.totalDue;

    tableRows.push([
      '01',
      initialDate,
      `VTA-${order.id.slice(-6).toUpperCase()}`,
      `Cargo por Despacho de Pollo (${balanceInfo.netKg.toFixed(2)} kg @ S/. ${balanceInfo.pricePerKg.toFixed(2)})`,
      'LIQUIDACIÓN',
      `S/. ${balanceInfo.totalDue.toFixed(2)}`,
      '-',
      `S/. ${currentBalance.toFixed(2)}`
    ]);

    // Rows 1..N: Payments
    sortedPayments.forEach((pay, idx) => {
      currentBalance = Math.max(0, currentBalance - pay.amount);
      const payTime = new Date(pay.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
      const opRef = pay.operationNumber ? `OP: ${pay.operationNumber}` : `REC-${pay.id.slice(-6).toUpperCase()}`;
      const concept = pay.note ? `Abono: ${pay.note}` : 'Amortización a cuenta de deuda';

      tableRows.push([
        String(idx + 2).padStart(2, '0'),
        payTime,
        opRef,
        concept,
        pay.method || 'EFECTIVO',
        '-',
        `S/. ${pay.amount.toFixed(2)}`,
        `S/. ${currentBalance.toFixed(2)}`
      ]);
    });

    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14 },
      head: [['#', 'Fecha / Hora', 'Ref. / Op.', 'Concepto y Detalle del Movimiento', 'Medio Pago', 'Cargo (+)', 'Abono (-)', 'Saldo (S/.)']],
      body: tableRows,
      theme: 'grid',
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: 'bold',
        halign: 'center',
        cellPadding: 3
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { halign: 'center', cellWidth: 24 },
        2: { halign: 'center', cellWidth: 24 },
        3: { halign: 'left', cellWidth: 'auto' },
        4: { halign: 'center', cellWidth: 22 },
        5: { halign: 'right', cellWidth: 20, fontStyle: 'bold' },
        6: { halign: 'right', cellWidth: 20, fontStyle: 'bold', textColor: [5, 150, 105] },
        7: { halign: 'right', cellWidth: 22, fontStyle: 'bold', textColor: [15, 23, 42] }
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 3,
        valign: 'middle',
        lineColor: [226, 232, 240],
        lineWidth: 0.2
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      }
    });

    const finalTableY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY : y + 60;
    let endY = finalTableY + 8;

    // Check if new page is needed for footer & signatures
    if (endY > 230) {
      doc.addPage();
      addAppWatermarkToPdf(doc);
      endY = 20;
    }

    // 5. SUMMARY TOTALS ROW
    doc.setFillColor(241, 245, 249);
    doc.rect(14, endY, 182, 14, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.rect(14, endY, 182, 14, 'S');

    doc.setFontSize(8.5).setFont("helvetica", "bold").setTextColor(15, 23, 42);
    doc.text("TOTALES ACUMULADOS:", 18, endY + 8.5);

    doc.text(`Total Cargos: S/. ${balanceInfo.totalDue.toFixed(2)}`, 75, endY + 8.5);
    doc.setTextColor(5, 150, 105);
    doc.text(`Total Abonos: S/. ${balanceInfo.totalPaid.toFixed(2)}`, 120, endY + 8.5);
    doc.setTextColor(balanceInfo.balance <= 0.05 ? 5 : 220, balanceInfo.balance <= 0.05 ? 150 : 38, balanceInfo.balance <= 0.05 ? 105 : 38);
    doc.text(`Saldo Final: S/. ${balanceInfo.balance.toFixed(2)}`, 160, endY + 8.5);

    endY += 22;

    // 6. CERTIFICATION & FORMAL SIGNATURE BLOCKS
    doc.setFontSize(7.5).setFont("helvetica", "italic").setTextColor(100, 116, 139);
    doc.text("Certificación: El presente estado de cuenta refleja fielmente las operaciones comerciales registradas en el sistema AviControl Pro.", 14, endY);
    doc.text("Cualquier observación o discrepancia deberá ser notificada a tesorería dentro de las 48 horas posteriores a la emisión.", 14, endY + 4);

    endY += 24;

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

    // Page Footer
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFontSize(7).setFont("helvetica", "normal").setTextColor(148, 163, 184);
    doc.text(`Documento generado por AviControl Pro • Fecha: ${new Date().toLocaleString()}`, 14, pageH - 10);
    doc.text(`Página 1 de 1`, 196, pageH - 10, { align: 'right' });

    handlePDFOutput(doc, `Estado_Cuenta_${order.clientName.replace(/\s+/g, '_')}_${order.id.slice(-6)}.pdf`);
  };

  // ==========================================
  // 3. REGISTRO DE NUEVO ABONO
  // ==========================================
  const handleOpenPayModal = (order: ClientOrder) => {
    setSelectedOrderForPay(order);
    const { balance } = calculateBalance(order);
    setPayAmount(balance > 0 ? balance.toFixed(2) : '');
    setPayMethod('EFECTIVO');
    setPayOpNumber('');
    setPayNote('');
    setPayDate(new Date().toISOString().slice(0, 10));
  };

  const handleProcessPayment = () => {
    if (!selectedOrderForPay) return;
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) return;

    const { balance: prevBalance } = calculateBalance(selectedOrderForPay);

    const payment: Payment = {
      id: Date.now().toString(),
      amount: Math.round(amount * 100) / 100,
      timestamp: payDate ? new Date(`${payDate}T${new Date().toTimeString().slice(0, 8)}`).getTime() : Date.now(),
      method: payMethod,
      operationNumber: payOpNumber.trim() || undefined,
      note: payNote.trim() || (amount >= prevBalance ? 'Cancelación Total' : 'Abono a Cuenta'),
      registeredBy: user?.id,
      registeredByName: user?.name || user?.username || 'Cajero'
    };

    const updatedOrder: ClientOrder = {
      ...selectedOrderForPay,
      payments: [...(selectedOrderForPay.payments || []), payment]
    };

    const newBal = calculateBalance(updatedOrder);
    if (newBal.balance <= 0.05) {
      updatedOrder.paymentStatus = 'PAID';
    } else {
      updatedOrder.paymentStatus = 'PENDING';
    }

    saveOrder(updatedOrder);
    window.dispatchEvent(new Event('avi_data_orders'));

    // Generar y descargar automáticamente el ticket de abono térmico
    generateReceiptPDF(updatedOrder, payment, prevBalance, newBal.balance);

    // Refresh state
    refresh();
    setSelectedOrderForPay(null);
    setPayAmount('');
    setPayOpNumber('');
    setPayNote('');
  };

  // Eliminar un abono en caso de error
  const handleDeletePayment = (paymentId: string) => {
    if (!viewHistoryOrder) return;
    if (!confirm('¿Estás seguro de anular este abono? El saldo de la cuenta se recalculará automáticamente.')) return;

    const updatedPayments = (viewHistoryOrder.payments || []).filter(p => p.id !== paymentId);
    const updatedOrder: ClientOrder = {
      ...viewHistoryOrder,
      payments: updatedPayments
    };

    const bal = calculateBalance(updatedOrder);
    updatedOrder.paymentStatus = bal.balance <= 0.05 ? 'PAID' : 'PENDING';

    saveOrder(updatedOrder);
    window.dispatchEvent(new Event('avi_data_orders'));
    setViewHistoryOrder(updatedOrder);
    refresh();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16 text-left">
      
      {/* 1. TOP HEADER & FINANCIAL SUMMARY CARDS */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 rounded-[2.5rem] p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full font-black text-[10px] uppercase tracking-widest border border-blue-400/30">
                Tesorería & Caja
              </span>
              <span className="text-xs text-slate-300 font-medium">Control de Créditos y Amortizaciones</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight text-white">
              Gestión de Cobranzas
            </h1>
            <p className="text-xs text-blue-200/70 font-medium mt-1">
              Administración de cuentas por cobrar, estados de cuenta bancarios y registro de abonos.
            </p>
          </div>

          {/* Quick Refresh & View Toggles */}
          <div className="flex items-center gap-3 self-stretch lg:self-auto">
            <div className="bg-white/10 p-1 rounded-2xl flex items-center border border-white/10">
              <button 
                onClick={() => setViewMode('LIST')}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all ${viewMode === 'LIST' ? 'bg-white text-slate-900 shadow-md' : 'text-blue-200 hover:text-white'}`}
                title="Vista de Listado / Tabla Ordenada"
              >
                <Layers size={16} /> Listado
              </button>
              <button 
                onClick={() => setViewMode('GRID')}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all ${viewMode === 'GRID' ? 'bg-white text-slate-900 shadow-md' : 'text-blue-200 hover:text-white'}`}
                title="Vista de Tarjetas Cuadrícula"
              >
                <Wallet size={16} /> Tarjetas
              </button>
            </div>
          </div>
        </div>

        {/* FINANCIAL STATS CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8 relative z-10">
          
          {/* Total Facturado */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-200">Facturación Total</span>
              <div className="p-2 bg-blue-500/20 text-blue-300 rounded-xl"><Building2 size={18}/></div>
            </div>
            <p className="font-digital text-2xl md:text-3xl font-bold text-white mt-2">
              S/. {kpiStats.totalBilled.toFixed(2)}
            </p>
            <p className="text-[10px] text-blue-200/60 font-medium mt-1">
              {kpiStats.totalOrders} órdenes registradas
            </p>
          </div>

          {/* Total Recaudado */}
          <div className="bg-emerald-950/40 backdrop-blur-md rounded-2xl p-5 border border-emerald-500/30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Total Cobrado (Abonos)</span>
              <div className="p-2 bg-emerald-500/20 text-emerald-300 rounded-xl"><TrendingUp size={18}/></div>
            </div>
            <p className="font-digital text-2xl md:text-3xl font-bold text-emerald-400 mt-2">
              S/. {kpiStats.totalCollected.toFixed(2)}
            </p>
            <p className="text-[10px] text-emerald-300/70 font-medium mt-1">
              {kpiStats.totalBilled > 0 ? ((kpiStats.totalCollected / kpiStats.totalBilled) * 100).toFixed(1) : 0}% recuperado
            </p>
          </div>

          {/* Cartera por Cobrar / Deuda Pendiente */}
          <div className="bg-red-950/40 backdrop-blur-md rounded-2xl p-5 border border-red-500/30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-red-300">Saldo por Cobrar</span>
              <div className="p-2 bg-red-500/20 text-red-300 rounded-xl"><TrendingDown size={18}/></div>
            </div>
            <p className="font-digital text-2xl md:text-3xl font-bold text-red-400 mt-2">
              S/. {kpiStats.totalPendingDebt.toFixed(2)}
            </p>
            <p className="text-[10px] text-red-300/70 font-medium mt-1">
              {kpiStats.debtorsCount} cuentas pendientes
            </p>
          </div>

          {/* Estado de Cartera */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-200">Cuentas al Día</span>
              <div className="p-2 bg-blue-500/20 text-blue-300 rounded-xl"><ShieldCheck size={18}/></div>
            </div>
            <p className="font-digital text-2xl md:text-3xl font-bold text-white mt-2">
              {kpiStats.totalOrders - kpiStats.debtorsCount} / {kpiStats.totalOrders}
            </p>
            <p className="text-[10px] text-blue-200/60 font-medium mt-1">
              {kpiStats.totalOrders > 0 ? (((kpiStats.totalOrders - kpiStats.debtorsCount) / kpiStats.totalOrders) * 100).toFixed(0) : 0}% efectividad
            </p>
          </div>

        </div>
      </div>

      {/* 2. SEARCH BAR & FILTER PILLS */}
      <div className="bg-white rounded-[2rem] p-5 md:p-6 shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
          
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input 
              type="text" 
              placeholder="Buscar por cliente, DNI, lote, fecha o N° de orden..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              className="w-full pl-12 pr-10 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm text-slate-900 outline-none focus:border-blue-600 focus:bg-white transition-all shadow-inner" 
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')} 
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Sorting Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest hidden sm:inline">Ordenar:</span>
            <select 
              value={sortBy} 
              onChange={e => setSortBy(e.target.value as any)}
              className="bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-bold text-xs text-slate-700 outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="date_desc">Más recientes primero</option>
              <option value="date_asc">Más antiguos primero</option>
              <option value="balance_desc">Mayor saldo deudor primero</option>
              <option value="client_asc">Cliente (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">Filtrar Estado:</span>
          
          <button 
            onClick={() => setStatusFilter('ALL')} 
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${statusFilter === 'ALL' ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Todos ({orders.length})
          </button>

          <button 
            onClick={() => setStatusFilter('PENDING')} 
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${statusFilter === 'PENDING' ? 'bg-red-600 text-white shadow-md' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}
          >
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
            Pendientes Sin Abono
          </button>

          <button 
            onClick={() => setStatusFilter('PARTIAL')} 
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${statusFilter === 'PARTIAL' ? 'bg-amber-600 text-white shadow-md' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
          >
            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
            Abonos Parciales
          </button>

          <button 
            onClick={() => setStatusFilter('PAID')} 
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${statusFilter === 'PAID' ? 'bg-emerald-600 text-white shadow-md' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
          >
            <CheckCircle2 size={14} />
            Cancelados / Al Día
          </button>
        </div>
      </div>

      {/* 3. MAIN CONTENT: LISTADO O CUADRÍCULA */}
      {viewMode === 'LIST' ? (
        
        /* === VISTA DE LISTADO / TABLA FORMAL === */
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest">
                  <th className="py-4 px-5">Fecha</th>
                  <th className="py-4 px-5">Cliente / Razón Social</th>
                  <th className="py-4 px-5">Lote / Referencia</th>
                  <th className="py-4 px-4 text-right">Importe Venta</th>
                  <th className="py-4 px-4 text-right">Total Abonado</th>
                  <th className="py-4 px-4 text-right">Saldo Deudor</th>
                  <th className="py-4 px-4 text-center">Estado</th>
                  <th className="py-4 px-5 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredOrders.map((order, idx) => {
                  const { totalDue, totalPaid, balance, percentPaid } = calculateBalance(order);
                  const isPaid = balance <= 0.05 || order.paymentStatus === 'PAID';
                  const isPartial = totalPaid > 0 && !isPaid;
                  const batchName = getBatchName(order.batchId);
                  const orderDate = order.date ? new Date(order.date).toLocaleDateString() : new Date(parseInt(order.id)).toLocaleDateString();

                  return (
                    <tr 
                      key={order.id} 
                      className={`hover:bg-blue-50/40 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                    >
                      {/* Fecha */}
                      <td className="py-4 px-5 font-mono text-slate-500 font-bold whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar size={13} className="text-slate-400" />
                          <span>{orderDate}</span>
                        </div>
                      </td>

                      {/* Cliente */}
                      <td className="py-4 px-5">
                        <div className="font-black text-slate-900 uppercase text-sm leading-tight">
                          {order.clientName}
                        </div>
                        {order.clientDni && (
                          <div className="text-[10px] font-mono text-slate-400 font-bold mt-0.5">
                            DNI: {order.clientDni}
                          </div>
                        )}
                      </td>

                      {/* Lote */}
                      <td className="py-4 px-5">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-black text-[10px] uppercase tracking-wider inline-block">
                          {batchName}
                        </span>
                      </td>

                      {/* Importe Venta */}
                      <td className="py-4 px-4 text-right font-digital font-bold text-slate-700 text-sm whitespace-nowrap">
                        S/. {totalDue.toFixed(2)}
                      </td>

                      {/* Total Abonado */}
                      <td className="py-4 px-4 text-right font-digital font-bold text-emerald-600 text-sm whitespace-nowrap">
                        S/. {totalPaid.toFixed(2)}
                        {totalPaid > 0 && (
                          <span className="block font-sans text-[9px] font-bold text-emerald-700">
                            ({percentPaid}%)
                          </span>
                        )}
                      </td>

                      {/* Saldo Deudor */}
                      <td className="py-4 px-4 text-right whitespace-nowrap">
                        <span className={`font-digital font-black text-base ${isPaid ? 'text-emerald-600' : 'text-red-600'}`}>
                          S/. {balance.toFixed(2)}
                        </span>
                      </td>

                      {/* Estado */}
                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        {isPaid ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-black uppercase tracking-wider">
                            <CheckCircle2 size={12} className="text-emerald-600" /> Cancelado
                          </span>
                        ) : isPartial ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-black uppercase tracking-wider">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div> Parcial
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 text-[9px] font-black uppercase tracking-wider">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div> Pendiente
                          </span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="py-4 px-5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Botón Abonar */}
                          {!isPaid && (
                            <button 
                              onClick={() => handleOpenPayModal(order)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm active:scale-95 transition-all"
                              title="Registrar Abono"
                            >
                              <DollarSign size={13} /> Abonar
                            </button>
                          )}

                          {/* Botón Historial de Pagos & Tickets */}
                          <button 
                            onClick={() => setViewHistoryOrder(order)}
                            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all"
                            title="Ver Historial de Abonos y Tickets"
                          >
                            <History size={15} className="text-blue-600" />
                          </button>

                          {/* Botón Estado de Cuenta Bancario PDF */}
                          <button 
                            onClick={() => generateBankStatementPDF(order)}
                            className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl transition-all"
                            title="Descargar Estado de Cuenta Bancario (PDF)"
                          >
                            <FileText size={15} className="text-blue-800" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredOrders.length === 0 && (
            <div className="p-16 text-center">
              <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
                <FileText size={28} />
              </div>
              <p className="text-sm font-black text-slate-700 uppercase tracking-wider">No se encontraron registros de cobranza</p>
              <p className="text-xs text-slate-400 mt-1">Prueba cambiando los filtros o la búsqueda</p>
            </div>
          )}
        </div>

      ) : (

        /* === VISTA DE TARJETAS / CUADRÍCULA === */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredOrders.map(order => {
            const { totalDue, totalPaid, balance, percentPaid } = calculateBalance(order);
            const isPaid = balance <= 0.05 || order.paymentStatus === 'PAID';
            const isPartial = totalPaid > 0 && !isPaid;
            const batchName = getBatchName(order.batchId);
            const orderDate = order.date ? new Date(order.date).toLocaleDateString() : new Date(parseInt(order.id)).toLocaleDateString();

            return (
              <div 
                key={order.id} 
                className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden hover:shadow-md hover:border-blue-300 transition-all flex flex-col group"
              >
                {/* Card Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
                  <div>
                    <h3 className="font-black text-slate-900 uppercase text-base tracking-tight leading-tight">
                      {order.clientName}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{orderDate}</span>
                      <span className="text-slate-300">•</span>
                      <span className="text-[9px] font-black text-blue-600 uppercase tracking-wider">{batchName}</span>
                    </div>
                  </div>
                  
                  <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-1.5 ${isPaid ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : isPartial ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${isPaid ? 'bg-emerald-500' : isPartial ? 'bg-amber-500' : 'bg-red-500 animate-pulse'}`}></div>
                    {isPaid ? 'Cancelado' : isPartial ? 'Parcial' : 'Pendiente'}
                  </span>
                </div>

                {/* Card Body */}
                <div className="p-6 flex-1 space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Facturado</span>
                      <span className="font-digital font-bold text-slate-700 text-lg">S/. {totalDue.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Abonado</span>
                      <span className="font-digital font-bold text-emerald-600 text-lg">S/. {totalPaid.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] font-black uppercase text-slate-400">
                      <span>Progreso de Pago</span>
                      <span>{percentPaid}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 ${isPaid ? 'bg-emerald-500' : 'bg-blue-600'}`} 
                        style={{ width: `${percentPaid}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Saldo Restante */}
                  <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                    <span className="text-xs font-black text-slate-900 uppercase tracking-widest">Saldo Restante</span>
                    <span className={`font-digital font-black text-2xl ${isPaid ? 'text-emerald-600' : 'text-red-600'}`}>
                      S/. {balance.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="p-4 bg-slate-900 flex gap-2">
                  <button 
                    onClick={() => setViewHistoryOrder(order)}
                    className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all border border-slate-700"
                    title="Historial y Tickets"
                  >
                    <History size={14} className="text-blue-400" /> Historial
                  </button>

                  <button 
                    onClick={() => generateBankStatementPDF(order)}
                    className="p-3 bg-slate-800 hover:bg-slate-700 text-blue-300 rounded-xl transition-all border border-slate-700"
                    title="Estado de Cuenta Bancario PDF"
                  >
                    <FileText size={16} />
                  </button>

                  {!isPaid && (
                    <button 
                      onClick={() => handleOpenPayModal(order)}
                      className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-950/20"
                    >
                      <DollarSign size={14} /> Abonar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. MODAL DE REGISTRAR ABONO CON DESGLOSE Y TICKET INMEDIATO              */}
      {/* ========================================================================= */}
      {selectedOrderForPay && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden animate-scale-up">
            
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                  <DollarSign size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight">Registrar Abono a Cuenta</h3>
                  <p className="text-xs text-slate-400 font-medium">{selectedOrderForPay.clientName}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedOrderForPay(null)}
                className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form */}
            <div className="p-6 md:p-8 space-y-5">
              
              {/* Deuda Actual Indicator */}
              <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Saldo Deudor Actual</span>
                  <span className="text-xs font-bold text-slate-700">{getBatchName(selectedOrderForPay.batchId)}</span>
                </div>
                <span className="font-digital font-black text-2xl text-red-600">
                  S/. {calculateBalance(selectedOrderForPay).balance.toFixed(2)}
                </span>
              </div>

              {/* Monto a abonar con quick buttons */}
              <div>
                <label className="text-[11px] font-black text-slate-700 uppercase tracking-widest block mb-2 ml-1">
                  Monto a Abonar (S/.)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xl font-bold">S/.</span>
                  <input 
                    type="number" 
                    step="0.01"
                    inputMode="decimal"
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl py-3.5 pl-14 pr-4 font-mono font-black text-2xl text-slate-900 outline-none focus:border-emerald-500 focus:bg-white transition-all" 
                    value={payAmount} 
                    onChange={e => setPayAmount(e.target.value)} 
                    autoFocus 
                    placeholder="0.00"
                  />
                </div>

                {/* Quick percentage buttons */}
                <div className="flex gap-2 mt-2.5">
                  <button 
                    type="button" 
                    onClick={() => setPayAmount(calculateBalance(selectedOrderForPay).balance.toFixed(2))}
                    className="flex-1 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-black text-[10px] uppercase tracking-wider rounded-lg transition-colors"
                  >
                    100% (Total)
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setPayAmount((calculateBalance(selectedOrderForPay).balance / 2).toFixed(2))}
                    className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-[10px] uppercase tracking-wider rounded-lg transition-colors"
                  >
                    50%
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setPayAmount((calculateBalance(selectedOrderForPay).balance * 0.25).toFixed(2))}
                    className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-[10px] uppercase tracking-wider rounded-lg transition-colors"
                  >
                    25%
                  </button>
                </div>
              </div>

              {/* Medio de Pago & N° de Operación */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">
                    Medio de Pago
                  </label>
                  <select 
                    value={payMethod} 
                    onChange={e => setPayMethod(e.target.value as any)}
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 font-bold text-xs text-slate-800 outline-none focus:border-blue-500"
                  >
                    <option value="EFECTIVO">💵 Efectivo</option>
                    <option value="TRANSFERENCIA">🏦 Transferencia Bancaria</option>
                    <option value="YAPE_PLIN">📱 Yape / Plin</option>
                    <option value="DEPOSITO">💳 Depósito Bancario</option>
                    <option value="CHEQUE">📑 Cheque</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">
                    N° de Operación / Ref. (Opcional)
                  </label>
                  <input 
                    type="text" 
                    placeholder="Ej. OP-184920"
                    value={payOpNumber} 
                    onChange={e => setPayOpNumber(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 font-bold text-xs text-slate-800 outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Fecha y Nota */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">
                    Fecha del Abono
                  </label>
                  <input 
                    type="date" 
                    value={payDate} 
                    onChange={e => setPayDate(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 font-bold text-xs text-slate-800 outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">
                    Concepto / Detalle
                  </label>
                  <input 
                    type="text" 
                    placeholder="Ej. Abono a cuenta"
                    value={payNote} 
                    onChange={e => setPayNote(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 font-bold text-xs text-slate-800 outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Nuevo Saldo Calculado */}
              <div className="flex justify-between items-center p-4 bg-blue-50 rounded-2xl border border-blue-100">
                <span className="text-xs font-bold text-blue-900 uppercase tracking-wider">Nuevo Saldo Restante</span>
                <span className="font-digital font-black text-blue-900 text-xl">
                  S/. {Math.max(0, calculateBalance(selectedOrderForPay).balance - (parseFloat(payAmount) || 0)).toFixed(2)}
                </span>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setSelectedOrderForPay(null)}
                  className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-xs uppercase tracking-widest transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="button"
                  onClick={handleProcessPayment}
                  disabled={!parseFloat(payAmount) || parseFloat(payAmount) <= 0}
                  className="flex-[2] bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Printer size={18} /> Procesar e Imprimir Ticket
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MODAL DE HISTORIAL DE ABONOS, TICKETS Y ESTADO DE CUENTA              */}
      {/* ========================================================================= */}
      {viewHistoryOrder && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-[2.5rem] w-full max-w-4xl shadow-2xl border border-slate-200 overflow-hidden animate-scale-up flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-4">
                <div className="p-3.5 bg-blue-500/20 text-blue-400 rounded-2xl border border-blue-400/20">
                  <History size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight">Historial de Abonos y Tickets</h3>
                  <p className="text-xs text-slate-300 font-medium mt-0.5">
                    Cliente: <span className="font-bold text-white uppercase">{viewHistoryOrder.clientName}</span> {viewHistoryOrder.clientDni ? `(DNI: ${viewHistoryOrder.clientDni})` : ''} • {getBatchName(viewHistoryOrder.batchId)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={() => generateBankStatementPDF(viewHistoryOrder)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md transition-all"
                  title="Descargar Estado de Cuenta Bancario PDF"
                >
                  <Download size={15} /> Estado de Cuenta PDF
                </button>

                <button 
                  onClick={() => setViewHistoryOrder(null)} 
                  className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                >
                  <X size={22} />
                </button>
              </div>
            </div>

            {/* Modal Body: Tabla de extracto */}
            <div className="flex-1 overflow-y-auto bg-slate-50 p-6 space-y-6">
              
              {/* Financial Quick KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Cargo Inicial</span>
                  <span className="font-digital font-black text-xl text-slate-900">
                    S/. {calculateBalance(viewHistoryOrder).totalDue.toFixed(2)}
                  </span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block">Total Abonado</span>
                  <span className="font-digital font-black text-xl text-emerald-600">
                    S/. {calculateBalance(viewHistoryOrder).totalPaid.toFixed(2)}
                  </span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-[10px] font-black text-red-600 uppercase tracking-widest block">Saldo Actual</span>
                  <span className="font-digital font-black text-xl text-red-600">
                    S/. {calculateBalance(viewHistoryOrder).balance.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Transactions Ledger */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-100 border-b border-slate-200 flex justify-between items-center">
                  <span className="font-black text-xs text-slate-800 uppercase tracking-wider">
                    Desglose Cronológico de Operaciones
                  </span>
                  <span className="text-[10px] font-bold text-slate-500">
                    {(viewHistoryOrder.payments || []).length} abonos registrados
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[9px] tracking-widest border-b border-slate-200">
                      <tr>
                        <th className="p-3.5">Fecha y Hora</th>
                        <th className="p-3.5">Concepto / Medio</th>
                        <th className="p-3.5">N° Operación</th>
                        <th className="p-3.5 text-right">Cargo (+)</th>
                        <th className="p-3.5 text-right">Abono (-)</th>
                        <th className="p-3.5 text-right">Saldo</th>
                        <th className="p-3.5 text-center">Ticket</th>
                        <th className="p-3.5 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      
                      {/* Fila 0: Cargo Inicial */}
                      <tr className="bg-slate-50/50">
                        <td className="p-3.5 text-slate-600 font-bold">
                          {viewHistoryOrder.date ? new Date(viewHistoryOrder.date).toLocaleDateString() : new Date(parseInt(viewHistoryOrder.id)).toLocaleDateString()}
                        </td>
                        <td className="p-3.5 font-sans font-black text-slate-800">
                          Liquidación Inicial Despacho
                        </td>
                        <td className="p-3.5 text-slate-400">
                          VTA-{viewHistoryOrder.id.slice(-6).toUpperCase()}
                        </td>
                        <td className="p-3.5 text-right font-bold text-slate-900">
                          {calculateBalance(viewHistoryOrder).totalDue.toFixed(2)}
                        </td>
                        <td className="p-3.5 text-right text-slate-400">-</td>
                        <td className="p-3.5 text-right font-bold text-red-600">
                          {calculateBalance(viewHistoryOrder).totalDue.toFixed(2)}
                        </td>
                        <td className="p-3.5 text-center text-slate-300">-</td>
                        <td className="p-3.5 text-center text-slate-300">-</td>
                      </tr>

                      {/* Filas de Abonos */}
                      {(() => {
                        let runningBalance = calculateBalance(viewHistoryOrder).totalDue;
                        const payments = [...(viewHistoryOrder.payments || [])].sort((a, b) => a.timestamp - b.timestamp);

                        return payments.map(pay => {
                          const prevBal = runningBalance;
                          runningBalance = Math.max(0, runningBalance - pay.amount);

                          return (
                            <tr key={pay.id} className="hover:bg-emerald-50/40 transition-colors">
                              <td className="p-3.5 text-slate-600 font-bold">
                                {new Date(pay.timestamp).toLocaleDateString()}{' '}
                                <span className="text-[10px] text-slate-400">
                                  {new Date(pay.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </td>
                              
                              <td className="p-3.5 font-sans">
                                <div className="font-bold text-emerald-800">{pay.note || 'Abono a Cuenta'}</div>
                                <div className="text-[10px] text-slate-400 font-bold">{pay.method || 'EFECTIVO'}</div>
                              </td>

                              <td className="p-3.5 text-slate-600 font-bold">
                                {pay.operationNumber || `REC-${pay.id.slice(-6).toUpperCase()}`}
                              </td>

                              <td className="p-3.5 text-right text-slate-400">-</td>

                              <td className="p-3.5 text-right font-bold text-emerald-600 text-sm">
                                S/. {pay.amount.toFixed(2)}
                              </td>

                              <td className="p-3.5 text-right font-bold text-slate-900">
                                S/. {runningBalance.toFixed(2)}
                              </td>

                              <td className="p-3.5 text-center">
                                <button 
                                  onClick={() => generateReceiptPDF(viewHistoryOrder, pay, prevBal, runningBalance)}
                                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1 transition-all"
                                  title="Imprimir Ticket Térmico de este Abono"
                                >
                                  <Printer size={13} /> Ticket
                                </button>
                              </td>

                              <td className="p-3.5 text-center">
                                <button 
                                  onClick={() => handleDeletePayment(pay.id)}
                                  className="p-1.5 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                  title="Anular Abono"
                                >
                                  <X size={15} />
                                </button>
                              </td>
                            </tr>
                          );
                        });
                      })()}

                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-5 bg-white border-t border-slate-200 flex flex-wrap justify-between items-center gap-4 shrink-0">
              <div className="text-xs text-slate-500 font-medium">
                Estado: <span className="font-bold text-slate-800">{calculateBalance(viewHistoryOrder).balance <= 0.05 ? 'Cuenta Cancelada en su totalidad' : 'Cuenta con Saldo Pendiente'}</span>
              </div>
              <button 
                onClick={() => setViewHistoryOrder(null)}
                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-800 transition-colors"
              >
                Cerrar
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default Collections;

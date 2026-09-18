import React, { useState, useEffect, useContext, useMemo, useCallback } from 'react';
import { getOrders, saveOrder, getConfig, getVisibleUserIds, getBatches, getEffectiveBranding } from '../../services/storage';
import { addLogoToPdf, addAppWatermarkToPdf } from '../../services/pdfHelper';
import { ClientOrder, WeighingType, UserRole, Payment } from '../../types';
import { 
  Search, Clock, History, Printer, Filter, CheckCircle, FileText, 
  DollarSign, ArrowUpRight, X, Calendar, User, CreditCard, Building2, 
  Receipt, ArrowDownRight, AlertTriangle, CheckCircle2, ChevronRight,
  TrendingDown, TrendingUp, Wallet, Eye, Download, ShieldCheck,
  Smartphone, Landmark, FileSpreadsheet, RefreshCw, Layers,
  ChevronUp, ChevronDown, CalendarDays, AlertCircle, ArrowRight
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AuthContext } from '../../App';

type FilterStatus = 'ALL' | 'PENDING' | 'PARTIAL' | 'PAID';
type ViewMode = 'LIST' | 'GRID';

export interface ClientPaymentRecord {
  id: string;
  amount: number;
  timestamp: number;
  method?: string;
  operationNumber?: string;
  note?: string;
  registeredByName?: string;
  orderId: string;
  orderDate: string;
  batchId?: string;
  batchName: string;
  orderTotalDue: number;
  orderTotalPaid: number;
  orderBalance: number;
  orderNetKg: number;
  order: ClientOrder;
}

interface BalanceCalculation {
  netKg: number;
  pricePerKg: number;
  totalDue: number;
  totalPaid: number;
  balance: number;
  paymentCount: number;
  percentPaid: number;
}


const getSafeDateString = (dateVal: string | number | undefined | null, fallbackId: string) => {
    if (dateVal) {
        const d = new Date(dateVal);
        if (!isNaN(d.getTime())) return d.toLocaleDateString();
    }
    const idNum = parseInt(fallbackId);
    if (!isNaN(idNum)) {
        const d = new Date(idNum);
        if (!isNaN(d.getTime())) return d.toLocaleDateString();
    }
    return new Date().toLocaleDateString();
};

const getSafeDateObj = (dateVal: string | number | undefined | null, fallbackId: string) => {
    if (dateVal) {
        const d = new Date(dateVal);
        if (!isNaN(d.getTime())) return d;
    }
    const idNum = parseInt(fallbackId);
    if (!isNaN(idNum)) {
        const d = new Date(idNum);
        if (!isNaN(d.getTime())) return d;
    }
    return new Date();
};

export type ClientGroup = {
  clientName: string;
  clientDni: string;
  orders: ClientOrder[];
  totalDue: number;
  totalPaid: number;
  balance: number;
  percentPaid: number;
};

const Collections: React.FC = () => {
  const [orders, setOrders] = useState<ClientOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('ALL');
  const [viewMode, setViewMode] = useState<ViewMode>('LIST');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'balance_desc' | 'client_asc'>('date_desc');
  
  // Sub-tabs per client (for expanded cards): 'DAYS' | 'PAYMENTS' | 'PENDING'
  const [clientActiveTab, setClientActiveTab] = useState<Record<string, 'DAYS' | 'PAYMENTS' | 'PENDING'>>({});
  // Day filter per client ('ALL' vs 'PENDING')
  const [clientDayFilter, setClientDayFilter] = useState<Record<string, 'ALL' | 'PENDING'>>({});

  // Full Client Account Statement Modal
  const [selectedClientStatement, setSelectedClientStatement] = useState<ClientGroup | null>(null);
  const [statementModalTab, setStatementModalTab] = useState<'DAYS' | 'PAYMENTS' | 'PENDING'>('DAYS');
  const [statementDayFilter, setStatementDayFilter] = useState<'ALL' | 'PENDING'>('ALL');

  // Main View Category: 'CLIENTS' or 'ALL_PAYMENTS'
  const [activeMainSection, setActiveMainSection] = useState<'CLIENTS' | 'ALL_PAYMENTS'>('CLIENTS');

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
    setOrders(all.filter(o => user?.role === UserRole.ADMIN || visibleIds.includes(o.createdBy || '') || !o.createdBy));
  };

  const calculateBalance = (order: ClientOrder): BalanceCalculation & { additionalTotal: number } => {
    const records = order.records || [];
    const full = records.filter(r => r.type === 'FULL').reduce((a, b) => a + b.weight, 0);
    const empty = records.filter(r => r.type === 'EMPTY').reduce((a, b) => a + b.weight, 0);
    const mort = records.filter(r => r.type === 'MORTALITY').reduce((a, b) => a + b.weight, 0);
    
    let net = order.weighingMode === WeighingType.SOLO_POLLO ? full : full - empty - mort;
    if (net < 0) net = 0;
    
    const price = order.pricePerKg || 0;
    
    // Additional Items
    const additionalItems = order.additionalItems || [];
    const additionalTotal = additionalItems.reduce((a, b) => a + (b.quantity * b.pricePerUnit), 0);
    
    const totalDue = Math.round(((net * price) + additionalTotal) * 100) / 100;
    const payments = order.payments || [];
    const totalPaid = Math.round(payments.reduce((a, b) => a + b.amount, 0) * 100) / 100;
    const balance = Math.max(0, Math.round((totalDue - totalPaid) * 100) / 100);
    const percentPaid = totalDue > 0 ? Math.min(100, Math.round((totalPaid / totalDue) * 100)) : (totalPaid > 0 ? 100 : 0);

    return { 
      netKg: net,
      pricePerKg: price,
      totalDue, 
      totalPaid, 
      balance, 
      paymentCount: payments.length,
      percentPaid,
      additionalTotal
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

  const getClientPayments = useCallback((clientOrders: ClientOrder[]): ClientPaymentRecord[] => {
    const list: ClientPaymentRecord[] = [];
    clientOrders.forEach(ord => {
      const bal = calculateBalance(ord);
      const bName = getBatchName(ord.batchId);
      const dStr = getSafeDateString(ord.date, ord.id);
      (ord.payments || []).forEach(p => {
        list.push({
          id: p.id,
          amount: p.amount,
          timestamp: p.timestamp,
          method: p.method,
          operationNumber: p.operationNumber,
          note: p.note,
          registeredByName: p.registeredByName,
          orderId: ord.id,
          orderDate: dStr,
          batchId: ord.batchId,
          batchName: bName,
          orderTotalDue: bal.totalDue,
          orderTotalPaid: bal.totalPaid,
          orderBalance: bal.balance,
          orderNetKg: bal.netKg,
          order: ord
        });
      });
    });
    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [batches]);

  const clientGroups = useMemo(() => {
    const groups: Record<string, ClientGroup> = {};

    filteredOrders.forEach(o => {
      const key = (o.clientName || 'Cliente No Identificado').trim().toLowerCase();
      if (!groups[key]) {
        groups[key] = {
          clientName: (o.clientName || 'Cliente No Identificado').trim(),
          clientDni: o.clientDni || '',
          orders: [],
          totalDue: 0,
          totalPaid: 0,
          balance: 0,
          percentPaid: 0
        };
      }
      
      const bal = calculateBalance(o);
      groups[key].orders.push(o);
      groups[key].totalDue += bal.totalDue;
      groups[key].totalPaid += bal.totalPaid;
      groups[key].balance += bal.balance;
    });

    return Object.values(groups).map(g => {
       g.percentPaid = g.totalDue > 0 ? Math.min(100, Math.round((g.totalPaid / g.totalDue) * 100)) : (g.totalPaid > 0 ? 100 : 0);
       return g;
    }).sort((a,b) => {
       if (sortBy === 'balance_desc') return b.balance - a.balance;
       if (sortBy === 'client_asc') return a.clientName.localeCompare(b.clientName);
       return b.balance - a.balance; // Default to highest balance first for groups
    });
  }, [filteredOrders, sortBy]);

  const allSystemPayments = useMemo(() => {
    return getClientPayments(orders);
  }, [orders, getClientPayments]);

  const filteredSystemPayments = useMemo(() => {
    const s = searchTerm.toLowerCase();
    if (!s) return allSystemPayments;
    return allSystemPayments.filter(p => 
      p.batchName.toLowerCase().includes(s) ||
      (p.order.clientName || '').toLowerCase().includes(s) ||
      (p.operationNumber || '').toLowerCase().includes(s) ||
      (p.method || '').toLowerCase().includes(s) ||
      p.orderDate.toLowerCase().includes(s)
    );
  }, [allSystemPayments, searchTerm]);

  const [expandedClients, setExpandedClients] = useState<Record<string, boolean>>({});

  const toggleClientExpansion = (clientName: string) => {
    setExpandedClients(prev => ({
      ...prev,
      [clientName]: !prev[clientName]
    }));
  };

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
    doc.text(getSafeDateString(order.date, order.id), 62, y + 27);

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
    let rowIndex = 1;

    // Row 1: Initial cargo for Chickens
    const initialDate = getSafeDateString(order.date, order.id);
    
    // Calculate the base chicken cost without additional items
    const baseChickenCost = balanceInfo.netKg * balanceInfo.pricePerKg;
    let currentBalance = baseChickenCost;

    tableRows.push([
      String(rowIndex++).padStart(2, '0'),
      initialDate,
      `VTA-${order.id.slice(-6).toUpperCase()}`,
      `Cargo por Despacho de Aves (${balanceInfo.netKg.toFixed(2)} kg @ S/. ${balanceInfo.pricePerKg.toFixed(2)})`,
      'LIQUIDACIÓN',
      `S/. ${baseChickenCost.toFixed(2)}`,
      '-',
      `S/. ${currentBalance.toFixed(2)}`
    ]);

    // Rows for Additional Items
    if (order.additionalItems && order.additionalItems.length > 0) {
      order.additionalItems.forEach(item => {
        const itemTotal = item.quantity * item.pricePerUnit;
        currentBalance += itemTotal;
        tableRows.push([
          String(rowIndex++).padStart(2, '0'),
          initialDate,
          `EXT-${item.id.slice(-6).toUpperCase()}`,
          `Cargo Extra: ${item.name} (${item.quantity} und. @ S/. ${item.pricePerUnit.toFixed(2)})`,
          'EXTRA',
          `S/. ${itemTotal.toFixed(2)}`,
          '-',
          `S/. ${currentBalance.toFixed(2)}`
        ]);
      });
    }

    // Rows N: Payments
    sortedPayments.forEach((pay, idx) => {
      currentBalance = Math.max(0, currentBalance - pay.amount);
      const payTime = new Date(pay.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
      const opRef = pay.operationNumber ? `OP: ${pay.operationNumber}` : `REC-${pay.id.slice(-6).toUpperCase()}`;
      const concept = pay.note ? `Abono: ${pay.note}` : 'Amortización a cuenta de deuda';

      tableRows.push([
        String(rowIndex++).padStart(2, '0'),
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

    // Page Footer
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFontSize(7).setFont("helvetica", "normal").setTextColor(148, 163, 184);
    doc.text(`Documento generado por AviControl Pro • Fecha: ${new Date().toLocaleString()}`, 14, pageH - 10);
    doc.text(`Página 1 de 1`, 196, pageH - 10, { align: 'right' });

    handlePDFOutput(doc, `Estado_Cuenta_${order.clientName.replace(/\s+/g, '_')}_${order.id.slice(-6)}.pdf`);
  };

  // =========================================================================
  // 3. REPORTE A4 DE COBRANZAS DEL CLIENTE AGRUPADO POR MES Y DÍAS DE PESAJE
  // =========================================================================
  const generateClientCollectionsA4PDF = (group: ClientGroup, mode: 'FULL' | 'PENDING_ONLY' = 'FULL') => {
    const doc = new jsPDF();
    addAppWatermarkToPdf(doc);
    const branding = getEffectiveBranding({} as any, user);
    let y = 10;
    if (branding.logoUrl) {
      y = addLogoToPdf(doc, branding.logoUrl, { maxWidth: 30, maxHeight: 22, defaultX: 14, y });
    }

    doc.setFillColor(15, 23, 42); // Slate 900
    doc.rect(14, y, 182, 13, 'F');
    doc.setFontSize(10.5).setFont("helvetica", "bold").setTextColor(255, 255, 255);
    const titleText = mode === 'PENDING_ONLY' 
      ? "ESTADO DE CUENTA - SALDOS Y CUENTAS PENDIENTES POR PAGAR" 
      : "ESTADO DE CUENTA INTEGRAL Y COBRANZAS POR MES Y DÍAS";
    doc.text(titleText, 105, y + 8.5, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    y += 18;

    // Client info
    doc.setFontSize(8.5).setFont("helvetica", "bold");
    doc.text("CLIENTE:", 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(group.clientName.toUpperCase(), 35, y);

    doc.setFont("helvetica", "bold");
    doc.text("FECHA EMISIÓN:", 135, y);
    doc.setFont("helvetica", "normal");
    doc.text(new Date().toLocaleDateString(), 168, y);
    y += 4.5;

    if (group.clientDni) {
      doc.setFont("helvetica", "bold");
      doc.text("DNI / RUC:", 14, y);
      doc.setFont("helvetica", "normal");
      doc.text(group.clientDni, 35, y);
      y += 4.5;
    }

    const pendingOrdersCount = group.orders.filter(o => calculateBalance(o).balance > 0.05).length;

    // Resumen General Acumulado
    autoTable(doc, {
      startY: y + 2,
      head: [['Total Facturado Histórico', 'Total Abonado Histórico', 'Deuda General Pendiente', 'Estado de Cuenta', 'Despachos Pendientes']],
      body: [[
        `S/. ${group.totalDue.toFixed(2)}`,
        `S/. ${group.totalPaid.toFixed(2)}`,
        `S/. ${group.balance.toFixed(2)}`,
        group.balance <= 0.05 ? 'AL DÍA / CANCELADO' : 'CUENTA CON SALDO PENDIENTE',
        `${pendingOrdersCount} de ${group.orders.length} órdenes`
      ]],
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 7.5 },
      styles: { fontSize: 8, halign: 'center', cellPadding: 2 }
    });

    y = (doc as any).lastAutoTable.finalY + 6;

    // SECTION 1: ÚLTIMOS PAGOS Y ABONOS REALIZADOS SEGÚN LOTE ABONADO
    const paymentsList = getClientPayments(group.orders);
    if (paymentsList.length > 0) {
      if (y > 220) {
        doc.addPage();
        addAppWatermarkToPdf(doc);
        y = 20;
      }

      doc.setFillColor(16, 185, 129); // Emerald 500
      doc.rect(14, y, 182, 6.5, 'F');
      doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(255, 255, 255);
      doc.text(`HISTORIAL DE ÚLTIMOS PAGOS Y ABONOS REALIZADOS SEGÚN LOTE ABONADO (${paymentsList.length} PAGOS)`, 18, y + 4.5);
      doc.setTextColor(0, 0, 0);
      y += 8;

      const paymentRows = paymentsList.slice(0, 20).map((p, idx) => {
        const pDate = new Date(p.timestamp).toLocaleDateString([], { dateStyle: 'short' });
        return [
          String(idx + 1).padStart(2, '0'),
          pDate,
          p.batchName,
          p.orderDate,
          p.operationNumber || `REC-${p.id.slice(-6).toUpperCase()}`,
          p.method || 'EFECTIVO',
          `S/. ${p.amount.toFixed(2)}`,
          `S/. ${p.orderBalance.toFixed(2)}`
        ];
      });

      autoTable(doc, {
        startY: y,
        head: [['#', 'Fecha Pago', 'Lote Abonado', 'Día Despacho', 'N° Operación / Ref', 'Medio Pago', 'Monto Abonado', 'Saldo Lote']],
        body: paymentRows,
        theme: 'grid',
        headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold', halign: 'center' },
        styles: { fontSize: 7, cellPadding: 1.8, halign: 'center' },
        columnStyles: {
          0: { halign: 'center', cellWidth: 7 },
          1: { halign: 'center', cellWidth: 20 },
          2: { halign: 'left', cellWidth: 32, fontStyle: 'bold' },
          3: { halign: 'center', cellWidth: 22 },
          4: { halign: 'left', cellWidth: 30 },
          5: { halign: 'center', cellWidth: 20 },
          6: { halign: 'right', cellWidth: 26, fontStyle: 'bold', textColor: [5, 150, 105] },
          7: { halign: 'right', cellWidth: 25, fontStyle: 'bold' }
        },
        margin: { left: 14, right: 14 }
      });

      y = (doc as any).lastAutoTable.finalY + 7;
    }

    // SECTION 2: DESGLOSE DE CUENTAS POR DÍAS DE PESAJE (TODOS O SOLO PENDIENTES)
    const targetOrders = mode === 'PENDING_ONLY' 
      ? group.orders.filter(o => calculateBalance(o).balance > 0.05)
      : group.orders;

    if (targetOrders.length === 0 && mode === 'PENDING_ONLY') {
      if (y > 230) {
        doc.addPage();
        addAppWatermarkToPdf(doc);
        y = 20;
      }
      doc.setFillColor(240, 253, 244);
      doc.roundedRect(14, y, 182, 16, 2, 2, 'F');
      doc.setFontSize(9.5).setFont("helvetica", "bold").setTextColor(5, 150, 105);
      doc.text("EL CLIENTE SE ENCUENTRA 100% AL DÍA • NO REGISTRA NINGÚN SALDO PENDIENTE", 105, y + 10, { align: 'center' });
      y += 22;
    } else {
      // Group target orders by month
      const monthlyData: Record<string, { totalDue: number; totalPaid: number; balance: number; netKg: number; orders: ClientOrder[] }> = {};
      targetOrders.forEach(o => {
        const oDate = getSafeDateObj(o.date, o.id);
        const monthKey = oDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase();
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { totalDue: 0, totalPaid: 0, balance: 0, netKg: 0, orders: [] };
        }
        const bal = calculateBalance(o);
        monthlyData[monthKey].totalDue += bal.totalDue;
        monthlyData[monthKey].totalPaid += bal.totalPaid;
        monthlyData[monthKey].balance += bal.balance;
        monthlyData[monthKey].netKg += bal.netKg;
        monthlyData[monthKey].orders.push(o);
      });

      Object.entries(monthlyData).forEach(([month, mData]) => {
        if (y > 230) {
          doc.addPage();
          addAppWatermarkToPdf(doc);
          y = 20;
        }

        // Month Section Banner
        doc.setFillColor(30, 41, 59);
        doc.rect(14, y, 182, 7, 'F');
        doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(255, 255, 255);
        const bannerTitle = mode === 'PENDING_ONLY' ? `[SOLO PENDIENTES] MES: ${month}` : `MES: ${month}`;
        doc.text(`${bannerTitle}  |  TOTAL PESO: ${mData.netKg.toFixed(1)} KG  |  FACTURADO: S/. ${mData.totalDue.toFixed(2)}  |  ABONADO: S/. ${mData.totalPaid.toFixed(2)}  |  SALDO: S/. ${mData.balance.toFixed(2)}`, 18, y + 4.8);
        doc.setTextColor(0, 0, 0);
        y += 9;

        const rows = mData.orders.map((ord, idx) => {
          const bal = calculateBalance(ord);
          const isPaid = bal.balance <= 0.05 || ord.paymentStatus === 'PAID';
          const records = ord.records || [];
          const totalBirds = records.filter(r => r.type === 'FULL').reduce((a, b) => a + (b.birds || 0), 0);
          const totalCrates = records.filter(r => r.type === 'FULL').reduce((a, b) => a + (b.quantity || 1), 0);
          const dateStr = getSafeDateString(ord.date, ord.id);
          const batchStr = getBatchName(ord.batchId);

          return [
            String(idx + 1).padStart(2, '0'),
            dateStr,
            batchStr,
            `${bal.netKg.toFixed(1)} kg`,
            `${totalBirds}p / ${totalCrates}j`,
            `S/. ${bal.pricePerKg.toFixed(2)}`,
            `S/. ${bal.totalDue.toFixed(2)}`,
            `S/. ${bal.totalPaid.toFixed(2)}`,
            `S/. ${bal.balance.toFixed(2)}`,
            isPaid ? 'CANCELADO' : 'PENDIENTE'
          ];
        });

        autoTable(doc, {
          startY: y,
          head: [['#', 'Día / Fecha', 'Lote', 'Neto (kg)', 'Pollos/Jabas', 'Precio/kg', 'Facturado', 'Abonado', 'Saldo Deudor', 'Estado']],
          body: rows,
          theme: 'grid',
          headStyles: { fillColor: mode === 'PENDING_ONLY' ? [185, 28, 28] : [71, 85, 105], textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold', halign: 'center' },
          styles: { fontSize: 7, cellPadding: 1.8, halign: 'center' },
          columnStyles: {
            0: { halign: 'center', cellWidth: 7 },
            1: { halign: 'center', cellWidth: 20 },
            2: { halign: 'left', cellWidth: 25 },
            3: { halign: 'right', cellWidth: 18, fontStyle: 'bold' },
            4: { halign: 'center', cellWidth: 20 },
            5: { halign: 'right', cellWidth: 16 },
            6: { halign: 'right', cellWidth: 20, fontStyle: 'bold' },
            7: { halign: 'right', cellWidth: 18 },
            8: { halign: 'right', cellWidth: 18, fontStyle: 'bold', textColor: [220, 38, 38] },
            9: { halign: 'center', cellWidth: 20 }
          },
          margin: { left: 14, right: 14 }
        });

        y = (doc as any).lastAutoTable.finalY + 6;
      });
    }

    // Firmas
    if (y > 240) {
      doc.addPage();
      addAppWatermarkToPdf(doc);
      y = 20;
    }
    y += 18;
    doc.setLineWidth(0.4);
    doc.line(20, y, 75, y);
    doc.line(135, y, 190, y);
    doc.setFontSize(8).setFont("helvetica", "bold");
    doc.text("RESPONSABLE DE COBRANZAS", 47.5, y + 4, { align: 'center' });
    doc.text("CONFORMIDAD CLIENTE", 162.5, y + 4, { align: 'center' });
    doc.setFont("helvetica", "normal").setFontSize(7);
    doc.text("Firma / Sello Tesorería", 47.5, y + 8, { align: 'center' });
    doc.text(group.clientName.toUpperCase(), 162.5, y + 8, { align: 'center' });

    handlePDFOutput(doc, `Cobranzas_${mode === 'PENDING_ONLY' ? 'Solo_Pendientes_' : ''}${group.clientName.replace(/\s+/g, '_')}.pdf`);
  };

  // =========================================================================
  // 4. TICKET TÉRMICO 80mm DE COBRANZAS AGRUPADO POR MES Y DÍAS DE PESAJE
  // =========================================================================
  const generateClientCollectionsTicketPDF = (group: ClientGroup, mode: 'FULL' | 'PENDING_ONLY' = 'FULL') => {
    const branding = getEffectiveBranding({} as any, user);
    const dummyDoc = new jsPDF({ unit: 'mm', format: [80, 25000] });

    const renderContent = (targetDoc: any) => {
      let y = 8;
      addAppWatermarkToPdf(targetDoc);
      if (branding.logoUrl) {
        y = addLogoToPdf(targetDoc, branding.logoUrl, { maxWidth: 24, maxHeight: 22, defaultX: 28, y });
      }
      targetDoc.setFontSize(10.5).setFont("helvetica", "bold");
      const splitTitle = targetDoc.splitTextToSize(branding.companyName.toUpperCase(), 70);
      splitTitle.forEach((line: string) => {
        targetDoc.text(line, 40, y, { align: 'center' });
        y += 4;
      });
      targetDoc.setFontSize(8).setFont("helvetica", "bold");
      targetDoc.text(mode === 'PENDING_ONLY' ? "ESTADO DE SALDOS PENDIENTES" : "ESTADO DE COBRANZAS Y DEUDA", 40, y, { align: 'center' });
      y += 3.5;
      targetDoc.setFontSize(6.5).setFont("helvetica", "normal");
      targetDoc.text(`EMISIÓN: ${new Date().toLocaleDateString()}`, 40, y, { align: 'center' });
      y += 3;

      targetDoc.setLineWidth(0.3);
      targetDoc.line(5, y, 75, y);
      y += 3.5;

      targetDoc.setFontSize(7.5).setFont("helvetica", "bold");
      targetDoc.text("CLIENTE:", 5, y);
      targetDoc.setFont("helvetica", "normal");
      targetDoc.text(group.clientName.toUpperCase(), 25, y);
      y += 3.5;
      if (group.clientDni) {
        targetDoc.setFont("helvetica", "bold");
        targetDoc.text("DNI/RUC:", 5, y);
        targetDoc.setFont("helvetica", "normal");
        targetDoc.text(group.clientDni, 25, y);
        y += 3.5;
      }

      // Box: Resumen General
      autoTable(targetDoc, {
        startY: y,
        head: [[{ content: 'RESUMEN GENERAL DE CUENTA', colSpan: 2, styles: { halign: 'center', fillColor: [220, 226, 230], textColor: 0 } }]],
        body: [
          ['Total Facturado:', `S/. ${group.totalDue.toFixed(2)}`],
          ['Total Abonado:', `S/. ${group.totalPaid.toFixed(2)}`],
          ['SALDO DEUDA:', `S/. ${group.balance.toFixed(2)}`]
        ],
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 1 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 }, 1: { halign: 'right', cellWidth: 28, fontStyle: 'bold' } },
        margin: { left: 5, right: 5 }
      });
      y = (targetDoc as any).lastAutoTable.finalY + 3.5;

      // Section: Últimos Abonos Recibidos (por lote)
      const pList = getClientPayments(group.orders);
      if (pList.length > 0) {
        targetDoc.setFillColor(230, 245, 235);
        targetDoc.rect(5, y, 70, 5, 'F');
        targetDoc.setFontSize(6.5).setFont("helvetica", "bold");
        targetDoc.text(`ÚLTIMOS ABONOS RECIBIDOS (${pList.length})`, 7, y + 3.5);
        y += 6;

        const payTicketRows = pList.slice(0, 8).map(p => [
          new Date(p.timestamp).toLocaleDateString([], { dateStyle: 'short' }),
          p.batchName.slice(0, 14),
          `S/.${p.amount.toFixed(1)}`
        ]);

        autoTable(targetDoc, {
          startY: y,
          head: [['FECHA', 'LOTE ABONADO', 'MONTO']],
          body: payTicketRows,
          theme: 'grid',
          headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255], fontSize: 5.5, fontStyle: 'bold', halign: 'center' },
          styles: { fontSize: 5.5, cellPadding: 0.8, halign: 'center' },
          columnStyles: {
            0: { cellWidth: 18 },
            1: { cellWidth: 34, halign: 'left' },
            2: { cellWidth: 18, halign: 'right', fontStyle: 'bold' }
          },
          margin: { left: 5, right: 5 }
        });
        y = (targetDoc as any).lastAutoTable.finalY + 3;
      }

      // Target orders for daily breakdown
      const targetOrders = mode === 'PENDING_ONLY' 
        ? group.orders.filter(o => calculateBalance(o).balance > 0.05)
        : group.orders;

      if (targetOrders.length === 0 && mode === 'PENDING_ONLY') {
        targetDoc.setFontSize(6.5).setFont("helvetica", "bold").setTextColor(5, 150, 105);
        targetDoc.text("AL DÍA: SIN CUENTAS PENDIENTES", 40, y + 3, { align: 'center' });
        targetDoc.setTextColor(0, 0, 0);
        y += 6;
      } else {
        // Group orders by month
        const monthlyData: Record<string, { totalDue: number; totalPaid: number; balance: number; netKg: number; orders: ClientOrder[] }> = {};
        targetOrders.forEach(o => {
          const oDate = getSafeDateObj(o.date, o.id);
          const monthKey = oDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase();
          if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = { totalDue: 0, totalPaid: 0, balance: 0, netKg: 0, orders: [] };
          }
          const bal = calculateBalance(o);
          monthlyData[monthKey].totalDue += bal.totalDue;
          monthlyData[monthKey].totalPaid += bal.totalPaid;
          monthlyData[monthKey].balance += bal.balance;
          monthlyData[monthKey].netKg += bal.netKg;
          monthlyData[monthKey].orders.push(o);
        });

        Object.entries(monthlyData).forEach(([month, mData]) => {
          targetDoc.setFillColor(240, 245, 250);
          targetDoc.rect(5, y, 70, 5, 'F');
          targetDoc.setFontSize(6.5).setFont("helvetica", "bold");
          targetDoc.text(mode === 'PENDING_ONLY' ? `[PENDIENTES] MES: ${month}` : `MES: ${month}`, 7, y + 3.5);
          y += 6;

          const bodyRows = mData.orders.map(ord => {
            const bal = calculateBalance(ord);
            const dateStr = getSafeDateString(ord.date, ord.id);
            return [
              dateStr,
              `${bal.netKg.toFixed(1)}kg`,
              `S/.${bal.totalDue.toFixed(1)}`,
              `S/.${bal.balance.toFixed(1)}`
            ];
          });

          autoTable(targetDoc, {
            startY: y,
            head: [['FECHA', 'PESO', 'FACT.', 'SALDO']],
            body: bodyRows,
            theme: 'grid',
            headStyles: { fillColor: mode === 'PENDING_ONLY' ? [185, 28, 28] : [220, 226, 230], textColor: mode === 'PENDING_ONLY' ? [255, 255, 255] : 0, fontSize: 6, fontStyle: 'bold', halign: 'center' },
            styles: { fontSize: 6, cellPadding: 0.8, halign: 'center' },
            columnStyles: {
              0: { cellWidth: 20 },
              1: { cellWidth: 16 },
              2: { cellWidth: 17, halign: 'right' },
              3: { cellWidth: 17, halign: 'right', fontStyle: 'bold', textColor: [220, 38, 38] }
            },
            margin: { left: 5, right: 5 }
          });
          y = (targetDoc as any).lastAutoTable.finalY + 1.5;

          targetDoc.setFontSize(6.5).setFont("helvetica", "bold");
          targetDoc.text(`Subtotal: Fact. S/. ${mData.totalDue.toFixed(2)} | Saldo S/. ${mData.balance.toFixed(2)}`, 40, y + 2.5, { align: 'center' });
          y += 5.5;
        });
      }

      y += 6;
      targetDoc.setLineWidth(0.3);
      targetDoc.line(6, y, 36, y);
      targetDoc.line(44, y, 74, y);
      targetDoc.setFontSize(6).setFont("helvetica", "bold");
      targetDoc.text("COBRANZAS", 21, y + 3, { align: 'center' });
      targetDoc.text("CLIENTE RECIBE", 59, y + 3, { align: 'center' });
      y += 7;

      return y;
    };

    const finalY = renderContent(dummyDoc);
    const doc = new jsPDF({ unit: 'mm', format: [80, Math.max(130, finalY)] });
    renderContent(doc);
    handlePDFOutput(doc, `TicketCobranza_${mode === 'PENDING_ONLY' ? 'Pendientes_' : ''}${group.clientName.replace(/\s+/g, '_')}.pdf`);
  };

  // =========================================================================
  // 5. REPORTE A4 MENSUAL DE COBRANZAS DE CLIENTE
  // =========================================================================
  const generateMonthCollectionsA4PDF = (group: ClientGroup, month: string, stats: { totalDue: number, totalPaid: number, balance: number, orders: ClientOrder[] }) => {
    const doc = new jsPDF();
    addAppWatermarkToPdf(doc);
    const branding = getEffectiveBranding({} as any, user);
    let y = 10;
    if (branding.logoUrl) {
      y = addLogoToPdf(doc, branding.logoUrl, { maxWidth: 30, maxHeight: 22, defaultX: 14, y });
    }

    doc.setFillColor(15, 23, 42);
    doc.rect(14, y, 182, 13, 'F');
    doc.setFontSize(11).setFont("helvetica", "bold").setTextColor(255, 255, 255);
    doc.text(`ESTADO DE COBRANZAS MENSUAL - ${month.toUpperCase()}`, 105, y + 8, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    y += 18;

    doc.setFontSize(8.5).setFont("helvetica", "bold");
    doc.text("CLIENTE:", 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(group.clientName.toUpperCase(), 35, y);

    doc.setFont("helvetica", "bold");
    doc.text("FECHA EMISIÓN:", 135, y);
    doc.setFont("helvetica", "normal");
    doc.text(new Date().toLocaleDateString(), 168, y);
    y += 4.5;

    if (group.clientDni) {
      doc.setFont("helvetica", "bold");
      doc.text("DNI / RUC:", 14, y);
      doc.setFont("helvetica", "normal");
      doc.text(group.clientDni, 35, y);
      y += 4.5;
    }

    let netMonthKg = 0;
    stats.orders.forEach(o => {
      netMonthKg += calculateBalance(o).netKg;
    });

    autoTable(doc, {
      startY: y + 2,
      head: [['Facturado en el Mes', 'Abonado en el Mes', 'Saldo del Mes', 'Kilos Netos Mes', 'Total Pesas']],
      body: [[
        `S/. ${stats.totalDue.toFixed(2)}`,
        `S/. ${stats.totalPaid.toFixed(2)}`,
        `S/. ${stats.balance.toFixed(2)}`,
        `${netMonthKg.toFixed(1)} kg`,
        `${stats.orders.length}`
      ]],
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
      styles: { fontSize: 8.5, halign: 'center', cellPadding: 2 }
    });

    y = (doc as any).lastAutoTable.finalY + 8;

    const rows = stats.orders.map((ord, idx) => {
      const bal = calculateBalance(ord);
      const isPaid = bal.balance <= 0.05 || ord.paymentStatus === 'PAID';
      const records = ord.records || [];
      const totalBirds = records.filter(r => r.type === 'FULL').reduce((a, b) => a + (b.birds || 0), 0);
      const totalCrates = records.filter(r => r.type === 'FULL').reduce((a, b) => a + (b.quantity || 1), 0);
      const dateStr = getSafeDateString(ord.date, ord.id);
      const batchStr = getBatchName(ord.batchId);

      return [
        String(idx + 1).padStart(2, '0'),
        dateStr,
        batchStr,
        `${bal.netKg.toFixed(1)} kg`,
        `${totalBirds}p / ${totalCrates}j`,
        `S/. ${bal.pricePerKg.toFixed(2)}`,
        `S/. ${bal.totalDue.toFixed(2)}`,
        `S/. ${bal.totalPaid.toFixed(2)}`,
        `S/. ${bal.balance.toFixed(2)}`,
        isPaid ? 'CANCELADO' : 'PENDIENTE'
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [['#', 'Día / Fecha', 'Lote', 'Neto (kg)', 'Pollos/Jabas', 'Precio/kg', 'Facturado', 'Abonado', 'Saldo', 'Estado']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold', halign: 'center' },
      styles: { fontSize: 7, cellPadding: 2, halign: 'center' },
      columnStyles: {
        0: { halign: 'center', cellWidth: 7 },
        1: { halign: 'center', cellWidth: 20 },
        2: { halign: 'left', cellWidth: 25 },
        3: { halign: 'right', cellWidth: 18, fontStyle: 'bold' },
        4: { halign: 'center', cellWidth: 20 },
        5: { halign: 'right', cellWidth: 16 },
        6: { halign: 'right', cellWidth: 20, fontStyle: 'bold' },
        7: { halign: 'right', cellWidth: 18 },
        8: { halign: 'right', cellWidth: 18, fontStyle: 'bold' },
        9: { halign: 'center', cellWidth: 20 }
      },
      margin: { left: 14, right: 14 }
    });

    y = (doc as any).lastAutoTable.finalY + 16;
    if (y > 240) {
      doc.addPage();
      addAppWatermarkToPdf(doc);
      y = 20;
    }
    doc.setLineWidth(0.4);
    doc.line(20, y, 75, y);
    doc.line(135, y, 190, y);
    doc.setFontSize(8).setFont("helvetica", "bold");
    doc.text("RESPONSABLE DE COBRANZAS", 47.5, y + 4, { align: 'center' });
    doc.text("CONFORMIDAD CLIENTE", 162.5, y + 4, { align: 'center' });

    handlePDFOutput(doc, `Cobranzas_${month.replace(/\s+/g, '_')}_${group.clientName.replace(/\s+/g, '_')}.pdf`);
  };

  // =========================================================================
  // 6. TICKET TÉRMICO 80mm MENSUAL DE COBRANZAS DE CLIENTE
  // =========================================================================
  const generateMonthCollectionsTicketPDF = (group: ClientGroup, month: string, stats: { totalDue: number, totalPaid: number, balance: number, orders: ClientOrder[] }) => {
    const branding = getEffectiveBranding({} as any, user);
    const dummyDoc = new jsPDF({ unit: 'mm', format: [80, 20000] });

    const renderContent = (targetDoc: any) => {
      let y = 8;
      addAppWatermarkToPdf(targetDoc);
      if (branding.logoUrl) {
        y = addLogoToPdf(targetDoc, branding.logoUrl, { maxWidth: 24, maxHeight: 22, defaultX: 28, y });
      }
      targetDoc.setFontSize(10.5).setFont("helvetica", "bold");
      const splitTitle = targetDoc.splitTextToSize(branding.companyName.toUpperCase(), 70);
      splitTitle.forEach((line: string) => {
        targetDoc.text(line, 40, y, { align: 'center' });
        y += 4;
      });
      targetDoc.setFontSize(8).setFont("helvetica", "bold");
      targetDoc.text("TICKET DE COBRANZAS MENSUAL", 40, y, { align: 'center' });
      y += 3.5;
      targetDoc.setFontSize(6.5).setFont("helvetica", "normal");
      targetDoc.text(`MES: ${month.toUpperCase()} | EMISIÓN: ${new Date().toLocaleDateString()}`, 40, y, { align: 'center' });
      y += 3;

      targetDoc.setLineWidth(0.3);
      targetDoc.line(5, y, 75, y);
      y += 3.5;

      targetDoc.setFontSize(7.5).setFont("helvetica", "bold");
      targetDoc.text("CLIENTE:", 5, y);
      targetDoc.setFont("helvetica", "normal");
      targetDoc.text(group.clientName.toUpperCase(), 25, y);
      y += 3.5;

      let netMonthKg = 0;
      stats.orders.forEach(o => {
        netMonthKg += calculateBalance(o).netKg;
      });

      autoTable(targetDoc, {
        startY: y,
        head: [[{ content: `RESUMEN MES ${month.toUpperCase()}`, colSpan: 2, styles: { halign: 'center', fillColor: [220, 226, 230], textColor: 0 } }]],
        body: [
          ['Peso Neto Mes:', `${netMonthKg.toFixed(1)} kg`],
          ['Total Facturado:', `S/. ${stats.totalDue.toFixed(2)}`],
          ['Total Abonado:', `S/. ${stats.totalPaid.toFixed(2)}`],
          ['SALDO PENDIENTE:', `S/. ${stats.balance.toFixed(2)}`]
        ],
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 1 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 }, 1: { halign: 'right', cellWidth: 28 } },
        margin: { left: 5, right: 5 }
      });
      y = (targetDoc as any).lastAutoTable.finalY + 3.5;

      const bodyRows = stats.orders.map(ord => {
        const bal = calculateBalance(ord);
        const dateStr = getSafeDateString(ord.date, ord.id);
        return [
          dateStr,
          `${bal.netKg.toFixed(1)}kg`,
          `S/.${bal.totalDue.toFixed(1)}`,
          `S/.${bal.balance.toFixed(1)}`
        ];
      });

      autoTable(targetDoc, {
        startY: y,
        head: [['FECHA', 'PESO', 'FACT.', 'SALDO']],
        body: bodyRows,
        theme: 'grid',
        headStyles: { fillColor: [220, 226, 230], textColor: 0, fontSize: 6, fontStyle: 'bold', halign: 'center' },
        styles: { fontSize: 6, cellPadding: 0.8, halign: 'center' },
        columnStyles: {
          0: { cellWidth: 20 },
          1: { cellWidth: 16 },
          2: { cellWidth: 17, halign: 'right' },
          3: { cellWidth: 17, halign: 'right', fontStyle: 'bold' }
        },
        margin: { left: 5, right: 5 }
      });
      y = (targetDoc as any).lastAutoTable.finalY + 6;

      targetDoc.setLineWidth(0.3);
      targetDoc.line(6, y, 36, y);
      targetDoc.line(44, y, 74, y);
      targetDoc.setFontSize(6).setFont("helvetica", "bold");
      targetDoc.text("COBRANZAS", 21, y + 3, { align: 'center' });
      targetDoc.text("CLIENTE RECIBE", 59, y + 3, { align: 'center' });
      y += 7;

      return y;
    };

    const finalY = renderContent(dummyDoc);
    const doc = new jsPDF({ unit: 'mm', format: [80, Math.max(130, finalY)] });
    renderContent(doc);
    handlePDFOutput(doc, `TicketCobranza_${month.replace(/\s+/g, '_')}_${group.clientName.replace(/\s+/g, '_')}.pdf`);
  };

  // ==========================================
  // 7. REGISTRO DE NUEVO ABONO
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

  const handleOpenClientPaymentModal = (group: ClientGroup) => {
    const pending = group.orders.filter(o => calculateBalance(o).balance > 0.05);
    const target = pending.length > 0 ? pending[0] : group.orders[0];
    if (target) {
      handleOpenPayModal(target);
    }
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
          <div className="flex flex-wrap items-center gap-3 self-stretch lg:self-auto">
            <div className="bg-white/10 p-1 rounded-2xl flex items-center border border-white/10">
              <button 
                onClick={() => setActiveMainSection('CLIENTS')}
                className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${activeMainSection === 'CLIENTS' ? 'bg-white text-slate-900 shadow-md' : 'text-blue-200 hover:text-white'}`}
                title="Gestión de Clientes y Estados de Cuenta"
              >
                <User size={15} /> Clientes & Cuentas
              </button>
              <button 
                onClick={() => setActiveMainSection('ALL_PAYMENTS')}
                className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${activeMainSection === 'ALL_PAYMENTS' ? 'bg-white text-slate-900 shadow-md' : 'text-blue-200 hover:text-white'}`}
                title="Historial de Últimos Abonos Realizados por Lote"
              >
                <History size={15} /> Últimos Abonos (Lotes)
              </button>
            </div>

            {activeMainSection === 'CLIENTS' && (
              <div className="bg-white/10 p-1 rounded-2xl flex items-center border border-white/10">
                <button 
                  onClick={() => setViewMode('LIST')}
                  className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${viewMode === 'LIST' ? 'bg-white text-slate-900 shadow-md' : 'text-blue-200 hover:text-white'}`}
                  title="Vista de Listado / Tabla Ordenada"
                >
                  <Layers size={15} /> Listado
                </button>
                <button 
                  onClick={() => setViewMode('GRID')}
                  className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${viewMode === 'GRID' ? 'bg-white text-slate-900 shadow-md' : 'text-blue-200 hover:text-white'}`}
                  title="Vista de Tarjetas Cuadrícula"
                >
                  <Wallet size={15} /> Tarjetas
                </button>
              </div>
            )}
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

      {/* 3. MAIN CONTENT: HISTORIAL GLOBAL DE PAGOS O LISTADO/CUADRÍCULA */}
      {activeMainSection === 'ALL_PAYMENTS' ? (
        <div className="space-y-4">
          {/* Header Summary for Global Payments */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                  <History size={20} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 uppercase text-base">Últimos Pagos Realizados según Lote Abonado</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Registro cronológico general de todos los abonos y cobranzas aplicados a cada lote de pesaje.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 self-stretch md:self-auto justify-between md:justify-end border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
              <div className="text-left md:text-right">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Total Abonos</span>
                <span className="font-digital text-xl font-bold text-slate-800">{filteredSystemPayments.length} registros</span>
              </div>
              <div className="text-left md:text-right">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 block">Monto Cobrado</span>
                <span className="font-digital text-xl font-bold text-emerald-600">
                  S/. {filteredSystemPayments.reduce((acc, p) => acc + p.amount, 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Payments Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {filteredSystemPayments.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[760px]">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-slate-200">
                      <th className="py-3 px-4">Fecha y Hora</th>
                      <th className="py-3 px-4">Cliente</th>
                      <th className="py-3 px-4">Lote Abonado</th>
                      <th className="py-3 px-3">Día Despacho</th>
                      <th className="py-3 px-3">N° Operación / Ref</th>
                      <th className="py-3 px-3">Método</th>
                      <th className="py-3 px-4 text-right">Monto Abonado</th>
                      <th className="py-3 px-4 text-right">Saldo Restante</th>
                      <th className="py-3 px-3">Registrado Por</th>
                      <th className="py-3 px-4 text-center">Ticket</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredSystemPayments.map((p) => {
                      const payDate = new Date(p.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
                      return (
                        <tr key={p.id} className="hover:bg-blue-50/20 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-800 text-[11px] whitespace-nowrap">
                            {payDate}
                          </td>
                          <td className="py-3 px-4 font-black text-slate-900 uppercase text-xs">
                            {p.order.clientName || 'Cliente'}
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-[10px] bg-blue-50 text-blue-800 font-black px-2.5 py-1 rounded-lg border border-blue-200 uppercase">
                              {p.batchName}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-600 font-medium">
                            {p.orderDate}
                          </td>
                          <td className="py-3 px-3 font-mono text-[11px] text-slate-600">
                            {p.operationNumber || `REC-${p.id.slice(-6).toUpperCase()}`}
                          </td>
                          <td className="py-3 px-3">
                            <span className="text-[9px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded uppercase">
                              {p.method || 'EFECTIVO'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-digital font-black text-emerald-600 text-sm">
                            S/. {p.amount.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-digital font-bold text-slate-700">
                            S/. {p.orderBalance.toFixed(2)}
                          </td>
                          <td className="py-3 px-3 text-[10px] text-slate-500">
                            {p.registeredByName || 'Caja Central'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => {
                                const targetPayment = (p.order.payments || []).find(x => x.id === p.id);
                                if (targetPayment) {
                                  const prevB = p.orderBalance + p.amount;
                                  generateReceiptPDF(p.order, targetPayment, prevB, p.orderBalance);
                                }
                              }}
                              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-black uppercase flex items-center gap-1 mx-auto transition-colors border border-emerald-200"
                              title="Reimprimir Ticket de este Abono"
                            >
                              <Printer size={11} /> Ticket
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-16 text-center text-slate-400">
                <History size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-black uppercase tracking-wider text-slate-700">No se encontraron abonos</p>
                <p className="text-xs text-slate-400 mt-1">No hay abonos registrados para la búsqueda o filtros aplicados.</p>
              </div>
            )}
          </div>
        </div>
      ) : viewMode === 'LIST' ? (
        
        /* === VISTA DE LISTADO DE CLIENTES AGRUPADOS === */
        <div className="space-y-4">
          {clientGroups.map((group) => {
            const isExpanded = expandedClients[group.clientName];
            const isFullyPaid = group.balance <= 0.05;
            const isPartial = group.totalPaid > 0 && !isFullyPaid;

            // Group orders by month
            const monthlyStats: Record<string, { totalDue: number, totalPaid: number, balance: number, netKg: number, orders: ClientOrder[] }> = {};
            
            group.orders.forEach(order => {
               const orderDate = getSafeDateObj(order.date, order.id);
               const monthYear = orderDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
               if (!monthlyStats[monthYear]) {
                 monthlyStats[monthYear] = { totalDue: 0, totalPaid: 0, balance: 0, netKg: 0, orders: [] };
               }
               const bal = calculateBalance(order);
               monthlyStats[monthYear].totalDue += bal.totalDue;
               monthlyStats[monthYear].totalPaid += bal.totalPaid;
               monthlyStats[monthYear].balance += bal.balance;
               monthlyStats[monthYear].netKg += bal.netKg;
               monthlyStats[monthYear].orders.push(order);
            });

            return (
              <div key={group.clientName} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div 
                  onClick={() => toggleClientExpansion(group.clientName)}
                  className={`p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-inner ${isFullyPaid ? 'bg-emerald-100 text-emerald-600' : isPartial ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'}`}>
                      {isFullyPaid ? <CheckCircle2 size={20} /> : <Wallet size={20} />}
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 uppercase text-sm md:text-base">{group.clientName}</h3>
                      <p className="text-[10px] md:text-xs font-bold text-slate-500 uppercase mt-0.5">
                        {group.orders.length} Órdenes Registradas {group.clientDni && `• DNI: ${group.clientDni}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between md:justify-end gap-3 md:gap-5 w-full md:w-auto">
                    <div className="text-left md:text-right">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Deuda General</p>
                      <p className={`font-digital font-bold text-lg md:text-xl ${isFullyPaid ? 'text-emerald-600' : 'text-red-600'}`}>
                        S/. {group.balance.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-left md:text-right hidden sm:block">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Facturado / Abonado</p>
                      <p className="font-digital font-bold text-slate-700 text-sm">
                        S/. {group.totalDue.toFixed(2)} / <span className="text-emerald-600">S/. {group.totalPaid.toFixed(2)}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedClientStatement(group); setStatementModalTab('DAYS'); }}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase flex items-center gap-1 shadow-sm active:scale-95 transition-all"
                        title="Abrir Estado de Cuenta del Cliente (General, Desglose por Días y Últimos Pagos)"
                      >
                        <FileText size={12} /> Estado de Cuenta
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleOpenClientPaymentModal(group); }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase flex items-center gap-1 shadow-sm active:scale-95 transition-all"
                        title="Registrar Abono a cuenta de este cliente"
                      >
                        <DollarSign size={12} /> + Abono
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); generateClientCollectionsA4PDF(group); }}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-bold flex items-center gap-1 transition-all"
                        title="Descargar Reporte Completo de Cobranzas A4"
                      >
                        <FileText size={12} /> A4
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); generateClientCollectionsTicketPDF(group); }}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-bold flex items-center gap-1 transition-all"
                        title="Imprimir Ticket Térmico de Cobranza 80mm"
                      >
                        <Printer size={12} /> Ticket
                      </button>
                      <div className="p-1.5 bg-slate-100 text-slate-400 rounded-lg">
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </div>
                    </div>
                  </div>
                </div>

                {isExpanded && (() => {
                  const clientPayments = getClientPayments(group.orders);
                  const pendingOrders = group.orders.filter(o => calculateBalance(o).balance > 0.05);
                  const activeTab = clientActiveTab[group.clientName] || 'DAYS';
                  const currentDayFilter = clientDayFilter[group.clientName] || 'ALL';

                  return (
                    <div className="border-t border-slate-100 bg-slate-50/70 p-3 md:p-5 animate-fade-in space-y-4">
                      {/* Tab Navigation for Client Breakdown */}
                      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => setClientActiveTab(prev => ({ ...prev, [group.clientName]: 'DAYS' }))}
                            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all ${activeTab === 'DAYS' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                          >
                            <CalendarDays size={14} /> Desglose por Días y Meses ({group.orders.length})
                          </button>
                          <button
                            onClick={() => setClientActiveTab(prev => ({ ...prev, [group.clientName]: 'PAYMENTS' }))}
                            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all ${activeTab === 'PAYMENTS' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                          >
                            <History size={14} /> Últimos Pagos según Lote ({clientPayments.length})
                          </button>
                          <button
                            onClick={() => setClientActiveTab(prev => ({ ...prev, [group.clientName]: 'PENDING' }))}
                            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all ${activeTab === 'PENDING' ? 'bg-red-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                          >
                            <AlertCircle size={14} /> Cuentas Pendientes por Pagar ({pendingOrders.length})
                          </button>
                        </div>

                        {/* Quick Report Downloads for this Client */}
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => generateClientCollectionsA4PDF(group, 'PENDING_ONLY')}
                            className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all"
                            title="Descargar solo órdenes con saldo pendiente en A4"
                          >
                            <FileText size={12} /> A4 Solo Pendientes
                          </button>
                          <button
                            onClick={() => generateClientCollectionsTicketPDF(group, 'PENDING_ONLY')}
                            className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all"
                            title="Ticket solo órdenes con saldo pendiente"
                          >
                            <Printer size={12} /> Ticket Solo Pendientes
                          </button>
                        </div>
                      </div>

                      {/* TAB 1: DESGLOSE POR DÍAS Y MESES */}
                      {activeTab === 'DAYS' && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                              Historial Cronológico de Pesajes y Despachos
                            </span>
                            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-[10px] font-bold">
                              <button
                                onClick={() => setClientDayFilter(prev => ({ ...prev, [group.clientName]: 'ALL' }))}
                                className={`px-2.5 py-1 rounded-lg transition-colors ${currentDayFilter === 'ALL' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                              >
                                Todos ({group.orders.length})
                              </button>
                              <button
                                onClick={() => setClientDayFilter(prev => ({ ...prev, [group.clientName]: 'PENDING' }))}
                                className={`px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 ${currentDayFilter === 'PENDING' ? 'bg-red-600 text-white' : 'text-red-700 hover:bg-red-50'}`}
                              >
                                Solo Pendientes ({pendingOrders.length})
                              </button>
                            </div>
                          </div>

                          {Object.entries(monthlyStats).map(([month, stats]) => {
                            const displayOrders = currentDayFilter === 'PENDING'
                              ? stats.orders.filter(o => calculateBalance(o).balance > 0.05)
                              : stats.orders;

                            if (displayOrders.length === 0 && currentDayFilter === 'PENDING') return null;

                            return (
                              <div key={month} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                                <div className="bg-slate-100/90 p-3 border-b border-slate-200 flex flex-wrap justify-between items-center gap-2">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-black text-slate-800 uppercase text-xs tracking-wider capitalize">{month}</h4>
                                    <span className="text-[10px] bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded-full">{displayOrders.length} pesas</span>
                                    <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full">{stats.netKg.toFixed(1)} kg</span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className="text-[10px] font-bold text-slate-500 uppercase">Facturado: <span className="text-slate-800">S/. {stats.totalDue.toFixed(2)}</span></div>
                                    <div className="text-[10px] font-bold text-slate-500 uppercase">Saldo: <span className={`${stats.balance <= 0.05 ? 'text-emerald-600' : 'text-red-600'}`}>S/. {stats.balance.toFixed(2)}</span></div>
                                    
                                    <div className="flex items-center gap-1 border-l border-slate-300 pl-2">
                                      <button
                                        onClick={() => generateMonthCollectionsA4PDF(group, month, stats)}
                                        className="px-2 py-1 bg-white hover:bg-slate-200 border border-slate-300 text-slate-700 rounded text-[9px] font-bold flex items-center gap-1 transition-colors"
                                        title="Descargar Reporte del Mes (A4)"
                                      >
                                        <FileText size={11} /> Mes A4
                                      </button>
                                      <button
                                        onClick={() => generateMonthCollectionsTicketPDF(group, month, stats)}
                                        className="px-2 py-1 bg-white hover:bg-slate-200 border border-slate-300 text-slate-700 rounded text-[9px] font-bold flex items-center gap-1 transition-colors"
                                        title="Imprimir Ticket del Mes (80mm)"
                                      >
                                        <Printer size={11} /> Ticket
                                      </button>
                                    </div>
                                  </div>
                                </div>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left border-collapse min-w-[650px]">
                                    <thead>
                                      <tr className="bg-slate-50 text-slate-500 text-[9px] font-black uppercase tracking-widest border-b border-slate-100">
                                        <th className="py-2.5 px-4">Día / Fecha de Pesaje</th>
                                        <th className="py-2.5 px-3">Lote Abonado</th>
                                        <th className="py-2.5 px-3 text-right">Detalle Pesas</th>
                                        <th className="py-2.5 px-3 text-right">Facturado</th>
                                        <th className="py-2.5 px-3 text-right">Abonado</th>
                                        <th className="py-2.5 px-3 text-right">Saldo Deudor</th>
                                        <th className="py-2.5 px-3">Último Pago en Lote</th>
                                        <th className="py-2.5 px-4 text-center">Acciones</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50 text-xs">
                                      {displayOrders.map(order => {
                                        const { totalDue, totalPaid, balance, netKg, pricePerKg } = calculateBalance(order);
                                        const isOrderPaid = balance <= 0.05 || order.paymentStatus === 'PAID';
                                        const batchName = getBatchName(order.batchId);
                                        const orderDate = getSafeDateString(order.date, order.id);
                                        const records = order.records || [];
                                        const totalBirds = records.filter(r => r.type === 'FULL').reduce((a, b) => a + (b.birds || 0), 0);
                                        const totalCrates = records.filter(r => r.type === 'FULL').reduce((a, b) => a + (b.quantity || 1), 0);
                                        const lastP = (order.payments && order.payments.length > 0) ? order.payments[order.payments.length - 1] : null;

                                        return (
                                          <tr key={order.id} className="hover:bg-blue-50/30 transition-colors bg-white">
                                            <td className="py-2.5 px-4">
                                              <div className="font-black text-slate-800 text-[11px]">{orderDate}</div>
                                              <div className="text-[9px] text-slate-400 font-mono">ID: {order.id.slice(-6)}</div>
                                            </td>
                                            <td className="py-2.5 px-3">
                                              <span className="text-[10px] bg-slate-100 text-slate-800 font-bold px-2 py-0.5 rounded-lg border border-slate-200 uppercase">{batchName}</span>
                                            </td>
                                            <td className="py-2.5 px-3 text-right">
                                              <div className="font-black text-slate-800 text-[11px]">{netKg.toFixed(1)} kg</div>
                                              <div className="text-[9px] text-slate-400">{totalBirds}p / {totalCrates}j @ S/.{pricePerKg.toFixed(2)}</div>
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-digital font-bold text-slate-700">S/. {totalDue.toFixed(2)}</td>
                                            <td className="py-2.5 px-3 text-right font-digital font-bold text-emerald-600">S/. {totalPaid.toFixed(2)}</td>
                                            <td className="py-2.5 px-3 text-right font-digital font-black">
                                              <span className={isOrderPaid ? 'text-emerald-600' : 'text-red-600'}>S/. {balance.toFixed(2)}</span>
                                            </td>
                                            <td className="py-2.5 px-3">
                                              {lastP ? (
                                                <div>
                                                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                                    +S/. {lastP.amount.toFixed(2)}
                                                  </span>
                                                  <span className="text-[9px] text-slate-400 block mt-0.5">
                                                    {new Date(lastP.timestamp).toLocaleDateString([], { dateStyle: 'short' })} • {lastP.method || 'Efectivo'}
                                                  </span>
                                                </div>
                                              ) : (
                                                <span className="text-[9px] text-slate-400 italic">Sin abonos</span>
                                              )}
                                            </td>
                                            <td className="py-2.5 px-4 text-center">
                                              <div className="flex items-center justify-center gap-1.5">
                                                {!isOrderPaid ? (
                                                  <button 
                                                    onClick={(e) => { e.stopPropagation(); handleOpenPayModal(order); }}
                                                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[9px] font-black uppercase flex items-center gap-1 shadow-sm active:scale-95 transition-all"
                                                    title="Abonar a este lote"
                                                  >
                                                    <DollarSign size={11} /> Abonar
                                                  </button>
                                                ) : (
                                                  <span className="px-2 py-1 bg-emerald-50 text-emerald-700 text-[9px] font-black rounded-lg uppercase">
                                                    Al Día
                                                  </span>
                                                )}
                                                <button 
                                                  onClick={(e) => { e.stopPropagation(); setViewHistoryOrder(order); }}
                                                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-blue-600 rounded-lg transition-colors"
                                                  title="Historial de Abonos de este lote"
                                                >
                                                  <History size={13} />
                                                </button>
                                                <button 
                                                  onClick={(e) => { e.stopPropagation(); generateBankStatementPDF(order); }}
                                                  className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors"
                                                  title="Estado de Cuenta A4 de este despacho"
                                                >
                                                  <FileText size={13} />
                                                </button>
                                              </div>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* TAB 2: ÚLTIMOS PAGOS SEGÚN LOTE ABONADO */}
                      {activeTab === 'PAYMENTS' && (
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                          <div className="p-4 bg-emerald-50/50 border-b border-emerald-100 flex flex-wrap justify-between items-center gap-2">
                            <div>
                              <h4 className="font-black text-emerald-950 uppercase text-xs tracking-wider">
                                Historial de Últimos Pagos y Abonos Realizados
                              </h4>
                              <p className="text-[10px] text-emerald-700 mt-0.5">
                                {clientPayments.length} pagos registrados a nombre de {group.clientName} clasificados por lote abonado
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] font-bold text-slate-500 uppercase">Total Amortizado:</span>
                              <span className="font-digital font-bold text-emerald-700 text-base ml-2">
                                S/. {clientPayments.reduce((acc, curr) => acc + curr.amount, 0).toFixed(2)}
                              </span>
                            </div>
                          </div>

                          {clientPayments.length > 0 ? (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left border-collapse min-w-[700px]">
                                <thead>
                                  <tr className="bg-slate-50 text-slate-500 text-[9px] font-black uppercase tracking-widest border-b border-slate-100">
                                    <th className="py-2.5 px-4">Fecha y Hora del Pago</th>
                                    <th className="py-2.5 px-3">Lote Abonado</th>
                                    <th className="py-2.5 px-3">Día Despacho</th>
                                    <th className="py-2.5 px-3">N° Operación / Ref</th>
                                    <th className="py-2.5 px-3">Método</th>
                                    <th className="py-2.5 px-3 text-right">Monto Abonado</th>
                                    <th className="py-2.5 px-3 text-right">Saldo Restante Lote</th>
                                    <th className="py-2.5 px-3">Registrado Por</th>
                                    <th className="py-2.5 px-4 text-center">Comprobante</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-xs">
                                  {clientPayments.map((p) => {
                                    const payDateFormatted = new Date(p.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
                                    return (
                                      <tr key={p.id} className="hover:bg-emerald-50/20 transition-colors">
                                        <td className="py-2.5 px-4 font-bold text-slate-800 text-[11px]">
                                          {payDateFormatted}
                                        </td>
                                        <td className="py-2.5 px-3">
                                          <span className="text-[10px] bg-blue-50 text-blue-800 font-black px-2 py-0.5 rounded-lg border border-blue-200 uppercase">
                                            {p.batchName}
                                          </span>
                                        </td>
                                        <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                                          {p.orderDate}
                                        </td>
                                        <td className="py-2.5 px-3 font-mono text-[10px] text-slate-600">
                                          {p.operationNumber || `REC-${p.id.slice(-6).toUpperCase()}`}
                                        </td>
                                        <td className="py-2.5 px-3">
                                          <span className="text-[9px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded uppercase">
                                            {p.method || 'EFECTIVO'}
                                          </span>
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-digital font-black text-emerald-600 text-sm">
                                          S/. {p.amount.toFixed(2)}
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-digital font-bold text-slate-700">
                                          S/. {p.orderBalance.toFixed(2)}
                                        </td>
                                        <td className="py-2.5 px-3 text-[10px] text-slate-500">
                                          {p.registeredByName || 'Caja Central'}
                                        </td>
                                        <td className="py-2.5 px-4 text-center">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const targetPayment = (p.order.payments || []).find(x => x.id === p.id);
                                              if (targetPayment) {
                                                const prevB = p.orderBalance + p.amount;
                                                generateReceiptPDF(p.order, targetPayment, prevB, p.orderBalance);
                                              }
                                            }}
                                            className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[9px] font-black uppercase flex items-center gap-1 mx-auto transition-colors border border-emerald-200"
                                            title="Reimprimir Ticket de este Abono"
                                          >
                                            <Printer size={11} /> Ticket
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="p-8 text-center text-slate-400">
                              <History size={24} className="mx-auto mb-2 opacity-40" />
                              <p className="text-xs font-bold uppercase tracking-wider">No se registran abonos aún para este cliente</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* TAB 3: CUENTAS PENDIENTES POR PAGAR */}
                      {activeTab === 'PENDING' && (
                        <div className="space-y-4">
                          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                            <div>
                              <span className="text-[10px] font-black uppercase tracking-widest text-red-700 block">
                                Total Deuda Pendiente del Cliente
                              </span>
                              <p className="font-digital text-2xl font-black text-red-600 mt-0.5">
                                S/. {group.balance.toFixed(2)}
                              </p>
                              <p className="text-[11px] text-red-600/80 font-medium">
                                {pendingOrders.length} {pendingOrders.length === 1 ? 'cuenta / día con saldo pendiente' : 'cuentas / días con saldo pendiente'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => generateClientCollectionsA4PDF(group, 'PENDING_ONLY')}
                                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black uppercase flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                              >
                                <FileText size={14} /> PDF A4 Solo Pendientes
                              </button>
                              <button
                                onClick={() => generateClientCollectionsTicketPDF(group, 'PENDING_ONLY')}
                                className="px-3 py-2 bg-white hover:bg-red-50 text-red-700 border border-red-300 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                              >
                                <Printer size={14} /> Ticket Solo Pendientes
                              </button>
                            </div>
                          </div>

                          {pendingOrders.length > 0 ? (
                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                              <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse min-w-[650px]">
                                  <thead>
                                    <tr className="bg-slate-50 text-slate-500 text-[9px] font-black uppercase tracking-widest border-b border-slate-100">
                                      <th className="py-2.5 px-4">Día / Fecha</th>
                                      <th className="py-2.5 px-3">Lote Pendiente</th>
                                      <th className="py-2.5 px-3 text-right">Peso Neto</th>
                                      <th className="py-2.5 px-3 text-right">Total Facturado</th>
                                      <th className="py-2.5 px-3 text-right">Total Ya Abonado</th>
                                      <th className="py-2.5 px-3 text-right text-red-600">Saldo que le queda</th>
                                      <th className="py-2.5 px-4 text-center">Acción</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 text-xs">
                                    {pendingOrders.map(order => {
                                      const { totalDue, totalPaid, balance, netKg } = calculateBalance(order);
                                      const batchName = getBatchName(order.batchId);
                                      const orderDate = getSafeDateString(order.date, order.id);

                                      return (
                                        <tr key={order.id} className="hover:bg-red-50/30 transition-colors">
                                          <td className="py-2.5 px-4 font-black text-slate-800 text-[11px]">
                                            {orderDate}
                                          </td>
                                          <td className="py-2.5 px-3">
                                            <span className="text-[10px] bg-red-50 text-red-800 font-black px-2 py-0.5 rounded-lg border border-red-200 uppercase">
                                              {batchName}
                                            </span>
                                          </td>
                                          <td className="py-2.5 px-3 text-right font-bold text-slate-700">
                                            {netKg.toFixed(1)} kg
                                          </td>
                                          <td className="py-2.5 px-3 text-right font-digital font-bold text-slate-700">
                                            S/. {totalDue.toFixed(2)}
                                          </td>
                                          <td className="py-2.5 px-3 text-right font-digital font-bold text-emerald-600">
                                            S/. {totalPaid.toFixed(2)}
                                          </td>
                                          <td className="py-2.5 px-3 text-right font-digital font-black text-red-600 text-base">
                                            S/. {balance.toFixed(2)}
                                          </td>
                                          <td className="py-2.5 px-4 text-center">
                                            <button
                                              onClick={(e) => { e.stopPropagation(); handleOpenPayModal(order); }}
                                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[9px] font-black uppercase flex items-center gap-1 mx-auto shadow-sm active:scale-95 transition-all"
                                            >
                                              <DollarSign size={11} /> Abonar a este Lote
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ) : (
                            <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-emerald-600">
                              <CheckCircle2 size={28} className="mx-auto mb-2" />
                              <p className="text-sm font-black uppercase tracking-wider">¡El cliente está 100% al día!</p>
                              <p className="text-xs text-slate-400 mt-0.5">No tiene ningún saldo ni cuenta pendiente por pagar.</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
          
          {clientGroups.length === 0 && (
            <div className="p-16 text-center bg-white rounded-2xl shadow-sm border border-slate-200">
              <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
                <FileText size={28} />
              </div>
              <p className="text-sm font-black text-slate-700 uppercase tracking-wider">No se encontraron clientes</p>
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
            const orderDate = getSafeDateString(order.date, order.id);

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
      {selectedOrderForPay && (() => {
        const currentBal = calculateBalance(selectedOrderForPay);
        const records = selectedOrderForPay.records || [];
        const totalBirds = records.filter(r => r.type === 'FULL').reduce((a, b) => a + (b.birds || 0), 0);
        const totalCrates = records.filter(r => r.type === 'FULL').reduce((a, b) => a + (b.quantity || 1), 0);
        const clientOrdersList = orders
          .filter(o => (o.clientName || '').trim().toLowerCase() === (selectedOrderForPay.clientName || '').trim().toLowerCase())
          .sort((a, b) => getSafeDateObj(b.date, b.id).getTime() - getSafeDateObj(a.date, a.id).getTime());

        return (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in overflow-y-auto">
            <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden animate-scale-up my-auto">
              
              {/* Modal Header */}
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                    <DollarSign size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black uppercase tracking-tight">Registrar Abono a Cuenta</h3>
                    <p className="text-xs text-slate-400 font-medium">{selectedOrderForPay.clientName} {selectedOrderForPay.clientDni && `• DNI: ${selectedOrderForPay.clientDni}`}</p>
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
              <div className="p-6 md:p-8 space-y-4">
                
                {/* Selector de Fecha de Pesaje / Cuenta a Abonar */}
                {clientOrdersList.length > 1 && (
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 ml-1">
                      📅 Seleccionar Fecha de Pesaje / Cuenta a Abonar
                    </label>
                    <select
                      value={selectedOrderForPay.id}
                      onChange={(e) => {
                        const ord = clientOrdersList.find(o => o.id === e.target.value);
                        if (ord) handleOpenPayModal(ord);
                      }}
                      className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 font-bold text-xs text-slate-800 outline-none focus:border-blue-500"
                    >
                      {clientOrdersList.map(ord => {
                        const b = calculateBalance(ord);
                        const isP = b.balance <= 0.05 || ord.paymentStatus === 'PAID';
                        const dStr = getSafeDateString(ord.date, ord.id);
                        const bName = getBatchName(ord.batchId);
                        return (
                          <option key={ord.id} value={ord.id}>
                            {dStr} - {bName} | Peso: {b.netKg.toFixed(1)}kg | Saldo: S/. {b.balance.toFixed(2)} {isP ? '✓ (CANCELADO)' : '⚠️ PENDIENTE'}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                {/* Tarjeta de Información Detallada de la Pesa Seleccionada */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Día y Lote de Pesaje</span>
                      <span className="text-xs font-bold text-slate-800">
                        {getSafeDateString(selectedOrderForPay.date, selectedOrderForPay.id)} • {getBatchName(selectedOrderForPay.batchId)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Saldo Pendiente</span>
                      <span className={`font-digital font-black text-xl ${currentBal.balance <= 0.05 ? 'text-emerald-600' : 'text-red-600'}`}>
                        S/. {currentBal.balance.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-200/60 text-[10px]">
                    <div>
                      <span className="text-slate-400 block font-bold">Peso Neto:</span>
                      <span className="font-bold text-slate-700">{currentBal.netKg.toFixed(1)} kg</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-bold">Carga:</span>
                      <span className="font-bold text-slate-700">{totalBirds}p / {totalCrates}j</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-bold">Precio / kg:</span>
                      <span className="font-bold text-slate-700">S/. {currentBal.pricePerKg.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="flex justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-200/60">
                    <span>Total Facturado: <strong className="text-slate-700">S/. {currentBal.totalDue.toFixed(2)}</strong></span>
                    <span>Total Ya Abonado: <strong className="text-emerald-600">S/. {currentBal.totalPaid.toFixed(2)}</strong></span>
                  </div>
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
                      onClick={() => setPayAmount(currentBal.balance.toFixed(2))}
                      className="flex-1 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-black text-[10px] uppercase tracking-wider rounded-lg transition-colors"
                    >
                      100% (Cancelar)
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setPayAmount((currentBal.balance / 2).toFixed(2))}
                      className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-[10px] uppercase tracking-wider rounded-lg transition-colors"
                    >
                      50%
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setPayAmount((currentBal.balance * 0.25).toFixed(2))}
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
                    S/. {Math.max(0, currentBal.balance - (parseFloat(payAmount) || 0)).toFixed(2)}
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
        );
      })()}

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
                      
                      {(() => {
                        const balInfo = calculateBalance(viewHistoryOrder);
                        const baseChickenCost = balInfo.netKg * balInfo.pricePerKg;
                        let runningBalance = baseChickenCost;
                        
                        return (
                          <>
                            {/* Fila 0: Cargo Inicial */}
                            <tr className="bg-slate-50/50">
                              <td className="p-3.5 text-slate-600 font-bold">
                                {getSafeDateString(viewHistoryOrder.date, viewHistoryOrder.id)}
                              </td>
                              <td className="p-3.5 font-sans font-black text-slate-800">
                                Liquidación Inicial Aves
                              </td>
                              <td className="p-3.5 text-slate-400">
                                VTA-{viewHistoryOrder.id.slice(-6).toUpperCase()}
                              </td>
                              <td className="p-3.5 text-right font-bold text-slate-900">
                                {baseChickenCost.toFixed(2)}
                              </td>
                              <td className="p-3.5 text-right text-slate-400">-</td>
                              <td className="p-3.5 text-right font-bold text-red-600">
                                {runningBalance.toFixed(2)}
                              </td>
                              <td className="p-3.5 text-center text-slate-300">-</td>
                              <td className="p-3.5 text-center text-slate-300">-</td>
                            </tr>

                            {/* Filas de Cargos Extras */}
                            {(viewHistoryOrder.additionalItems || []).map(item => {
                              const itemTotal = item.quantity * item.pricePerUnit;
                              runningBalance += itemTotal;
                              return (
                                <tr key={item.id} className="bg-amber-50/30">
                                  <td className="p-3.5 text-slate-600 font-bold">
                                    {getSafeDateString(viewHistoryOrder.date, viewHistoryOrder.id)}
                                  </td>
                                  <td className="p-3.5 font-sans font-black text-amber-900">
                                    Cargo Extra: {item.name}
                                  </td>
                                  <td className="p-3.5 text-slate-400">
                                    EXT-{item.id.slice(-6).toUpperCase()}
                                  </td>
                                  <td className="p-3.5 text-right font-bold text-slate-900">
                                    {itemTotal.toFixed(2)}
                                  </td>
                                  <td className="p-3.5 text-right text-slate-400">-</td>
                                  <td className="p-3.5 text-right font-bold text-red-600">
                                    {runningBalance.toFixed(2)}
                                  </td>
                                  <td className="p-3.5 text-center text-slate-300">-</td>
                                  <td className="p-3.5 text-center text-slate-300">-</td>
                                </tr>
                              );
                            })}

                            {/* Filas de Abonos */}
                            {[...(viewHistoryOrder.payments || [])].sort((a, b) => a.timestamp - b.timestamp).map(pay => {
                              const prevBal = runningBalance;
                              runningBalance = Math.max(0, runningBalance - pay.amount);

                              return (
                                <tr key={pay.id} className="hover:bg-emerald-50/40 transition-colors">
                                  <td className="p-3.5 text-slate-600 font-bold">
                                    {getSafeDateString(pay.timestamp, '0')}{' '}
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
                        })}
                      </>
                    );
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

      {/* 6. MODAL ESTADO DE CUENTA INTEGRAL DEL CLIENTE (DESGLOSE POR DÍAS Y ÚLTIMOS PAGOS SEGÚN LOTE) */}
      {selectedClientStatement && (() => {
        const clientPayments = getClientPayments(selectedClientStatement.orders);
        const pendingOrders = selectedClientStatement.orders.filter(o => calculateBalance(o).balance > 0.05);
        const isClientPaid = selectedClientStatement.balance <= 0.05;

        // Group by month
        const monthlyStats: Record<string, { totalDue: number, totalPaid: number, balance: number, netKg: number, orders: ClientOrder[] }> = {};
        selectedClientStatement.orders.forEach(order => {
          const orderDate = getSafeDateObj(order.date, order.id);
          const monthYear = orderDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
          if (!monthlyStats[monthYear]) {
            monthlyStats[monthYear] = { totalDue: 0, totalPaid: 0, balance: 0, netKg: 0, orders: [] };
          }
          const bal = calculateBalance(order);
          monthlyStats[monthYear].totalDue += bal.totalDue;
          monthlyStats[monthYear].totalPaid += bal.totalPaid;
          monthlyStats[monthYear].balance += bal.balance;
          monthlyStats[monthYear].netKg += bal.netKg;
          monthlyStats[monthYear].orders.push(order);
        });

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-slate-950/80 backdrop-blur-md animate-fade-in">
            <div className="bg-slate-50 w-full max-w-6xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
              {/* Header */}
              <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-5 md:p-6 text-white flex flex-wrap justify-between items-center gap-4 shrink-0">
                <div className="flex items-center gap-3.5">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isClientPaid ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                    <FileText size={24} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-blue-300 bg-blue-500/20 px-2 py-0.5 rounded-md border border-blue-400/20">
                        Estado de Cuenta de Cliente
                      </span>
                      {selectedClientStatement.clientDni && (
                        <span className="text-[10px] text-slate-300 font-mono">DNI: {selectedClientStatement.clientDni}</span>
                      )}
                    </div>
                    <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight text-white mt-1">
                      {selectedClientStatement.clientName}
                    </h2>
                  </div>
                </div>

                {/* PDF & Print Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => generateClientCollectionsA4PDF(selectedClientStatement)}
                    className="px-3 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition-all"
                    title="Reporte A4 Completo"
                  >
                    <FileText size={14} /> Reporte A4
                  </button>
                  <button
                    onClick={() => generateClientCollectionsTicketPDF(selectedClientStatement)}
                    className="px-3 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition-all"
                    title="Ticket Térmico Completo"
                  >
                    <Printer size={14} /> Ticket 80mm
                  </button>
                  <button
                    onClick={() => generateClientCollectionsA4PDF(selectedClientStatement, 'PENDING_ONLY')}
                    className="px-3 py-2 bg-red-600/80 hover:bg-red-600 border border-red-500 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition-all"
                    title="Reporte A4 Solo Pendientes"
                  >
                    <AlertCircle size={14} /> A4 Solo Pendientes
                  </button>
                  <button
                    onClick={() => setSelectedClientStatement(null)}
                    className="p-2 bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white rounded-xl transition-all ml-1"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* General Financial Summary */}
              <div className="bg-white p-4 md:p-5 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Total Facturado</span>
                  <span className="font-digital text-lg md:text-xl font-bold text-slate-900 mt-1 block">
                    S/. {selectedClientStatement.totalDue.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-500 font-bold">{selectedClientStatement.orders.length} pesajes en total</span>
                </div>

                <div className="bg-emerald-50/60 p-3.5 rounded-2xl border border-emerald-200">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 block">Total Abonado</span>
                  <span className="font-digital text-lg md:text-xl font-bold text-emerald-700 mt-1 block">
                    S/. {selectedClientStatement.totalPaid.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-emerald-600 font-bold">{clientPayments.length} abonos realizados</span>
                </div>

                <div className={`p-3.5 rounded-2xl border ${isClientPaid ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                  <span className={`text-[10px] font-black uppercase tracking-widest block ${isClientPaid ? 'text-emerald-700' : 'text-red-700'}`}>
                    Saldo Deudor General
                  </span>
                  <span className={`font-digital text-xl md:text-2xl font-black mt-1 block ${isClientPaid ? 'text-emerald-600' : 'text-red-600'}`}>
                    S/. {selectedClientStatement.balance.toFixed(2)}
                  </span>
                  <span className={`text-[10px] font-bold ${isClientPaid ? 'text-emerald-600' : 'text-red-600'}`}>
                    {isClientPaid ? 'Cuenta cancelada' : `${pendingOrders.length} cuentas con saldo`}
                  </span>
                </div>

                <div className="bg-blue-50/60 p-3.5 rounded-2xl border border-blue-200 flex flex-col justify-center">
                  <button
                    onClick={() => {
                      handleOpenClientPaymentModal(selectedClientStatement);
                    }}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                  >
                    <DollarSign size={15} /> + Registrar Abono
                  </button>
                </div>
              </div>

              {/* Subtabs Bar */}
              <div className="bg-slate-100 px-4 md:px-6 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setStatementModalTab('DAYS')}
                    className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all ${statementModalTab === 'DAYS' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-200'}`}
                  >
                    <CalendarDays size={14} /> Desglose por Días y Lotes ({selectedClientStatement.orders.length})
                  </button>
                  <button
                    onClick={() => setStatementModalTab('PAYMENTS')}
                    className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all ${statementModalTab === 'PAYMENTS' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-200'}`}
                  >
                    <History size={14} /> Últimos Pagos Realizados según Lote ({clientPayments.length})
                  </button>
                  <button
                    onClick={() => setStatementModalTab('PENDING')}
                    className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all ${statementModalTab === 'PENDING' ? 'bg-red-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-200'}`}
                  >
                    <AlertCircle size={14} /> Cuentas Pendientes que le Quedan ({pendingOrders.length})
                  </button>
                </div>

                {statementModalTab === 'DAYS' && (
                  <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-[10px] font-bold">
                    <button
                      onClick={() => setStatementDayFilter('ALL')}
                      className={`px-2.5 py-1 rounded-lg transition-colors ${statementDayFilter === 'ALL' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                      Todos ({selectedClientStatement.orders.length})
                    </button>
                    <button
                      onClick={() => setStatementDayFilter('PENDING')}
                      className={`px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 ${statementDayFilter === 'PENDING' ? 'bg-red-600 text-white' : 'text-red-700 hover:bg-red-50'}`}
                    >
                      Solo Pendientes ({pendingOrders.length})
                    </button>
                  </div>
                )}
              </div>

              {/* Scrollable Content */}
              <div className="p-4 md:p-6 overflow-y-auto space-y-4 flex-1">
                {/* MODAL TAB 1: DESGLOSE POR DÍAS */}
                {statementModalTab === 'DAYS' && (
                  <div className="space-y-4">
                    {Object.entries(monthlyStats).map(([month, stats]) => {
                      const displayOrders = statementDayFilter === 'PENDING'
                        ? stats.orders.filter(o => calculateBalance(o).balance > 0.05)
                        : stats.orders;

                      if (displayOrders.length === 0 && statementDayFilter === 'PENDING') return null;

                      return (
                        <div key={month} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                          <div className="bg-slate-100 p-3.5 border-b border-slate-200 flex flex-wrap justify-between items-center gap-2">
                            <div className="flex items-center gap-2">
                              <h4 className="font-black text-slate-800 uppercase text-xs tracking-wider capitalize">{month}</h4>
                              <span className="text-[10px] bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded-full">{displayOrders.length} pesas</span>
                              <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full">{stats.netKg.toFixed(1)} kg</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-[10px] font-bold text-slate-500 uppercase">Facturado: <span className="text-slate-800">S/. {stats.totalDue.toFixed(2)}</span></div>
                              <div className="text-[10px] font-bold text-slate-500 uppercase">Saldo: <span className={`${stats.balance <= 0.05 ? 'text-emerald-600' : 'text-red-600'}`}>S/. {stats.balance.toFixed(2)}</span></div>
                            </div>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[700px]">
                              <thead>
                                <tr className="bg-slate-50 text-slate-500 text-[9px] font-black uppercase tracking-widest border-b border-slate-100">
                                  <th className="py-2.5 px-4">Día / Fecha de Pesaje</th>
                                  <th className="py-2.5 px-3">Lote Abonado</th>
                                  <th className="py-2.5 px-3 text-right">Detalle Pesas</th>
                                  <th className="py-2.5 px-3 text-right">Facturado</th>
                                  <th className="py-2.5 px-3 text-right">Abonado</th>
                                  <th className="py-2.5 px-3 text-right">Saldo Deudor</th>
                                  <th className="py-2.5 px-3">Último Pago en Lote</th>
                                  <th className="py-2.5 px-4 text-center">Acción</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-xs">
                                {displayOrders.map(order => {
                                  const { totalDue, totalPaid, balance, netKg, pricePerKg } = calculateBalance(order);
                                  const isOrderPaid = balance <= 0.05 || order.paymentStatus === 'PAID';
                                  const batchName = getBatchName(order.batchId);
                                  const orderDate = getSafeDateString(order.date, order.id);
                                  const records = order.records || [];
                                  const totalBirds = records.filter(r => r.type === 'FULL').reduce((a, b) => a + (b.birds || 0), 0);
                                  const totalCrates = records.filter(r => r.type === 'FULL').reduce((a, b) => a + (b.quantity || 1), 0);
                                  const lastP = (order.payments && order.payments.length > 0) ? order.payments[order.payments.length - 1] : null;

                                  return (
                                    <tr key={order.id} className="hover:bg-blue-50/30 transition-colors">
                                      <td className="py-2.5 px-4">
                                        <div className="font-black text-slate-800 text-[11px]">{orderDate}</div>
                                        <div className="text-[9px] text-slate-400 font-mono">ID: {order.id.slice(-6)}</div>
                                      </td>
                                      <td className="py-2.5 px-3">
                                        <span className="text-[10px] bg-slate-100 text-slate-800 font-bold px-2 py-0.5 rounded-lg border border-slate-200 uppercase">{batchName}</span>
                                      </td>
                                      <td className="py-2.5 px-3 text-right">
                                        <div className="font-black text-slate-800 text-[11px]">{netKg.toFixed(1)} kg</div>
                                        <div className="text-[9px] text-slate-400">{totalBirds}p / {totalCrates}j @ S/.{pricePerKg.toFixed(2)}</div>
                                      </td>
                                      <td className="py-2.5 px-3 text-right font-digital font-bold text-slate-700">S/. {totalDue.toFixed(2)}</td>
                                      <td className="py-2.5 px-3 text-right font-digital font-bold text-emerald-600">S/. {totalPaid.toFixed(2)}</td>
                                      <td className="py-2.5 px-3 text-right font-digital font-black">
                                        <span className={isOrderPaid ? 'text-emerald-600' : 'text-red-600'}>S/. {balance.toFixed(2)}</span>
                                      </td>
                                      <td className="py-2.5 px-3">
                                        {lastP ? (
                                          <div>
                                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                              +S/. {lastP.amount.toFixed(2)}
                                            </span>
                                            <span className="text-[9px] text-slate-400 block mt-0.5">
                                              {new Date(lastP.timestamp).toLocaleDateString([], { dateStyle: 'short' })} • {lastP.method || 'Efectivo'}
                                            </span>
                                          </div>
                                        ) : (
                                          <span className="text-[9px] text-slate-400 italic">Sin abonos</span>
                                        )}
                                      </td>
                                      <td className="py-2.5 px-4 text-center">
                                        <div className="flex items-center justify-center gap-1.5">
                                          {!isOrderPaid ? (
                                            <button 
                                              onClick={() => handleOpenPayModal(order)}
                                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[9px] font-black uppercase flex items-center gap-1 shadow-sm active:scale-95 transition-all"
                                              title="Abonar a este lote"
                                            >
                                              <DollarSign size={11} /> Abonar
                                            </button>
                                          ) : (
                                            <span className="px-2 py-1 bg-emerald-50 text-emerald-700 text-[9px] font-black rounded-lg uppercase">
                                              Al Día
                                            </span>
                                          )}
                                          <button 
                                            onClick={() => setViewHistoryOrder(order)}
                                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-blue-600 rounded-lg transition-colors"
                                            title="Historial de Abonos"
                                          >
                                            <History size={13} />
                                          </button>
                                          <button 
                                            onClick={() => generateBankStatementPDF(order)}
                                            className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors"
                                            title="Estado de Cuenta A4 de esta fecha"
                                          >
                                            <FileText size={13} />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* MODAL TAB 2: ÚLTIMOS PAGOS SEGÚN LOTE */}
                {statementModalTab === 'PAYMENTS' && (
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="p-4 bg-emerald-50/50 border-b border-emerald-100 flex flex-wrap justify-between items-center gap-2">
                      <div>
                        <h4 className="font-black text-emerald-950 uppercase text-xs tracking-wider">
                          Historial de Pagos Realizados según Lote Abonado
                        </h4>
                        <p className="text-[11px] text-emerald-700 mt-0.5">
                          Lista cronológica de todos los abonos efectuados a las cuentas y lotes de este cliente.
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Total Abonado:</span>
                        <span className="font-digital font-bold text-emerald-700 text-lg ml-2">
                          S/. {clientPayments.reduce((acc, curr) => acc + curr.amount, 0).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {clientPayments.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[720px]">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500 text-[9px] font-black uppercase tracking-widest border-b border-slate-100">
                              <th className="py-2.5 px-4">Fecha y Hora</th>
                              <th className="py-2.5 px-3">Lote Abonado</th>
                              <th className="py-2.5 px-3">Día Despacho</th>
                              <th className="py-2.5 px-3">N° Operación / Ref</th>
                              <th className="py-2.5 px-3">Método</th>
                              <th className="py-2.5 px-3 text-right">Monto Abonado</th>
                              <th className="py-2.5 px-3 text-right">Saldo Restante</th>
                              <th className="py-2.5 px-3">Registrado Por</th>
                              <th className="py-2.5 px-4 text-center">Ticket</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-xs">
                            {clientPayments.map((p) => {
                              const payDateFormatted = new Date(p.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
                              return (
                                <tr key={p.id} className="hover:bg-emerald-50/20 transition-colors">
                                  <td className="py-2.5 px-4 font-bold text-slate-800 text-[11px]">
                                    {payDateFormatted}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span className="text-[10px] bg-blue-50 text-blue-800 font-black px-2 py-0.5 rounded-lg border border-blue-200 uppercase">
                                      {p.batchName}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                                    {p.orderDate}
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-[10px] text-slate-600">
                                    {p.operationNumber || `REC-${p.id.slice(-6).toUpperCase()}`}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span className="text-[9px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded uppercase">
                                      {p.method || 'EFECTIVO'}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-digital font-black text-emerald-600 text-sm">
                                    S/. {p.amount.toFixed(2)}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-digital font-bold text-slate-700">
                                    S/. {p.orderBalance.toFixed(2)}
                                  </td>
                                  <td className="py-2.5 px-3 text-[10px] text-slate-500">
                                    {p.registeredByName || 'Caja Central'}
                                  </td>
                                  <td className="py-2.5 px-4 text-center">
                                    <button
                                      onClick={() => {
                                        const targetPayment = (p.order.payments || []).find(x => x.id === p.id);
                                        if (targetPayment) {
                                          const prevB = p.orderBalance + p.amount;
                                          generateReceiptPDF(p.order, targetPayment, prevB, p.orderBalance);
                                        }
                                      }}
                                      className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[9px] font-black uppercase flex items-center gap-1 mx-auto transition-colors border border-emerald-200"
                                      title="Reimprimir Ticket de este Abono"
                                    >
                                      <Printer size={11} /> Ticket
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="p-8 text-center text-slate-400">
                        <History size={24} className="mx-auto mb-2 opacity-40" />
                        <p className="text-xs font-bold uppercase tracking-wider">No se registran abonos aún para este cliente</p>
                      </div>
                    )}
                  </div>
                )}

                {/* MODAL TAB 3: CUENTAS PENDIENTES */}
                {statementModalTab === 'PENDING' && (
                  <div className="space-y-4">
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-red-700 block">
                          Total Deuda Pendiente del Cliente
                        </span>
                        <p className="font-digital text-2xl font-black text-red-600 mt-0.5">
                          S/. {selectedClientStatement.balance.toFixed(2)}
                        </p>
                        <p className="text-[11px] text-red-600/80 font-medium">
                          {pendingOrders.length} {pendingOrders.length === 1 ? 'cuenta / fecha de pesaje pendiente de pago' : 'cuentas / fechas de pesaje pendientes de pago'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => generateClientCollectionsA4PDF(selectedClientStatement, 'PENDING_ONLY')}
                          className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black uppercase flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                        >
                          <FileText size={14} /> PDF A4 Solo Pendientes
                        </button>
                        <button
                          onClick={() => generateClientCollectionsTicketPDF(selectedClientStatement, 'PENDING_ONLY')}
                          className="px-3 py-2 bg-white hover:bg-red-50 text-red-700 border border-red-300 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                        >
                          <Printer size={14} /> Ticket Solo Pendientes
                        </button>
                      </div>
                    </div>

                    {pendingOrders.length > 0 ? (
                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse min-w-[650px]">
                            <thead>
                              <tr className="bg-slate-50 text-slate-500 text-[9px] font-black uppercase tracking-widest border-b border-slate-100">
                                <th className="py-2.5 px-4">Día / Fecha</th>
                                <th className="py-2.5 px-3">Lote Pendiente</th>
                                <th className="py-2.5 px-3 text-right">Peso Neto</th>
                                <th className="py-2.5 px-3 text-right">Total Facturado</th>
                                <th className="py-2.5 px-3 text-right">Total Abonado</th>
                                <th className="py-2.5 px-3 text-right text-red-600">Saldo que le queda</th>
                                <th className="py-2.5 px-4 text-center">Acción</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs">
                              {pendingOrders.map(order => {
                                const { totalDue, totalPaid, balance, netKg } = calculateBalance(order);
                                const batchName = getBatchName(order.batchId);
                                const orderDate = getSafeDateString(order.date, order.id);

                                return (
                                  <tr key={order.id} className="hover:bg-red-50/30 transition-colors">
                                    <td className="py-2.5 px-4 font-black text-slate-800 text-[11px]">
                                      {orderDate}
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <span className="text-[10px] bg-red-50 text-red-800 font-black px-2 py-0.5 rounded-lg border border-red-200 uppercase">
                                        {batchName}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-bold text-slate-700">
                                      {netKg.toFixed(1)} kg
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-digital font-bold text-slate-700">
                                      S/. {totalDue.toFixed(2)}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-digital font-bold text-emerald-600">
                                      S/. {totalPaid.toFixed(2)}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-digital font-black text-red-600 text-base">
                                      S/. {balance.toFixed(2)}
                                    </td>
                                    <td className="py-2.5 px-4 text-center">
                                      <button
                                        onClick={() => handleOpenPayModal(order)}
                                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[9px] font-black uppercase flex items-center gap-1 mx-auto shadow-sm active:scale-95 transition-all"
                                      >
                                        <DollarSign size={11} /> Abonar a este Lote
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-emerald-600">
                        <CheckCircle2 size={32} className="mx-auto mb-2" />
                        <p className="text-sm font-black uppercase tracking-wider">¡El cliente está 100% al día!</p>
                        <p className="text-xs text-slate-400 mt-0.5">No tiene ningún saldo ni cuenta pendiente por pagar.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-white border-t border-slate-200 flex justify-end shrink-0">
                <button
                  onClick={() => setSelectedClientStatement(null)}
                  className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-800 transition-colors"
                >
                  Cerrar Estado de Cuenta
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
};

export default Collections;

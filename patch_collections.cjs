const fs = require('fs');
let content = fs.readFileSync('components/pages/Collections.tsx', 'utf-8');

const importReplacement = `import { Calendar, Search, FileText, CheckCircle2, TrendingUp, TrendingDown, DollarSign, X, Wallet, Layers, ShieldCheck, Building2, History, ChevronDown, ChevronUp } from 'lucide-react';`;

content = content.replace(/import \{ Calendar, Search, FileText, CheckCircle2, TrendingUp, TrendingDown, DollarSign, X, Wallet, Layers, ShieldCheck, Building2, History \} from 'lucide-react';/, importReplacement);

const renderListStart = content.indexOf('{viewMode === \'LIST\' ? (');
const renderListEnd = content.indexOf('{/* === VISTA DE CUADRÍCULA / TARJETAS === */}');

const newRenderList = `{viewMode === 'LIST' ? (
        
        /* === VISTA DE LISTADO DE CLIENTES AGRUPADOS === */
        <div className="space-y-4">
          {clientGroups.map((group) => {
            const isExpanded = expandedClients[group.clientName];
            const isFullyPaid = group.balance <= 0.05;
            const isPartial = group.totalPaid > 0 && !isFullyPaid;

            // Group orders by month
            const monthlyStats: Record<string, { totalDue: number, totalPaid: number, balance: number, orders: ClientOrder[] }> = {};
            
            group.orders.forEach(order => {
               const orderDate = order.date ? new Date(order.date) : new Date(parseInt(order.id));
               const monthYear = orderDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
               if (!monthlyStats[monthYear]) {
                 monthlyStats[monthYear] = { totalDue: 0, totalPaid: 0, balance: 0, orders: [] };
               }
               const bal = calculateBalance(order);
               monthlyStats[monthYear].totalDue += bal.totalDue;
               monthlyStats[monthYear].totalPaid += bal.totalPaid;
               monthlyStats[monthYear].balance += bal.balance;
               monthlyStats[monthYear].orders.push(order);
            });

            return (
              <div key={group.clientName} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div 
                  onClick={() => toggleClientExpansion(group.clientName)}
                  className={\`p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer transition-colors \${isExpanded ? 'bg-blue-50/50' : 'hover:bg-slate-50'}\`}
                >
                  <div className="flex items-center gap-3">
                    <div className={\`w-10 h-10 rounded-xl flex items-center justify-center shadow-inner \${isFullyPaid ? 'bg-emerald-100 text-emerald-600' : isPartial ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'}\`}>
                      {isFullyPaid ? <CheckCircle2 size={20} /> : <Wallet size={20} />}
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 uppercase text-sm md:text-base">{group.clientName}</h3>
                      <p className="text-[10px] md:text-xs font-bold text-slate-500 uppercase mt-0.5">
                        {group.orders.length} Órdenes Registradas {group.clientDni && \`• DNI: \${group.clientDni}\`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto">
                    <div className="text-left md:text-right">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Deuda General</p>
                      <p className={\`font-digital font-bold text-lg md:text-xl \${isFullyPaid ? 'text-emerald-600' : 'text-red-600'}\`}>
                        S/. {group.balance.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-left md:text-right hidden sm:block">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Facturado / Abonado</p>
                      <p className="font-digital font-bold text-slate-700 text-sm">
                        S/. {group.totalDue.toFixed(2)} / <span className="text-emerald-600">S/. {group.totalPaid.toFixed(2)}</span>
                      </p>
                    </div>
                    <div className="p-2 bg-slate-100 text-slate-400 rounded-lg">
                      {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/50 p-3 md:p-5 animate-fade-in space-y-4">
                    {/* Monthly Breakdowns */}
                    {Object.entries(monthlyStats).map(([month, stats]) => (
                      <div key={month} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                        <div className="bg-slate-100/80 p-3 border-b border-slate-200 flex justify-between items-center">
                           <h4 className="font-black text-slate-800 uppercase text-[11px] tracking-wider capitalize">{month}</h4>
                           <div className="flex gap-4">
                             <span className="text-[10px] font-bold text-slate-500 uppercase">Facturado: <span className="text-slate-800">S/. {stats.totalDue.toFixed(2)}</span></span>
                             <span className="text-[10px] font-bold text-slate-500 uppercase">Saldo: <span className={\`\${stats.balance <= 0.05 ? 'text-emerald-600' : 'text-red-600'}\`}>S/. {stats.balance.toFixed(2)}</span></span>
                           </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse min-w-[600px]">
                            <thead>
                              <tr className="bg-slate-50 text-slate-500 text-[9px] font-black uppercase tracking-widest border-b border-slate-100">
                                <th className="py-2.5 px-4">Fecha / Orden</th>
                                <th className="py-2.5 px-3">Lote</th>
                                <th className="py-2.5 px-3 text-right">Facturado</th>
                                <th className="py-2.5 px-3 text-right">Abonado</th>
                                <th className="py-2.5 px-3 text-right">Saldo</th>
                                <th className="py-2.5 px-4 text-center">Acciones</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 text-xs">
                              {stats.orders.map(order => {
                                const { totalDue, totalPaid, balance, percentPaid } = calculateBalance(order);
                                const isOrderPaid = balance <= 0.05 || order.paymentStatus === 'PAID';
                                const batchName = getBatchName(order.batchId);
                                const orderDate = order.date ? new Date(order.date).toLocaleDateString() : new Date(parseInt(order.id)).toLocaleDateString();

                                return (
                                  <tr key={order.id} className="hover:bg-blue-50/30 transition-colors bg-white">
                                    <td className="py-2.5 px-4">
                                      <div className="font-bold text-slate-800 text-[11px]">{orderDate}</div>
                                      <div className="text-[9px] text-slate-400 font-mono">ID: {order.id.slice(-6)}</div>
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <span className="text-[9px] bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded uppercase">{batchName}</span>
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-digital font-bold text-slate-700">S/. {totalDue.toFixed(2)}</td>
                                    <td className="py-2.5 px-3 text-right font-digital font-bold text-emerald-600">S/. {totalPaid.toFixed(2)}</td>
                                    <td className="py-2.5 px-3 text-right font-digital font-black">
                                      <span className={isOrderPaid ? 'text-emerald-600' : 'text-red-600'}>S/. {balance.toFixed(2)}</span>
                                    </td>
                                    <td className="py-2.5 px-4 text-center">
                                      <div className="flex items-center justify-center gap-1.5">
                                        {!isOrderPaid && (
                                          <button 
                                            onClick={(e) => { e.stopPropagation(); handleOpenPayModal(order); }}
                                            className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[9px] font-black uppercase flex items-center gap-1 shadow-sm active:scale-95"
                                          >
                                            <DollarSign size={10} /> Abonar
                                          </button>
                                        )}
                                        <button 
                                          onClick={(e) => { e.stopPropagation(); setViewHistoryOrder(order); }}
                                          className="p-1.5 bg-slate-100 hover:bg-slate-200 text-blue-600 rounded"
                                          title="Historial de Abonos"
                                        >
                                          <History size={12} />
                                        </button>
                                        <button 
                                          onClick={(e) => { e.stopPropagation(); generateBankStatementPDF(order); }}
                                          className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded"
                                          title="Estado de Cuenta"
                                        >
                                          <FileText size={12} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
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
        
        `;

content = content.substring(0, renderListStart) + newRenderList + content.substring(renderListEnd);

fs.writeFileSync('components/pages/Collections.tsx', content);
console.log('Patched Collections.tsx');

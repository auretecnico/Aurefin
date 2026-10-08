/* ==========================================================================
   AureFin Pro — Módulo de Integração e Exportação Excel (SheetJS)
   Geração de Planilhas .XLSX Reais, Multi-Aba, Fórmulas Nativas e Layout Executivo
   ========================================================================== */

import * as XLSX from 'xlsx';
import { validation } from './validation.js';
import { storage } from './storage.js';

export const excel = {
  /**
   * Exporta a Planilha Mestre Consolidada Multi-Aba
   */
  async exportMasterWorkbook(data, periodLabel = 'Geral') {
    const wb = XLSX.utils.book_new();
    const generationDateStr = new Date().toLocaleDateString('pt-BR') + ' às ' + new Date().toLocaleTimeString('pt-BR');

    // 1. ABA: RESUMO EXECUTIVO
    const summaryRows = [
      ['AUREFIN PRO — SISTEMA DE GESTÃO FINANCEIRA E ADMINISTRATIVA'],
      ['RELATÓRIO EXECUTIVO CONSOLIDADO'],
      ['Período:', periodLabel, 'Gerado em:', generationDateStr],
      [],
      ['INDICADOR FINANCEIRO', 'VALOR (R$)', 'STATUS / CONTEXTO'],
      ['Saldo Disponível em Caixas e Bancos', (data.metrics.totalBalanceCents / 100), 'Recursos imediatos'],
      ['Faturamento Bruto Consolidado', (data.metrics.totalGrossRevenueCents / 100), 'Vendas registradas'],
      ['Faturamento Líquido Consolidado', (data.metrics.totalNetRevenueCents / 100), 'Após deduções'],
      ['Total Recebido no Caixa (Realizado)', (data.metrics.realizedIncomeCents / 100), 'Entradas operacionais'],
      ['Total Pago no Caixa (Realizado)', (data.metrics.realizedExpenseCents / 100), 'Saídas operacionais'],
      ['Resultado do Fluxo de Caixa', (data.metrics.cashFlowResultCents / 100), data.metrics.cashFlowResultCents >= 0 ? 'Superávit' : 'Déficit'],
      ['Contas a Pagar Pendentes', (data.metrics.payablesPendingCents / 100), 'Obrigações futuras'],
      ['Contas a Pagar Vencidas (Crítico)', (data.metrics.payablesOverdueCents / 100), 'Necessita liquidação'],
      ['Contas a Receber Pendentes', (data.metrics.receivablesPendingCents / 100), 'Projetado a receber'],
      ['Contas a Receber Vencidas', (data.metrics.receivablesOverdueCents / 100), 'Cobrança necessária'],
      [],
      ['Observação: Os dados gerenciais acima refletem as informações registradas localmente no sistema.']
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    this.applySheetStyles(wsSummary, [38, 20, 26]);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo Executivo');

    // 2. ABA: FATURAMENTO DIÁRIO
    const revenueRows = [
      ['Data', 'Valor Bruto', 'Descontos', 'Cancelamentos', 'Valor Líquido', 'Pix', 'Cartão Crédito', 'Cartão Débito', 'Dinheiro', 'Transferência', 'Venda a Prazo', 'Observações']
    ];
    (data.dailyRevenues || []).forEach(r => {
      revenueRows.push([
        validation.formatDateBR(r.date),
        (r.grossCents / 100),
        (r.discountCents / 100),
        (r.cancellationCents / 100),
        (r.netCents / 100),
        (r.pixCents / 100),
        (r.creditCents / 100),
        (r.debitCents / 100),
        (r.cashCents / 100),
        (r.transferCents / 100),
        (r.termCents / 100),
        r.notes || ''
      ]);
    });
    // Linha de Total com Fórmulas
    if (data.dailyRevenues && data.dailyRevenues.length > 0) {
      const lastRow = revenueRows.length;
      revenueRows.push([
        'TOTAL CONSOLIDADO',
        { f: `SUM(B2:B${lastRow})` },
        { f: `SUM(C2:C${lastRow})` },
        { f: `SUM(D2:D${lastRow})` },
        { f: `SUM(E2:E${lastRow})` },
        { f: `SUM(F2:F${lastRow})` },
        { f: `SUM(G2:G${lastRow})` },
        { f: `SUM(H2:H${lastRow})` },
        { f: `SUM(I2:I${lastRow})` },
        { f: `SUM(J2:J${lastRow})` },
        { f: `SUM(K2:K${lastRow})` },
        'Total do período'
      ]);
    }
    const wsRevenue = XLSX.utils.aoa_to_sheet(revenueRows);
    this.applySheetStyles(wsRevenue, [14, 16, 14, 14, 16, 14, 14, 14, 14, 14, 14, 30], true);
    XLSX.utils.book_append_sheet(wb, wsRevenue, 'Faturamento Diário');

    // 3. ABA: CONTAS A PAGAR & BOLETOS
    const payRows = [
      ['Vencimento', 'Descrição', 'Fornecedor', 'Categoria', 'Valor Original', 'Valor Pago', 'Saldo Devedor', 'Status', 'Nº Documento', 'Parcela', 'Código de Barras / Boleto', 'Observações']
    ];
    (data.payables || []).forEach(p => {
      const orig = p.originalAmountCents / 100;
      const paid = (p.amountPaidCents || 0) / 100;
      const sup = data.supplierMap?.get(p.supplierId)?.name || 'Fornecedor não informado';
      const cat = data.categoryMap?.get(p.categoryId)?.name || 'Geral';
      payRows.push([
        validation.formatDateBR(p.dueDate),
        p.description,
        sup,
        cat,
        orig,
        paid,
        Math.max(0, orig - paid),
        this.translateStatus(p.status),
        p.docNumber || '-',
        p.installment || '1/1',
        p.barcode || '-',
        p.notes || ''
      ]);
    });
    if (data.payables && data.payables.length > 0) {
      const lastRow = payRows.length;
      payRows.push([
        'TOTAL', '', '', '',
        { f: `SUM(E2:E${lastRow})` },
        { f: `SUM(F2:F${lastRow})` },
        { f: `SUM(G2:G${lastRow})` },
        '', '', '', '', ''
      ]);
    }
    const wsPay = XLSX.utils.aoa_to_sheet(payRows);
    this.applySheetStyles(wsPay, [14, 28, 24, 20, 16, 16, 16, 14, 16, 10, 42, 26], true);
    XLSX.utils.book_append_sheet(wb, wsPay, 'Contas a Pagar');

    // 4. ABA: CONTAS A RECEBER
    const recRows = [
      ['Previsão', 'Descrição', 'Cliente', 'Categoria', 'Valor Original', 'Valor Recebido', 'Saldo Pendente', 'Status', 'Forma', 'Parcela', 'Observações']
    ];
    (data.receivables || []).forEach(r => {
      const orig = r.originalAmountCents / 100;
      const rec = (r.amountReceivedCents || 0) / 100;
      const cust = data.customerMap?.get(r.customerId)?.name || 'Cliente não informado';
      const cat = data.categoryMap?.get(r.categoryId)?.name || 'Geral';
      recRows.push([
        validation.formatDateBR(r.expectedDate),
        r.description,
        cust,
        cat,
        orig,
        rec,
        Math.max(0, orig - rec),
        this.translateStatus(r.status),
        r.paymentMethod || 'Pix',
        r.installment || '1/1',
        r.notes || ''
      ]);
    });
    if (data.receivables && data.receivables.length > 0) {
      const lastRow = recRows.length;
      recRows.push([
        'TOTAL', '', '', '',
        { f: `SUM(E2:E${lastRow})` },
        { f: `SUM(F2:F${lastRow})` },
        { f: `SUM(G2:G${lastRow})` },
        '', '', '', ''
      ]);
    }
    const wsRec = XLSX.utils.aoa_to_sheet(recRows);
    this.applySheetStyles(wsRec, [14, 28, 24, 20, 16, 16, 16, 14, 16, 10, 26], true);
    XLSX.utils.book_append_sheet(wb, wsRec, 'Contas a Receber');

    // 5. ABA: MOVIMENTAÇÕES DE CAIXA
    const txRows = [
      ['Data', 'Tipo', 'Descrição', 'Valor (R$)', 'Conta Financeira', 'Categoria', 'Observações']
    ];
    (data.transactions || []).forEach(t => {
      const acc = data.accountMap?.get(t.accountId)?.name || 'Conta Padrão';
      const cat = data.categoryMap?.get(t.categoryId)?.name || (t.type === 'transfer' ? 'Transferência Interna' : 'Geral');
      txRows.push([
        validation.formatDateBR(t.date),
        t.type === 'income' ? 'Entrada' : t.type === 'expense' ? 'Saída' : 'Transferência',
        t.description,
        (t.amountCents / 100),
        acc,
        cat,
        t.notes || ''
      ]);
    });
    const wsTx = XLSX.utils.aoa_to_sheet(txRows);
    this.applySheetStyles(wsTx, [14, 14, 32, 16, 24, 22, 26], true);
    XLSX.utils.book_append_sheet(wb, wsTx, 'Movimentações');

    // 6. ABA: BANCOS E SALDOS
    const accRows = [
      ['Conta / Caixa', 'Tipo', 'Código Banco', 'Agência', 'Número da Conta', 'Saldo Atual (R$)']
    ];
    (data.accounts || []).forEach(a => {
      accRows.push([
        a.name,
        a.type === 'checking' ? 'Conta Corrente' : a.type === 'cash' ? 'Caixa Físico' : 'Aplicação / Reserva',
        a.bankCode || '-',
        a.agency || '-',
        a.number || '-',
        (a.currentBalanceCents / 100)
      ]);
    });
    if (data.accounts && data.accounts.length > 0) {
      const lastRow = accRows.length;
      accRows.push([
        'SALDO TOTAL CONSOLIDADO', '', '', '', '',
        { f: `SUM(F2:F${lastRow})` }
      ]);
    }
    const wsAcc = XLSX.utils.aoa_to_sheet(accRows);
    this.applySheetStyles(wsAcc, [28, 18, 14, 14, 18, 20], true);
    XLSX.utils.book_append_sheet(wb, wsAcc, 'Saldos Bancários');

    // 7. ABA: EMPRÉSTIMOS E AMORTIZAÇÃO
    const loanRows = [
      ['Instituição / Linha', 'Valor Contratado (R$)', 'Total Parcelas', 'Parcelas Pagas', 'Valor da Parcela (R$)', 'Taxa de Juros', 'Saldo Devedor Atual (R$)', 'Observações']
    ];
    (data.loans || []).forEach(l => {
      loanRows.push([
        l.institution,
        (l.contractedAmountCents / 100),
        l.totalInstallments,
        l.paidInstallments,
        (l.installmentValueCents / 100),
        l.annualInterestRate || '-',
        (l.currentBalanceCents / 100),
        l.notes || ''
      ]);
    });
    const wsLoans = XLSX.utils.aoa_to_sheet(loanRows);
    this.applySheetStyles(wsLoans, [30, 20, 14, 14, 20, 18, 22, 26], true);
    XLSX.utils.book_append_sheet(wb, wsLoans, 'Empréstimos');

    // Gravação e Download do Arquivo .xlsx
    const fileName = `AureFin_Relatorio_Consolidado_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);

    // Registro no Histórico de Exportações
    await storage.save('exports_history', {
      id: 'exp_' + Date.now(),
      fileName,
      type: 'Consolidado Completo',
      period: periodLabel,
      timestamp: new Date().toISOString()
    });

    storage.markExcelExported();
    return fileName;
  },

  /**
   * Exportação Individual por Módulo
   */
  async exportModuleWorkbook(moduleKey, moduleData, columns, fileNamePrefix) {
    const wb = XLSX.utils.book_new();
    const rows = [columns.map(c => c.label)];

    moduleData.forEach(item => {
      rows.push(columns.map(c => c.getValue(item)));
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const colWidths = columns.map(c => c.width || 18);
    this.applySheetStyles(ws, colWidths, true);

    XLSX.utils.book_append_sheet(wb, ws, fileNamePrefix);

    const fileName = `${fileNamePrefix}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);

    await storage.save('exports_history', {
      id: 'exp_' + Date.now(),
      fileName,
      type: fileNamePrefix,
      period: 'Módulo Específico',
      timestamp: new Date().toISOString()
    });

    storage.markExcelExported();
    return fileName;
  },

  /**
   * Aplica larguras, filtros automáticos e congelamento de primeira linha
   */
  applySheetStyles(sheet, colWidths = [], enableAutoFilter = false) {
    if (colWidths && colWidths.length > 0) {
      sheet['!cols'] = colWidths.map(w => ({ wch: w }));
    }

    if (enableAutoFilter && sheet['!ref']) {
      sheet['!autofilter'] = { ref: sheet['!ref'] };
    }

    // Congela linha de cabeçalho
    sheet['!views'] = [{ state: 'frozen', ySplit: 1 }];
  },

  translateStatus(status) {
    const map = {
      pending: 'Pendente',
      due_today: 'Vence Hoje',
      due_soon: 'A Vencer',
      overdue: 'Vencido',
      partial: 'Parcialmente Pago',
      paid: 'Pago / Liquidado',
      received: 'Recebido',
      cancelled: 'Cancelado'
    };
    return map[status] || status;
  }
};

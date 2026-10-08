/* ==========================================================================
   AureFin Pro — Módulo de Regras e Inteligência Financeira
   Cálculos de Fluxo de Caixa, DRE Gerencial, Ponto de Equilíbrio e Amortização
   ========================================================================== */

import { validation } from './validation.js';

export const finance = {
  /**
   * Calcula o Saldo Total consolidado de todas as contas financeiras cadastradas
   */
  calculateTotalAvailableBalance(accounts) {
    if (!Array.isArray(accounts)) return 0;
    return accounts.reduce((total, acc) => total + (Number(acc.currentBalanceCents) || 0), 0);
  },

  /**
   * Determina o status financeiro de uma obrigação com base nas datas e valores
   */
  determinePayableStatus(payable) {
    if (payable.status === 'cancelled') return 'cancelled';
    if (payable.status === 'paid' || (payable.amountPaidCents >= payable.originalAmountCents && payable.originalAmountCents > 0)) {
      return 'paid';
    }
    if (payable.amountPaidCents > 0 && payable.amountPaidCents < payable.originalAmountCents) {
      return 'partial';
    }

    const diffDays = validation.getDaysDifference(payable.dueDate);
    if (diffDays === null) return 'pending';
    if (diffDays < 0) return 'overdue';
    if (diffDays === 0) return 'due_today';
    if (diffDays <= 3) return 'due_soon';
    return 'pending';
  },

  /**
   * Determina o status financeiro de uma conta a receber
   */
  determineReceivableStatus(receivable) {
    if (receivable.status === 'cancelled') return 'cancelled';
    if (receivable.status === 'received' || (receivable.amountReceivedCents >= receivable.originalAmountCents && receivable.originalAmountCents > 0)) {
      return 'received';
    }
    if (receivable.amountReceivedCents > 0 && receivable.amountReceivedCents < receivable.originalAmountCents) {
      return 'partial';
    }

    const diffDays = validation.getDaysDifference(receivable.expectedDate);
    if (diffDays === null) return 'pending';
    if (diffDays < 0) return 'overdue';
    if (diffDays === 0) return 'due_today';
    return 'pending';
  },

  /**
   * Retorna resumo executivo para o painel principal (Dashboard) no período selecionado
   */
  computeDashboardMetrics({ accounts, transactions, payables, receivables, dailyRevenues, periodFilter }) {
    const totalBalanceCents = this.calculateTotalAvailableBalance(accounts);

    // Filtra transações do período
    const filteredTxs = this.filterByPeriod(transactions, periodFilter, 'date');
    const filteredPayables = this.filterByPeriod(payables, periodFilter, 'dueDate');
    const filteredReceivables = this.filterByPeriod(receivables, periodFilter, 'expectedDate');
    const filteredDaily = this.filterByPeriod(dailyRevenues, periodFilter, 'date');

    // Faturamento bruto e líquido consolidado
    const totalGrossRevenueCents = filteredDaily.reduce((acc, d) => acc + (Number(d.grossCents) || 0), 0);
    const totalNetRevenueCents = filteredDaily.reduce((acc, d) => acc + (Number(d.netCents) || 0), 0);

    // Entradas e saídas de caixa realizadas (desconsiderando transferências internas)
    const realizedIncomeCents = filteredTxs
      .filter(t => t.type === 'income')
      .reduce((acc, t) => acc + (Number(t.amountCents) || 0), 0);

    const realizedExpenseCents = filteredTxs
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => acc + (Number(t.amountCents) || 0), 0);

    const cashFlowResultCents = realizedIncomeCents - realizedExpenseCents;

    // Obrigações a pagar no período
    let payablesPendingCents = 0;
    let payablesOverdueCents = 0;
    let payablesDueSoonCents = 0;

    payables.forEach(p => {
      const status = this.determinePayableStatus(p);
      const remainingCents = Math.max(0, (Number(p.originalAmountCents) || 0) - (Number(p.amountPaidCents) || 0));

      if (status === 'overdue') {
        payablesOverdueCents += remainingCents;
      } else if (status === 'due_soon' || status === 'due_today') {
        payablesDueSoonCents += remainingCents;
      }
      if (status !== 'paid' && status !== 'cancelled') {
        payablesPendingCents += remainingCents;
      }
    });

    // Recebimentos pendentes
    let receivablesPendingCents = 0;
    let receivablesOverdueCents = 0;

    receivables.forEach(r => {
      const status = this.determineReceivableStatus(r);
      const remainingCents = Math.max(0, (Number(r.originalAmountCents) || 0) - (Number(r.amountReceivedCents) || 0));

      if (status === 'overdue') {
        receivablesOverdueCents += remainingCents;
      }
      if (status !== 'received' && status !== 'cancelled') {
        receivablesPendingCents += remainingCents;
      }
    });

    return {
      totalBalanceCents,
      totalGrossRevenueCents,
      totalNetRevenueCents,
      realizedIncomeCents,
      realizedExpenseCents,
      cashFlowResultCents,
      payablesPendingCents,
      payablesOverdueCents,
      payablesDueSoonCents,
      receivablesPendingCents,
      receivablesOverdueCents
    };
  },

  /**
   * Filtro genérico de coleção por período de datas
   */
  filterByPeriod(items, period, dateField = 'date') {
    if (!Array.isArray(items)) return [];
    if (!period || period === 'all') return items;

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    return items.filter(item => {
      const itemDateStr = item[dateField];
      if (!itemDateStr) return false;

      const [y, m, d] = itemDateStr.split('T')[0].split('-').map(Number);
      const itemDate = new Date(y, m - 1, d);

      if (period === 'current_month') {
        return y === currentYear && (m - 1) === currentMonth;
      }
      if (period === 'prev_month') {
        const prevM = currentMonth === 0 ? 11 : currentMonth - 1;
        const prevY = currentMonth === 0 ? currentYear - 1 : currentYear;
        return y === prevY && (m - 1) === prevM;
      }
      if (period === 'last_30_days') {
        const past30 = new Date(today);
        past30.setDate(past30.getDate() - 30);
        return itemDate >= past30 && itemDate <= today;
      }
      if (period === 'current_quarter') {
        const quarterStartMonth = Math.floor(currentMonth / 3) * 3;
        const quarterEndMonth = quarterStartMonth + 2;
        return y === currentYear && (m - 1) >= quarterStartMonth && (m - 1) <= quarterEndMonth;
      }
      if (period === 'current_year') {
        return y === currentYear;
      }

      return true;
    });
  },

  /**
   * Cálculo de DRE Gerencial (Demonstrativo do Resultado do Exercício)
   */
  computeDRE({ transactions, dailyRevenues, categories, periodFilter }) {
    const filteredDaily = this.filterByPeriod(dailyRevenues, periodFilter, 'date');
    const filteredTxs = this.filterByPeriod(transactions, periodFilter, 'date');

    // 1. Receita Bruta Operacional (Soma de Vendas e Serviços)
    const grossRevenueCents = filteredDaily.reduce((acc, d) => acc + (Number(d.grossCents) || 0), 0);
    const deductionsCents = filteredDaily.reduce((acc, d) => acc + (Number(d.discountCents) || 0) + (Number(d.cancellationCents) || 0), 0);
    const netRevenueCents = grossRevenueCents - deductionsCents;

    // Categorias mapa
    const catMap = new Map();
    categories.forEach(c => catMap.set(c.id, c));

    // Custos e Despesas agrupados
    let variableCostsCents = 0;
    let fixedExpensesCents = 0;
    let financialExpensesCents = 0;
    let financialIncomeCents = 0;

    filteredTxs.forEach(tx => {
      if (tx.type === 'transfer') return; // Transferências não impactam DRE

      const cat = catMap.get(tx.categoryId);
      const group = cat ? cat.group : 'Geral';
      const amount = Number(tx.amountCents) || 0;

      if (tx.type === 'expense') {
        if (group === 'Variável') {
          variableCostsCents += amount;
        } else if (group === 'Financeiro') {
          financialExpensesCents += amount;
        } else {
          fixedExpensesCents += amount;
        }
      } else if (tx.type === 'income') {
        if (group === 'Financeiro') {
          financialIncomeCents += amount;
        }
      }
    });

    // Margem de Contribuição = Receita Líquida - Custos Variáveis
    const contributionMarginCents = netRevenueCents - variableCostsCents;
    const contributionMarginPct = netRevenueCents > 0 ? ((contributionMarginCents / netRevenueCents) * 100).toFixed(1) : '0.0';

    // Resultado Operacional = Margem de Contribuição - Despesas Fixas
    const operatingResultCents = contributionMarginCents - fixedExpensesCents;

    // Resultado Financeiro Líquido
    const netFinancialResultCents = financialIncomeCents - financialExpensesCents;

    // Resultado Líquido do Exercício (Lucro Líquido Gerencial)
    const netProfitCents = operatingResultCents + netFinancialResultCents;
    const netProfitMarginPct = netRevenueCents > 0 ? ((netProfitCents / netRevenueCents) * 100).toFixed(1) : '0.0';

    // Ponto de Equilíbrio Operacional (R$ necessários para cobrir os custos e despesas fixas)
    const cmRatio = netRevenueCents > 0 ? (contributionMarginCents / netRevenueCents) : 0;
    const breakevenCents = cmRatio > 0 ? Math.round(fixedExpensesCents / cmRatio) : 0;

    return {
      grossRevenueCents,
      deductionsCents,
      netRevenueCents,
      variableCostsCents,
      contributionMarginCents,
      contributionMarginPct,
      fixedExpensesCents,
      operatingResultCents,
      financialIncomeCents,
      financialExpensesCents,
      netFinancialResultCents,
      netProfitCents,
      netProfitMarginPct,
      breakevenCents
    };
  },

  /**
   * Calculadora Financeira Utilitária
   */
  calculateFinancialTool(type, params) {
    switch (type) {
      case 'margin_markup': {
        const cost = Number(params.costCents) || 0;
        const price = Number(params.priceCents) || 0;
        if (price <= 0 || cost < 0) return { marginPct: 0, markupPct: 0, profitCents: 0 };
        const profitCents = price - cost;
        const marginPct = (profitCents / price) * 100;
        const markupPct = cost > 0 ? (profitCents / cost) * 100 : 0;
        return {
          profitCents,
          marginPct: marginPct.toFixed(2),
          markupPct: markupPct.toFixed(2)
        };
      }
      case 'simple_interest': {
        const principal = Number(params.principalCents) || 0;
        const ratePerMonth = Number(params.rateMonthlyPct) || 0;
        const months = Number(params.months) || 1;
        const interestCents = Math.round(principal * (ratePerMonth / 100) * months);
        const totalCents = principal + interestCents;
        return {
          interestCents,
          totalCents,
          installmentCents: Math.round(totalCents / months)
        };
      }
      case 'breakeven': {
        const fixedExpensesCents = Number(params.fixedExpensesCents) || 0;
        const marginPct = Number(params.marginPct) || 0;
        if (marginPct <= 0) return { breakevenCents: 0 };
        const breakevenCents = Math.round(fixedExpensesCents / (marginPct / 100));
        return { breakevenCents };
      }
      case 'discount_addition': {
        const originalCents = Number(params.originalCents) || 0;
        const pct = Number(params.pct) || 0;
        const deltaCents = Math.round(originalCents * (pct / 100));
        return {
          withDiscountCents: Math.max(0, originalCents - deltaCents),
          withAdditionCents: originalCents + deltaCents,
          deltaCents
        };
      }
      default:
        return {};
    }
  }
};

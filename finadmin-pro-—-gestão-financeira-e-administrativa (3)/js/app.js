/* ==========================================================================
   AureFin Pro — Controlador Principal da Aplicação
   Coordenação de Navegação, 20 Módulos de Gestão e Interatividade
   ========================================================================== */

import { storage } from './storage.js';
import { validation } from './validation.js';
import { finance } from './finance.js';
import { excel } from './excel.js';
import { charts } from './charts.js';
import { components } from './components.js';

class AureFinApp {
  constructor() {
    this.currentView = 'dashboard';
    this.periodFilter = 'current_month';
    this.cachedData = {};
    this.searchTerm = '';
  }

  async start() {
    await storage.init();
    this.setupEventListeners();
    await this.refreshData();
    this.updateOrganizationUI();
    this.updateRemindersUI();
    this.renderCurrentView();
    this.updateExcelSyncUI();
    components.refreshIcons();
  }

  async refreshData() {
    const [
      accounts,
      transactions,
      dailyRevenues,
      payables,
      receivables,
      loans,
      customers,
      suppliers,
      categories,
      goals,
      auditLog,
      trash,
      exportsHistory,
      reminders
    ] = await Promise.all([
      storage.getAll('accounts'),
      storage.getAll('transactions'),
      storage.getAll('daily_revenues'),
      storage.getAll('payables'),
      storage.getAll('receivables'),
      storage.getAll('loans'),
      storage.getAll('customers'),
      storage.getAll('suppliers'),
      storage.getAll('categories'),
      storage.getAll('goals'),
      storage.getAll('audit_log'),
      storage.getAll('trash'),
      storage.getAll('exports_history'),
      storage.getReminders()
    ]);

    this.cachedData = {
      accounts,
      transactions,
      dailyRevenues,
      payables,
      receivables,
      loans,
      customers,
      suppliers,
      categories,
      goals,
      auditLog,
      trash,
      exportsHistory,
      reminders: reminders || [],
      accountMap: new Map(accounts.map(a => [a.id, a])),
      customerMap: new Map(customers.map(c => [c.id, c])),
      supplierMap: new Map(suppliers.map(s => [s.id, s])),
      categoryMap: new Map(categories.map(c => [c.id, c]))
    };

    this.cachedData.metrics = finance.computeDashboardMetrics({
      accounts,
      transactions,
      payables,
      receivables,
      dailyRevenues,
      periodFilter: this.periodFilter
    });
  }

  setupEventListeners() {
    // Navegação Lateral
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const targetView = item.dataset.view;
        if (targetView) this.switchView(targetView);
      });
    });

    // Toggle Sidebar
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    if (sidebarToggle && sidebar) {
      sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
      });
    }

    // Personalização de Nome da Empresa
    document.getElementById('btn-edit-org-name')?.addEventListener('click', () => {
      this.openOrgNameModal();
    });

    // Lembrar Depois / Lembretes Rápidos
    document.getElementById('btn-quick-reminders')?.addEventListener('click', () => {
      this.openRemindersModal();
    });

    // Seletor de Período
    const periodSelect = document.getElementById('global-period-select');
    if (periodSelect) {
      periodSelect.addEventListener('change', async (e) => {
        this.periodFilter = e.target.value;
        await this.refreshData();
        this.renderCurrentView();
      });
    }

    // Busca Global
    const globalSearchInput = document.getElementById('global-search-input');
    if (globalSearchInput) {
      globalSearchInput.addEventListener('input', (e) => {
        this.searchTerm = e.target.value.toLowerCase().trim();
        this.handleGlobalSearch();
      });
    }

    // Atalhos do Teclado
    window.addEventListener('keydown', (e) => {
      if (e.altKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        this.openTransactionModal();
      } else if (e.altKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        this.openCalculatorModal();
      } else if (e.altKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        this.triggerMasterExcelExport();
      } else if (e.altKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        this.openRemindersModal();
      } else if ((e.key === '/' || (e.altKey && e.key === 'f')) && document.activeElement !== globalSearchInput) {
        e.preventDefault();
        globalSearchInput?.focus();
      }
    });

    // Botões de Ação do Topbar
    document.getElementById('btn-new-entry')?.addEventListener('click', () => this.openTransactionModal());
    document.getElementById('btn-quick-calc')?.addEventListener('click', () => this.openCalculatorModal());
    document.getElementById('btn-quick-export')?.addEventListener('click', () => this.triggerMasterExcelExport());

    // Evento de alteração de dados
    window.addEventListener('aurefin:data_changed', async () => {
      await this.refreshData();
      this.updateOrganizationUI();
      this.updateRemindersUI();
      this.updateExcelSyncUI();
      this.renderCurrentView();
    });
  }

  updateExcelSyncUI() {
    const badge = document.getElementById('unsaved-export-badge');
    if (!badge) return;
    const status = storage.getExcelSyncStatus();
    if (status.hasChanges) {
      badge.classList.add('has-changes');
      badge.innerHTML = `${components.getIconSvg('file-warning', 14)} Planilha Pendente`;
      badge.title = 'Há novos lançamentos registrados após a última exportação Excel.';
    } else {
      badge.classList.remove('has-changes');
      badge.innerHTML = `${components.getIconSvg('file-check', 14)} Excel Sincronizado`;
      badge.title = 'Todos os dados atuais já foram consolidados no arquivo Excel.';
    }
    components.refreshIcons(badge);
  }

  switchView(viewId) {
    this.currentView = viewId;

    // Atualiza links da sidebar
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewId);
    });

    // Atualiza breadcrumb
    const breadcrumbCurrent = document.getElementById('breadcrumb-current');
    const activeItem = document.querySelector(`.nav-item[data-view="${viewId}"] .nav-label`);
    if (breadcrumbCurrent && activeItem) {
      breadcrumbCurrent.textContent = activeItem.textContent;
    }

    // Alterna visibilidade da view
    document.querySelectorAll('.view-section').forEach(sec => {
      sec.classList.remove('active');
    });

    const activeSec = document.getElementById(`view-${viewId}`);
    if (activeSec) {
      activeSec.classList.add('active');
      this.renderCurrentView();
    }
  }

  renderCurrentView() {
    switch (this.currentView) {
      case 'dashboard':
        this.renderDashboardView();
        break;
      case 'daily-revenue':
        this.renderDailyRevenueView();
        break;
      case 'transactions':
        this.renderTransactionsView();
        break;
      case 'payables':
        this.renderPayablesView();
        break;
      case 'receivables':
        this.renderReceivablesView();
        break;
      case 'bankslips':
        this.renderBankSlipsView();
        break;
      case 'expenses':
        this.renderExpensesView();
        break;
      case 'revenues':
        this.renderRevenuesView();
        break;
      case 'cashflow':
        this.renderCashFlowView();
        break;
      case 'bank-accounts':
        this.renderBankAccountsView();
        break;
      case 'loans':
        this.renderLoansView();
        break;
      case 'customers':
        this.renderCustomersView();
        break;
      case 'suppliers':
        this.renderSuppliersView();
        break;
      case 'categories':
        this.renderCategoriesView();
        break;
      case 'goals':
        this.renderGoalsView();
        break;
      case 'reports':
        this.renderReportsView();
        break;
      case 'excel-export':
        this.renderExcelExportView();
        break;
      case 'trash-audit':
        this.renderTrashAuditView();
        break;
      case 'settings':
        this.renderSettingsView();
        break;
      case 'help':
        this.renderHelpView();
        break;
    }
    components.refreshIcons();
  }

  // =========================================================================
  // 1. VISÃO GERAL (DASHBOARD)
  // =========================================================================
  renderDashboardView() {
    const m = this.cachedData.metrics;

    // Métricas principais
    document.getElementById('dash-balance').textContent = validation.formatBRL(m.totalBalanceCents);
    document.getElementById('dash-gross-revenue').textContent = validation.formatBRL(m.totalGrossRevenueCents);
    document.getElementById('dash-income-realized').textContent = validation.formatBRL(m.realizedIncomeCents);
    document.getElementById('dash-expense-realized').textContent = validation.formatBRL(m.realizedExpenseCents);

    const cashFlowEl = document.getElementById('dash-cashflow-result');
    cashFlowEl.textContent = validation.formatBRL(m.cashFlowResultCents);
    cashFlowEl.className = `stat-value ${m.cashFlowResultCents >= 0 ? 'positive' : 'negative'}`;

    document.getElementById('dash-payables-pending').textContent = validation.formatBRL(m.payablesPendingCents);
    document.getElementById('dash-payables-overdue').textContent = validation.formatBRL(m.payablesOverdueCents);
    document.getElementById('dash-receivables-pending').textContent = validation.formatBRL(m.receivablesPendingCents);

    // Gráficos do Dashboard
    const recentDays = this.cachedData.dailyRevenues.slice(-7);
    const dayLabels = recentDays.map(d => validation.formatDateBR(d.date).slice(0, 5));
    const grossValues = recentDays.map(d => d.grossCents / 100);
    const netValues = recentDays.map(d => d.netCents / 100);

    charts.renderCashFlowComparison('chart-dash-cashflow', dayLabels, grossValues, netValues);

    // Próximos Vencimentos
    const upcomingContainer = document.getElementById('dash-upcoming-payables-list');
    const pendingPayables = this.cachedData.payables
      .filter(p => p.status !== 'paid' && p.status !== 'cancelled')
      .slice(0, 5);

    if (pendingPayables.length === 0) {
      upcomingContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 13px;">Nenhum compromisso pendente no período.</p>';
    } else {
      upcomingContainer.innerHTML = pendingPayables.map(p => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border-light);">
          <div>
            <div style="font-weight: 600; font-size: 13px; color: var(--text-primary);">${p.description}</div>
            <div style="font-size: 11px; color: var(--text-muted);">Vencimento: ${validation.formatDateBR(p.dueDate)} · ${p.installment || '1/1'}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 700; font-size: 13px; color: var(--danger); font-variant-numeric: tabular-nums;">${validation.formatBRL(p.originalAmountCents)}</div>
            ${components.renderStatusBadge(finance.determinePayableStatus(p))}
          </div>
        </div>
      `).join('');
    }
  }

  // =========================================================================
  // 2. FATURAMENTO DIÁRIO
  // =========================================================================
  renderDailyRevenueView() {
    const list = finance.filterByPeriod(this.cachedData.dailyRevenues, this.periodFilter, 'date');
    const tbody = document.getElementById('daily-revenue-table-body');
    if (!tbody) return;

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9">${components.renderEmptyState({
        icon: 'receipt',
        title: 'Nenhum faturamento registrado',
        description: 'Cadastre o primeiro fechamento diário clicando no botão abaixo.',
        actionButton: '<button class="btn btn-primary" id="btn-empty-daily">Registrar Fechamento Diário</button>'
      })}</td></tr>`;
      document.getElementById('btn-empty-daily')?.addEventListener('click', () => this.openDailyRevenueModal());
      return;
    }

    let totGross = 0, totDisc = 0, totNet = 0, totPix = 0, totCards = 0, totCash = 0;

    tbody.innerHTML = list.map(item => {
      totGross += item.grossCents;
      totDisc += (item.discountCents + item.cancellationCents);
      totNet += item.netCents;
      totPix += item.pixCents;
      totCards += (item.creditCents + item.debitCents);
      totCash += item.cashCents;

      return `
        <tr>
          <td><strong>${validation.formatDateBR(item.date)}</strong></td>
          <td class="align-right">${validation.formatBRL(item.grossCents)}</td>
          <td class="align-right" style="color: var(--danger);">${validation.formatBRL(item.discountCents + item.cancellationCents)}</td>
          <td class="align-right" style="font-weight: 700; color: var(--success);">${validation.formatBRL(item.netCents)}</td>
          <td class="align-right">${validation.formatBRL(item.pixCents)}</td>
          <td class="align-right">${validation.formatBRL(item.creditCents + item.debitCents)}</td>
          <td class="align-right">${validation.formatBRL(item.cashCents)}</td>
          <td><span style="font-size: 12px; color: var(--text-muted);">${item.notes || '-'}</span></td>
          <td class="align-center">
            <div class="row-actions">
              <button class="btn-icon-action" onclick="window.aureFin.editDailyRevenue('${item.id}')" title="Editar">${components.getIconSvg('pencil', 14)}</button>
              <button class="btn-icon-action danger" onclick="window.aureFin.deleteDailyRevenue('${item.id}')" title="Excluir">${components.getIconSvg('trash-2', 14)}</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Totais no Rodapé
    document.getElementById('daily-tot-gross').textContent = validation.formatBRL(totGross);
    document.getElementById('daily-tot-disc').textContent = validation.formatBRL(totDisc);
    document.getElementById('daily-tot-net').textContent = validation.formatBRL(totNet);
    document.getElementById('daily-tot-pix').textContent = validation.formatBRL(totPix);
    document.getElementById('daily-tot-cards').textContent = validation.formatBRL(totCards);
    document.getElementById('daily-tot-cash').textContent = validation.formatBRL(totCash);
  }

  // =========================================================================
  // 3. MOVIMENTAÇÕES FINANCEIRAS (LIVRO CAIXA)
  // =========================================================================
  renderTransactionsView() {
    const list = finance.filterByPeriod(this.cachedData.transactions, this.periodFilter, 'date');
    const tbody = document.getElementById('transactions-table-body');
    if (!tbody) return;

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7">${components.renderEmptyState({
        icon: 'arrow-left-right',
        title: 'Nenhuma movimentação encontrada',
        description: 'Faça um lançamento financeiro para começar a registrar o livro caixa.',
        actionButton: '<button class="btn btn-primary" onclick="window.aureFin.openTransactionModal()">+ Novo Lançamento</button>'
      })}</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(tx => {
      const acc = this.cachedData.accountMap.get(tx.accountId)?.name || 'Conta Corrente';
      const cat = this.cachedData.categoryMap.get(tx.categoryId)?.name || (tx.type === 'transfer' ? 'Transferência' : 'Geral');

      let typeBadge = '<span class="badge-status info">Transferência</span>';
      let amountClass = 'neutral';
      if (tx.type === 'income') {
        typeBadge = '<span class="badge-status success">Receita</span>';
        amountClass = 'positive';
      } else if (tx.type === 'expense') {
        typeBadge = '<span class="badge-status danger">Despesa</span>';
        amountClass = 'negative';
      }

      return `
        <tr>
          <td>${validation.formatDateBR(tx.date)}</td>
          <td>${typeBadge}</td>
          <td><strong>${tx.description}</strong></td>
          <td><span style="font-size: 12px; color: var(--text-secondary);">${acc}</span></td>
          <td><span style="font-size: 12px; color: var(--text-muted);">${cat}</span></td>
          <td class="align-right ${amountClass}" style="font-weight: 700;">${validation.formatBRL(tx.amountCents)}</td>
          <td class="align-center">
            <button class="btn-icon-action danger" onclick="window.aureFin.deleteTransaction('${tx.id}')" title="Excluir">${components.getIconSvg('trash-2', 14)}</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // =========================================================================
  // 4. CONTAS A PAGAR & BOLETOS
  // =========================================================================
  renderPayablesView() {
    const list = finance.filterByPeriod(this.cachedData.payables, this.periodFilter, 'dueDate');
    const tbody = document.getElementById('payables-table-body');
    if (!tbody) return;

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8">${components.renderEmptyState({
        icon: 'receipt',
        title: 'Nenhuma conta a pagar no período',
        description: 'Todas as obrigações estão em dia ou não há lançamentos cadastrados.',
        actionButton: '<button class="btn btn-primary" onclick="window.aureFin.openPayableModal()">+ Nova Conta a Pagar</button>'
      })}</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(p => {
      const status = finance.determinePayableStatus(p);
      const sup = this.cachedData.supplierMap.get(p.supplierId)?.name || 'Fornecedor';
      const cat = this.cachedData.categoryMap.get(p.categoryId)?.name || 'Geral';

      return `
        <tr>
          <td><strong>${validation.formatDateBR(p.dueDate)}</strong></td>
          <td>
            <div style="font-weight: 600;">${p.description}</div>
            <div style="font-size: 11px; color: var(--text-muted);">${sup} · ${cat}</div>
          </td>
          <td>${p.docNumber || '-'}</td>
          <td>${p.installment || '1/1'}</td>
          <td class="align-right">${validation.formatBRL(p.originalAmountCents)}</td>
          <td class="align-right" style="color: var(--success);">${validation.formatBRL(p.amountPaidCents || 0)}</td>
          <td class="align-center">${components.renderStatusBadge(status)}</td>
          <td class="align-center">
            <div class="row-actions">
              ${status !== 'paid' ? `<button class="btn btn-sm btn-success" onclick="window.aureFin.openPaymentModal('${p.id}')">Quitar</button>` : ''}
              <button class="btn-icon-action" onclick="window.aureFin.editPayable('${p.id}')" title="Editar">${components.getIconSvg('pencil', 14)}</button>
              <button class="btn-icon-action danger" onclick="window.aureFin.deletePayable('${p.id}')" title="Excluir">${components.getIconSvg('trash-2', 14)}</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // =========================================================================
  // 5. CONTAS A RECEBER
  // =========================================================================
  renderReceivablesView() {
    const list = finance.filterByPeriod(this.cachedData.receivables, this.periodFilter, 'expectedDate');
    const tbody = document.getElementById('receivables-table-body');
    if (!tbody) return;

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8">${components.renderEmptyState({
        icon: 'wallet',
        title: 'Nenhuma conta a receber no período',
        description: 'Cadastre suas faturas e cobranças para acompanhar os recebimentos.',
        actionButton: '<button class="btn btn-primary" onclick="window.aureFin.openReceivableModal()">+ Nova Conta a Receber</button>'
      })}</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(r => {
      const status = finance.determineReceivableStatus(r);
      const cust = this.cachedData.customerMap.get(r.customerId)?.name || 'Cliente';

      return `
        <tr>
          <td><strong>${validation.formatDateBR(r.expectedDate)}</strong></td>
          <td>
            <div style="font-weight: 600;">${r.description}</div>
            <div style="font-size: 11px; color: var(--text-muted);">${cust}</div>
          </td>
          <td>${r.paymentMethod || 'Pix'}</td>
          <td>${r.installment || '1/1'}</td>
          <td class="align-right">${validation.formatBRL(r.originalAmountCents)}</td>
          <td class="align-right" style="color: var(--success);">${validation.formatBRL(r.amountReceivedCents || 0)}</td>
          <td class="align-center">${components.renderStatusBadge(status)}</td>
          <td class="align-center">
            <div class="row-actions">
              ${status !== 'received' ? `<button class="btn btn-sm btn-success" onclick="window.aureFin.openReceiveSettlementModal('${r.id}')">Receber</button>` : ''}
              <button class="btn-icon-action danger" onclick="window.aureFin.deleteReceivable('${r.id}')" title="Excluir">${components.getIconSvg('trash-2', 14)}</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // =========================================================================
  // 6. BOLETOS E DOCUMENTOS
  // =========================================================================
  renderBankSlipsView() {
    const boletos = this.cachedData.payables.filter(p => p.isBoleto || Boolean(p.barcode));
    const tbody = document.getElementById('bankslips-table-body');
    if (!tbody) return;

    if (boletos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7">${components.renderEmptyState({
        icon: 'barcode',
        title: 'Nenhum boleto cadastrado',
        description: 'Cadastre boletos bancários com linha digitável e código de barras.'
      })}</td></tr>`;
      return;
    }

    tbody.innerHTML = boletos.map(b => {
      const status = finance.determinePayableStatus(b);
      const sup = this.cachedData.supplierMap.get(b.supplierId)?.name || 'Fornecedor';

      return `
        <tr>
          <td><strong>${validation.formatDateBR(b.dueDate)}</strong></td>
          <td>
            <div style="font-weight: 600;">${b.description}</div>
            <div style="font-size: 11px; color: var(--text-muted);">${sup}</div>
          </td>
          <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); word-break: break-all;">
            ${validation.formatBarcode(b.barcode)}
          </td>
          <td class="align-right" style="font-weight: 700;">${validation.formatBRL(b.originalAmountCents)}</td>
          <td class="align-center">${components.renderStatusBadge(status)}</td>
          <td class="align-center">
            <button class="btn btn-sm btn-secondary" onclick="window.aureFin.copyBarcode('${b.barcode}')" title="Copiar código de barras">
              ${components.getIconSvg('copy', 12)} Copiar Linha
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // =========================================================================
  // 7 & 8. DESPESAS E RECEITAS ESPECÍFICAS
  // =========================================================================
  renderExpensesView() {
    const list = this.cachedData.transactions.filter(t => t.type === 'expense');
    const tbody = document.getElementById('expenses-table-body');
    if (!tbody) return;

    tbody.innerHTML = list.map(t => {
      const cat = this.cachedData.categoryMap.get(t.categoryId)?.name || 'Despesa Geral';
      const acc = this.cachedData.accountMap.get(t.accountId)?.name || 'Conta';
      return `
        <tr>
          <td>${validation.formatDateBR(t.date)}</td>
          <td><strong>${t.description}</strong></td>
          <td>${cat}</td>
          <td>${acc}</td>
          <td class="align-right" style="color: var(--danger); font-weight: 700;">${validation.formatBRL(t.amountCents)}</td>
          <td class="align-center">
            <button class="btn-icon-action danger" onclick="window.aureFin.deleteTransaction('${t.id}')">${components.getIconSvg('trash-2', 14)}</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  renderRevenuesView() {
    const list = this.cachedData.transactions.filter(t => t.type === 'income');
    const tbody = document.getElementById('revenues-table-body');
    if (!tbody) return;

    tbody.innerHTML = list.map(t => {
      const cat = this.cachedData.categoryMap.get(t.categoryId)?.name || 'Receita Operacional';
      const acc = this.cachedData.accountMap.get(t.accountId)?.name || 'Conta';
      return `
        <tr>
          <td>${validation.formatDateBR(t.date)}</td>
          <td><strong>${t.description}</strong></td>
          <td>${cat}</td>
          <td>${acc}</td>
          <td class="align-right" style="color: var(--success); font-weight: 700;">${validation.formatBRL(t.amountCents)}</td>
          <td class="align-center">
            <button class="btn-icon-action danger" onclick="window.aureFin.deleteTransaction('${t.id}')">${components.getIconSvg('trash-2', 14)}</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // =========================================================================
  // 9. FLUXO DE CAIXA
  // =========================================================================
  renderCashFlowView() {
    const m = this.cachedData.metrics;
    document.getElementById('cashflow-start-bal').textContent = validation.formatBRL(m.totalBalanceCents - m.cashFlowResultCents);
    document.getElementById('cashflow-incomes').textContent = validation.formatBRL(m.realizedIncomeCents);
    document.getElementById('cashflow-expenses').textContent = validation.formatBRL(m.realizedExpenseCents);
    document.getElementById('cashflow-final-bal').textContent = validation.formatBRL(m.totalBalanceCents);

    // Gráfico de categorias
    const expCats = new Map();
    this.cachedData.transactions.filter(t => t.type === 'expense').forEach(t => {
      const name = this.cachedData.categoryMap.get(t.categoryId)?.name || 'Outras';
      expCats.set(name, (expCats.get(name) || 0) + (t.amountCents / 100));
    });

    const catLabels = Array.from(expCats.keys());
    const catAmounts = Array.from(expCats.values());
    charts.renderExpensesByCategory('chart-cashflow-categories', catLabels, catAmounts);
  }

  // =========================================================================
  // 10. BANCOS E CAIXAS
  // =========================================================================
  renderBankAccountsView() {
    const container = document.getElementById('bank-accounts-grid');
    if (!container) return;

    container.innerHTML = this.cachedData.accounts.map(acc => `
      <div class="stat-item" style="display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div class="stat-header">
            <span class="stat-label" style="font-size: 13px; font-weight: 700; color: var(--navy-800);">${acc.name}</span>
            <span class="stat-icon">${components.getIconSvg(acc.type === 'cash' ? 'wallet' : 'landmark', 16)}</span>
          </div>
          <div class="stat-value" style="color: #0f274a; margin: 8px 0;">${validation.formatBRL(acc.currentBalanceCents)}</div>
          <div class="stat-subtext" style="margin-bottom: 12px;">
            <span>${acc.type === 'cash' ? 'Caixa físico da empresa' : `Cód: ${acc.bankCode || '-'} · Ag: ${acc.agency || '-'} · ${acc.number || '-'}`}</span>
          </div>
        </div>
        <div style="display: flex; gap: 6px; padding-top: 10px; border-top: 1px solid var(--border-light);">
          <button class="btn btn-sm btn-secondary" onclick="window.aureFin.openAdjustBalanceForAccount('${acc.id}')" style="flex: 1;">
            <i data-lucide="sliders"></i> Ajustar Saldo
          </button>
        </div>
      </div>
    `).join('');
    components.refreshIcons(container);
  }

  openAdjustBalanceForAccount(accountId) {
    this.openAdjustBalanceModal();
    const select = document.getElementById('adjust-balance-account');
    if (select) select.value = accountId;
    const acc = this.cachedData.accountMap.get(accountId);
    const input = document.getElementById('adjust-balance-amount');
    if (input && acc) input.value = validation.formatBRL(acc.currentBalanceCents, false);
  }

  // =========================================================================
  // 11. EMPRÉSTIMOS E PARCELAS
  // =========================================================================
  renderLoansView() {
    const tbody = document.getElementById('loans-table-body');
    if (!tbody) return;

    if (this.cachedData.loans.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7">${components.renderEmptyState({
        icon: 'hand-coins',
        title: 'Nenhum empréstimo cadastrado',
        description: 'Cadastre contratos de financiamento e capital de giro.'
      })}</td></tr>`;
      return;
    }

    tbody.innerHTML = this.cachedData.loans.map(l => `
      <tr>
        <td><strong>${l.institution}</strong></td>
        <td class="align-right">${validation.formatBRL(l.contractedAmountCents)}</td>
        <td class="align-center">${l.paidInstallments} / ${l.totalInstallments}</td>
        <td class="align-right">${validation.formatBRL(l.installmentValueCents)}</td>
        <td>${l.annualInterestRate || '-'}</td>
        <td class="align-right" style="font-weight: 700; color: var(--danger);">${validation.formatBRL(l.currentBalanceCents)}</td>
        <td class="align-center">
          <button class="btn-icon-action danger" onclick="window.aureFin.deleteLoan('${l.id}')">${components.getIconSvg('trash-2', 14)}</button>
        </td>
      </tr>
    `).join('');
  }

  // =========================================================================
  // 12 & 13. CLIENTES E FORNECEDORES
  // =========================================================================
  renderCustomersView() {
    const tbody = document.getElementById('customers-table-body');
    if (!tbody) return;

    tbody.innerHTML = this.cachedData.customers.map(c => `
      <tr>
        <td><strong>${c.name}</strong></td>
        <td>${validation.formatDocument(c.document)}</td>
        <td>${c.email || '-'}</td>
        <td>${c.phone || '-'}</td>
        <td class="align-right" style="font-weight: 600;">${validation.formatBRL(c.totalBilledCents || 0)}</td>
        <td class="align-center">
          <button class="btn-icon-action danger" onclick="window.aureFin.deleteCustomer('${c.id}')">${components.getIconSvg('trash-2', 14)}</button>
        </td>
      </tr>
    `).join('');
  }

  renderSuppliersView() {
    const tbody = document.getElementById('suppliers-table-body');
    if (!tbody) return;

    tbody.innerHTML = this.cachedData.suppliers.map(s => `
      <tr>
        <td><strong>${s.name}</strong></td>
        <td>${validation.formatDocument(s.document)}</td>
        <td>${s.email || '-'}</td>
        <td>${s.phone || '-'}</td>
        <td class="align-center">
          <button class="btn-icon-action danger" onclick="window.aureFin.deleteSupplier('${s.id}')">${components.getIconSvg('trash-2', 14)}</button>
        </td>
      </tr>
    `).join('');
  }

  // =========================================================================
  // 14. CATEGORIAS FINANCEIRAS
  // =========================================================================
  renderCategoriesView() {
    const tbody = document.getElementById('categories-table-body');
    if (!tbody) return;

    tbody.innerHTML = this.cachedData.categories.map(cat => `
      <tr>
        <td>
          <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${cat.color || '#64748b'}; margin-right: 6px;"></span>
          <strong>${cat.name}</strong>
        </td>
        <td>${cat.type === 'revenue' ? '<span class="badge-status success">Receita</span>' : '<span class="badge-status danger">Despesa</span>'}</td>
        <td>${cat.group || 'Geral'}</td>
        <td class="align-center">
          <button class="btn-icon-action danger" onclick="window.aureFin.deleteCategory('${cat.id}')">${components.getIconSvg('trash-2', 14)}</button>
        </td>
      </tr>
    `).join('');
  }

  // =========================================================================
  // 15. METAS FINANCEIRAS
  // =========================================================================
  renderGoalsView() {
    const container = document.getElementById('goals-cards-container');
    if (!container) return;

    container.innerHTML = this.cachedData.goals.map(g => {
      const pct = g.targetCents > 0 ? Math.min(100, Math.round((g.currentCents / g.targetCents) * 100)) : 0;
      return `
        <div class="content-panel" style="padding: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div style="font-weight: 700; font-size: 15px;">${g.title}</div>
            <span class="badge-status ${pct >= 100 ? 'success' : 'info'}">${pct}% Atingido</span>
          </div>
          <div style="background: var(--surface-subtle); height: 10px; border-radius: 5px; overflow: hidden; margin-bottom: 12px;">
            <div style="background: ${pct >= 100 ? 'var(--success)' : 'var(--navy-600)'}; height: 100%; width: ${pct}%;"></div>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 13px; color: var(--text-muted);">
            <span>Realizado: <strong>${validation.formatBRL(g.currentCents)}</strong></span>
            <span>Meta: <strong>${validation.formatBRL(g.targetCents)}</strong></span>
          </div>
        </div>
      `;
    }).join('');
  }

  // =========================================================================
  // 16. RELATÓRIOS GERENCIAIS & DRE
  // =========================================================================
  renderReportsView() {
    const dre = finance.computeDRE({
      transactions: this.cachedData.transactions,
      dailyRevenues: this.cachedData.dailyRevenues,
      categories: this.cachedData.categories,
      periodFilter: this.periodFilter
    });

    document.getElementById('dre-gross-revenue').textContent = validation.formatBRL(dre.grossRevenueCents);
    document.getElementById('dre-deductions').textContent = `(-) ${validation.formatBRL(dre.deductionsCents)}`;
    document.getElementById('dre-net-revenue').textContent = validation.formatBRL(dre.netRevenueCents);
    document.getElementById('dre-var-costs').textContent = `(-) ${validation.formatBRL(dre.variableCostsCents)}`;
    document.getElementById('dre-contrib-margin').textContent = `${validation.formatBRL(dre.contributionMarginCents)} (${dre.contributionMarginPct}%)`;
    document.getElementById('dre-fixed-expenses').textContent = `(-) ${validation.formatBRL(dre.fixedExpensesCents)}`;
    document.getElementById('dre-operating-result').textContent = validation.formatBRL(dre.operatingResultCents);
    document.getElementById('dre-net-profit').textContent = validation.formatBRL(dre.netProfitCents);
    document.getElementById('dre-breakeven').textContent = validation.formatBRL(dre.breakevenCents);
  }

  // =========================================================================
  // 17. CENTRAL DE EXPORTAÇÃO EXCEL
  // =========================================================================
  renderExcelExportView() {
    const syncStatus = storage.getExcelSyncStatus();
    const statusBox = document.getElementById('excel-export-status-box');
    if (statusBox) {
      if (syncStatus.hasChanges) {
        statusBox.innerHTML = `
          <div style="padding: 14px 18px; background: #fffbeb; border: 1px solid #fde68a; border-radius: var(--radius-md); color: #92400e; display: flex; align-items: center; justify-content: space-between;">
            <div>
              <strong>Atenção:</strong> Existem novos lançamentos financeiros prontos para serem consolidados no arquivo Excel.
              <div style="font-size: 11px; margin-top: 2px;">Última exportação realizada: ${validation.formatDateTimeBR(syncStatus.lastExported)}</div>
            </div>
            <button class="btn btn-primary" onclick="window.aureFin.triggerMasterExcelExport()">
              ${components.getIconSvg('download', 14)} Exportar Agora
            </button>
          </div>
        `;
      } else {
        statusBox.innerHTML = `
          <div style="padding: 14px 18px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: var(--radius-md); color: #065f46; display: flex; align-items: center; justify-content: space-between;">
            <div>
              <strong>Status Sincronizado:</strong> Todos os registros locais já foram exportados na última planilha baixada.
              <div style="font-size: 11px; margin-top: 2px;">Exportado em: ${validation.formatDateTimeBR(syncStatus.lastExported)}</div>
            </div>
            <button class="btn btn-secondary" onclick="window.aureFin.triggerMasterExcelExport()">
              ${components.getIconSvg('download', 14)} Baixar Novamente
            </button>
          </div>
        `;
      }
    }

    // Histórico de exportações
    const tbody = document.getElementById('excel-history-table-body');
    if (tbody) {
      tbody.innerHTML = this.cachedData.exportsHistory.map(exp => `
        <tr>
          <td><strong>${exp.fileName}</strong></td>
          <td>${exp.type}</td>
          <td>${exp.period}</td>
          <td>${validation.formatDateTimeBR(exp.timestamp)}</td>
        </tr>
      `).join('');
    }
  }

  // =========================================================================
  // 18. LIXEIRA E HISTÓRICO DE AUDITORIA
  // =========================================================================
  renderTrashAuditView() {
    const trashTbody = document.getElementById('trash-table-body');
    if (trashTbody) {
      if (this.cachedData.trash.length === 0) {
        trashTbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 24px;">Lixeira vazia. Nenhum item excluído.</td></tr>';
      } else {
        trashTbody.innerHTML = this.cachedData.trash.map(t => `
          <tr>
            <td>${t.originalStore}</td>
            <td><strong>${t.data.description || t.data.name || t.data.date || 'Registro'}</strong></td>
            <td>${validation.formatDateTimeBR(t.deletedAt)}</td>
            <td class="align-center">
              <button class="btn btn-sm btn-secondary" onclick="window.aureFin.restoreFromTrash('${t.id}')">Restaurar</button>
            </td>
          </tr>
        `).join('');
      }
    }

    const auditTbody = document.getElementById('audit-table-body');
    if (auditTbody) {
      auditTbody.innerHTML = this.cachedData.auditLog.slice(-15).reverse().map(log => `
        <tr>
          <td>${validation.formatDateTimeBR(log.timestamp)}</td>
          <td><span class="badge-status neutral">${log.action}</span></td>
          <td>${log.entity}</td>
          <td>${log.description}</td>
        </tr>
      `).join('');
    }
  }

  // =========================================================================
  // 19. CONFIGURAÇÕES E BACKUP
  // =========================================================================
  renderSettingsView() {
    // Configurações
  }

  // =========================================================================
  // 20. AJUDA E CENTRAL DE ORIENTAÇÕES
  // =========================================================================
  renderHelpView() {
    // Orientações
  }

  // =========================================================================
  // MODAIS E AÇÕES
  // =========================================================================
  async triggerMasterExcelExport() {
    try {
      const fileName = await excel.exportMasterWorkbook(this.cachedData, this.periodFilter);
      components.showToast(`Planilha ${fileName} gerada com sucesso!`, 'success');
      await storage.logAudit('EXCEL_EXPORT', 'Excel', `Planilha mestre consolidada gerada: ${fileName}`);
      this.updateExcelSyncUI();
    } catch (err) {
      components.showToast('Erro ao exportar planilha Excel.', 'danger');
      console.error(err);
    }
  }

  copyBarcode(barcode) {
    if (!barcode) return;
    navigator.clipboard.writeText(barcode);
    components.showToast('Código de barras copiado para a área de transferência!', 'success');
  }

  async restoreFromTrash(trashId) {
    await storage.restoreFromTrash(trashId);
    components.showToast('Item restaurado com sucesso!', 'success');
    await this.refreshData();
    this.renderCurrentView();
  }

  async deleteTransaction(id) {
    const confirmed = await components.confirm({
      title: 'Excluir Movimentação',
      message: 'Deseja mover esta movimentação para a lixeira?',
      isDanger: true
    });
    if (!confirmed) return;

    await storage.remove('transactions', id);
    await storage.logAudit('DELETE', 'Movimentação', `Movimentação ${id} excluída`);
    components.showToast('Movimentação excluída.', 'success');
    await this.refreshData();
    this.renderCurrentView();
  }

  async deletePayable(id) {
    const confirmed = await components.confirm({
      title: 'Excluir Conta a Pagar',
      message: 'Deseja realmente excluir esta conta a pagar?',
      isDanger: true
    });
    if (!confirmed) return;

    await storage.remove('payables', id);
    await storage.logAudit('DELETE', 'Conta a Pagar', `Conta a pagar ${id} excluída`);
    components.showToast('Conta a pagar excluída.', 'success');
    await this.refreshData();
    this.renderCurrentView();
  }

  async deleteReceivable(id) {
    const confirmed = await components.confirm({
      title: 'Excluir Conta a Receber',
      message: 'Deseja realmente excluir esta conta a receber?',
      isDanger: true
    });
    if (!confirmed) return;

    await storage.remove('receivables', id);
    await storage.logAudit('DELETE', 'Conta a Receber', `Conta a receber ${id} excluída`);
    components.showToast('Conta a receber excluída.', 'success');
    await this.refreshData();
    this.renderCurrentView();
  }

  async deleteDailyRevenue(id) {
    const confirmed = await components.confirm({
      title: 'Excluir Fechamento Diário',
      message: 'Deseja excluir o registro deste dia de faturamento?',
      isDanger: true
    });
    if (!confirmed) return;

    await storage.remove('daily_revenues', id);
    components.showToast('Fechamento diário excluído.', 'success');
    await this.refreshData();
    this.renderCurrentView();
  }

  openTransactionModal() {
    const modal = document.getElementById('transaction-modal');
    if (!modal) return;

    const accSelect = document.getElementById('tx-account');
    accSelect.innerHTML = this.cachedData.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');

    const catSelect = document.getElementById('tx-category');
    catSelect.innerHTML = this.cachedData.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    document.getElementById('tx-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('tx-description').value = '';
    document.getElementById('tx-amount').value = '';

    modal.classList.add('open');
  }

  closeTransactionModal() {
    document.getElementById('transaction-modal')?.classList.remove('open');
  }

  async saveTransaction() {
    const type = document.getElementById('tx-type').value;
    const date = document.getElementById('tx-date').value;
    const description = document.getElementById('tx-description').value;
    const amountStr = document.getElementById('tx-amount').value;
    const accountId = document.getElementById('tx-account').value;
    const categoryId = document.getElementById('tx-category').value;

    const amountCents = validation.parseBRLToCents(amountStr);
    if (!description || amountCents <= 0) {
      components.showToast('Informe uma descrição válida e um valor maior que zero.', 'warning');
      return;
    }

    const tx = {
      type,
      date,
      description,
      amountCents,
      accountId,
      categoryId
    };

    await storage.save('transactions', tx);

    // Atualiza saldo da conta
    const account = this.cachedData.accountMap.get(accountId);
    if (account) {
      if (type === 'income') {
        account.currentBalanceCents += amountCents;
      } else if (type === 'expense') {
        account.currentBalanceCents -= amountCents;
      }
      await storage.save('accounts', account);
    }

    await storage.logAudit('CREATE', 'Movimentação', `Nova movimentação: ${description} (${validation.formatBRL(amountCents)})`);
    this.closeTransactionModal();
    components.showToast('Lançamento salvo com sucesso!', 'success');
    await this.refreshData();
    this.renderCurrentView();
  }

  openDailyRevenueModal() {
    const modal = document.getElementById('daily-revenue-modal');
    if (!modal) return;
    document.getElementById('daily-rev-date').value = new Date().toISOString().split('T')[0];
    modal.classList.add('open');
  }

  closeDailyRevenueModal() {
    document.getElementById('daily-revenue-modal')?.classList.remove('open');
  }

  async saveDailyRevenue() {
    const date = document.getElementById('daily-rev-date').value;
    const grossCents = validation.parseBRLToCents(document.getElementById('daily-rev-gross').value);
    const discountCents = validation.parseBRLToCents(document.getElementById('daily-rev-discount').value);
    const pixCents = validation.parseBRLToCents(document.getElementById('daily-rev-pix').value);
    const creditCents = validation.parseBRLToCents(document.getElementById('daily-rev-credit').value);
    const debitCents = validation.parseBRLToCents(document.getElementById('daily-rev-debit').value);
    const cashCents = validation.parseBRLToCents(document.getElementById('daily-rev-cash').value);
    const termCents = validation.parseBRLToCents(document.getElementById('daily-rev-term').value);
    const notes = document.getElementById('daily-rev-notes').value;

    const data = {
      grossCents,
      discountCents,
      cancellationCents: 0,
      pixCents,
      creditCents,
      debitCents,
      cashCents,
      transferCents: 0,
      termCents,
      notes
    };

    const check = validation.validateDailyRevenue(data);
    if (!check.isValid) {
      const proceed = await components.confirm({
        title: 'Divergência de Fechamento',
        message: `${check.message}\nDeseja salvar mesmo com divergência?`,
        confirmText: 'Salvar Mesmo Assim',
        isDanger: true
      });
      if (!proceed) return;
    }

    data.id = 'fat_' + date;
    data.date = date;
    data.netCents = check.netCents;

    await storage.save('daily_revenues', data);
    this.closeDailyRevenueModal();
    components.showToast('Faturamento diário registrado com sucesso!', 'success');
    await this.refreshData();
    this.renderCurrentView();
  }

  openPayableModal() {
    const modal = document.getElementById('payable-modal');
    if (!modal) return;

    const supSelect = document.getElementById('pay-supplier');
    supSelect.innerHTML = this.cachedData.suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

    const catSelect = document.getElementById('pay-category');
    catSelect.innerHTML = this.cachedData.categories.filter(c => c.type === 'expense').map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    document.getElementById('pay-due-date').value = new Date().toISOString().split('T')[0];
    modal.classList.add('open');
  }

  closePayableModal() {
    document.getElementById('payable-modal')?.classList.remove('open');
  }

  async savePayable() {
    const description = document.getElementById('pay-desc').value;
    const supplierId = document.getElementById('pay-supplier').value;
    const categoryId = document.getElementById('pay-category').value;
    const dueDate = document.getElementById('pay-due-date').value;
    const amountCents = validation.parseBRLToCents(document.getElementById('pay-amount').value);
    const docNumber = document.getElementById('pay-doc').value;
    const barcode = document.getElementById('pay-barcode').value;

    if (!description || amountCents <= 0) {
      components.showToast('Preencha a descrição e um valor válido.', 'warning');
      return;
    }

    await storage.save('payables', {
      description,
      supplierId,
      categoryId,
      dueDate,
      originalAmountCents: amountCents,
      amountPaidCents: 0,
      docNumber,
      barcode,
      status: 'pending',
      installment: '1/1',
      isBoleto: Boolean(barcode)
    });

    this.closePayableModal();
    components.showToast('Conta a pagar cadastrada com sucesso!', 'success');
    await this.refreshData();
    this.renderCurrentView();
  }

  openReceivableModal() {
    const modal = document.getElementById('receivable-modal');
    if (!modal) return;

    const custSelect = document.getElementById('rec-customer');
    custSelect.innerHTML = this.cachedData.customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    const catSelect = document.getElementById('rec-category');
    catSelect.innerHTML = this.cachedData.categories.filter(c => c.type === 'revenue').map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    document.getElementById('rec-expected-date').value = new Date().toISOString().split('T')[0];
    modal.classList.add('open');
  }

  closeReceivableModal() {
    document.getElementById('receivable-modal')?.classList.remove('open');
  }

  async saveReceivable() {
    const description = document.getElementById('rec-desc').value;
    const customerId = document.getElementById('rec-customer').value;
    const categoryId = document.getElementById('rec-category').value;
    const expectedDate = document.getElementById('rec-expected-date').value;
    const amountCents = validation.parseBRLToCents(document.getElementById('rec-amount').value);
    const paymentMethod = document.getElementById('rec-method').value;

    if (!description || amountCents <= 0) {
      components.showToast('Preencha a descrição e um valor válido.', 'warning');
      return;
    }

    await storage.save('receivables', {
      description,
      customerId,
      categoryId,
      expectedDate,
      originalAmountCents: amountCents,
      amountReceivedCents: 0,
      paymentMethod,
      status: 'pending',
      installment: '1/1'
    });

    this.closeReceivableModal();
    components.showToast('Conta a receber cadastrada com sucesso!', 'success');
    await this.refreshData();
    this.renderCurrentView();
  }

  async openPaymentModal(payableId) {
    const payable = await storage.getById('payables', payableId);
    if (!payable) return;

    const confirmed = await components.confirm({
      title: 'Confirmar Quitação',
      message: `Deseja registrar o pagamento de ${validation.formatBRL(payable.originalAmountCents)} para "${payable.description}"?`,
      confirmText: 'Confirmar Pagamento'
    });
    if (!confirmed) return;

    payable.amountPaidCents = payable.originalAmountCents;
    payable.paymentDate = new Date().toISOString().split('T')[0];
    payable.status = 'paid';

    await storage.save('payables', payable);

    // Registra saída correspondente no Livro Caixa
    await storage.save('transactions', {
      date: payable.paymentDate,
      type: 'expense',
      description: `Pagamento: ${payable.description}`,
      amountCents: payable.originalAmountCents,
      accountId: payable.accountId || this.cachedData.accounts[0]?.id,
      categoryId: payable.categoryId,
      sourceId: payable.id
    });

    components.showToast('Pagamento liquidado e registrado no caixa!', 'success');
    await this.refreshData();
    this.renderCurrentView();
  }

  async openReceiveSettlementModal(receivableId) {
    const rec = await storage.getById('receivables', receivableId);
    if (!rec) return;

    const confirmed = await components.confirm({
      title: 'Confirmar Recebimento',
      message: `Deseja registrar o recebimento de ${validation.formatBRL(rec.originalAmountCents)} referente a "${rec.description}"?`,
      confirmText: 'Confirmar Entrada'
    });
    if (!confirmed) return;

    rec.amountReceivedCents = rec.originalAmountCents;
    rec.receiptDate = new Date().toISOString().split('T')[0];
    rec.status = 'received';

    await storage.save('receivables', rec);

    // Registra entrada correspondente no Livro Caixa
    await storage.save('transactions', {
      date: rec.receiptDate,
      type: 'income',
      description: `Recebimento: ${rec.description}`,
      amountCents: rec.originalAmountCents,
      accountId: rec.accountId || this.cachedData.accounts[0]?.id,
      categoryId: rec.categoryId,
      sourceId: rec.id
    });

    components.showToast('Recebimento confirmado e adicionado ao caixa!', 'success');
    await this.refreshData();
    this.renderCurrentView();
  }

  openCalculatorModal() {
    document.getElementById('calculator-modal')?.classList.add('open');
  }

  closeCalculatorModal() {
    document.getElementById('calculator-modal')?.classList.remove('open');
  }

  calculateTool(toolType) {
    if (toolType === 'margin') {
      const cost = validation.parseBRLToCents(document.getElementById('calc-cost').value);
      const price = validation.parseBRLToCents(document.getElementById('calc-price').value);
      const res = finance.calculateFinancialTool('margin_markup', { costCents: cost, priceCents: price });
      document.getElementById('calc-res-margin').textContent = `${res.marginPct}%`;
      document.getElementById('calc-res-markup').textContent = `${res.markupPct}%`;
      document.getElementById('calc-res-profit').textContent = validation.formatBRL(res.profitCents);
    } else if (toolType === 'interest') {
      const principal = validation.parseBRLToCents(document.getElementById('calc-int-principal').value);
      const rate = parseFloat(document.getElementById('calc-int-rate').value) || 0;
      const months = parseInt(document.getElementById('calc-int-months').value) || 1;
      const res = finance.calculateFinancialTool('simple_interest', { principalCents: principal, rateMonthlyPct: rate, months });
      document.getElementById('calc-res-interest').textContent = validation.formatBRL(res.interestCents);
      document.getElementById('calc-res-total').textContent = validation.formatBRL(res.totalCents);
      document.getElementById('calc-res-installment').textContent = validation.formatBRL(res.installmentCents);
    }
  }

  handleGlobalSearch() {
    if (!this.searchTerm) return;
    // Se digitou na busca global, filtra as listas atuais
    console.log('Buscando termo:', this.searchTerm);
  }

  updateOrganizationUI() {
    const orgName = storage.getOrganizationName();
    const topbarText = document.getElementById('topbar-org-name-text');
    if (topbarText) topbarText.textContent = orgName;

    const sidebarSub = document.getElementById('sidebar-org-subtitle');
    if (sidebarSub) sidebarSub.textContent = orgName;

    const sidebarFooterName = document.getElementById('sidebar-org-name-text');
    if (sidebarFooterName) sidebarFooterName.textContent = orgName;

    const dashHighlight = document.getElementById('dash-org-name-highlight');
    if (dashHighlight) dashHighlight.textContent = orgName;

    const settingsInput = document.getElementById('settings-org-name-input');
    if (settingsInput) settingsInput.value = orgName;
  }

  openOrgNameModal() {
    const modal = document.getElementById('org-name-modal');
    const input = document.getElementById('modal-org-name-input');
    if (input) input.value = storage.getOrganizationName();
    modal?.classList.add('open');
    input?.focus();
  }

  closeOrgNameModal() {
    document.getElementById('org-name-modal')?.classList.remove('open');
  }

  saveOrgNameFromModal() {
    const input = document.getElementById('modal-org-name-input');
    const newName = storage.setOrganizationName(input?.value);
    this.closeOrgNameModal();
    this.updateOrganizationUI();
    components.showToast(`Nome atualizado para "${newName}"!`, 'success');
  }

  saveOrgNameFromSettings() {
    const input = document.getElementById('settings-org-name-input');
    const newName = storage.setOrganizationName(input?.value);
    this.updateOrganizationUI();
    components.showToast(`Identificação salva como "${newName}"!`, 'success');
  }

  updateRemindersUI() {
    const reminders = this.cachedData.reminders || [];
    const pendingCount = reminders.filter(r => !r.completed).length;

    const badge = document.getElementById('reminders-badge-count');
    if (badge) {
      badge.textContent = pendingCount;
      badge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
    }

    const summaryText = document.getElementById('reminders-summary-text');
    if (summaryText) {
      summaryText.textContent = `${pendingCount} pendente${pendingCount === 1 ? '' : 's'}`;
    }

    const container = document.getElementById('reminders-list-container');
    if (!container) return;

    if (reminders.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 16px;">Nenhum lembrete cadastrado. Use o campo acima para adicionar anotações rápidas.</p>';
      return;
    }

    container.innerHTML = reminders.map(r => `
      <div class="reminder-item ${r.completed ? 'completed' : ''}">
        <div class="reminder-left">
          <input type="checkbox" class="reminder-checkbox" ${r.completed ? 'checked' : ''} onchange="window.aureFin.toggleReminder('${r.id}')" />
          <div>
            <div class="reminder-text">${r.text}</div>
            ${r.dueDate ? `<div class="reminder-date"><i data-lucide="calendar"></i> ${validation.formatDateBR(r.dueDate)}</div>` : ''}
          </div>
        </div>
        <button class="btn-icon-action danger" onclick="window.aureFin.deleteReminder('${r.id}')" title="Excluir lembrete">
          ${components.getIconSvg('trash-2', 14)}
        </button>
      </div>
    `).join('');
    components.refreshIcons(container);
  }

  openRemindersModal() {
    this.updateRemindersUI();
    document.getElementById('reminders-modal')?.classList.add('open');
  }

  closeRemindersModal() {
    document.getElementById('reminders-modal')?.classList.remove('open');
  }

  async saveNewReminder() {
    const input = document.getElementById('new-reminder-text');
    const dateInput = document.getElementById('new-reminder-date');
    const text = input?.value?.trim();
    if (!text) {
      components.showToast('Digite a descrição do lembrete.', 'warning');
      return;
    }

    await storage.addReminder(text, dateInput?.value || null);
    if (input) input.value = '';
    if (dateInput) dateInput.value = '';

    components.showToast('Lembrete salvo com sucesso!', 'success');
    await this.refreshData();
    this.updateRemindersUI();
  }

  async toggleReminder(id) {
    await storage.toggleReminder(id);
    await this.refreshData();
    this.updateRemindersUI();
  }

  async deleteReminder(id) {
    await storage.deleteReminder(id);
    components.showToast('Lembrete excluído.', 'info');
    await this.refreshData();
    this.updateRemindersUI();
  }

  openAdjustBalanceModal() {
    const modal = document.getElementById('account-balance-modal');
    const select = document.getElementById('adjust-balance-account');
    const amountInput = document.getElementById('adjust-balance-amount');

    if (select) {
      select.innerHTML = this.cachedData.accounts.map(a => `
        <option value="${a.id}">${a.name} (Atual: ${validation.formatBRL(a.currentBalanceCents)})</option>
      `).join('');
    }

    if (amountInput) amountInput.value = '';
    modal?.classList.add('open');
  }

  closeAdjustBalanceModal() {
    document.getElementById('account-balance-modal')?.classList.remove('open');
  }

  async saveAdjustedBalance() {
    const select = document.getElementById('adjust-balance-account');
    const amountInput = document.getElementById('adjust-balance-amount');
    const accountId = select?.value;
    const cents = validation.parseBRLToCents(amountInput?.value);

    const account = this.cachedData.accountMap.get(accountId);
    if (!account) return;

    account.currentBalanceCents = cents;
    await storage.save('accounts', account);
    await storage.logAudit('ADJUST_BALANCE', 'Conta', `Saldo ajustado para ${account.name}: ${validation.formatBRL(cents)}`);

    this.closeAdjustBalanceModal();
    components.showToast(`Saldo de ${account.name} atualizado para ${validation.formatBRL(cents)}!`, 'success');
    await this.refreshData();
    this.renderCurrentView();
  }

  openAddAccountModal() {
    const modal = document.getElementById('add-account-modal');
    document.getElementById('new-account-name').value = '';
    document.getElementById('new-account-balance').value = '';
    modal?.classList.add('open');
  }

  closeAddAccountModal() {
    document.getElementById('add-account-modal')?.classList.remove('open');
  }

  async saveNewAccount() {
    const name = document.getElementById('new-account-name')?.value?.trim();
    const type = document.getElementById('new-account-type')?.value;
    const balanceCents = validation.parseBRLToCents(document.getElementById('new-account-balance')?.value);

    if (!name) {
      components.showToast('Informe o nome da conta bancária.', 'warning');
      return;
    }

    const newAcc = {
      name,
      type,
      initialBalanceCents: balanceCents,
      currentBalanceCents: balanceCents,
      bankCode: '000',
      agency: '0001',
      number: 'Conta Corrente'
    };

    await storage.save('accounts', newAcc);
    this.closeAddAccountModal();
    components.showToast(`Conta "${name}" adicionada com sucesso!`, 'success');
    await this.refreshData();
    this.renderCurrentView();
  }

  async promptResetToZero() {
    const confirmed = await components.confirm({
      title: 'Começar do Zero?',
      message: 'Esta ação apagará todos os dados anteriores e deixará o sistema completamente limpo com saldo R$ 0,00 nos 4 bancos brasileiros (Banco do Brasil, Mercado Pago, PagBank e Bradesco), prontos para seu uso real. Deseja continuar?',
      confirmText: 'Sim, Começar do Zero',
      isDanger: true
    });
    if (!confirmed) return;

    await storage.resetToZero();
    components.showToast('Sistema reiniciado com sucesso! Saldo zerado e bancos brasileiros prontos para uso.', 'success');
    await this.refreshData();
    this.updateOrganizationUI();
    this.updateRemindersUI();
    this.renderCurrentView();
  }

  async exportBackupJSON() {
    const json = await storage.exportFullBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_aurefin_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    components.showToast('Backup JSON exportado com sucesso!', 'success');
  }

  async importBackupJSON(fileInput) {
    const file = fileInput.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const confirmed = await components.confirm({
        title: 'Restaurar Backup',
        message: 'A restauração substituirá os dados atuais pelos dados do arquivo. Deseja continuar?',
        confirmText: 'Restaurar Dados',
        isDanger: true
      });
      if (!confirmed) return;

      await storage.importFullBackup(text);
      components.showToast('Backup restaurado com sucesso!', 'success');
      await this.refreshData();
      this.renderCurrentView();
    } catch (err) {
      components.showToast('Arquivo de backup inválido ou corrompido.', 'danger');
      console.error(err);
    }
  }
}

// Inicialização Singleton
window.aureFin = new AureFinApp();
window.aureFin = window.aureFin;

window.addEventListener('DOMContentLoaded', () => {
  window.aureFin.start();
});

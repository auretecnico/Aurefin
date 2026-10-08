/* ==========================================================================
   AureFin Pro — Módulo de Componentes Reutilizáveis de Interface
   Modais, Diálogos, Toasts, Tabelas Dinâmicas e Badges Semânticos
   ========================================================================== */

import * as lucide from 'lucide';
import { validation } from './validation.js';

export const components = {
  /**
   * Atualiza e renderiza todos os ícones da biblioteca Lucide no documento
   */
  refreshIcons(container = document) {
    if (lucide && lucide.createIcons) {
      lucide.createIcons({
        root: container,
        icons: lucide.icons,
        attrs: {
          'stroke-width': 1.8
        }
      });
    }
  },

  /**
   * Obtém SVG de um ícone Lucide
   */
  getIconSvg(iconName, size = 16, className = '') {
    const icon = lucide.icons ? lucide.icons[iconName] : null;
    if (icon && typeof icon.toSvg === 'function') {
      return icon.toSvg({
        class: className,
        width: size,
        height: size,
        'stroke-width': 1.8
      });
    }
    return `<i data-lucide="${iconName}" class="${className}"></i>`;
  },

  /**
   * Sistema de Notificações Toast
   */
  showToast(message, type = 'info', duration = 3500) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle-2';
    if (type === 'danger') iconName = 'alert-triangle';
    if (type === 'warning') iconName = 'alert-circle';

    toast.innerHTML = `
      <span class="toast-icon">${this.getIconSvg(iconName, 18)}</span>
      <div class="toast-message">${message}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.2s ease-out';
      setTimeout(() => toast.remove(), 200);
    }, duration);
  },

  /**
   * Diálogo Modal de Confirmação Seguro
   */
  async confirm({ title = 'Confirmação', message = 'Deseja realmente prosseguir?', confirmText = 'Confirmar', isDanger = false }) {
    return new Promise((resolve) => {
      let modalBackdrop = document.getElementById('confirm-modal-backdrop');
      if (!modalBackdrop) {
        modalBackdrop = document.createElement('div');
        modalBackdrop.id = 'confirm-modal-backdrop';
        modalBackdrop.className = 'modal-backdrop';
        document.body.appendChild(modalBackdrop);
      }

      modalBackdrop.innerHTML = `
        <div class="modal-card modal-sm" role="dialog" aria-modal="true">
          <div class="modal-header">
            <div class="modal-title">
              ${this.getIconSvg(isDanger ? 'alert-triangle' : 'help-circle', 18, isDanger ? 'text-danger' : '')}
              ${title}
            </div>
            <button class="modal-close-btn" id="confirm-cancel-x" aria-label="Fechar">
              ${this.getIconSvg('x', 18)}
            </button>
          </div>
          <div class="modal-body">
            <p style="font-size: 13px; color: var(--text-secondary); line-height: 1.5;">${message}</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="confirm-btn-cancel">Cancelar</button>
            <button class="btn ${isDanger ? 'btn-danger' : 'btn-primary'}" id="confirm-btn-ok">${confirmText}</button>
          </div>
        </div>
      `;

      modalBackdrop.classList.add('open');

      const cleanup = (result) => {
        modalBackdrop.classList.remove('open');
        resolve(result);
      };

      document.getElementById('confirm-cancel-x').onclick = () => cleanup(false);
      document.getElementById('confirm-btn-cancel').onclick = () => cleanup(false);
      document.getElementById('confirm-btn-ok').onclick = () => cleanup(true);
    });
  },

  /**
   * Renderiza Badge de Status Semântico
   */
  renderStatusBadge(status) {
    const map = {
      paid: { label: 'Pago', class: 'success', icon: 'check-circle' },
      received: { label: 'Recebido', class: 'success', icon: 'check-circle' },
      partial: { label: 'Parcial', class: 'warning', icon: 'clock' },
      pending: { label: 'Pendente', class: 'neutral', icon: 'circle' },
      due_soon: { label: 'A Vencer', class: 'warning', icon: 'alert-circle' },
      due_today: { label: 'Vence Hoje', class: 'warning', icon: 'calendar' },
      overdue: { label: 'Vencido', class: 'danger', icon: 'alert-triangle' },
      cancelled: { label: 'Cancelado', class: 'neutral', icon: 'slash' }
    };

    const s = map[status] || { label: status, class: 'neutral', icon: 'info' };
    return `<span class="badge-status ${s.class}">${this.getIconSvg(s.icon, 12)} ${s.label}</span>`;
  },

  /**
   * Renderiza Caixa de Estado Vazio
   */
  renderEmptyState({ icon = 'inbox', title = 'Nenhum registro encontrado', description = 'Não existem dados correspondentes no período selecionado.', actionButton = '' }) {
    return `
      <div class="empty-state-box">
        <div class="empty-state-icon">
          ${this.getIconSvg(icon, 24)}
        </div>
        <div class="empty-state-title">${title}</div>
        <div class="empty-state-desc">${description}</div>
        ${actionButton ? `<div style="margin-top: 12px;">${actionButton}</div>` : ''}
      </div>
    `;
  }
};

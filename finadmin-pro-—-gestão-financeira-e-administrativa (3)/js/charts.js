/* ==========================================================================
   AureFin Pro — Módulo de Gráficos Financeiros (Chart.js)
   Visualizações Executivas de Fluxo de Caixa, Despesas e Faturamento
   ========================================================================== */

import Chart from 'chart.js/auto';

const chartInstances = new Map();

export const charts = {
  /**
   * Destrói instância existente de gráfico para evitar sobreposição ou vazamentos
   */
  destroy(canvasId) {
    if (chartInstances.has(canvasId)) {
      try {
        chartInstances.get(canvasId).destroy();
      } catch (e) {
        console.warn('Erro ao destruir gráfico anterior:', e);
      }
      chartInstances.delete(canvasId);
    }
  },

  /**
   * Gráfico de Evolução de Entradas vs Saídas no Fluxo de Caixa
   */
  renderCashFlowComparison(canvasId, labels, incomes, expenses) {
    this.destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Entradas Realizadas',
            data: incomes,
            backgroundColor: '#059669',
            borderRadius: 4,
            barPercentage: 0.6
          },
          {
            label: 'Saídas Realizadas',
            data: expenses,
            backgroundColor: '#dc2626',
            borderRadius: 4,
            barPercentage: 0.6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              boxWidth: 12,
              font: { family: 'Inter', size: 12 }
            }
          },
          tooltip: {
            callbacks: {
              label: (item) => ` ${item.dataset.label}: R$ ${(item.raw || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false }
          },
          y: {
            grid: { color: '#f1f5f9' },
            ticks: {
              callback: (value) => 'R$ ' + Number(value).toLocaleString('pt-BR')
            }
          }
        }
      }
    });

    chartInstances.set(canvasId, chart);
    return chart;
  },

  /**
   * Gráfico de Pizza / Rosca: Meios de Pagamento do Faturamento
   */
  renderPaymentMethods(canvasId, labels, values) {
    this.destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: ['#059669', '#2563eb', '#3b82f6', '#d97706', '#64748b', '#8b5cf6'],
            borderWidth: 2,
            borderColor: '#ffffff'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: {
            position: 'right',
            labels: {
              boxWidth: 12,
              font: { family: 'Inter', size: 11 }
            }
          },
          tooltip: {
            callbacks: {
              label: (item) => ` ${item.label}: R$ ${(item.raw || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
            }
          }
        }
      }
    });

    chartInstances.set(canvasId, chart);
    return chart;
  },

  /**
   * Gráfico de Barras Horizontais: Despesas por Categoria
   */
  renderExpensesByCategory(canvasId, categories, amounts) {
    this.destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: categories,
        datasets: [
          {
            label: 'Total Gasto (R$)',
            data: amounts,
            backgroundColor: '#ea580c',
            borderRadius: 4
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => ` Total: R$ ${(item.raw || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
            }
          }
        },
        scales: {
          x: {
            grid: { color: '#f1f5f9' },
            ticks: {
              callback: (value) => 'R$ ' + Number(value).toLocaleString('pt-BR')
            }
          },
          y: {
            grid: { display: false }
          }
        }
      }
    });

    chartInstances.set(canvasId, chart);
    return chart;
  }
};

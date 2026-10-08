/* ==========================================================================
   AureFin Pro — Módulo de Validação e Formatação
   Validações Financeiras, Padrão BRL e Integridade de Dados
   ========================================================================== */

export const validation = {
  /**
   * Converte centavos inteiros para string BRL formatada: "R$ 1.250,50"
   */
  formatBRL(cents, showPrefix = true) {
    if (cents === null || cents === undefined || isNaN(cents)) cents = 0;
    const value = cents / 100;
    const formatted = value.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return showPrefix ? `R$ ${formatted}` : formatted;
  },

  /**
   * Converte string de moeda do usuário (ex: "1.250,50" ou "R$ 1250.50") em centavos inteiros
   */
  parseBRLToCents(str) {
    if (typeof str === 'number') return Math.round(str * 100);
    if (!str || typeof str !== 'string') return 0;

    let clean = str.replace(/[R$\s]/g, '').trim();
    if (!clean) return 0;

    // Detecta se foi digitado formato brasileiro "1.250,50" ou americano "1250.50"
    if (clean.includes(',') && clean.includes('.')) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else if (clean.includes(',')) {
      clean = clean.replace(',', '.');
    }

    const num = parseFloat(clean);
    return isNaN(num) ? 0 : Math.round(num * 100);
  },

  /**
   * Formata data ISO (AAAA-MM-DD) para padrão brasileiro (DD/MM/AAAA)
   */
  formatDateBR(dateStr) {
    if (!dateStr) return '-';
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  },

  /**
   * Formata data e hora para exibição completa
   */
  formatDateTimeBR(isoStr) {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoStr;
    }
  },

  /**
   * Retorna diferença em dias em relação à data atual (positivo = futuro, negativo = atrasado, 0 = hoje)
   */
  getDaysDifference(targetDateStr) {
    if (!targetDateStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [year, month, day] = targetDateStr.split('-').map(Number);
    const target = new Date(year, month - 1, day);
    target.setHours(0, 0, 0, 0);

    const diffTime = target.getTime() - today.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
  },

  /**
   * Valida fechamento diário e meios de pagamento
   */
  validateDailyRevenue(data) {
    const gross = Number(data.grossCents) || 0;
    const discount = Number(data.discountCents) || 0;
    const cancellation = Number(data.cancellationCents) || 0;
    const net = gross - discount - cancellation;

    const sumMethods =
      (Number(data.pixCents) || 0) +
      (Number(data.creditCents) || 0) +
      (Number(data.debitCents) || 0) +
      (Number(data.cashCents) || 0) +
      (Number(data.transferCents) || 0) +
      (Number(data.termCents) || 0);

    const diffCents = net - sumMethods;

    return {
      isValid: diffCents === 0,
      netCents: net,
      sumMethodsCents: sumMethods,
      diffCents: diffCents,
      message: diffCents === 0
        ? 'Valores conferem perfeitamente.'
        : `Divergência detectada: diferença de ${this.formatBRL(Math.abs(diffCents))} entre o faturamento líquido e a soma dos meios de pagamento.`
    };
  },

  /**
   * Formata linha digitável / código de barras de boleto
   */
  formatBarcode(raw) {
    if (!raw) return '';
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 47) {
      return `${digits.slice(0, 5)}.${digits.slice(5, 10)} ${digits.slice(10, 15)}.${digits.slice(15, 21)} ${digits.slice(21, 26)}.${digits.slice(26, 32)} ${digits.slice(32, 33)} ${digits.slice(33)}`;
    }
    if (digits.length === 48) {
      return `${digits.slice(0, 12)} ${digits.slice(12, 24)} ${digits.slice(24, 36)} ${digits.slice(36, 48)}`;
    }
    return raw;
  },

  /**
   * Formata CPF ou CNPJ
   */
  formatDocument(doc) {
    if (!doc) return '-';
    const digits = doc.replace(/\D/g, '');
    if (digits.length === 11) {
      return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    if (digits.length === 14) {
      return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    return doc;
  },

  /**
   * Valida obrigatoriedade de campos em formulários
   */
  validateForm(formData, requiredFields) {
    const errors = {};
    for (const field of requiredFields) {
      const val = formData[field];
      if (val === undefined || val === null || String(val).trim() === '') {
        errors[field] = 'Este campo é obrigatório';
      }
    }
    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }
};

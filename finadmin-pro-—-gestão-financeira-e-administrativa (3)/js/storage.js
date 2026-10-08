/* ==========================================================================
   AureFin Pro — Módulo de Armazenamento e Persistência
   IndexedDB & LocalStorage com Suporte a Backup, Lixeira e Auditoria
   ========================================================================== */

const STORAGE_KEYS = {
  PREFERENCES: 'aurefin_preferences',
  EXCEL_SYNC: 'aurefin_excel_sync_state',
  CLEAN_INITIALIZED: 'aurefin_clean_v4_zero_banks',
};

const DB_NAME = 'AureFinProDB';
const DB_VERSION = 2;

const STORES = [
  'accounts',
  'transactions',
  'daily_revenues',
  'payables',
  'receivables',
  'loans',
  'customers',
  'suppliers',
  'categories',
  'goals',
  'audit_log',
  'trash',
  'exports_history',
  'reminders'
];

class StorageService {
  constructor() {
    this.db = null;
    this.unsavedChanges = false;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        STORES.forEach((storeName) => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: 'id' });
          }
        });
      };

      request.onsuccess = async (event) => {
        this.db = event.target.result;
        await this.checkSeedData();
        resolve(this);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  async getAll(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async getById(storeName, id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async save(storeName, item) {
    if (!item.id) {
      item.id = 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }
    item.updatedAt = new Date().toISOString();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(item);
      req.onsuccess = () => {
        this.markUnsavedChange();
        resolve(item);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async remove(storeName, id, moveToTrash = true) {
    const item = await this.getById(storeName, id);
    if (!item) return false;

    if (moveToTrash) {
      await this.save('trash', {
        id: 'trash_' + Date.now(),
        originalStore: storeName,
        originalId: id,
        data: item,
        deletedAt: new Date().toISOString()
      });
    }

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(id);
      req.onsuccess = () => {
        this.markUnsavedChange();
        resolve(true);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async restoreFromTrash(trashId) {
    const trashItem = await this.getById('trash', trashId);
    if (!trashItem) return false;

    await this.save(trashItem.originalStore, trashItem.data);

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('trash', 'readwrite');
      const store = tx.objectStore('trash');
      const req = store.delete(trashId);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async logAudit(action, entity, description, details = null) {
    const log = {
      id: 'audit_' + Date.now(),
      timestamp: new Date().toISOString(),
      action,
      entity,
      description,
      details
    };
    return this.save('audit_log', log);
  }

  markUnsavedChange() {
    this.unsavedChanges = true;
    localStorage.setItem(STORAGE_KEYS.EXCEL_SYNC, JSON.stringify({
      hasChanges: true,
      lastModified: new Date().toISOString()
    }));
    window.dispatchEvent(new CustomEvent('aurefin:data_changed'));
    window.dispatchEvent(new CustomEvent('aurefin:data_changed'));
  }

  markExcelExported() {
    this.unsavedChanges = false;
    localStorage.setItem(STORAGE_KEYS.EXCEL_SYNC, JSON.stringify({
      hasChanges: false,
      lastExported: new Date().toISOString()
    }));
    window.dispatchEvent(new CustomEvent('aurefin:data_changed'));
    window.dispatchEvent(new CustomEvent('aurefin:data_changed'));
  }

  getExcelSyncStatus() {
    try {
      const state = JSON.parse(localStorage.getItem(STORAGE_KEYS.EXCEL_SYNC) || '{}');
      return {
        hasChanges: Boolean(state.hasChanges),
        lastExported: state.lastExported || null,
        lastModified: state.lastModified || null
      };
    } catch {
      return { hasChanges: false, lastExported: null, lastModified: null };
    }
  }

  async exportFullBackup() {
    const backupData = {
      version: '2.0',
      system: 'AureFin Pro',
      exportedAt: new Date().toISOString(),
      stores: {}
    };

    for (const store of STORES) {
      backupData.stores[store] = await this.getAll(store);
    }

    return JSON.stringify(backupData, null, 2);
  }

  async importFullBackup(jsonString) {
    const parsed = JSON.parse(jsonString);
    if (!parsed.stores || !parsed.version) {
      throw new Error('Formato de backup inválido.');
    }

    for (const storeName of STORES) {
      if (parsed.stores[storeName]) {
        await this.clearStore(storeName);
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        for (const item of parsed.stores[storeName]) {
          store.put(item);
        }
      }
    }

    await this.logAudit('IMPORT_BACKUP', 'Sistema', 'Backup completo restaurado com sucesso');
    this.markUnsavedChange();
    return true;
  }

  async clearStore(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async resetAllData(keepCategories = true) {
    for (const storeName of STORES) {
      if (keepCategories && storeName === 'categories') continue;
      await this.clearStore(storeName);
    }
    this.markUnsavedChange();
  }

  getOrganizationName() {
    return localStorage.getItem('aurefin_org_name') || localStorage.getItem('finadmin_org_name') || 'Minha Empresa';
  }

  setOrganizationName(name) {
    const cleanName = (name || '').trim() || 'Minha Empresa';
    localStorage.setItem('aurefin_org_name', cleanName);
    localStorage.setItem('finadmin_org_name', cleanName);
    window.dispatchEvent(new CustomEvent('aurefin:data_changed'));
    window.dispatchEvent(new CustomEvent('aurefin:data_changed'));
    return cleanName;
  }

  async getReminders() {
    return this.getAll('reminders');
  }

  async addReminder(text, dueDate = null) {
    if (!text || !text.trim()) return null;
    const reminder = {
      id: 'rem_' + Date.now(),
      text: text.trim(),
      dueDate: dueDate || null,
      completed: false,
      createdAt: new Date().toISOString()
    };
    await this.save('reminders', reminder);
    return reminder;
  }

  async toggleReminder(id) {
    const item = await this.getById('reminders', id);
    if (!item) return null;
    item.completed = !item.completed;
    await this.save('reminders', item);
    return item;
  }

  async deleteReminder(id) {
    return this.remove('reminders', id, false);
  }

  async resetToZero(orgName = null) {
    for (const storeName of STORES) {
      await this.clearStore(storeName);
    }

    if (orgName) {
      this.setOrganizationName(orgName);
    }

    // Categorias Essenciais Padrão (Plano de Contas)
    const defaultCategories = [
      { id: 'cat_rec_1', name: 'Venda de Mercadorias', type: 'revenue', color: '#059669', group: 'Operacional' },
      { id: 'cat_rec_2', name: 'Prestação de Serviços', type: 'revenue', color: '#0284c7', group: 'Operacional' },
      { id: 'cat_rec_3', name: 'Rendimentos Financeiros', type: 'revenue', color: '#6366f1', group: 'Financeiro' },
      { id: 'cat_rec_4', name: 'Outras Receitas', type: 'revenue', color: '#10b981', group: 'Não Operacional' },

      { id: 'cat_des_1', name: 'Aluguel e Condomínio', type: 'expense', color: '#dc2626', group: 'Fixa' },
      { id: 'cat_des_2', name: 'Energia, Água e Gás', type: 'expense', color: '#ea580c', group: 'Fixa' },
      { id: 'cat_des_3', name: 'Internet e Telefonia', type: 'expense', color: '#f59e0b', group: 'Fixa' },
      { id: 'cat_des_4', name: 'Salários e Pró-labore', type: 'expense', color: '#b91c1c', group: 'Fixa' },
      { id: 'cat_des_5', name: 'Impostos e Tributos (DAS/Simples)', type: 'expense', color: '#7c3aed', group: 'Variável' },
      { id: 'cat_des_6', name: 'Fornecedores e Mercadorias', type: 'expense', color: '#d97706', group: 'Variável' },
      { id: 'cat_des_7', name: 'Taxas de Maquininha / Meios de Pagamento', type: 'expense', color: '#475569', group: 'Variável' },
      { id: 'cat_des_8', name: 'Tarifas Bancárias', type: 'expense', color: '#64748b', group: 'Financeiro' },
      { id: 'cat_des_9', name: 'Marketing e Anúncios', type: 'expense', color: '#2563eb', group: 'Variável' },
      { id: 'cat_des_10', name: 'Manutenção e Limpeza', type: 'expense', color: '#0d9488', group: 'Fixa' }
    ];

    for (const cat of defaultCategories) {
      await this.save('categories', cat);
    }

    // Os 4 Bancos Brasileiros Solicitados (Todos iniciados rigorosamente com R$ 0,00)
    const brazilianAccounts = [
      {
        id: 'acc_bb',
        name: 'Banco do Brasil',
        type: 'checking',
        bankCode: '001',
        agency: '0001',
        number: 'Conta Corrente',
        initialBalanceCents: 0,
        currentBalanceCents: 0
      },
      {
        id: 'acc_mp',
        name: 'Mercado Pago',
        type: 'checking',
        bankCode: '323',
        agency: '0001',
        number: 'Conta Digital PJ',
        initialBalanceCents: 0,
        currentBalanceCents: 0
      },
      {
        id: 'acc_pb',
        name: 'PagBank',
        type: 'checking',
        bankCode: '290',
        agency: '0001',
        number: 'Conta Digital',
        initialBalanceCents: 0,
        currentBalanceCents: 0
      },
      {
        id: 'acc_bradesco',
        name: 'Bradesco',
        type: 'checking',
        bankCode: '237',
        agency: '0001',
        number: 'Conta Corrente',
        initialBalanceCents: 0,
        currentBalanceCents: 0
      }
    ];

    for (const acc of brazilianAccounts) {
      await this.save('accounts', acc);
    }

    // Lembrete rápido inicial
    await this.addReminder('Configurar os saldos iniciais dos bancos ou registrar o primeiro faturamento diário');

    localStorage.setItem(STORAGE_KEYS.CLEAN_INITIALIZED, 'true');
    this.markExcelExported();
    await this.logAudit('INIT_ZERO', 'Sistema', 'Sistema iniciado do zero com bancos brasileiros (saldo R$ 0,00)');
  }

  async checkSeedData() {
    const isCleanInit = localStorage.getItem(STORAGE_KEYS.CLEAN_INITIALIZED);
    if (!isCleanInit) {
      await this.resetToZero();
    }
  }
}

export const storage = new StorageService();

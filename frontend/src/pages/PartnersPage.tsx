import React, { useEffect, useState } from 'react';
import {
  BadgeCheck,
  Boxes,
  Edit3,
  Mail,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Trash2,
  Truck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  CsvExportBar,
  ITEMS_PER_PAGE,
  PaginationBar,
} from '../components/ListPaginationAndCsv';
import { StructuredAddressFields } from '../components/StructuredAddressFields';
import {
  apiRequest,
  formatCurrencyBRL,
  formatDateTimeBR,
} from '../services/api';
import { Customer, Employee, Supplier } from '../types/erp';
import {
  composeAddressString,
  formatCpfCnpjMask,
  formatCpfMask,
  formatPhoneMask,
  onlyDigits,
  parseAddressString,
} from '../utils/formatters';

export const PartnersPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    'customers' | 'suppliers' | 'employees'
  >('customers');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modal de Cliente
  const [showCustomerModal, setShowCustomerModal] = useState<boolean>(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [custName, setCustName] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custDocument, setCustDocument] = useState('');
  const [custAddrObj, setCustAddrObj] = useState({
    cep: '',
    stateUf: '',
    city: '',
    street: '',
  });

  // Modal de Fornecedor
  const [showSupplierModal, setShowSupplierModal] = useState<boolean>(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supName, setSupName] = useState('');
  const [supDocument, setSupDocument] = useState('');
  const [supEmail, setSupEmail] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supAddrObj, setSupAddrObj] = useState({
    cep: '',
    stateUf: '',
    city: '',
    street: '',
  });
  const [supLeadTime, setSupLeadTime] = useState('7');

  // Modal de Funcionário
  const [showEmployeeModal, setShowEmployeeModal] = useState<boolean>(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [empName, setEmpName] = useState('');
  const [empDocument, setEmpDocument] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [empEmail, setEmpEmail] = useState('');
  const [empAddrObj, setEmpAddrObj] = useState({
    cep: '',
    stateUf: '',
    city: '',
    street: '',
  });
  const [empJobTitle, setEmpJobTitle] = useState('Vendedor(a)');

  const [submitting, setSubmitting] = useState<boolean>(false);

  const loadPartners = async (q = search) => {
    setLoading(true);
    try {
      const queryParam = q.trim() ? `?search=${encodeURIComponent(q.trim())}` : '';
      const [custData, supData, empData] = await Promise.all([
        apiRequest<Customer[]>(`/partners/customers${queryParam}`),
        apiRequest<Supplier[]>(`/partners/suppliers${queryParam}`),
        apiRequest<Employee[]>(`/partners/employees${queryParam}`),
      ]);
      setCustomers(custData);
      setSuppliers(supData);
      setEmployees(empData);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao carregar cadastros.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPartners(search);
  }, [search]);

  // --- Funções de Clientes ---
  const openNewCustomer = () => {
    setEditingCustomer(null);
    setCustName('');
    setCustEmail('');
    setCustPhone('');
    setCustDocument('');
    setCustAddrObj({ cep: '', stateUf: '', city: '', street: '' });
    setShowCustomerModal(true);
  };

  const openEditCustomer = (c: Customer) => {
    setEditingCustomer(c);
    setCustName(c.name);
    setCustEmail(c.email || '');
    setCustPhone(formatPhoneMask(c.phone || ''));
    setCustDocument(formatCpfCnpjMask(c.document || ''));
    setCustAddrObj(parseAddressString(c.notes || ''));
    setShowCustomerModal(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        name: custName,
        email: custEmail,
        phone: onlyDigits(custPhone, 11),
        document: onlyDigits(custDocument, 14),
        notes: composeAddressString(custAddrObj),
      };

      if (editingCustomer) {
        await apiRequest(`/partners/customers/${editingCustomer.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/partners/customers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setShowCustomerModal(false);
      await loadPartners(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar cliente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCustomer = async (c: Customer) => {
    if (!window.confirm(`Deseja excluir o cliente "${c.name}"?`)) return;
    try {
      await apiRequest(`/partners/customers/${c.id}`, { method: 'DELETE' });
      await loadPartners(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir cliente.');
    }
  };

  // --- Funções de Fornecedores ---
  const openNewSupplier = () => {
    setEditingSupplier(null);
    setSupName('');
    setSupDocument('');
    setSupEmail('');
    setSupPhone('');
    setSupAddrObj({ cep: '', stateUf: '', city: '', street: '' });
    setSupLeadTime('7');
    setShowSupplierModal(true);
  };

  const openEditSupplier = (s: Supplier) => {
    setEditingSupplier(s);
    setSupName(s.name);
    setSupDocument(formatCpfCnpjMask(s.document || ''));
    setSupEmail(s.email || '');
    setSupPhone(formatPhoneMask(s.phone || ''));
    setSupAddrObj(parseAddressString(s.address || ''));
    setSupLeadTime(String(s.leadTimeDays || 7));
    setShowSupplierModal(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        name: supName,
        document: onlyDigits(supDocument, 14),
        email: supEmail,
        phone: onlyDigits(supPhone, 11),
        address: composeAddressString(supAddrObj),
        leadTimeDays: Number(supLeadTime) || 7,
      };

      if (editingSupplier) {
        await apiRequest(`/partners/suppliers/${editingSupplier.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/partners/suppliers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setShowSupplierModal(false);
      await loadPartners(search);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao salvar fornecedor.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSupplier = async (s: Supplier) => {
    if (!window.confirm(`Deseja excluir o fornecedor "${s.name}"?`)) return;
    try {
      await apiRequest(`/partners/suppliers/${s.id}`, { method: 'DELETE' });
      await loadPartners(search);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao excluir fornecedor.'
      );
    }
  };

  // --- Funções de Funcionários ---
  const openNewEmployee = () => {
    setEditingEmployee(null);
    setEmpName('');
    setEmpDocument('');
    setEmpPhone('');
    setEmpEmail('');
    setEmpAddrObj({ cep: '', stateUf: '', city: '', street: '' });
    setEmpJobTitle('Vendedor(a)');
    setShowEmployeeModal(true);
  };

  const openEditEmployee = (emp: Employee) => {
    setEditingEmployee(emp);
    setEmpName(emp.name);
    setEmpDocument(formatCpfMask(emp.document || ''));
    setEmpPhone(formatPhoneMask(emp.phone || ''));
    setEmpEmail(emp.email || '');
    setEmpAddrObj(parseAddressString(emp.address || ''));
    setEmpJobTitle(emp.jobTitle || 'Vendedor(a)');
    setShowEmployeeModal(true);
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        name: empName,
        document: onlyDigits(empDocument, 14),
        phone: onlyDigits(empPhone, 11),
        address: composeAddressString(empAddrObj),
        email: empEmail,
        jobTitle: empJobTitle,
        role: empJobTitle.toLowerCase().includes('gerente') ? 'ADMIN' : 'STAFF',
      };

      if (editingEmployee) {
        await apiRequest(`/partners/employees/${editingEmployee.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/partners/employees', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setShowEmployeeModal(false);
      await loadPartners(search);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao salvar funcionário.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteEmployee = async (emp: Employee) => {
    if (!window.confirm(`Deseja remover o funcionário "${emp.name}"?`)) return;
    try {
      await apiRequest(`/partners/employees/${emp.id}`, { method: 'DELETE' });
      await loadPartners(search);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao remover funcionário.'
      );
    }
  };

  const handleHeaderAction = () => {
    if (activeTab === 'customers') openNewCustomer();
    else if (activeTab === 'suppliers') openNewSupplier();
    else openNewEmployee();
  };

  const headerButtonLabel =
    activeTab === 'customers'
      ? 'Cadastrar Novo Cliente'
      : activeTab === 'suppliers'
      ? 'Cadastrar Novo Fornecedor'
      : 'Cadastrar Novo Funcionário';

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Cadastros (CPF / CNPJ)
          </h1>
          <p className="text-sm sm:text-base text-slate-400 mt-1">
            Gerencie seus Clientes (CPF), Fornecedores e Confecções (CNPJ) e a equipe de Funcionários da loja.
          </p>
        </div>

        <button
          type="button"
          onClick={handleHeaderAction}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white flex items-center gap-2 transition shadow-md shadow-indigo-950/50 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{headerButtonLabel}</span>
        </button>
      </div>

      {/* Seletor de Abas (Clientes, Fornecedores, Funcionários) + Busca + Exportação CSV */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-950 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setActiveTab('customers');
                setCurrentPage(1);
              }}
              className={`px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'customers'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Clientes ({customers.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('suppliers');
                setCurrentPage(1);
              }}
              className={`px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'suppliers'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Truck className="w-4 h-4" />
              <span>Fornecedores ({suppliers.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('employees');
                setCurrentPage(1);
              }}
              className={`px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'employees'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>Funcionários ({employees.length})</span>
            </button>
          </div>

          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              placeholder="Buscar por nome, CPF/CNPJ ou telefone..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {activeTab === 'customers' && (
          <CsvExportBar
            reportTitle="Cadastro de Clientes"
            filenamePrefix="clientes"
            items={customers}
            activeFilters={[
              { label: 'Aba', value: 'Clientes' },
              { label: 'Busca', value: search || 'Todos' },
            ]}
            headers={[
              'Nome do Cliente',
              'CPF',
              'Telefone',
              'E-mail',
              'Endereço',
              'Qtd Compras',
              'Total Gasto (R$)',
            ]}
            rowMapper={(c) => [
              c.name,
              formatCpfCnpjMask(c.document) || 'Não informado',
              formatPhoneMask(c.phone) || '—',
              c.email || '—',
              c.notes || '—',
              c.totalOrders,
              c.totalSpent.toFixed(2).replace('.', ','),
            ]}
          />
        )}

        {activeTab === 'suppliers' && (
          <CsvExportBar
            reportTitle="Cadastro de Fornecedores"
            filenamePrefix="fornecedores"
            items={suppliers}
            activeFilters={[
              { label: 'Aba', value: 'Fornecedores' },
              { label: 'Busca', value: search || 'Todos' },
            ]}
            headers={[
              'Nome do Fornecedor',
              'CNPJ / CPF',
              'Telefone',
              'E-mail',
              'Endereço',
              'Prazo Entrega (Dias)',
              'Modelos Vinculados',
              'Entregas Realizadas',
            ]}
            rowMapper={(s) => [
              s.name,
              formatCpfCnpjMask(s.document) || '—',
              formatPhoneMask(s.phone) || '—',
              s.email || '—',
              s.address || '—',
              s.leadTimeDays,
              s.productsCount ?? 0,
              s.entriesCount ?? 0,
            ]}
          />
        )}

        {activeTab === 'employees' && (
          <CsvExportBar
            reportTitle="Cadastro de Funcionários e Vendedores"
            filenamePrefix="funcionarios"
            items={employees}
            activeFilters={[
              { label: 'Aba', value: 'Funcionários' },
              { label: 'Busca', value: search || 'Todos' },
            ]}
            headers={[
              'Nome do Funcionário',
              'Cargo / Função',
              'CPF',
              'Telefone',
              'E-mail',
              'Endereço',
              'Vendas Realizadas',
              'Total Vendido (R$)',
            ]}
            rowMapper={(emp) => [
              emp.name,
              emp.jobTitle || 'Vendedor(a)',
              formatCpfCnpjMask(emp.document) || '—',
              formatPhoneMask(emp.phone) || '—',
              emp.email || '—',
              emp.address || '—',
              emp.salesCount,
              emp.salesRevenue.toFixed(2).replace('.', ','),
            ]}
          />
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-300 text-base gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
          <span>Carregando cadastros...</span>
        </div>
      ) : activeTab === 'customers' ? (
        /* ABA 1: LISTA DE CLIENTES */
        customers.length === 0 ? (
          <div className="p-12 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-2">
            <div className="text-base font-bold text-white">
              Nenhum cliente encontrado.
            </div>
            <p className="text-sm text-slate-400">
              Cadastre seus clientes para acompanhar o histórico de compras de cada um.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {customers
                .slice(
                  (currentPage - 1) * ITEMS_PER_PAGE,
                  currentPage * ITEMS_PER_PAGE
                )
                .map((c) => (
                  <div
                    key={c.id}
                    className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between gap-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5">
                        <h3 className="text-lg font-bold text-white">
                          {c.name}
                        </h3>
                        {c.document && (
                          <div className="text-sm text-slate-400 font-mono">
                            CPF: {formatCpfCnpjMask(c.document)}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300 pt-1">
                          {c.phone && (
                            <span className="flex items-center gap-1.5 font-mono">
                              <Phone className="w-4 h-4 text-indigo-400" />
                              {formatPhoneMask(c.phone)}
                            </span>
                          )}
                          {c.email && (
                            <span className="flex items-center gap-1.5">
                              <Mail className="w-4 h-4 text-indigo-400" />
                              {c.email}
                            </span>
                          )}
                        </div>
                        {c.notes && (
                          <p className="text-sm text-slate-400 pt-1 flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>{c.notes}</span>
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditCustomer(c)}
                          className="p-2 rounded-lg bg-slate-800 hover:bg-indigo-600 text-indigo-300 hover:text-white transition cursor-pointer"
                          title="Editar cliente"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteCustomer(c)}
                          className="p-2 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white transition cursor-pointer"
                          title="Excluir cliente"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2 text-slate-300">
                        <ShoppingBag className="w-4 h-4 text-emerald-400" />
                        <span>
                          <strong>{c.totalOrders}</strong> compra(s) na loja
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Total gasto: </span>
                        <strong className="text-emerald-400 text-base">
                          {formatCurrencyBRL(c.totalSpent)}
                        </strong>
                      </div>
                      {c.lastPurchaseAt && (
                        <div className="w-full text-sm text-slate-400">
                          Última compra em: {formatDateTimeBR(c.lastPurchaseAt)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>

            <PaginationBar
              currentPage={currentPage}
              totalItems={customers.length}
              onPageChange={setCurrentPage}
            />
          </div>
        )
      ) : activeTab === 'suppliers' ? (
        /* ABA 2: LISTA DE FORNECEDORES */
        suppliers.length === 0 ? (
          <div className="p-12 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-2">
            <div className="text-base font-bold text-white">
              Nenhum fornecedor encontrado.
            </div>
            <p className="text-sm text-slate-400">
              Cadastre as confecções e distribuidores que fornecem mercadorias para sua loja.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {suppliers
                .slice(
                  (currentPage - 1) * ITEMS_PER_PAGE,
                  currentPage * ITEMS_PER_PAGE
                )
                .map((s) => (
                  <div
                    key={s.id}
                    className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between gap-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5">
                        <h3 className="text-lg font-bold text-white">
                          {s.name}
                        </h3>
                        {s.document && (
                          <div className="text-sm text-slate-400 font-mono">
                            CNPJ / CPF: {formatCpfCnpjMask(s.document)}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300 pt-1">
                          {s.phone && (
                            <span className="flex items-center gap-1.5 font-mono">
                              <Phone className="w-4 h-4 text-sky-400" />
                              {formatPhoneMask(s.phone)}
                            </span>
                          )}
                          {s.email && (
                            <span className="flex items-center gap-1.5">
                              <Mail className="w-4 h-4 text-sky-400" />
                              {s.email}
                            </span>
                          )}
                        </div>
                        {s.address && (
                          <p className="text-sm text-slate-400 pt-1 flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>{s.address}</span>
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditSupplier(s)}
                          className="p-2 rounded-lg bg-slate-800 hover:bg-indigo-600 text-indigo-300 hover:text-white transition cursor-pointer"
                          title="Editar fornecedor"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteSupplier(s)}
                          className="p-2 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white transition cursor-pointer"
                          title="Excluir fornecedor"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-sm">
                      <span className="text-slate-300">
                        Modelos vinculados:{' '}
                        <strong className="text-white">
                          {s.productsCount ?? 0}
                        </strong>
                      </span>
                      <span className="text-slate-300">
                        Entregas no estoque:{' '}
                        <strong className="text-white">
                          {s.entriesCount ?? 0}
                        </strong>
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-300 font-medium">
                        Prazo de entrega: {s.leadTimeDays} dias
                      </span>
                    </div>
                  </div>
                ))}
            </div>

            <PaginationBar
              currentPage={currentPage}
              totalItems={suppliers.length}
              onPageChange={setCurrentPage}
            />
          </div>
        )
      ) : (
        /* ABA 3: LISTA DE FUNCIONÁRIOS / VENDEDORES */
        employees.length === 0 ? (
          <div className="p-12 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-2">
            <div className="text-base font-bold text-white">
              Nenhum funcionário encontrado.
            </div>
            <p className="text-sm text-slate-400">
              Cadastre os vendedores e funcionários da loja para registrar quem realizou cada venda ou entrada de estoque.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {employees
                .slice(
                  (currentPage - 1) * ITEMS_PER_PAGE,
                  currentPage * ITEMS_PER_PAGE
                )
                .map((emp) => (
                  <div
                    key={emp.id}
                    className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between gap-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <h3 className="text-lg font-bold text-white">
                            {emp.name}
                          </h3>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-sm font-medium">
                            <BadgeCheck className="w-3.5 h-3.5" />
                            {emp.jobTitle || 'Vendedor(a)'}
                          </span>
                        </div>

                        {emp.document && (
                          <div className="text-sm text-slate-400 font-mono">
                            CPF: {formatCpfCnpjMask(emp.document)}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300 pt-1">
                          {emp.phone && (
                            <span className="flex items-center gap-1.5 font-mono">
                              <Phone className="w-4 h-4 text-emerald-400" />
                              {formatPhoneMask(emp.phone)}
                            </span>
                          )}
                          {emp.email && (
                            <span className="flex items-center gap-1.5">
                              <Mail className="w-4 h-4 text-emerald-400" />
                              {emp.email}
                            </span>
                          )}
                        </div>
                        {emp.address && (
                          <p className="text-sm text-slate-400 pt-1 flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>{emp.address}</span>
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditEmployee(emp)}
                          className="p-2 rounded-lg bg-slate-800 hover:bg-indigo-600 text-indigo-300 hover:text-white transition cursor-pointer"
                          title="Editar funcionário"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteEmployee(emp)}
                          className="p-2 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white transition cursor-pointer"
                          title="Remover funcionário"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2 text-slate-300">
                        <ShoppingBag className="w-4 h-4 text-emerald-400" />
                        <span>
                          <strong>{emp.salesCount}</strong> venda(s) realizada(s)
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-slate-300">
                        <Boxes className="w-4 h-4 text-indigo-400" />
                        <span>
                          <strong>{emp.movementsCount}</strong> reg. no estoque
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400">Total vendido: </span>
                        <strong className="text-emerald-400 text-base">
                          {formatCurrencyBRL(emp.salesRevenue)}
                        </strong>
                      </div>
                    </div>
                  </div>
                ))}
            </div>

            <PaginationBar
              currentPage={currentPage}
              totalItems={employees.length}
              onPageChange={setCurrentPage}
            />
          </div>
        )
      )}

      {/* MODAL DE CLIENTE */}
      {showCustomerModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-6 sm:p-8 shadow-2xl my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h2 className="text-xl font-bold text-white">
                {editingCustomer ? 'Editar Cliente' : 'Cadastrar Novo Cliente'}
              </h2>
              <button
                type="button"
                onClick={() => setShowCustomerModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="space-y-4 mt-5">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  Nome Completo do Cliente
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Camila Rocha"
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    Telefone / WhatsApp
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={15}
                    placeholder="(11) 99999-9999"
                    value={custPhone}
                    onChange={(e) =>
                      setCustPhone(formatPhoneMask(e.target.value))
                    }
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    CPF / CNPJ (Opcional)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={18}
                    placeholder="000.000.000-00"
                    value={custDocument}
                    onChange={(e) =>
                      setCustDocument(formatCpfCnpjMask(e.target.value))
                    }
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    E-mail (Opcional)
                  </label>
                  <input
                    type="email"
                    placeholder="cliente@email.com"
                    value={custEmail}
                    onChange={(e) => setCustEmail(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white"
                  />
                </div>
              </div>

              <StructuredAddressFields
                cep={custAddrObj.cep}
                stateUf={custAddrObj.stateUf}
                city={custAddrObj.city}
                street={custAddrObj.street}
                onChange={setCustAddrObj}
              />

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCustomerModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-sm text-slate-200 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white cursor-pointer"
                >
                  {submitting ? 'Salvando...' : 'Salvar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE FORNECEDOR */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-6 sm:p-8 shadow-2xl my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h2 className="text-xl font-bold text-white">
                {editingSupplier
                  ? 'Editar Fornecedor'
                  : 'Cadastrar Novo Fornecedor'}
              </h2>
              <button
                type="button"
                onClick={() => setShowSupplierModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="space-y-4 mt-5">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  Nome da Empresa / Fornecedor
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Têxtil Brasil Confecções Ltda"
                  value={supName}
                  onChange={(e) => setSupName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    CNPJ ou CPF (Obrigatório) *
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    maxLength={18}
                    placeholder="00.000.000/0001-00"
                    value={supDocument}
                    onChange={(e) =>
                      setSupDocument(formatCpfCnpjMask(e.target.value))
                    }
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    Prazo de Entrega (Dias)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={180}
                    required
                    value={supLeadTime}
                    onChange={(e) => setSupLeadTime(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    Telefone Comercial
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={15}
                    placeholder="(11) 3333-4444"
                    value={supPhone}
                    onChange={(e) =>
                      setSupPhone(formatPhoneMask(e.target.value))
                    }
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    E-mail do Fornecedor
                  </label>
                  <input
                    type="email"
                    placeholder="vendas@fornecedor.com.br"
                    value={supEmail}
                    onChange={(e) => setSupEmail(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white"
                  />
                </div>
              </div>

              <StructuredAddressFields
                cep={supAddrObj.cep}
                stateUf={supAddrObj.stateUf}
                city={supAddrObj.city}
                street={supAddrObj.street}
                onChange={setSupAddrObj}
              />

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSupplierModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-sm text-slate-200 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white cursor-pointer"
                >
                  {submitting ? 'Salvando...' : 'Salvar Fornecedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE FUNCIONÁRIO */}
      {showEmployeeModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-6 sm:p-8 shadow-2xl my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h2 className="text-xl font-bold text-white">
                {editingEmployee
                  ? 'Editar Funcionário'
                  : 'Cadastrar Novo Funcionário'}
              </h2>
              <button
                type="button"
                onClick={() => setShowEmployeeModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEmployee} className="space-y-4 mt-5">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  Nome Completo do Funcionário
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Juliana Martins"
                  value={empName}
                  onChange={(e) => setEmpName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    Cargo / Função na Loja
                  </label>
                  <select
                    value={empJobTitle}
                    onChange={(e) => setEmpJobTitle(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white"
                  >
                    <option value="Vendedor(a)">Vendedor(a)</option>
                    <option value="Vendedor / Caixa">Vendedor / Caixa</option>
                    <option value="Operador(a) de Caixa">Operador(a) de Caixa</option>
                    <option value="Estoquista">Estoquista</option>
                    <option value="Gerente de Loja">Gerente de Loja</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    CPF do Funcionário (Obrigatório) *
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    maxLength={14}
                    placeholder="000.000.000-00"
                    value={empDocument}
                    onChange={(e) =>
                      setEmpDocument(formatCpfMask(e.target.value))
                    }
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    Telefone / WhatsApp
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={15}
                    placeholder="(11) 99999-9999"
                    value={empPhone}
                    onChange={(e) =>
                      setEmpPhone(formatPhoneMask(e.target.value))
                    }
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    E-mail (Opcional)
                  </label>
                  <input
                    type="email"
                    placeholder="funcionario@loja.com"
                    value={empEmail}
                    onChange={(e) => setEmpEmail(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white"
                  />
                </div>
              </div>

              <StructuredAddressFields
                cep={empAddrObj.cep}
                stateUf={empAddrObj.stateUf}
                city={empAddrObj.city}
                street={empAddrObj.street}
                onChange={setEmpAddrObj}
              />

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEmployeeModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-sm text-slate-200 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white cursor-pointer"
                >
                  {submitting ? 'Salvando...' : 'Salvar Funcionário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

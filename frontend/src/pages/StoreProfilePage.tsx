import React, { useEffect, useState } from 'react';
import {
  Building2,
  Camera,
  CheckCircle2,
  FileText,
  Mail,
  MapPin,
  Phone,
  Save,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { StructuredAddressFields } from '../components/StructuredAddressFields';
import {
  ApiError,
  apiRequest,
  compressImageToWebP,
  getDataUrlSizeKB,
} from '../services/api';
import { AuthTenant } from '../types/erp';
import {
  composeAddressString,
  formatCpfCnpjMask,
  formatPhoneMask,
  onlyDigits,
  parseAddressString,
} from '../utils/formatters';

export const StoreProfilePage: React.FC = () => {
  const { tenant, updateTenantState } = useAuth();

  const [name, setName] = useState(tenant?.name || '');
  const [legalName, setLegalName] = useState(tenant?.legalName || '');
  const [document, setDocument] = useState(
    formatCpfCnpjMask(tenant?.document || '')
  );
  const [stateRegistration, setStateRegistration] = useState(
    tenant?.stateRegistration || ''
  );
  const [email, setEmail] = useState(tenant?.email || '');
  const [phone, setPhone] = useState(formatPhoneMask(tenant?.phone || ''));
  const [addrObj, setAddrObj] = useState(() =>
    parseAddressString(tenant?.address || '')
  );
  const [logoPreview, setLogoPreview] = useState<string | null>(
    tenant?.logoUrl || null
  );
  const [logoCompressionInfo, setLogoCompressionInfo] = useState<string | null>(
    null
  );

  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const clearFieldError = (fieldName: string) => {
    if (fieldErrors[fieldName]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[fieldName];
        return next;
      });
    }
  };

  useEffect(() => {
    setLoading(true);
    apiRequest<AuthTenant>('/auth/store-profile')
      .then((profile) => {
        setName(profile.name || '');
        setLegalName(profile.legalName || '');
        setDocument(formatCpfCnpjMask(profile.document || ''));
        setStateRegistration(profile.stateRegistration || '');
        setEmail(profile.email || '');
        setPhone(formatPhoneMask(profile.phone || ''));
        setAddrObj(parseAddressString(profile.address || ''));
        setLogoPreview(profile.logoUrl || null);
      })
      .catch((err) => {
        setError(
          err instanceof Error
            ? err.message
            : 'Erro ao carregar dados da loja.'
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleLogoFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setLogoCompressionInfo(null);
    try {
      const originalKb = Math.max(1, Math.round(file.size / 1024));
      const compressedDataUrl = await compressImageToWebP(file, 360);
      const finalKb = getDataUrlSizeKB(compressedDataUrl);
      setLogoPreview(compressedDataUrl);
      setLogoCompressionInfo(
        `Imagem otimizada em WebP (${originalKb} KB → ${finalKb} KB)`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao processar logo da loja.'
      );
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSuccessMsg(null);

    const cleanDoc = onlyDigits(document, 14);
    if (cleanDoc.length !== 11 && cleanDoc.length !== 14) {
      setFieldErrors({
        document: [
          'Informe um CPF (11 números) ou CNPJ (14 números) válido para a loja.',
        ],
      });
      setError(
        'Informe um CPF (11 números) ou CNPJ (14 números) válido para a loja.'
      );
      return;
    }

    setSaving(true);

    try {
      const composedAddress = composeAddressString(addrObj);
      const updated = await apiRequest<AuthTenant>('/auth/store-profile', {
        method: 'PUT',
        body: JSON.stringify({
          name,
          legalName,
          document: cleanDoc,
          stateRegistration,
          email,
          phone: onlyDigits(phone, 11),
          address: composedAddress,
          logoInput: logoPreview,
        }),
      });

      updateTenantState(updated);
      setLogoPreview(updated.logoUrl || null);
      setSuccessMsg(
        'Cadastro da loja atualizado com sucesso! Os dados já estão ativos no sistema e nas Notas Fiscais.'
      );
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.fieldErrors &&
        Object.keys(err.fieldErrors).length > 0
      ) {
        setFieldErrors(err.fieldErrors);
        setError(err.message);
      } else {
        setError(
          err instanceof Error
            ? err.message
            : 'Erro ao salvar perfil do lojista.'
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const storeInitial = (name || 'L').trim().charAt(0).toUpperCase();

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
          Perfil e Cadastro da Loja
        </h1>
        <p className="text-sm sm:text-base text-slate-400 mt-1">
          Configure a foto de perfil (logo), Nome Fantasia, Razão Social, CNPJ, Inscrição Estadual e Endereço utilizados nas Notas Fiscais e na vitrine.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm font-medium">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm font-medium flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="p-12 rounded-2xl bg-slate-900 border border-slate-800 text-center text-base text-slate-400">
          Carregando perfil da loja...
        </div>
      ) : (
        <form
          onSubmit={handleSaveProfile}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6"
        >
          {/* Seção da Logo / Inicial da Loja */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 pb-6 border-b border-slate-800">
            {logoPreview ? (
              <img
                src={logoPreview}
                alt={name}
                className="w-24 h-24 rounded-2xl object-cover border-2 border-indigo-500/50 shadow-lg shrink-0"
              />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-600 to-amber-600 flex items-center justify-center text-4xl font-bold text-white shadow-lg shrink-0">
                {storeInitial}
              </div>
            )}

            <div className="space-y-2">
              <div className="text-lg font-bold text-white">
                Logo ou Foto de Perfil da Loja
              </div>
              <p className="text-sm text-slate-400">
                Se nenhuma imagem for enviada, o sistema exibirá automaticamente a inicial{' '}
                <strong className="text-white">"{storeInitial}"</strong> do nome da loja.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <label className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white flex items-center gap-2 cursor-pointer transition">
                  <Camera className="w-4 h-4" />
                  <span>Enviar Foto / Logo (Máx. 3 MB)</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => void handleLogoFileChange(e)}
                    className="hidden"
                  />
                </label>

                {logoPreview && (
                  <button
                    type="button"
                    onClick={() => {
                      setLogoPreview(null);
                      setLogoCompressionInfo(null);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-rose-600 text-sm font-medium text-slate-200 hover:text-white flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Usar Inicial "{storeInitial}"</span>
                  </button>
                )}
              </div>

              {logoCompressionInfo && (
                <div className="text-xs font-medium text-emerald-400">
                  ✓ {logoCompressionInfo}
                </div>
              )}
            </div>
          </div>

          {/* Dados Empresariais e Fiscais */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-lg font-bold text-white">
              <Building2 className="w-5 h-5 text-indigo-400" />
              <span>Dados Empresariais e Fiscais (Emissor da Nota Fiscal)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  Nome Fantasia da Loja (Obrigatório) *
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  placeholder="Ex: Vértice Moda & Vestuário"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    clearFieldError('name');
                  }}
                  className={`w-full px-4 py-2.5 rounded-xl bg-slate-950 border ${
                    fieldErrors.name
                      ? 'border-rose-500 ring-2 ring-rose-500/40 bg-rose-500/5'
                      : 'border-slate-800'
                  } text-base text-white focus:outline-none focus:border-indigo-500`}
                />
                {fieldErrors.name && (
                  <p className="text-xs text-rose-400 mt-1 font-medium">
                    {fieldErrors.name[0]}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  Razão Social
                </label>
                <input
                  type="text"
                  placeholder="Ex: Vértice Comércio de Confecções Ltda"
                  value={legalName}
                  onChange={(e) => {
                    setLegalName(e.target.value);
                    clearFieldError('legalName');
                  }}
                  className={`w-full px-4 py-2.5 rounded-xl bg-slate-950 border ${
                    fieldErrors.legalName
                      ? 'border-rose-500 ring-2 ring-rose-500/40 bg-rose-500/5'
                      : 'border-slate-800'
                  } text-base text-white focus:outline-none focus:border-indigo-500`}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-amber-400" />
                    CNPJ ou CPF do Lojista (Obrigatório) *
                  </span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  maxLength={18}
                  placeholder="00.000.000/0001-00"
                  value={document}
                  onChange={(e) => {
                    setDocument(formatCpfCnpjMask(e.target.value));
                    clearFieldError('document');
                  }}
                  className={`w-full px-4 py-2.5 rounded-xl bg-slate-950 border ${
                    fieldErrors.document
                      ? 'border-rose-500 ring-2 ring-rose-500/40 bg-rose-500/5'
                      : 'border-slate-800'
                  } text-base text-white font-mono focus:outline-none focus:border-indigo-500`}
                />
                {fieldErrors.document && (
                  <p className="text-xs text-rose-400 mt-1 font-medium">
                    {fieldErrors.document[0]}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  Inscrição Estadual (IE)
                </label>
                <input
                  type="text"
                  placeholder="Ex: 114.892.330.119 ou ISENTO"
                  value={stateRegistration}
                  onChange={(e) => setStateRegistration(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-base text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Contato e Localização */}
          <div className="space-y-4 pt-4 border-t border-slate-800">
            <div className="flex items-center gap-2 text-lg font-bold text-white">
              <MapPin className="w-5 h-5 text-emerald-400" />
              <span>Endereço e Contatos Comerciais</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="w-4 h-4 text-emerald-400" />
                    Telefone / WhatsApp da Loja
                  </span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={15}
                  placeholder="(11) 98888-7777"
                  value={phone}
                  onChange={(e) => {
                    setPhone(formatPhoneMask(e.target.value));
                    clearFieldError('phone');
                  }}
                  className={`w-full px-4 py-2.5 rounded-xl bg-slate-950 border ${
                    fieldErrors.phone
                      ? 'border-rose-500 ring-2 ring-rose-500/40 bg-rose-500/5'
                      : 'border-slate-800'
                  } text-base text-white font-mono focus:outline-none focus:border-indigo-500`}
                />
                {fieldErrors.phone && (
                  <p className="text-xs text-rose-400 mt-1 font-medium">
                    {fieldErrors.phone[0]}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="w-4 h-4 text-indigo-400" />
                    E-mail Comercial da Loja
                  </span>
                </label>
                <input
                  type="email"
                  placeholder="contato@sualoja.com.br"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearFieldError('email');
                  }}
                  className={`w-full px-4 py-2.5 rounded-xl bg-slate-950 border ${
                    fieldErrors.email
                      ? 'border-rose-500 ring-2 ring-rose-500/40 bg-rose-500/5'
                      : 'border-slate-800'
                  } text-base text-white focus:outline-none focus:border-indigo-500`}
                />
                {fieldErrors.email && (
                  <p className="text-xs text-rose-400 mt-1 font-medium">
                    {fieldErrors.email[0]}
                  </p>
                )}
              </div>
            </div>

            <StructuredAddressFields
              cep={addrObj.cep}
              stateUf={addrObj.stateUf}
              city={addrObj.city}
              street={addrObj.street}
              onChange={(next) => {
                setAddrObj(next);
                clearFieldError('address');
              }}
              fieldErrors={fieldErrors}
            />
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-800">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-base font-bold text-white flex items-center gap-2 transition shadow-lg shadow-indigo-950/50 cursor-pointer"
            >
              <Save className="w-5 h-5" />
              <span>
                {saving ? 'Salvando Cadastro...' : 'Salvar Cadastro da Loja'}
              </span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};


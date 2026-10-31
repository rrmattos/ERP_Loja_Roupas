import React, { useEffect, useState } from 'react';
import { CheckCircle2, MapPin, RefreshCw, Search } from 'lucide-react';
import {
  BRAZIL_STATES,
  fetchCitiesByState,
  formatCepMask,
  lookupAddressByCep,
  onlyDigits,
} from '../utils/formatters';

interface StructuredAddressFieldsProps {
  cep: string;
  stateUf: string;
  city: string;
  street: string;
  onChange: (next: {
    cep: string;
    stateUf: string;
    city: string;
    street: string;
  }) => void;
  required?: boolean;
  fieldErrors?: {
    cep?: string[];
    stateUf?: string[];
    city?: string[];
    street?: string[];
    address?: string[];
  };
}

export const StructuredAddressFields: React.FC<StructuredAddressFieldsProps> = ({
  cep,
  stateUf,
  city,
  street,
  onChange,
  required = false,
  fieldErrors,
}) => {
  const [cities, setCities] = useState<string[]>([]);
  const [loadingCities, setLoadingCities] = useState<boolean>(false);
  const [lookingUpCep, setLookingUpCep] = useState<boolean>(false);
  const [cepFeedback, setCepFeedback] = useState<{
    type: 'ok' | 'err';
    msg: string;
  } | null>(null);

  // Carrega a lista de cidades do IBGE sempre que o Estado (UF) mudar
  useEffect(() => {
    let active = true;
    if (!stateUf) {
      setCities([]);
      return;
    }

    setLoadingCities(true);
    fetchCitiesByState(stateUf)
      .then((list) => {
        if (!active) return;
        // Garante que a cidade já preenchida (via CEP ou banco) esteja na lista mesmo se houver diferença de grafia
        if (city && !list.includes(city)) {
          setCities([city, ...list]);
        } else {
          setCities(list);
        }
      })
      .finally(() => {
        if (active) setLoadingCities(false);
      });

    return () => {
      active = false;
    };
  }, [stateUf, city]);

  const handleVerifyCep = async (cepToSearch = cep) => {
    const clean = onlyDigits(cepToSearch, 8);
    if (clean.length !== 8) {
      setCepFeedback({
        type: 'err',
        msg: 'Digite os 8 números do CEP para buscar.',
      });
      return;
    }

    setLookingUpCep(true);
    setCepFeedback(null);
    try {
      const found = await lookupAddressByCep(clean);
      const stateCities = await fetchCitiesByState(found.stateUf);
      if (found.city && !stateCities.includes(found.city)) {
        setCities([found.city, ...stateCities]);
      } else {
        setCities(stateCities);
      }

      onChange({
        cep: found.cep,
        stateUf: found.stateUf,
        city: found.city,
        street: found.street || street,
      });

      setCepFeedback({
        type: 'ok',
        msg: `Localizado: ${found.city} - ${found.stateUf}`,
      });
    } catch (err) {
      setCepFeedback({
        type: 'err',
        msg:
          err instanceof Error
            ? err.message
            : 'Não foi possível localizar este CEP.',
      });
    } finally {
      setLookingUpCep(false);
    }
  };

  const hasAddressError = Boolean(
    fieldErrors?.address ||
      fieldErrors?.street ||
      fieldErrors?.city ||
      fieldErrors?.stateUf
  );

  return (
    <div
      className={`p-4 sm:p-5 rounded-2xl bg-slate-950/90 border transition-all ${
        hasAddressError
          ? 'border-rose-500/70 ring-1 ring-rose-500/30'
          : 'border-slate-800'
      } space-y-4`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-indigo-300">
          <MapPin className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>Endereço Completo (CEP, Estado, Cidade e Rua)</span>
        </div>
        {cepFeedback && (
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5 ${
              cepFeedback.type === 'ok'
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
            }`}
          >
            {cepFeedback.type === 'ok' && (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{cepFeedback.msg}</span>
          </span>
        )}
      </div>

      {/* Grid com 3 colunas amplas: CEP, Estado (UF) e Cidade */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 items-start">
        {/* 1. CEP (Opcional) com botão de verificar na API */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            CEP <span className="text-slate-400 font-normal">(Opcional)</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              maxLength={9}
              placeholder="00000-000"
              value={cep}
              onChange={(e) => {
                const formatted = formatCepMask(e.target.value);
                onChange({ cep: formatted, stateUf, city, street });
                if (onlyDigits(formatted).length === 8) {
                  void handleVerifyCep(formatted);
                }
              }}
              className="w-full min-w-[110px] px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              disabled={lookingUpCep}
              onClick={() => void handleVerifyCep(cep)}
              title="Buscar endereço pelo CEP nos Correios"
              className="px-3.5 py-2.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/35 border border-indigo-500/40 text-indigo-300 text-sm font-semibold flex items-center gap-1.5 shrink-0 transition cursor-pointer disabled:opacity-50"
            >
              {lookingUpCep ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              <span className="hidden xs:inline">Buscar</span>
            </button>
          </div>
        </div>

        {/* 2. Estado (Lista com todos os Estados do Brasil com espaço generoso) */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Estado (UF) {required && <span className="text-rose-400">*</span>}
          </label>
          <select
            required={required}
            value={stateUf}
            onChange={(e) => {
              const nextUf = e.target.value;
              onChange({
                cep,
                stateUf: nextUf,
                city: '', // Reseta a cidade ao trocar o Estado
                street,
              });
            }}
            className={`w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border ${
              fieldErrors?.stateUf
                ? 'border-rose-500 ring-1 ring-rose-500/50'
                : 'border-slate-700'
            } text-sm text-white focus:outline-none focus:border-indigo-500`}
          >
            <option value="">Selecione o Estado...</option>
            {BRAZIL_STATES.map((st) => (
              <option key={st.uf} value={st.uf}>
                {st.uf} — {st.name}
              </option>
            ))}
          </select>
          {fieldErrors?.stateUf && (
            <p className="text-xs text-rose-400 mt-1 font-medium">
              {fieldErrors.stateUf[0]}
            </p>
          )}
        </div>

        {/* 3. Cidade (Lista filtrada pelo Estado selecionado) */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Cidade {stateUf ? `(${stateUf})` : ''}{' '}
            {required && <span className="text-rose-400">*</span>}
          </label>
          <select
            required={required}
            disabled={!stateUf || loadingCities}
            value={city}
            onChange={(e) =>
              onChange({
                cep,
                stateUf,
                city: e.target.value,
                street,
              })
            }
            className={`w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border ${
              fieldErrors?.city
                ? 'border-rose-500 ring-1 ring-rose-500/50'
                : 'border-slate-700'
            } text-sm text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <option value="">
              {!stateUf
                ? 'Aguardando Estado...'
                : loadingCities
                ? 'Carregando cidades do IBGE...'
                : 'Selecione a Cidade...'}
            </option>
            {cities.map((cityName) => (
              <option key={cityName} value={cityName}>
                {cityName}
              </option>
            ))}
          </select>
          {fieldErrors?.city && (
            <p className="text-xs text-rose-400 mt-1 font-medium">
              {fieldErrors.city[0]}
            </p>
          )}
        </div>
      </div>

      {/* 4. Rua, Número, Bairro e Complemento */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">
          Rua, Número e Bairro {required && <span className="text-rose-400">*</span>}
        </label>
        <input
          type="text"
          required={required}
          placeholder="Ex: Rua Felipe Schmidt, 240 - Centro (Loja 2)"
          value={street}
          onChange={(e) =>
            onChange({
              cep,
              stateUf,
              city,
              street: e.target.value,
            })
          }
          className={`w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border ${
            fieldErrors?.street || fieldErrors?.address
              ? 'border-rose-500 ring-1 ring-rose-500/50'
              : 'border-slate-700'
          } text-sm text-white focus:outline-none focus:border-indigo-500`}
        />
        {(fieldErrors?.street || fieldErrors?.address) && (
          <p className="text-xs text-rose-400 mt-1 font-medium">
            {fieldErrors?.street?.[0] || fieldErrors?.address?.[0]}
          </p>
        )}
      </div>
    </div>
  );
};


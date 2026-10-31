/**
 * Utilitários de formatação (Máscaras de CPF, CNPJ, Telefone, CEP) e consulta de Endereço (CEP + Estados/Cidades IBGE)
 */

/**
 * Remove todos os caracteres não numéricos (mantém apenas 0-9) e limita o tamanho máximo de dígitos.
 * Ideal para salvar no banco de dados como string limpa (preservando zeros à esquerda).
 */
export function onlyDigits(
  value: string | null | undefined,
  maxDigits?: number
): string {
  const digits = (value || '').replace(/\D/g, '');
  return typeof maxDigits === 'number' ? digits.slice(0, maxDigits) : digits;
}

/**
 * Formata apenas CPF (até 11 dígitos): 000.000.000-00
 */
export function formatCpfMask(value: string | null | undefined): string {
  const d = onlyDigits(value, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

/**
 * Formata apenas CNPJ (até 14 dígitos): 00.000.000/0000-00
 */
export function formatCnpjMask(value: string | null | undefined): string {
  const d = onlyDigits(value, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  }
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

/**
 * Formata dinamicamente CPF (até 11 dígitos) ou CNPJ (12 a 14 dígitos)
 */
export function formatCpfCnpjMask(value: string | null | undefined): string {
  const d = onlyDigits(value, 14);
  if (d.length <= 11) {
    return formatCpfMask(d);
  }
  return formatCnpjMask(d);
}

/**
 * Formata Telefone / Celular Brasileiro (10 ou 11 dígitos):
 * (11) 98888-7777 ou (11) 3333-4444
 */
export function formatPhoneMask(value: string | null | undefined): string {
  const d = onlyDigits(value, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6, 10)}`;
  }
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
}

/**
 * Formata CEP Brasileiro (8 dígitos): 00000-000
 */
export function formatCepMask(value: string | null | undefined): string {
  const d = onlyDigits(value, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5, 8)}`;
}

/**
 * Lista oficial das 27 Unidades Federativas (Estados) do Brasil
 */
export interface BrazilState {
  uf: string;
  name: string;
}

export const BRAZIL_STATES: BrazilState[] = [
  { uf: 'AC', name: 'Acre' },
  { uf: 'AL', name: 'Alagoas' },
  { uf: 'AP', name: 'Amapá' },
  { uf: 'AM', name: 'Amazonas' },
  { uf: 'BA', name: 'Bahia' },
  { uf: 'CE', name: 'Ceará' },
  { uf: 'DF', name: 'Distrito Federal' },
  { uf: 'ES', name: 'Espírito Santo' },
  { uf: 'GO', name: 'Goiás' },
  { uf: 'MA', name: 'Maranhão' },
  { uf: 'MT', name: 'Mato Grosso' },
  { uf: 'MS', name: 'Mato Grosso do Sul' },
  { uf: 'MG', name: 'Minas Gerais' },
  { uf: 'PA', name: 'Pará' },
  { uf: 'PB', name: 'Paraíba' },
  { uf: 'PR', name: 'Paraná' },
  { uf: 'PE', name: 'Pernambuco' },
  { uf: 'PI', name: 'Piauí' },
  { uf: 'RJ', name: 'Rio de Janeiro' },
  { uf: 'RN', name: 'Rio Grande do Norte' },
  { uf: 'RS', name: 'Rio Grande do Sul' },
  { uf: 'RO', name: 'Rondônia' },
  { uf: 'RR', name: 'Roraima' },
  { uf: 'SC', name: 'Santa Catarina' },
  { uf: 'SP', name: 'São Paulo' },
  { uf: 'SE', name: 'Sergipe' },
  { uf: 'TO', name: 'Tocantins' },
];

const FALLBACK_CITIES_BY_UF: Record<string, string[]> = {
  AC: ['Rio Branco', 'Cruzeiro do Sul', 'Sena Madureira'],
  AL: ['Maceió', 'Arapiraca', 'Rio Largo'],
  AP: ['Macapá', 'Santana', 'Laranjal do Jari'],
  AM: ['Manaus', 'Parintins', 'Itacoatiara'],
  BA: ['Salvador', 'Feira de Santana', 'Vitória da Conquista', 'Camaçari', 'Ilhéus'],
  CE: ['Fortaleza', 'Caucaia', 'Juazeiro do Norte', 'Sobral'],
  DF: ['Brasília', 'Taguatinga', 'Águas Claras', 'Guará'],
  ES: ['Vitória', 'Vila Velha', 'Serra', 'Cariacica', 'Linhares'],
  GO: ['Goiânia', 'Aparecida de Goiânia', 'Anápolis', 'Rio Verde'],
  MA: ['São Luís', 'Imperatriz', 'São José de Ribamar', 'Timon'],
  MT: ['Cuiabá', 'Várzea Grande', 'Rondonópolis', 'Sinop'],
  MS: ['Campo Grande', 'Dourados', 'Três Lagoas', 'Corumbá'],
  MG: ['Belo Horizonte', 'Uberlândia', 'Contagem', 'Juiz de Fora', 'Betim', 'Montes Claros'],
  PA: ['Belém', 'Ananindeua', 'Santarém', 'Marabá'],
  PB: ['João Pessoa', 'Campina Grande', 'Santa Rita', 'Patos'],
  PR: ['Curitiba', 'Londrina', 'Maringá', 'Ponta Grossa', 'Cascavel', 'Foz do Iguaçu'],
  PE: ['Recife', 'Jaboatão dos Guararapes', 'Olinda', 'Caruaru', 'Petrolina'],
  PI: ['Teresina', 'Parnaíba', 'Picos'],
  RJ: ['Rio de Janeiro', 'São Gonçalo', 'Duque de Caxias', 'Nova Iguaçu', 'Niterói', 'Petrópolis'],
  RN: ['Natal', 'Mossoró', 'Parnamirim'],
  RS: ['Porto Alegre', 'Caxias do Sul', 'Canoas', 'Pelotas', 'Santa Maria', 'Gramado'],
  RO: ['Porto Velho', 'Ji-Paraná', 'Ariquemes'],
  RR: ['Boa Vista', 'Rorainópolis'],
  SC: ['Florianópolis', 'Joinville', 'Blumenau', 'São José', 'Itajaí', 'Balneário Camboriú', 'Chapecó'],
  SP: ['São Paulo', 'Guarulhos', 'Campinas', 'São Bernardo do Campo', 'Santo André', 'Ribeirão Preto', 'Santos', 'Sorocaba', 'São José dos Campos', 'Bauru'],
  SE: ['Aracaju', 'Nossa Senhora do Socorro', 'Lagarto'],
  TO: ['Palmas', 'Araguaína', 'Gurupi'],
};

const ibgeCitiesCache: Record<string, string[]> = {};

/**
 * Busca a lista oficial de municípios do Estado (UF) diretamente na API pública do IBGE (Governo Federal),
 * com cache em memória e fallback automático caso esteja sem internet.
 */
export async function fetchCitiesByState(uf: string): Promise<string[]> {
  const cleanUf = (uf || '').trim().toUpperCase();
  if (!cleanUf || cleanUf.length !== 2) return [];

  if (ibgeCitiesCache[cleanUf]) {
    return ibgeCitiesCache[cleanUf];
  }

  try {
    const response = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${cleanUf}/municipios?orderBy=nome`
    );
    if (!response.ok) {
      throw new Error('Falha ao consultar IBGE');
    }
    const data = (await response.json()) as Array<{ nome: string }>;
    const names = data.map((item) => item.nome);
    if (names.length > 0) {
      ibgeCitiesCache[cleanUf] = names;
      return names;
    }
  } catch {
    // Fallback offline
  }

  return FALLBACK_CITIES_BY_UF[cleanUf] || [];
}

export interface CepLookupResult {
  cep: string;
  stateUf: string;
  city: string;
  street: string;
}

/**
 * Consulta o CEP na BrasilAPI (Serviço Oficial / Correios) com fallback para ViaCEP
 */
export async function lookupAddressByCep(
  rawCep: string
): Promise<CepLookupResult> {
  const digits = onlyDigits(rawCep, 8);
  if (digits.length !== 8) {
    throw new Error('Digite os 8 números do CEP para consultar.');
  }

  // Tentativa 1: BrasilAPI
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cep/v1/${digits}`);
    if (res.ok) {
      const data = (await res.json()) as {
        cep?: string;
        state?: string;
        city?: string;
        street?: string;
        neighborhood?: string;
      };
      if (data.state && data.city) {
        const streetParts = [data.street, data.neighborhood].filter(Boolean);
        return {
          cep: formatCepMask(digits),
          stateUf: data.state.toUpperCase(),
          city: data.city,
          street: streetParts.join(' - '),
        };
      }
    }
  } catch {
    // Segue para o fallback ViaCEP
  }

  // Tentativa 2: ViaCEP
  const viaRes = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  if (!viaRes.ok) {
    throw new Error('Não foi possível consultar o CEP no momento.');
  }
  const viaData = (await viaRes.json()) as {
    erro?: boolean;
    uf?: string;
    localidade?: string;
    logradouro?: string;
    bairro?: string;
  };

  if (viaData.erro || !viaData.uf || !viaData.localidade) {
    throw new Error('CEP não encontrado. Verifique os números digitados.');
  }

  const streetParts = [viaData.logradouro, viaData.bairro].filter(Boolean);
  return {
    cep: formatCepMask(digits),
    stateUf: viaData.uf.toUpperCase(),
    city: viaData.localidade,
    street: streetParts.join(' - '),
  };
}

export interface StructuredAddress {
  cep: string;
  stateUf: string;
  city: string;
  street: string;
}

/**
 * Monta uma string única padronizada para exibição e armazenamento a partir dos campos separados
 * Formato: "Rua Exemplo, 123 - Centro | Cidade - UF | CEP: 00000-000"
 */
export function composeAddressString(addr: StructuredAddress): string {
  const street = addr.street.trim();
  const city = addr.city.trim();
  const stateUf = addr.stateUf.trim().toUpperCase();
  const cep = formatCepMask(addr.cep);

  const parts: string[] = [];
  if (street) parts.push(street);
  if (city && stateUf) {
    parts.push(`${city} - ${stateUf}`);
  } else if (stateUf) {
    parts.push(stateUf);
  }
  if (cep) {
    parts.push(`CEP: ${cep}`);
  }

  return parts.join(' | ');
}

/**
 * Extrai CEP, Estado (UF), Cidade e Rua de um endereço salvo anteriormente
 */
export function parseAddressString(
  rawAddress: string | null | undefined
): StructuredAddress {
  if (!rawAddress || !rawAddress.trim()) {
    return { cep: '', stateUf: '', city: '', street: '' };
  }

  const text = rawAddress.trim();

  // Extrai CEP se houver
  const cepMatch = text.match(/(\d{5})-?(\d{3})/);
  const cep = cepMatch ? `${cepMatch[1]}-${cepMatch[2]}` : '';

  // Se estiver no formato padronizado separado por " | "
  if (text.includes(' | ')) {
    const segments = text
      .split(' | ')
      .map((s) => s.trim())
      .filter((s) => !s.toUpperCase().startsWith('CEP:'));

    let street = '';
    let city = '';
    let stateUf = '';

    for (const seg of segments) {
      const ufMatch = seg.match(/^(.+?)\s*-\s*([A-Z]{2})$/);
      if (ufMatch && BRAZIL_STATES.some((st) => st.uf === ufMatch[2])) {
        city = ufMatch[1].trim();
        stateUf = ufMatch[2].trim();
      } else if (
        seg.length === 2 &&
        BRAZIL_STATES.some((st) => st.uf === seg.toUpperCase())
      ) {
        stateUf = seg.toUpperCase();
      } else if (!street) {
        street = seg;
      }
    }

    return { cep, stateUf, city, street };
  }

  // Tenta extrair "Cidade - UF" ou ", Cidade - UF" de endereços legados
  const legacyMatch = text.match(/^(.*?)[,\s]+([^,-]+?)\s*-\s*([A-Z]{2})(?:[,\s|].*)?$/i);
  if (
    legacyMatch &&
    BRAZIL_STATES.some((st) => st.uf === legacyMatch[3].toUpperCase())
  ) {
    return {
      cep,
      street: legacyMatch[1].trim(),
      city: legacyMatch[2].trim(),
      stateUf: legacyMatch[3].toUpperCase(),
    };
  }

  return {
    cep,
    stateUf: '',
    city: '',
    street: text.replace(/\|?\s*CEP:\s*\d{5}-?\d{3}/i, '').trim(),
  };
}


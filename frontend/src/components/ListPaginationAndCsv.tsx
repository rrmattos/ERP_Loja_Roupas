import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
} from 'lucide-react';

export const ITEMS_PER_PAGE = 10;

/**
 * Converte uma string de intervalo de páginas estilo impressora (ex: "1-2", "3-6", "2", "1-2, 4")
 * nos índices de páginas selecionadas (base 1, ordenados e sem duplicatas).
 */
export function parsePageRangeString(
  rangeInput: string,
  totalPages: number
): number[] {
  const maxPage = Math.max(1, totalPages);
  const cleaned = rangeInput.trim();
  if (!cleaned) {
    throw new Error('Informe o intervalo de páginas (ex: 1-2 ou 3-6).');
  }

  const pagesSet = new Set<number>();
  const parts = cleaned.split(',').map((p) => p.trim()).filter(Boolean);

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map((s) => s.trim());
      const start = Number.parseInt(startStr, 10);
      const end = Number.parseInt(endStr, 10);

      if (
        Number.isNaN(start) ||
        Number.isNaN(end) ||
        start < 1 ||
        end < start
      ) {
        throw new Error(
          `Intervalo inválido "${part}". Use o formato início-fim (ex: 1-2 ou 3-6).`
        );
      }

      if (start > maxPage) {
        throw new Error(
          `A página ${start} não existe. Esta lista possui ${maxPage} página(s).`
        );
      }

      const clampedEnd = Math.min(end, maxPage);
      for (let p = start; p <= clampedEnd; p += 1) {
        pagesSet.add(p);
      }
    } else {
      const pageNum = Number.parseInt(part, 10);
      if (Number.isNaN(pageNum) || pageNum < 1) {
        throw new Error(
          `Número de página inválido "${part}". Use ex: 1-2 ou 3-6.`
        );
      }
      if (pageNum > maxPage) {
        throw new Error(
          `A página ${pageNum} não existe. Esta lista possui ${maxPage} página(s).`
        );
      }
      pagesSet.add(pageNum);
    }
  }

  const sorted = Array.from(pagesSet).sort((a, b) => a - b);
  if (sorted.length === 0) {
    throw new Error('Nenhuma página válida selecionada.');
  }
  return sorted;
}

/**
 * Escapa um valor para célula de CSV separado por ponto-e-vírgula (padrão Excel Brasil)
 */
function escapeCsvCell(val: string | number | null | undefined): string {
  const str = String(val ?? '')
    .replace(/\r?\n|\r/g, ' ')
    .trim();
  if (str.includes(';') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export interface ActiveFilterItem {
  label: string;
  value: string;
}

interface CsvExportBarProps<T> {
  reportTitle: string;
  filenamePrefix: string;
  items: T[];
  itemsPerPage?: number;
  activeFilters: ActiveFilterItem[];
  headers: string[];
  rowMapper: (item: T, globalIndex: number) => Array<string | number>;
}

/**
 * Barra de Exportação / Impressão de Planilhas em Excel (.XLSX) e CSV
 * Suporta Filtros Ativos e Seleção de Páginas estilo impressora ("Todas" ou "1-2", "3-6")
 */
export function CsvExportBar<T>({
  reportTitle,
  filenamePrefix,
  items,
  itemsPerPage = ITEMS_PER_PAGE,
  activeFilters,
  headers,
  rowMapper,
}: CsvExportBarProps<T>): React.ReactElement {
  const [exportAllPages, setExportAllPages] = useState<boolean>(true);
  const [pageRangeInput, setPageRangeInput] = useState<string>('1-2');
  const [rangeError, setRangeError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage));

  const getSelectedSlice = (): { selectedItems: T[]; pagesLabel: string } | null => {
    if (items.length === 0) {
      setRangeError('Não há itens na lista filtrada para exportar.');
      return null;
    }

    if (exportAllPages) {
      return {
        selectedItems: items,
        pagesLabel: `Todas as páginas (1 a ${totalPages})`,
      };
    }

    try {
      const selectedPages = parsePageRangeString(pageRangeInput, totalPages);
      const selectedItems: T[] = [];
      selectedPages.forEach((pageNumber) => {
        const startIdx = (pageNumber - 1) * itemsPerPage;
        const endIdx = startIdx + itemsPerPage;
        selectedItems.push(...items.slice(startIdx, endIdx));
      });

      return {
        selectedItems,
        pagesLabel: `Páginas selecionadas: ${selectedPages.join(', ')}`,
      };
    } catch (err) {
      setRangeError(
        err instanceof Error ? err.message : 'Intervalo de páginas inválido.'
      );
      return null;
    }
  };

  /**
   * Exporta arquivo oficial Excel (.xlsx) com colunas separadas e largura ajustada
   */
  const handleExportXlsx = async () => {
    setRangeError(null);
    const sliceData = getSelectedSlice();
    if (!sliceData) return;

    const XLSX = await import('xlsx');
    const { selectedItems, pagesLabel } = sliceData;
    const filterSummary = activeFilters
      .map((f) => `${f.label}: ${f.value}`)
      .join(' | ');

    // Estrutura de dados linha por linha da planilha Excel
    const wsData: Array<Array<string | number | boolean | null>> = [
      ['RELATÓRIO:', reportTitle],
      ['FILTROS APLICADOS:', filterSummary || 'Todos os registros'],
      [
        'INTERVALO EXPORTADO:',
        `${pagesLabel} (${selectedItems.length} registros)`,
      ],
      ['DATA DA EXTRAÇÃO:', new Date().toLocaleString('pt-BR')],
      [], // linha em branco para separar o cabeçalho dos dados
      headers, // linha exata de cabeçalho das colunas
    ];

    selectedItems.forEach((item, idx) => {
      const row = rowMapper(item, idx);
      wsData.push(row);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Ajusta automaticamente a largura de cada coluna para não truncar valores
    const colWidths = headers.map((header, colIdx) => {
      let maxLen = header.length;
      // analisa as primeiras 60 linhas para determinar a largura ideal
      for (let r = 5; r < Math.min(wsData.length, 65); r += 1) {
        const val = wsData[r]?.[colIdx];
        if (val !== undefined && val !== null) {
          const len = String(val).length;
          if (len > maxLen) maxLen = len;
        }
      }
      return { wch: Math.min(Math.max(maxLen + 4, 14), 50) };
    });
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, 'Dados');

    const dateSuffix = new Date().toISOString().slice(0, 10);
    const rangeSuffix = exportAllPages
      ? 'todas-paginas'
      : `pag-${pageRangeInput.trim().replace(/[^0-9-]/g, '_')}`;

    XLSX.writeFile(wb, `${filenamePrefix}-${rangeSuffix}-${dateSuffix}.xlsx`);
  };

  /**
   * Exporta arquivo CSV com codificação UTF-8 com BOM e separador ";"
   */
  const handleExportCsv = () => {
    setRangeError(null);
    const sliceData = getSelectedSlice();
    if (!sliceData) return;

    const { selectedItems, pagesLabel } = sliceData;
    const filterSummary = activeFilters
      .map((f) => `${f.label}: ${f.value}`)
      .join(' | ');

    const csvLines: string[] = [
      `${escapeCsvCell('Relatório')};${escapeCsvCell(reportTitle)}`,
      `${escapeCsvCell('Filtros Selecionados')};${escapeCsvCell(
        filterSummary || 'Todos os registros'
      )}`,
      `${escapeCsvCell('Intervalo Exportado')};${escapeCsvCell(pagesLabel)} (${
        selectedItems.length
      } registro(s))`,
      '',
      headers.map(escapeCsvCell).join(';'),
    ];

    selectedItems.forEach((item, idx) => {
      const row = rowMapper(item, idx);
      csvLines.push(row.map(escapeCsvCell).join(';'));
    });

    const bom = '\uFEFF';
    const csvContent = bom + csvLines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateSuffix = new Date().toISOString().slice(0, 10);
    const rangeSuffix = exportAllPages
      ? 'todas-paginas'
      : `pag-${pageRangeInput.trim().replace(/[^0-9-]/g, '_')}`;

    link.href = url;
    link.setAttribute(
      'download',
      `${filenamePrefix}-${rangeSuffix}-${dateSuffix}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="pt-3 border-t border-slate-800/90 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="flex items-center gap-1.5 font-bold text-emerald-400">
          <FileSpreadsheet className="w-4 h-4" />
          <span>Exportar Planilha:</span>
        </span>

        {/* Checkbox Booleano: Todas as páginas */}
        <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={exportAllPages}
            onChange={(e) => {
              setExportAllPages(e.target.checked);
              setRangeError(null);
            }}
            className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
          />
          <span className="text-sm font-medium">
            Todas as páginas ({totalPages} {totalPages === 1 ? 'pág.' : 'págs.'})
          </span>
        </label>

        {/* Se desmarcar "Todas", abre o campo tipo impressora ("1-2", "3-6") */}
        {!exportAllPages && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-300">Páginas:</span>
            <input
              type="text"
              placeholder="Ex: 1-2 ou 3-6"
              value={pageRangeInput}
              onChange={(e) => {
                setPageRangeInput(e.target.value);
                setRangeError(null);
              }}
              className="w-32 px-3 py-1.5 rounded-xl bg-slate-950 border border-indigo-500/60 text-sm text-white font-mono focus:outline-none focus:border-indigo-400"
            />
            <span className="text-xs text-slate-400">
              (de 1 até {totalPages})
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {rangeError && (
          <span className="text-xs font-medium text-rose-400 mr-2">{rangeError}</span>
        )}

        {/* Botão Principal: Excel (.XLSX) */}
        <button
          type="button"
          onClick={handleExportXlsx}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold flex items-center gap-2 shadow transition cursor-pointer"
          title="Baixar em formato oficial Excel (.xlsx) com colunas organizadas"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>
            {exportAllPages
              ? 'Exportar Excel (.xlsx)'
              : `Exportar Excel (Págs. ${pageRangeInput || '...'})`}
          </span>
        </button>

        {/* Botão Secundário: CSV */}
        <button
          type="button"
          onClick={handleExportCsv}
          className="px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-sm font-medium flex items-center gap-1.5 transition cursor-pointer"
          title="Baixar em formato texto separado por ponto-e-vírgula (.csv)"
        >
          <Download className="w-3.5 h-3.5 text-slate-400" />
          <span>CSV</span>
        </button>
      </div>
    </div>
  );
}

interface PaginationBarProps {
  currentPage: number;
  totalItems: number;
  itemsPerPage?: number;
  onPageChange: (page: number) => void;
}

/**
 * Barra de Paginação padrão (10 linhas por página)
 */
export const PaginationBar: React.FC<PaginationBarProps> = ({
  currentPage,
  totalItems,
  itemsPerPage = ITEMS_PER_PAGE,
  onPageChange,
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startItem = totalItems === 0 ? 0 : (safePage - 1) * itemsPerPage + 1;
  const endItem = Math.min(safePage * itemsPerPage, totalItems);

  if (totalItems === 0) return null;

  // Gera lista de botões de página
  const pages: number[] = [];
  const startPage = Math.max(1, safePage - 2);
  const endPage = Math.min(totalPages, startPage + 4);
  for (let p = startPage; p <= endPage; p += 1) {
    pages.push(p);
  }

  return (
    <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4 text-sm">
      <div className="text-slate-300">
        Mostrando <strong className="text-white">{startItem}</strong> a{' '}
        <strong className="text-white">{endItem}</strong> de{' '}
        <strong className="text-white">{totalItems}</strong> registro(s) •{' '}
        <span className="text-indigo-300 font-semibold">
          Página {safePage} de {totalPages}
        </span>{' '}
        <span className="text-slate-400">(máx. {itemsPerPage} por página)</span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 disabled:opacity-40 border border-slate-800 text-slate-200 font-medium flex items-center gap-1 transition cursor-pointer disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Anterior</span>
        </button>

        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            className={`w-9 h-9 rounded-xl font-semibold transition cursor-pointer ${
              p === safePage
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/50'
                : 'bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300'
            }`}
          >
            {p}
          </button>
        ))}

        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 disabled:opacity-40 border border-slate-800 text-slate-200 font-medium flex items-center gap-1 transition cursor-pointer disabled:cursor-not-allowed"
        >
          <span>Próxima</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

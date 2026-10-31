/**
 * Configuração de cores e estilos de operações de estoque do ERP
 * Conforme diretrizes:
 * - Vendas (SALE_OUT): sempre VERDE (emerald)
 * - Estoque Inicial (INITIAL_BALANCE): BRANCO / Neutro (slate)
 * - Chegada de Fornecedor (PURCHASE_IN): Índigo / Azul
 * - Devolução de Cliente (RETURN_IN): Roxo / Violeta
 * - Entrada Manual / Ajuste (ADJUSTMENT_IN): Ciano / Sky
 * - Saída por Defeito / Perda (ADJUSTMENT_OUT): VERMELHO (rose) - única operação de estoque negativa
 */

export interface MovementBadgeInfo {
  badgeStyle: string;
  qtyColor: string;
  qtyPrefix: '+' | '-' | '';
  qtyText: string;
  label: string;
  iconType: 'sale' | 'initial' | 'purchase' | 'return' | 'adjust_in' | 'defect_out';
}

export const movementTypeLabel: Record<string, string> = {
  INITIAL_BALANCE: 'Estoque Inicial',
  PURCHASE_IN: 'Entrada de Fornecedor',
  SALE_OUT: 'Venda Concluída',
  RETURN_IN: 'Devolução de Cliente',
  ADJUSTMENT_IN: 'Entrada por Ajuste',
  ADJUSTMENT_OUT: 'Saída por Perda/Defeito',
};

export function getMovementBadge(
  movementType: string,
  quantity?: number
): MovementBadgeInfo {
  switch (movementType) {
    case 'SALE_OUT':
      // Venda Concluída: SEMPRE VERDE
      return {
        badgeStyle:
          'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold',
        qtyColor: 'text-emerald-400 font-bold',
        qtyPrefix: '-',
        qtyText: quantity !== undefined ? `-${quantity}` : '',
        label: 'Venda Concluída',
        iconType: 'sale',
      };

    case 'INITIAL_BALANCE':
      // Estoque Inicial: BRANCO / NEUTRO
      return {
        badgeStyle:
          'bg-slate-800 text-white border border-slate-700 font-semibold',
        qtyColor: 'text-white font-bold',
        qtyPrefix: '+',
        qtyText: quantity !== undefined ? `+${quantity}` : '',
        label: 'Estoque Inicial',
        iconType: 'initial',
      };

    case 'PURCHASE_IN':
      // Chegada de Fornecedor: Azul Índigo
      return {
        badgeStyle:
          'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-semibold',
        qtyColor: 'text-indigo-400 font-bold',
        qtyPrefix: '+',
        qtyText: quantity !== undefined ? `+${quantity}` : '',
        label: 'Entrada de Fornecedor',
        iconType: 'purchase',
      };

    case 'RETURN_IN':
      // Devolução de Cliente: Roxo / Violeta
      return {
        badgeStyle:
          'bg-purple-500/15 text-purple-300 border border-purple-500/30 font-semibold',
        qtyColor: 'text-purple-400 font-bold',
        qtyPrefix: '+',
        qtyText: quantity !== undefined ? `+${quantity}` : '',
        label: 'Devolução de Cliente',
        iconType: 'return',
      };

    case 'ADJUSTMENT_IN':
      // Entrada por Ajuste / Inventário: Ciano / Sky
      return {
        badgeStyle:
          'bg-sky-500/15 text-sky-300 border border-sky-500/30 font-semibold',
        qtyColor: 'text-sky-400 font-bold',
        qtyPrefix: '+',
        qtyText: quantity !== undefined ? `+${quantity}` : '',
        label: 'Entrada por Ajuste',
        iconType: 'adjust_in',
      };

    case 'ADJUSTMENT_OUT':
      // Baixa por Defeito / Perda: ÚNICA OPERAÇÃO VERMELHA
      return {
        badgeStyle:
          'bg-rose-500/15 text-rose-300 border border-rose-500/30 font-semibold',
        qtyColor: 'text-rose-400 font-bold',
        qtyPrefix: '-',
        qtyText: quantity !== undefined ? `-${quantity}` : '',
        label: 'Saída por Perda/Defeito',
        iconType: 'defect_out',
      };

    default:
      return {
        badgeStyle:
          'bg-slate-800 text-slate-300 border border-slate-700 font-medium',
        qtyColor: 'text-slate-300',
        qtyPrefix: '',
        qtyText: quantity !== undefined ? `${quantity}` : '',
        label: movementType,
        iconType: 'adjust_in',
      };
  }
}


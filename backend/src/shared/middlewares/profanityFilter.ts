import { Request, Response, NextFunction } from 'express';
import filter from 'leo-profanity';

/**
 * Dicionário abrangente de termos impróprios em Português (PT-BR)
 */
const PT_BR_PROFANITY_WORDS = [
  'arrombado', 'arrombada', 'babaca', 'babaquice', 'bacanal', 'bicha',
  'biscate', 'bobo', 'bosta', 'boquete', 'boqueteiro', 'boqueteira',
  'buceta', 'bucetao', 'bucetinha', 'burro', 'burra', 'cadela',
  'cagado', 'cagada', 'cagao', 'caguei', 'canalha', 'caralho',
  'cassete', 'chato', 'chata', 'chifrudo', 'chifruda', 'chota',
  'chupada', 'chupador', 'chupadeira', 'clitoris', 'cocaina', 'coco',
  'corno', 'corna', 'cornudo', 'cretino', 'cretina', 'cu', 'cuzinho',
  'cuzudo', 'cuzuda', 'cuzao', 'desgraca', 'desgracado', 'desgracada',
  'droga', 'escroto', 'escrota', 'estupido', 'estupida', 'estupro',
  'estuprador', 'fecal', 'fedor', 'fedorento', 'fedorenta', 'filho da puta',
  'foda', 'foda-se', 'fodasse', 'fodao', 'foder', 'fodido', 'fodida',
  'fofoqueiro', 'fofoqueira', 'fudendo', 'fuder', 'fudido', 'fudida',
  'galinha', 'gaiato', 'gaiata', 'gonorria', 'idiota', 'imbecil',
  'inferno', 'isquemia', 'ladrao', 'ladra', 'ladravaz', 'lazarento',
  'lazarenta', 'leproso', 'leprosa', 'lixo', 'maconha', 'maconheiro',
  'maconheira', 'maluco', 'maluca', 'masturba', 'masturbacao', 'merda',
  'merdao', 'merdinha', 'mijo', 'mijada', 'mocorongo', 'mocoronga',
  'moleque', 'mula', 'nazista', 'nazismo', 'negro safado', 'orgia',
  'otario', 'otaria', 'palhaco', 'palhaca', 'panaca', 'paspalho',
  'paspalha', 'pau', 'pauzao', 'pedofilo', 'pedofilia', 'peido',
  'peituda', 'pelada', 'pelado', 'penis', 'pentelho', 'perereca',
  'pica', 'picao', 'pinto', 'pintao', 'piranha', 'piroca', 'pirocudo',
  'piss', 'pivete', 'porco', 'porca', 'porno', 'pornografia', 'pornografico',
  'porra', 'prostituta', 'prostituto', 'punheta', 'punheteiro', 'puta',
  'putaria', 'putedo', 'putinha', 'puto', 'puxa-saco', 'quenga',
  'rabao', 'rabo', 'ranhoso', 'ranhosa', 'retardado', 'retardada',
  'safado', 'safada', 'sapatona', 'siririca', 'sifilis', 'tarado',
  'tarada', 'tesao', 'testiculo', 'transa', 'transar', 'trocha',
  'trouxa', 'vaca', 'vadiagem', 'vadio', 'vadia', 'vagabundo',
  'vagabunda', 'vagina', 'veado', 'viado', 'viadagem', 'xana',
  'xaninha', 'xereca', 'xexeca', 'xoxota'
];


// Dicionário e expressões compilados uma única vez por processo.
const dictionary = [...filter.getDictionary('en'), ...PT_BR_PROFANITY_WORDS];
export function normalizeLeetspeak(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/@/g, 'a').replace(/3/g, 'e')
    .replace(/[1!|]/g, 'i').replace(/0/g, 'o').replace(/[$5]/g, 's');
}
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const blockedWords = Array.from(new Set(dictionary.map(normalizeLeetspeak)));
const wordPattern = new RegExp(`\\b(?:${blockedWords.map(word =>
  word.split(/\s+/).map(escapeRegex).join('\\s+')
).join('|')})\\b`, 'i');

export function hasProfanity(value: unknown): boolean {
  if (typeof value !== 'string' || /^(?:data:|blob:|https?:\/\/)\S+$/i.test(value.trim())) return false;
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  // Pontuação no fim da palavra não deve virar leetspeak e ocultar uma ocorrência.
  return wordPattern.test(normalized) || wordPattern.test(normalizeLeetspeak(normalized));
}

/** Somente campos de texto visíveis escolhidos pela rota são moderados. */
export function profanityFilter(...fields: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();
    for (const field of fields) {
      if (hasProfanity(req.body?.[field])) {
        res.status(422).json({
          status: 'error', code: 'PROFANITY_DETECTED',
          message: 'Este campo contém termos não permitidos na demonstração.',
          details: { [field]: ['Revise o texto deste campo.'] }
        });
        return;
      }
    }
    next();
  };
}

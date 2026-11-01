/**
 * Utilitário de Moderação de Imagens Client-Side (Executado exclusivamente no navegador)
 * Utiliza @tensorflow/tfjs e nsfwjs com Lazy Loading dinâmico.
 * O modelo é mantido em cache (singleton) para não re-baixar em validações futuras.
 */

type NSFWModel = import('nsfwjs').NSFWJS;

let cachedModel: NSFWModel | null = null;
let modelLoadingPromise: Promise<NSFWModel> | null = null;

/**
 * Carrega dinamicamente o modelo NSFWJS e TensorFlow via importação sob demanda (Lazy Loading)
 */
export async function getNSFWModel(): Promise<NSFWModel> {
  if (cachedModel) {
    return cachedModel;
  }

  if (modelLoadingPromise) {
    return modelLoadingPromise;
  }

  modelLoadingPromise = (async () => {
    try {
      await import('@tensorflow/tfjs');
      const nsfwjs = await import('nsfwjs');
      // Carrega o modelo MobileNetV2 padrão do nsfwjs
      cachedModel = await nsfwjs.load();
      return cachedModel;
    } finally {
      modelLoadingPromise = null;
    }
  })();

  return modelLoadingPromise;
}

export interface ModerationResult {
  isSafe: boolean;
  reason?: string;
  details?: {
    porn: number;
    hentai: number;
    sexy: number;
    sum: number;
  };
}

/**
 * Valida se um arquivo de imagem (File) ou Data URL contém conteúdo adulto/impróprio.
 * Regra para vestuário: Porn/Hentai > 60% ou Sexy > 85%, individualmente.
 */
export async function moderateImage(
  imageSource: File | string
): Promise<ModerationResult> {
  let objectUrl: string | null = null;

  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    if (imageSource instanceof File) {
      objectUrl = URL.createObjectURL(imageSource);
      img.src = objectUrl;
    } else {
      img.src = imageSource;
    }

    // Aguarda o elemento Image decodificar em memória
    await new Promise<void>((resolve, reject) => {
      if (img.complete && img.naturalWidth !== 0) {
        resolve();
        return;
      }
      img.onload = () => resolve();
      img.onerror = () =>
        reject(
          new Error(
            'Não foi possível decodificar a imagem para moderação. Verifique se o arquivo está corrompido.'
          )
        );
    });

    const model = await getNSFWModel();
    const predictions: Array<{ className: string; probability: number }> =
      await model.classify(img);

    const porn =
      predictions.find((p) => p.className.toLowerCase() === 'porn')
        ?.probability ?? 0;
    const hentai =
      predictions.find((p) => p.className.toLowerCase() === 'hentai')
        ?.probability ?? 0;
    const sexy =
      predictions.find((p) => p.className.toLowerCase() === 'sexy')
        ?.probability ?? 0;

    if (predictions.length !== 5 || predictions.some(p => !Number.isFinite(p.probability) || p.probability < 0 || p.probability > 1) || !['Porn', 'Hentai', 'Sexy'].every(name => predictions.some(p => p.className === name))) {
      throw new Error('Resultado de moderação inválido. Tente novamente.');
    }
    const sum = porn + hentai + sexy;

    // Não somar categorias: roupas podem elevar Sexy sem nudez.
    if (porn > 0.6 || hentai > 0.6 || sexy > 0.85) {
      return {
        isSafe: false,
        reason:
          'A imagem foi bloqueada pela moderação de segurança por conter conteúdo inadequado para o sistema de demonstração.',
        details: { porn, hentai, sexy, sum },
      };
    }

    return {
      isSafe: true,
      details: { porn, hentai, sexy, sum },
    };
  } catch (err) {
    // Se ocorrer erro inesperado na moderação (ex: falha de decodificação), loga e lança para o caller tratar
    console.warn('Aviso na moderação de imagem:', err);
    throw err;
  } finally {
    // Libera a URL do objeto da memória imediatamente após a análise
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}


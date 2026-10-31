import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { env } from '../../config/env';
import { AppError } from '../errors/AppError';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

export const PRESET_GALLERY_IMAGES = [
  { id: 'tshirt-oversized', name: 'Camiseta Oversized', url: '/presets/tshirt-oversized.svg' },
  { id: 'hoodie-cyber', name: 'Moletom Canguru', url: '/presets/hoodie-cyber.svg' },
  { id: 'jacket-windbreaker', name: 'Jaqueta Corta-Vento', url: '/presets/jacket-windbreaker.svg' },
  { id: 'pants-cargo', name: 'Calça Cargo Street', url: '/presets/pants-cargo.svg' },
  { id: 'cap-snapback', name: 'Boné Streetwear', url: '/presets/cap-snapback.svg' },
  { id: 'sneaker-urban', name: 'Tênis Urban Low', url: '/presets/sneaker-urban.svg' },
];

/**
 * Verifica os Magic Bytes reais do buffer binário para impedir upload de scripts maliciosos
 */
function detectSafeImageExtension(buffer: Buffer): 'webp' | 'png' | 'jpg' | null {
  if (buffer.length < 12) return null;

  // WebP: "RIFF" (0..3) + "WEBP" (8..11)
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'png';
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }

  return null;
}

/**
 * Processa a imagem enviada (Preset da Galeria ou Base64 comprimido em WebP/PNG/JPG)
 */
export async function processProductImage(
  imageInput: string | null | undefined,
  tenantId: string
): Promise<{ imageUrl: string | null; isCustomUpload: boolean }> {
  if (!imageInput || imageInput.trim() === '') {
    return { imageUrl: '/presets/tshirt-oversized.svg', isCustomUpload: false };
  }

  const trimmed = imageInput.trim();

  // 1. Se for uma imagem da galeria pré-definida ou já salva em /uploads/
  if (trimmed.startsWith('/presets/')) {
    const isAllowedPreset = PRESET_GALLERY_IMAGES.some((p) => p.url === trimmed);
    if (!isAllowedPreset) {
      throw new AppError('Imagem da galeria inválida.', 400, 'INVALID_PRESET_IMAGE');
    }
    return { imageUrl: trimmed, isCustomUpload: false };
  }

  if (trimmed.startsWith('/uploads/')) {
    return { imageUrl: trimmed, isCustomUpload: true };
  }

  // 2. Se for um upload Base64 (Data URL)
  const matches = /^data:image\/(webp|png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/.exec(trimmed);
  if (!matches) {
    throw new AppError(
      'Formato de imagem inválido. Envie WebP, PNG ou JPEG válido.',
      400,
      'INVALID_IMAGE_FORMAT'
    );
  }

  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, 'base64');

  const maxBytes = Math.min(env.MAX_UPLOAD_SIZE_KB * 1024, 3 * 1024 * 1024);
  if (buffer.length > maxBytes) {
    throw new AppError(
      'A imagem excede o limite máximo permitido de 3 MB.',
      413,
      'IMAGE_TOO_LARGE'
    );
  }

  const realExt = detectSafeImageExtension(buffer);
  if (!realExt) {
    throw new AppError(
      'Assinatura binária do arquivo inválida (Magic Bytes não correspondem a uma imagem segura).',
      400,
      'INVALID_MAGIC_BYTES'
    );
  }

  await fs.mkdir(UPLOADS_DIR, { recursive: true });

  const shortTenant = tenantId.slice(0, 8);
  const fileName = `prod_${shortTenant}_${crypto.randomUUID()}.${realExt}`;
  const fullPath = path.resolve(UPLOADS_DIR, fileName);

  await fs.writeFile(fullPath, buffer);

  return {
    imageUrl: `/uploads/${fileName}`,
    isCustomUpload: true,
  };
}

export async function processStoreLogo(
  logoInput: string | null | undefined,
  tenantId: string
): Promise<string | null> {
  if (!logoInput || logoInput.trim() === '') {
    return null;
  }

  const trimmed = logoInput.trim();
  if (trimmed.startsWith('/uploads/') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  const processed = await processProductImage(trimmed, tenantId);
  return processed.imageUrl;
}

export async function removeCustomUploadIfExists(imageUrl: string | null | undefined): Promise<void> {
  if (!imageUrl || !imageUrl.startsWith('/uploads/')) return;
  const fileName = path.basename(imageUrl);
  const fullPath = path.resolve(UPLOADS_DIR, fileName);
  if (!fullPath.startsWith(UPLOADS_DIR)) return;

  try {
    await fs.unlink(fullPath);
  } catch {
    // Ignora caso já tenha sido removido
  }
}


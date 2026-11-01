import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { PoolClient } from 'pg';
import { query, withTenantTransaction } from '../../config/database';
import { env } from '../../config/env';
import { AppError } from '../errors/AppError';
import { logger } from './logger';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
export const PRESET_GALLERY_IMAGES = [
  { id: 'tshirt-oversized', name: 'Camiseta Oversized', url: '/presets/tshirt-oversized.svg' },
  { id: 'hoodie-cyber', name: 'Moletom Canguru', url: '/presets/hoodie-cyber.svg' },
  { id: 'jacket-windbreaker', name: 'Jaqueta Corta-Vento', url: '/presets/jacket-windbreaker.svg' },
  { id: 'pants-cargo', name: 'Calça Cargo Street', url: '/presets/pants-cargo.svg' },
  { id: 'cap-snapback', name: 'Boné Streetwear', url: '/presets/cap-snapback.svg' },
  { id: 'sneaker-urban', name: 'Tênis Urban Low', url: '/presets/sneaker-urban.svg' },
];


export interface OwnedUpload { imageUrl: string; tenantId: string }
export interface ProcessedImage {
  imageUrl: string | null;
  isCustomUpload: boolean;
  createdUpload: OwnedUpload | null;
}

function validUploadName(imageUrl: string, tenantId: string): boolean {
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  // Prefixos antigos só são aceitos com prova de referência no banco.
  return new RegExp(`^/uploads/prod_(?:${tenantId}|${tenantId.slice(0, 8)})_${uuid}\\.(?:webp|png|jpg)$`, 'i').test(imageUrl);
}

export async function getOwnedUpload(imageUrl: string | null | undefined, tenantId: string, client?: PoolClient): Promise<OwnedUpload | null> {
  if (!imageUrl?.startsWith('/uploads/')) return null;
  if (!validUploadName(imageUrl, tenantId)) throw new AppError('Referência de upload inválida.', 400, 'INVALID_UPLOAD_REFERENCE');
  const sql = `SELECT 1 FROM products WHERE tenant_id = $1 AND image_url = $2
    UNION ALL SELECT 1 FROM tenants WHERE id = $1 AND logo_url = $2 LIMIT 1`;
  const result = client ? await client.query(sql, [tenantId, imageUrl]) : await query(sql, [tenantId, imageUrl]);
  if (!result.rowCount) throw new AppError('A imagem não pertence a esta loja.', 403, 'UPLOAD_NOT_OWNED');
  return { imageUrl, tenantId };
}

export function detectSafeImageExtension(buffer: Buffer): 'webp' | 'png' | 'jpg' | null {
  if (buffer.length < 12) return null;
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'
    && buffer.readUInt32LE(4) === buffer.length - 8 && buffer.length >= 20
    && ['VP8 ', 'VP8L', 'VP8X'].includes(buffer.toString('ascii', 12, 16))) return 'webp';
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    && buffer.length >= 33 && buffer.toString('ascii', 12, 16) === 'IHDR') return 'png';
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
    && buffer[buffer.length - 2] === 255 && buffer[buffer.length - 1] === 217) return 'jpg';
  return null;
}

export async function processProductImage(imageInput: string | null | undefined, tenantId: string, client?: PoolClient): Promise<ProcessedImage> {
  const trimmed = imageInput?.trim();
  if (!trimmed) return { imageUrl: '/presets/tshirt-oversized.svg', isCustomUpload: false, createdUpload: null };
  if (PRESET_GALLERY_IMAGES.some(p => p.url === trimmed)) return { imageUrl: trimmed, isCustomUpload: false, createdUpload: null };
  if (trimmed.startsWith('/uploads/')) {
    await getOwnedUpload(trimmed, tenantId, client);
    return { imageUrl: trimmed, isCustomUpload: true, createdUpload: null };
  }
  const matches = /^data:image\/(webp|png|jpeg|jpg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(trimmed);
  if (!matches) throw new AppError('Envie uma imagem JPEG, PNG ou WebP válida.', 400, 'INVALID_IMAGE_FORMAT');
  const maxBytes = Math.min(env.MAX_UPLOAD_SIZE_KB * 1024, 2 * 1024 * 1024);
  if (matches[2].length > 4 * Math.ceil(maxBytes / 3)) throw new AppError('A imagem excede 2 MB.', 413, 'IMAGE_TOO_LARGE');
  const buffer = Buffer.from(matches[2], 'base64');
  if (buffer.toString('base64') !== matches[2]) throw new AppError('Base64 inválido.', 400, 'INVALID_IMAGE_FORMAT');
  if (buffer.length > maxBytes) throw new AppError('A imagem excede 2 MB.', 413, 'IMAGE_TOO_LARGE');
  const realExt = detectSafeImageExtension(buffer);
  const declaredExt = matches[1] === 'jpeg' ? 'jpg' : matches[1];
  if (!realExt || realExt !== declaredExt) throw new AppError('Assinatura e MIME da imagem não correspondem.', 400, 'INVALID_MAGIC_BYTES');
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) throw new AppError('Loja inválida.', 400, 'INVALID_TENANT');
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  const fileName = `prod_${tenantId}_${crypto.randomUUID()}.${realExt}`;
  await fs.writeFile(path.join(UPLOADS_DIR, fileName), buffer, { flag: 'wx' });
  const imageUrl = `/uploads/${fileName}`;
  return { imageUrl, isCustomUpload: true, createdUpload: { imageUrl, tenantId } };
}

export async function processStoreLogo(logoInput: string | null | undefined, tenantId: string, client?: PoolClient): Promise<ProcessedImage> {
  if (!logoInput?.trim()) return { imageUrl: null, isCustomUpload: false, createdUpload: null };
  return processProductImage(logoInput, tenantId, client);
}

/** Recebe prova obtida antes da persistência; nunca apaga arquivos ainda referenciados. */
export async function removeCustomUploadIfExists(upload: OwnedUpload | null | undefined): Promise<void> {
  if (!upload || !validUploadName(upload.imageUrl, upload.tenantId)) return;
  try {
    await withTenantTransaction(upload.tenantId, async client => {
      const refs = await client.query(`SELECT 1 FROM products WHERE image_url = $1
        UNION ALL SELECT 1 FROM tenants WHERE logo_url = $1 LIMIT 1`, [upload.imageUrl]);
      if (refs.rowCount) return;
      try { await fs.unlink(path.join(UPLOADS_DIR, path.basename(upload.imageUrl))); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    });
  } catch (error) {
    logger.error('Falha ao limpar upload sem referência', {
      imageUrl: upload.imageUrl,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

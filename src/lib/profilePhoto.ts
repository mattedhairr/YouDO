import { supabase } from './supabase';

/**
 * Your own profile photo (supabase/profile_photos.sql): cropped to a square on
 * the phone, shrunk to PHOTO_SIZE and uploaded to avatars/<your id>/<time>.
 */
export const PHOTO_SIZE = 320;
export const MAX_ZOOM = 4;

/** How the photo sits in the round frame: zoom (1 = the short side fills it) and the move, in frame pixels. */
export interface CropState {
  zoom: number;
  x: number;
  y: number;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** At zoom 1 the image's shorter side exactly fills the frame. */
export function baseScale(imageWidth: number, imageHeight: number, frame: number): number {
  return frame / Math.max(1, Math.min(imageWidth, imageHeight));
}

/** The frame is always covered: zoom stays in range and the photo can't be moved so far an edge shows. */
export function clampCrop(state: CropState, imageWidth: number, imageHeight: number, frame: number): CropState {
  const zoom = clamp(Number.isFinite(state.zoom) ? state.zoom : 1, 1, MAX_ZOOM);
  const scale = baseScale(imageWidth, imageHeight, frame) * zoom;
  const maxX = Math.max(0, (imageWidth * scale - frame) / 2);
  const maxY = Math.max(0, (imageHeight * scale - frame) / 2);
  return { zoom, x: clamp(state.x || 0, -maxX, maxX), y: clamp(state.y || 0, -maxY, maxY) };
}

/** The square of the original image that the frame shows. */
export function cropSource(state: CropState, imageWidth: number, imageHeight: number, frame: number) {
  const crop = clampCrop(state, imageWidth, imageHeight, frame);
  const scale = baseScale(imageWidth, imageHeight, frame) * crop.zoom;
  const size = frame / scale;
  const centerX = imageWidth / 2 - crop.x / scale;
  const centerY = imageHeight / 2 - crop.y / scale;
  return { sx: centerX - size / 2, sy: centerY - size / 2, size };
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/** Draws the chosen square at PHOTO_SIZE: WebP where the phone can make it, else JPEG. */
export async function renderPhoto(image: CanvasImageSource, source: { sx: number; sy: number; size: number }, size = PHOTO_SIZE): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This phone could not prepare the photo.');
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, source.sx, source.sy, source.size, source.size, 0, 0, size, size);
  const webp = await toBlob(canvas, 'image/webp', 0.82);
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await toBlob(canvas, 'image/jpeg', 0.86);
  if (!jpeg) throw new Error('This phone could not prepare the photo.');
  return jpeg;
}

/** The storage path of one of your photos from its public address, or null for anything else. */
export function photoPath(url: string | null | undefined, userId: string): string | null {
  const match = typeof url === 'string' ? url.match(/\/storage\/v1\/object\/public\/avatars\/([^?#]+)/) : null;
  return match && match[1].startsWith(`${userId}/`) ? decodeURIComponent(match[1]) : null;
}

/** Uploads the photo and returns its public address. Nothing is deleted here (see removeOldPhotos). */
export async function uploadProfilePhoto(userId: string, blob: Blob): Promise<string> {
  const extension = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/${Date.now()}.${extension}`;
  const bucket = supabase.storage.from('avatars');
  const { error } = await bucket.upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
  if (error) {
    throw new Error(/bucket not found/i.test(error.message) ? 'Photos need a server update first.' : 'Could not upload the photo. Check your connection and try again.');
  }
  return bucket.getPublicUrl(path).data.publicUrl;
}

/** After a save: deletes your other photos, keeping the one in use (if it is a photo). Best effort. */
export async function removeOldPhotos(userId: string, keepUrl?: string | null): Promise<void> {
  try {
    const keep = photoPath(keepUrl, userId);
    const bucket = supabase.storage.from('avatars');
    const { data } = await bucket.list(userId, { limit: 100 });
    const old = (data ?? []).map((file) => `${userId}/${file.name}`).filter((path) => path !== keep);
    if (old.length) await bucket.remove(old);
  } catch {
    /* Left for the next save. */
  }
}

import LZString from 'lz-string';

/**
 * LZString Base64 Compression & Chunking Utility for Supabase Auth Metadata.
 * Compresses JSON strings by ~80-90% to bypass API payload limits and splits into small 4.5KB chunks.
 */

export function compressBackup(jsonStr: string, chunkSize = 4500): { chunks: Record<string, string>; count: number } {
  try {
    const b64 = LZString.compressToBase64(jsonStr);
    if (!b64) return { chunks: {}, count: 0 };

    const count = Math.ceil(b64.length / chunkSize);
    const chunks: Record<string, string> = {
      youdo_c_count: String(count),
      youdo_c_len: String(jsonStr.length),
    };

    for (let i = 0; i < count; i++) {
      chunks[`youdo_c_${i}`] = b64.slice(i * chunkSize, (i + 1) * chunkSize);
    }
    return { chunks, count };
  } catch (err) {
    console.error('Compression failed:', err);
    return { chunks: {}, count: 0 };
  }
}

export function decompressBackup(metadata: Record<string, any>): string | null {
  try {
    const count = parseInt(metadata.youdo_c_count || '0', 10);
    if (!count || count <= 0) {
      // Legacy uncompressed fallback check
      if (metadata.youdo_cloud_backup) {
        return typeof metadata.youdo_cloud_backup === 'string'
          ? metadata.youdo_cloud_backup
          : JSON.stringify(metadata.youdo_cloud_backup);
      }
      return null;
    }

    let b64 = '';
    for (let i = 0; i < count; i++) {
      const chunk = metadata[`youdo_c_${i}`];
      if (!chunk) return null;
      b64 += chunk;
    }

    const jsonStr = LZString.decompressFromBase64(b64);
    return jsonStr || null;
  } catch (err) {
    console.error('Decompression failed:', err);
    return null;
  }
}

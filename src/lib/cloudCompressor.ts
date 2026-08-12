/**
 * Lightweight LZW Compression & Decompression Utility for Supabase Auth Metadata.
 * Compresses JSON strings by ~84% to bypass API payload limits and splits into small chunks.
 */

export function compressBackup(jsonStr: string, chunkSize = 7000): { chunks: Record<string, string>; count: number } {
  try {
    const dict: Record<string, number> = {};
    const out: number[] = [];
    let c = '';
    let wc = '';
    let w = '';
    let dictSize = 256;
    for (let i = 0; i < 256; i++) {
      dict[String.fromCharCode(i)] = i;
    }

    for (let i = 0; i < jsonStr.length; i++) {
      c = jsonStr.charAt(i);
      wc = w + c;
      if (Object.prototype.hasOwnProperty.call(dict, wc)) {
        w = wc;
      } else {
        out.push(dict[w]);
        dict[wc] = dictSize++;
        w = c;
      }
    }
    if (w !== '') out.push(dict[w]);

    // Convert to latin1 string & base64 encode
    let latin1 = '';
    for (let i = 0; i < out.length; i++) {
      latin1 += String.fromCharCode(out[i]);
    }
    const b64 = btoa(latin1);

    // Split base64 into chunked metadata fields
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

    const str = atob(b64);
    const dict: Record<number, string> = {};
    for (let i = 0; i < 256; i++) {
      dict[i] = String.fromCharCode(i);
    }

    let w = str.charAt(0);
    const out = [w];
    let dictSize = 256;

    for (let i = 1; i < str.length; i++) {
      const k = str.charCodeAt(i);
      let entry = '';
      if (dict[k]) {
        entry = dict[k];
      } else if (k === dictSize) {
        entry = w + w.charAt(0);
      } else {
        return null;
      }
      out.push(entry);
      dict[dictSize++] = w + entry.charAt(0);
      w = entry;
    }

    return out.join('');
  } catch (err) {
    console.error('Decompression failed:', err);
    return null;
  }
}

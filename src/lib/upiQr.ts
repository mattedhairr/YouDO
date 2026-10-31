import qrcode from 'qrcode-generator';

export interface QrDrawing {
  viewBox: string;
  path: string;
}

/**
 * A QR code (error correction M) as one SVG path: a line through each run of
 * dark modules in a row. Draw with stroke="currentColor" and strokeWidth={1};
 * the white padding around it is the quiet zone scanners need.
 */
export function qrDrawing(text: string): QrDrawing {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  let path = '';
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; ) {
      if (!qr.isDark(row, col)) { col++; continue; }
      let end = col;
      while (end < size && qr.isDark(row, end)) end++;
      path += `M${col} ${row + 0.5}h${end - col}`;
      col = end;
    }
  }
  return { viewBox: `0 0 ${size} ${size}`, path };
}

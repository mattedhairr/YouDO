import { describe, expect, it } from 'vitest';
import { qrDrawing } from './upiQr';

describe('qrDrawing', () => {
  const uri = 'upi://pay?pa=mattedhairr@axl&pn=YouDO&cu=INR';

  it('draws a square QR code with its corner markers', () => {
    const { viewBox, path } = qrDrawing(uri);
    const size = Number(viewBox.split(' ')[2]);
    expect(viewBox).toBe(`0 0 ${size} ${size}`);
    // A QR code is 21 modules plus 4 per version.
    expect((size - 21) % 4).toBe(0);
    // The top-left finder pattern: a full 7-module line, and the same on the right.
    expect(path.startsWith('M0 0.5h7')).toBe(true);
    expect(path).toContain(`M${size - 7} 0.5h7`);
  });

  it('is the same for the same text and changes with the UPI ID', () => {
    expect(qrDrawing(uri)).toEqual(qrDrawing(uri));
    expect(qrDrawing('upi://pay?pa=study.fund@okaxis&pn=YouDO&cu=INR').path).not.toBe(qrDrawing(uri).path);
  });
});

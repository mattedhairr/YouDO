import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const svgPath = join(publicDir, 'icon.svg');
const svgBuffer = readFileSync(svgPath);

async function generate() {
  // Standard "any" icon — transparent background preserved
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(join(publicDir, 'icon-192.png'));
  console.log('✓ icon-192.png');

  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(join(publicDir, 'icon-512.png'));
  console.log('✓ icon-512.png');

  // Maskable icon — needs a solid "safe zone" background
  // Android crops the icon into a circle/squircle, so the background must be solid
  // We composite the icon on a solid dark background with padding
  const bgColor = { r: 11, g: 15, b: 23, alpha: 1 }; // #0B0F17

  // 512x512 maskable — icon occupies ~80% inner safe zone
  const iconPadded512 = await sharp(svgBuffer)
    .resize(Math.round(512 * 0.75), Math.round(512 * 0.75))
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: bgColor,
    },
  })
    .composite([{
      input: iconPadded512,
      gravity: 'center',
    }])
    .png()
    .toFile(join(publicDir, 'icon-512-maskable.png'));
  console.log('✓ icon-512-maskable.png');

  // 192x192 maskable
  const iconPadded192 = await sharp(svgBuffer)
    .resize(Math.round(192 * 0.75), Math.round(192 * 0.75))
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 192,
      height: 192,
      channels: 4,
      background: bgColor,
    },
  })
    .composite([{
      input: iconPadded192,
      gravity: 'center',
    }])
    .png()
    .toFile(join(publicDir, 'icon-192-maskable.png'));
  console.log('✓ icon-192-maskable.png');

  // apple-touch-icon — 180x180 on solid background (Safari/iOS)
  const iconPadded180 = await sharp(svgBuffer)
    .resize(Math.round(180 * 0.75), Math.round(180 * 0.75))
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 180,
      height: 180,
      channels: 4,
      background: bgColor,
    },
  })
    .composite([{
      input: iconPadded180,
      gravity: 'center',
    }])
    .png()
    .toFile(join(publicDir, 'apple-touch-icon.png'));
  console.log('✓ apple-touch-icon.png (180x180)');

  console.log('\nAll icons generated successfully!');
}

generate().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});

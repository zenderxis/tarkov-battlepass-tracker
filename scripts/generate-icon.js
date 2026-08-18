// Regenerates data-source/app_resources/black_div.ico from black_div.png.
//
// The .ico that shipped in this repo only had a single 30x32 layer — fine
// for the in-app window titlebar, but electron-builder refuses to build a
// Windows installer/exe with an icon that doesn't include at least a 256x256
// layer (Windows uses the bigger sizes for things like the "large icons"
// Explorer view and the installer wizard itself). This builds a proper
// multi-resolution .ico (16/24/32/48/64/128/256) from the source PNG.
//
// Usage: node scripts/generate-icon.js

const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default;

const SOURCE_PNG = path.join(__dirname, '..', 'data-source', 'app_resources', 'black_div.png');
const OUTPUT_ICO = path.join(__dirname, '..', 'data-source', 'app_resources', 'black_div.ico');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

async function main() {
  const meta = await sharp(SOURCE_PNG).metadata();
  // Source art isn't perfectly square (1214x1295) — center-crop to square
  // first so every generated size is a clean, undistorted resize rather
  // than a squashed non-uniform scale.
  const side = Math.min(meta.width, meta.height);
  const left = Math.round((meta.width - side) / 2);
  const top = Math.round((meta.height - side) / 2);

  const buffers = await Promise.all(
    SIZES.map((size) =>
      sharp(SOURCE_PNG)
        .extract({ left, top, width: side, height: side })
        .resize(size, size)
        .png()
        .toBuffer()
    )
  );

  const ico = await pngToIco(buffers);
  fs.writeFileSync(OUTPUT_ICO, ico);
  console.log(`Wrote ${OUTPUT_ICO} (${SIZES.join('/')})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

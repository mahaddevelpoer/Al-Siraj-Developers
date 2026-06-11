// Create a valid 256x256 ICO file with a "Z" logo
const fs = require('fs');
const path = require('path');

function createIco256() {
  const size = 256;
  const bitsPerPixel = 24;
  const rowSize = Math.floor((bitsPerPixel * size + 31) / 32) * 4;
  const pixelDataSize = rowSize * size;
  const bmpInfoHeaderSize = 40;

  const pixelData = Buffer.alloc(pixelDataSize, 0);

  // Colors
  const bg1 = { r: 0x0a, g: 0x0e, b: 0x1a }; // dark navy
  const bg2 = { r: 0x1a, g: 0x2a, b: 0x5a }; // mid blue
  const fg  = { r: 0xff, g: 0xff, b: 0xff }; // white
  const acc = { r: 0x60, g: 0xa8, b: 0x00 }; // gold-green

  const setPixel = (x, y, col) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const bmpY = size - 1 - y;
    const off = bmpY * rowSize + x * 3;
    pixelData[off]     = col.b;
    pixelData[off + 1] = col.g;
    pixelData[off + 2] = col.r;
  };

  // Gradient background
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (size * 2);
      const r = Math.round(bg1.r + (bg2.r - bg1.r) * t);
      const g = Math.round(bg1.g + (bg2.g - bg1.g) * t);
      const b = Math.round(bg1.b + (bg2.b - bg1.b) * t);
      setPixel(x, y, { r, g, b });
    }
  }

  // Draw thick "Z" scaled for 256x256
  // Top bar: y=50-80, x=50-206
  for (let x = 50; x <= 206; x++) for (let y = 50; y <= 80; y++) setPixel(x, y, fg);
  // Bottom bar: y=176-206, x=50-206
  for (let x = 50; x <= 206; x++) for (let y = 176; y <= 206; y++) setPixel(x, y, fg);
  // Diagonal stroke (anti-aliased thick)
  for (let i = 0; i <= 96; i++) {
    const cx = Math.round(206 - (i * 156) / 96);
    const cy = 80 + i;
    for (let dx = -16; dx <= 16; dx++) {
      for (let dy = -4; dy <= 4; dy++) {
        setPixel(cx + dx, cy + dy, fg);
      }
    }
  }
  // Accent dot top-right
  for (let dx = -10; dx <= 10; dx++) for (let dy = -10; dy <= 10; dy++) {
    if (dx*dx + dy*dy <= 100) setPixel(206 + dx, 50 + dy, acc);
  }

  // Build ICO
  const bmpHeader = Buffer.alloc(bmpInfoHeaderSize, 0);
  bmpHeader.writeUInt32LE(bmpInfoHeaderSize, 0);
  bmpHeader.writeInt32LE(size, 4);
  bmpHeader.writeInt32LE(size * 2, 8);
  bmpHeader.writeUInt16LE(1, 12);
  bmpHeader.writeUInt16LE(bitsPerPixel, 14);
  bmpHeader.writeUInt32LE(0, 16);
  bmpHeader.writeUInt32LE(pixelDataSize, 20);

  const andMaskRowSize = Math.floor((size + 31) / 32) * 4;
  const andMask = Buffer.alloc(andMaskRowSize * size, 0);
  const totalImageSize = bmpInfoHeaderSize + pixelDataSize + andMask.length;

  const iconDir = Buffer.alloc(6);
  iconDir.writeUInt16LE(0, 0);
  iconDir.writeUInt16LE(1, 2);
  iconDir.writeUInt16LE(1, 4);

  const iconEntry = Buffer.alloc(16);
  iconEntry.writeUInt8(0, 0);  // 0 means 256
  iconEntry.writeUInt8(0, 1);
  iconEntry.writeUInt8(0, 2);
  iconEntry.writeUInt8(0, 3);
  iconEntry.writeUInt16LE(1, 4);
  iconEntry.writeUInt16LE(bitsPerPixel, 6);
  iconEntry.writeUInt32LE(totalImageSize, 8);
  iconEntry.writeUInt32LE(22, 12); // 6 + 16

  const icoFile = Buffer.concat([iconDir, iconEntry, bmpHeader, pixelData, andMask]);
  const outPath = path.join(__dirname, 'public', 'logo.ico');
  fs.writeFileSync(outPath, icoFile);
  console.log('✅ 256x256 logo.ico created! Size:', icoFile.length, 'bytes');
}

createIco256();

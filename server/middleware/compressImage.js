import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// Compress image after upload
export async function compressImage(filePath, quality = 70, maxWidth = 1280) {
  const ext = path.extname(filePath).toLowerCase();
  const outPath = filePath.replace(/(\.[a-zA-Z]+)$/, '_compressed$1');
  try {
    let image = sharp(filePath);
    const metadata = await image.metadata();
    if (metadata.width > maxWidth) {
      image = image.resize({ width: maxWidth });
    }
    await image
      .jpeg({ quality })
      .toFile(outPath);
    // Optionally replace original
    fs.unlinkSync(filePath);
    fs.renameSync(outPath, filePath);
    return filePath;
  } catch (err) {
    console.error('Image compression failed:', err);
    return filePath;
  }
}

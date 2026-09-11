const sharp = require("sharp");
const fs = require("fs/promises");

const MAX_DIMENSION = 1600;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

async function normalizeImageBuffer(buffer) {
  const image = sharp(buffer, { failOn: "error" });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error("Uploaded file is not a valid image");

  const bytes = await image
    .rotate()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
  if (bytes.length > MAX_OUTPUT_BYTES) throw new Error("Normalized image is too large");
  return bytes;
}

/**
 * Validates that a file is actually a decodable raster image (not just
 * MIME-type-labeled as one) and re-encodes it to a normalized JPEG,
 * stripping EXIF/metadata and capping dimensions. This defends against a
 * malicious payload wearing an image content-type, and against embedded
 * metadata (e.g. GPS EXIF tags) leaking unintentionally.
 *
 * Throws if the buffer is not a valid image sharp can decode.
 */
async function reencodeImage(inputPath, outputPath) {
  const buffer = await fs.readFile(inputPath);
  const normalized = await normalizeImageBuffer(buffer);
  await fs.writeFile(outputPath, normalized);

  await fs.unlink(inputPath).catch(() => {});
  return outputPath;
}

module.exports = { reencodeImage, normalizeImageBuffer, MAX_OUTPUT_BYTES };

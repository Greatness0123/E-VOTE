const { test } = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { normalizeImageBuffer, MAX_OUTPUT_BYTES } = require("../src/services/upload.service");

test("normalizeImageBuffer produces bounded JPEG data", async () => {
  const input = await sharp({ create: { width: 20, height: 20, channels: 4, background: "red" } }).png().toBuffer();
  const output = await normalizeImageBuffer(input);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.ok(output.length <= MAX_OUTPUT_BYTES);
});

test("normalizeImageBuffer rejects non-image content", async () => {
  await assert.rejects(normalizeImageBuffer(Buffer.from("<script>alert(1)</script>")));
});

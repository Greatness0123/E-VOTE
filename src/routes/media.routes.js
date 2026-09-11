const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/:id", requireAuth, async (req, res) => {
  const asset = await prisma.mediaAsset.findUnique({ where: { id: req.params.id } });
  if (!asset) return res.status(404).json({ error: "Media not found" });
  res.set({
    "Content-Type": asset.contentType,
    "Content-Length": String(asset.byteLength),
    "Cache-Control": "private, max-age=86400, immutable",
    "X-Content-Type-Options": "nosniff",
  });
  res.send(Buffer.from(asset.bytes));
});

module.exports = router;

const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { logAction } = require("../services/audit.service");

const router = express.Router();

// Only these keys may be set — an explicit allowlist rather than free-form
// keys, so the settings surface stays predictable.
const ALLOWED_KEYS = new Set([
  "SITE_NAME",
  "SUPPORT_EMAIL",
  "ELECTORAL_OFFICE_CONTACT",
  "MAINTENANCE_MODE",
]);

router.use(requireAuth, requireRole("ADMIN", "ELECTION_OFFICER"));

router.get("/", async (req, res) => {
  const settings = await prisma.setting.findMany();
  res.json({ settings: Object.fromEntries(settings.map((s) => [s.key, s.value])) });
});

router.put("/:key", requireRole("ADMIN"), async (req, res) => {
  const { key } = req.params;
  const { value } = req.body || {};
  if (!ALLOWED_KEYS.has(key)) return res.status(400).json({ error: `Unknown setting key: ${key}` });
  if (typeof value !== "string") return res.status(400).json({ error: "value must be a string" });

  const setting = await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  await logAction({ actorId: req.user.id, action: "SETTING_UPDATED", entity: "Setting", entityId: key, metadata: { value } });
  res.json({ setting });
});

module.exports = router;

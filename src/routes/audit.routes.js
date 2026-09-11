const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth, requireRole("ADMIN", "ELECTION_OFFICER"));

router.get("/", async (req, res) => {
  const { action, actorId, entity, from, to, page = "1", pageSize = "25" } = req.query;

  const where = {
    ...(action && { action: { contains: action, mode: "insensitive" } }),
    ...(actorId && { actorId }),
    ...(entity && { entity }),
    ...((from || to) && {
      createdAt: {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      },
    }),
  };

  const take = Math.min(Number(pageSize) || 25, 100);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: { actor: { select: { fullName: true, matricNumber: true } } },
    }),
  ]);

  res.json({
    logs: logs.map((l) => ({
      id: l.id,
      action: l.action,
      entity: l.entity,
      entityId: l.entityId,
      metadata: l.metadata ? JSON.parse(l.metadata) : null,
      actor: l.actor ? `${l.actor.fullName} (${l.actor.matricNumber})` : "System",
      ipAddress: l.ipAddress,
      createdAt: l.createdAt,
    })),
    total,
    page: Number(page),
    pageSize: take,
  });
});

// Lightweight "security alerts" feed for the dashboard — recent failed
// logins and OTP failures, grouped by actor, over the last 24 hours.
router.get("/security-alerts", async (req, res) => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const failedLogins = await prisma.auditLog.findMany({
    where: { action: "LOGIN_FAILED", createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { actor: { select: { fullName: true, matricNumber: true } } },
  });

  const byActor = new Map();
  for (const log of failedLogins) {
    const key = log.actorId || "unknown";
    byActor.set(key, (byActor.get(key) || 0) + 1);
  }

  const alerts = Array.from(byActor.entries())
    .filter(([, count]) => count >= 3)
    .map(([actorId, count]) => {
      const log = failedLogins.find((l) => l.actorId === actorId);
      return {
        type: "REPEATED_FAILED_LOGIN",
        actor: log?.actor ? `${log.actor.fullName} (${log.actor.matricNumber})` : "Unknown",
        count,
        severity: count >= 5 ? "high" : "medium",
      };
    });

  res.json({ alerts, windowHours: 24 });
});

module.exports = router;

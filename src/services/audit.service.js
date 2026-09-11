const prisma = require("../lib/prisma");

async function logAction({ actorId, action, entity, entityId, metadata, ipAddress }) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actorId || null,
        action,
        entity: entity || null,
        entityId: entityId || null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        ipAddress: ipAddress || null,
      },
    });
  } catch (err) {
    // Audit logging must never crash the primary request path.
    console.error("audit-log-failed", action, err.message);
  }
}

module.exports = { logAction };

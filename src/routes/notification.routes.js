const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { studentId: req.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const unreadCount = notifications.filter((n) => !n.readAt).length;
  res.json({ notifications, unreadCount });
});

router.post("/:id/read", async (req, res) => {
  const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!notification || notification.studentId !== req.user.id) {
    return res.status(404).json({ error: "Notification not found" });
  }
  await prisma.notification.update({ where: { id: req.params.id }, data: { readAt: new Date() } });
  res.json({ ok: true });
});

router.post("/read-all", async (req, res) => {
  await prisma.notification.updateMany({
    where: { studentId: req.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ ok: true });
});

module.exports = router;

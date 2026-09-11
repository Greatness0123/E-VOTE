const prisma = require("../lib/prisma");

async function notifyStudent({ studentId, type, title, body, electionId }) {
  return prisma.notification.create({ data: { studentId, type, title, body, electionId } });
}

async function notifyElectionEligibility({ electionId, type, title, body }) {
  const eligible = await prisma.electionEligibility.findMany({ where: { electionId }, select: { studentId: true } });
  if (eligible.length === 0) return { count: 0 };
  await prisma.notification.createMany({
    data: eligible.map((e) => ({ studentId: e.studentId, type, title, body, electionId })),
  });
  return { count: eligible.length };
}

module.exports = { notifyStudent, notifyElectionEligibility };

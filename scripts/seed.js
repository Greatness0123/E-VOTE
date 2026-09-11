// Development/testing seed script — NOT run in production.
// Safe to delete entirely; the application works with an empty database.
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const argon2 = require("argon2");

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to run seed script in production.");
    process.exit(1);
  }

  const adminPassword = await argon2.hash("ChangeMe!2024", { type: argon2.argon2id });
  const admin = await prisma.student.upsert({
    where: { matricNumber: "ADMIN/0001" },
    update: {},
    create: {
      fullName: "Electoral Officer",
      matricNumber: "ADMIN/0001",
      email: "electoral.officer@example.edu",
      passwordHash: adminPassword,
      role: "ELECTION_OFFICER",
    },
  });

  const studentPassword = await argon2.hash("Passw0rd!23", { type: argon2.argon2id });
  const students = [];
  for (let i = 1; i <= 5; i++) {
    const s = await prisma.student.upsert({
      where: { matricNumber: `CSC/20/000${i}` },
      update: {},
      create: {
        fullName: `Sample Student ${i}`,
        matricNumber: `CSC/20/000${i}`,
        email: `student${i}@example.edu`,
        department: "Computer Science",
        level: "300",
        passwordHash: studentPassword,
        role: "STUDENT",
      },
    });
    students.push(s);
  }

  const election = await prisma.election.upsert({
    where: { id: "seed-election-2026" },
    update: {},
    create: {
      id: "seed-election-2026",
      title: "SUG General Election 2026",
      description: "Sample development election — safe to delete.",
      academicSession: "2025/2026",
      startDate: new Date(Date.now() - 60 * 60 * 1000),
      endDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: "ACTIVE",
      createdBy: admin.id,
    },
  });

  const president = await prisma.position.create({
    data: { electionId: election.id, title: "President", displayOrder: 1, required: true },
  });

  await prisma.candidate.createMany({
    data: [
      { electionId: election.id, positionId: president.id, fullName: "Candidate A", slogan: "Progress. Unity. Service.", displayOrder: 1 },
      { electionId: election.id, positionId: president.id, fullName: "Candidate B", slogan: "Students First.", displayOrder: 2 },
    ],
  });

  await prisma.electionEligibility.createMany({
    data: students.map((s) => ({ electionId: election.id, studentId: s.id })),
    skipDuplicates: true,
  });

  console.log("Seed complete.");
  console.log("Admin login: ADMIN/0001 / ChangeMe!2024");
  console.log("Student login: CSC/20/0001 / Passw0rd!23");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

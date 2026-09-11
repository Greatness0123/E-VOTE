// Lazily-created singleton: pure unit tests can import services without a
// generated Prisma client, while the first database operation initializes it.
let instance;

function getClient() {
  if (instance) return instance;
  if (globalThis.__sugVotePrisma) {
    instance = globalThis.__sugVotePrisma;
    return instance;
  }
  const { PrismaClient } = require("@prisma/client");
  instance = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  if (process.env.NODE_ENV !== "production") globalThis.__sugVotePrisma = instance;
  return instance;
}

module.exports = new Proxy({}, {
  get(_target, property) {
    const value = getClient()[property];
    return typeof value === "function" ? value.bind(getClient()) : value;
  },
});

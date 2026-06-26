const { PrismaClient } = require("@prisma/client");

// Single shared Prisma client. Connection is lazy: the server can boot and
// serve /health even before the database is reachable.
let prisma = null;

function getPrisma() {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

module.exports = { getPrisma };

// Optional seed: creates today's daily pattern. Run with `npm run seed`.
require("dotenv").config();
const { getPrisma } = require("../src/prisma");
const prisma = getPrisma();

async function main() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const seed = today.toISOString().slice(0, 10).replace(/-/g, "");
  await prisma.dailyPattern.upsert({
    where: { date: today },
    update: {},
    create: { date: today, seed },
  });
  console.log("Seeded daily pattern:", seed);
}

main().finally(() => process.exit(0));

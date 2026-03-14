require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL,
    },
  },
});

async function main() {
  console.log(`Polling database for completion via DIRECT_URL...`);
  while (true) {
    try {
      const latestRun = await prisma.socialScanRun.findFirst({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          errors: true,
          tickersScanned: true,
          scanDate: true,
          createdAt: true,
        },
      });

      if (latestRun.status !== "RUNNING") {
        console.log("Scan finished with status:", latestRun.status);
        console.log("Latest DB Run:", JSON.stringify(latestRun, null, 2));
        break;
      }
    } catch (err) {
      console.log("DB Connection error, retrying...", err.message);
    }

    // Wait for 5 seconds before checking again
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

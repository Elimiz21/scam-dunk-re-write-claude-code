import { PrismaClient } from '@prisma/client';
import { runSocialScanAndStore } from './src/lib/social-scan/orchestrate';

const prisma = new PrismaClient();

async function main() {
    console.log("Creating dummy scan run...");
    const scanRun = await prisma.socialScanRun.create({
        data: {
            scanDate: new Date(),
            status: "RUNNING",
            triggeredBy: "CLI_TEST",
        }
    });

    console.log("Running social scan...");
    const result = await runSocialScanAndStore({
        scanRunId: scanRun.id,
        triggeredBy: "CLI_TEST",
        manualTickers: [
            { ticker: "GME", name: "GameStop", riskScore: 100, riskLevel: "HIGH", signals: [] },
            { ticker: "AMC", name: "AMC Ent", riskScore: 100, riskLevel: "HIGH", signals: [] }
        ]
    });

    console.log("Result:", JSON.stringify(result, null, 2));

    const latestRuns = await prisma.socialScanRun.findMany({
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, status: true, errors: true, tickersScanned: true, scanDate: true }
    });

    console.log("Latest DB Run:", JSON.stringify(latestRuns, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());

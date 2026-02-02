/**
 * API to get team members (admin users) for author selection
 */

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";

export async function GET() {
    const session = await getAdminSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const teamMembers = await prisma.adminUser.findMany({
            where: { isActive: true },
            select: {
                id: true,
                name: true,
                email: true,
            },
            orderBy: { name: "asc" },
        });

        // Format for dropdown - use name if available, otherwise email prefix
        const members = teamMembers.map((member) => ({
            id: member.id,
            name: member.name || member.email.split("@")[0],
            email: member.email,
        }));

        // Add "Scam Dunk Team" as a default option
        const allMembers = [
            { id: "team", name: "Scam Dunk Team", email: "" },
            ...members,
        ];

        return NextResponse.json({
            members: allMembers,
            currentUserId: session.id,
            currentUserName: session.name || session.email.split("@")[0],
        });
    } catch (error) {
        console.error("Error fetching team members:", error);
        return NextResponse.json(
            { error: "Failed to fetch team members" },
            { status: 500 }
        );
    }
}

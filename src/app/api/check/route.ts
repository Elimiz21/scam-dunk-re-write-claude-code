import { NextRequest } from "next/server";

import { processCheckRequest } from "@/lib/check-scan";

// Allow up to 30 seconds for the full AI pipeline (Python backend + market data + narrative)
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  return processCheckRequest(request);
}

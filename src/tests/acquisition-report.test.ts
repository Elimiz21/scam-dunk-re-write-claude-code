import { buildAcquisitionBreakdown } from "@/lib/admin/acquisition-report";

describe("acquisition breakdown", () => {
  test("groups null legacy attribution separately and ranks known sources by signups", () => {
    expect(
      buildAcquisitionBreakdown([
        { source: "google", medium: "organic", campaign: null },
        { source: "wsj.com", medium: "referral", campaign: null },
        { source: "wsj.com", medium: "referral", campaign: null },
        { source: null, medium: null, campaign: null },
      ]),
    ).toEqual([
      { source: "wsj.com", medium: "referral", campaign: null, signUps: 2 },
      { source: "google", medium: "organic", campaign: null, signUps: 1 },
      { source: "Unattributed", medium: "—", campaign: null, signUps: 1 },
    ]);
  });
});

import {
  deserializeFirstTouchAttribution,
  parseFirstTouchAttribution,
  serializeFirstTouchAttribution,
} from "@/lib/first-touch-attribution";

describe("first-touch attribution", () => {
  test("prefers UTM data and retains a GA client ID without storing an email", () => {
    const attribution = parseFirstTouchAttribution({
      source: "WSJ-Newsletter",
      medium: "email",
      campaign: "fall-launch",
      referrer: "https://www.wsj.com/articles/example?subscriber=private",
      clientId: "123456789.987654321",
    });

    expect(attribution).toEqual({
      source: "wsj-newsletter",
      medium: "email",
      campaign: "fall-launch",
      referrerHost: "www.wsj.com",
      clientId: "123456789.987654321",
    });
    expect(serializeFirstTouchAttribution(attribution)).not.toContain("private");
  });

  test("round-trips the host-only referrer without restoring a referrer URL", () => {
    const stored = serializeFirstTouchAttribution({
      source: "wsj.com",
      medium: "referral",
      campaign: null,
      referrerHost: "wsj.com",
      clientId: "42.24",
    });

    expect(deserializeFirstTouchAttribution(stored)).toEqual({
      source: "wsj.com",
      medium: "referral",
      campaign: null,
      referrerHost: "wsj.com",
      clientId: "42.24",
    });
  });

  test("uses an external referrer as a referral and rejects malformed values", () => {
    expect(
      parseFirstTouchAttribution({
        referrer: "https://trk.wsj.com/click?email=person@example.com",
        clientId: "not-a-ga-client-id",
      }),
    ).toEqual({
      source: "trk.wsj.com",
      medium: "referral",
      campaign: null,
      referrerHost: "trk.wsj.com",
      clientId: null,
    });
  });
});

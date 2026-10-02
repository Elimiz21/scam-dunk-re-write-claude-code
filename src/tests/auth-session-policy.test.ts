import {
  WEB_ABSOLUTE_SESSION_SECONDS,
  WEB_IDLE_SESSION_SECONDS,
  isWebSessionExpired,
} from "@/lib/session-policy";

describe("web session policy", () => {
  test("uses a seven-day idle timeout and thirty-day absolute timeout", () => {
    expect(WEB_IDLE_SESSION_SECONDS).toBe(7 * 24 * 60 * 60);
    expect(WEB_ABSOLUTE_SESSION_SECONDS).toBe(30 * 24 * 60 * 60);
  });

  test("expires sessions after inactivity or absolute lifetime", () => {
    const createdAt = 1_000_000;
    expect(
      isWebSessionExpired({
        createdAt,
        lastActivityAt: createdAt,
        now: createdAt + WEB_IDLE_SESSION_SECONDS * 1000,
      }),
    ).toBe(true);

    expect(
      isWebSessionExpired({
        createdAt,
        lastActivityAt: createdAt + 6 * 24 * 60 * 60 * 1000,
        now: createdAt + WEB_ABSOLUTE_SESSION_SECONDS * 1000,
      }),
    ).toBe(true);
  });

  test("keeps an active session before either limit", () => {
    const createdAt = 1_000_000;
    expect(
      isWebSessionExpired({
        createdAt,
        lastActivityAt: createdAt + 6 * 24 * 60 * 60 * 1000,
        now: createdAt + 6 * 24 * 60 * 60 * 1000,
      }),
    ).toBe(false);
  });
});

import { findCredentialsUser } from "@/lib/auth-user";

describe("credential login database read", () => {
  test("selects only fields required to authenticate a user", async () => {
    const user = {
      id: "user-1",
      email: "investor@example.com",
      name: "Investor",
      plan: "FREE",
      hashedPassword: "hash",
      emailVerified: new Date("2026-01-01T00:00:00.000Z"),
    };
    const findUnique = jest.fn().mockResolvedValue(user);

    await expect(
      findCredentialsUser({ user: { findUnique } }, "investor@example.com"),
    ).resolves.toEqual(user);

    expect(findUnique).toHaveBeenCalledWith({
      where: { email: "investor@example.com" },
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        hashedPassword: true,
        emailVerified: true,
      },
    });
  });
});

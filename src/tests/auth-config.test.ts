import { authConfig } from "@/lib/auth.config";

describe("Auth.js runtime configuration", () => {
  it("trusts the host used by the deployed and local app runtimes", () => {
    expect(authConfig.trustHost).toBe(true);
  });
});

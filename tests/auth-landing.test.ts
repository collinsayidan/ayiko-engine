import { describe, expect, it } from "vitest";
import { authLanding } from "../web/lib/auth-landing";

const land = (url: string) => {
  const u = new URL(url, "https://ayiko.ai");
  return authLanding(u.pathname, u.searchParams);
};

describe("sign-in links that land on the wrong page", () => {
  it("send codes to /auth/callback from any page, including ones that don't exist", () => {
    expect(land("/?code=abc")).toBe("/auth/callback?code=abc&next=%2Fapp");
    expect(land("/auth/v1/callback?code=abc")).toBe("/auth/callback?code=abc&next=%2Fapp");
    expect(land("/signup?code=abc&next=%2Fapp%3Fplan%3Dfree")).toBe("/auth/callback?code=abc&next=%2Fapp%3Fplan%3Dfree");
  });

  it("send token_hash links to /auth/confirm", () => {
    expect(land("/callback?token_hash=t&type=signup")).toBe("/auth/confirm?token_hash=t&type=signup&next=%2Fapp");
  });

  it("send expired links to the login page", () => {
    expect(land("/?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid")).toBe("/login?error=link");
  });

  it("leave the real handlers, the API and ordinary pages alone", () => {
    expect(land("/auth/callback?code=abc")).toBeNull();
    expect(land("/auth/confirm?token_hash=t")).toBeNull();
    expect(land("/api/videos?code=abc")).toBeNull();
    expect(land("/app?plan=free")).toBeNull();
    expect(land("/login?error=link")).toBeNull();
  });
});

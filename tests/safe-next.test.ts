import { describe, expect, it } from "vitest";
import { safeNext } from "../web/lib/safe-next";

describe("sign-in redirects", () => {
  it("keep paths on this site", () => {
    expect(safeNext("/app")).toBe("/app");
    expect(safeNext("/app?plan=creator&template=menu-reel")).toBe("/app?plan=creator&template=menu-reel");
    expect(safeNext("/app/edit/123#look")).toBe("/app/edit/123#look");
    expect(safeNext("/admin")).toBe("/admin");
  });

  it("send anything that could leave the site to /app", () => {
    for (const bad of [
      null, undefined, "", "app", "https://evil.com", "//evil.com", "/\\evil.com", "/\\/evil.com", "\\\\evil.com",
      "/\t/evil.com", "/\n/evil.com", "/\r\n/evil.com", "javascript:alert(1)", " /evil",
    ]) {
      expect(safeNext(bad), JSON.stringify(bad)).toBe("/app");
    }
    expect(safeNext("//evil.com", "/login")).toBe("/login");
  });
});

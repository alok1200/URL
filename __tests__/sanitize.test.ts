import { describe, expect, it } from "vitest";
import { buildContentDisposition, sanitizeFilename } from "@/lib/sanitize";

describe("sanitizeFilename", () => {
  it("strips illegal OS characters and preserves readable title", () => {
    expect(sanitizeFilename('My: Awesome / Video? <2026> "HD"*|', "mp4")).toBe(
      "My Awesome Video 2026 HD.mp4",
    );
  });

  it("handles Windows reserved device names", () => {
    expect(sanitizeFilename("CON", "mp3")).toBe("download.mp3");
    expect(sanitizeFilename("nul", "mp4")).toBe("download.mp4");
  });

  it("builds valid ASCII + UTF-8 Content-Disposition header", () => {
    const header = buildContentDisposition("Café — Music Video.mp4");
    expect(header).toContain('attachment; filename="');
    expect(header).toContain("filename*=UTF-8''");
  });
});

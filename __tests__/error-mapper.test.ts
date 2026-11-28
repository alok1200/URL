import { describe, expect, it } from "vitest";
import { mapError } from "@/lib/error-mapper";

describe("mapError", () => {
  it("maps DRM-protected errors clearly", () => {
    const res = mapError("ERROR: [generic] This video is DRM protected (Widevine)");
    expect(res.code).toBe("DRM_PROTECTED");
    expect(res.status).toBe(422);
    expect(res.message.toLowerCase()).toContain("drm");
  });

  it("maps private or removed video errors", () => {
    const res = mapError("ERROR: [youtube] Private video. Sign in if you've been granted access");
    expect(res.code).toBe("UNAVAILABLE");
    expect(res.status).toBe(404);
  });

  it("maps login / age-restricted errors", () => {
    const res = mapError("ERROR: Sign in to confirm your age. This video may be inappropriate");
    expect(res.code).toBe("LOGIN_REQUIRED");
    expect(res.status).toBe(403);
  });

  it("maps geo-blocked errors", () => {
    const res = mapError("ERROR: The uploader has not made this video available in your country");
    expect(res.code).toBe("GEO_BLOCKED");
    expect(res.status).toBe(403);
  });

  it("maps site IP blocking / bot checks with local/cookies/proxy guidance", () => {
    const res = mapError("ERROR: Sign in to confirm you're not a bot");
    expect(res.code).toBe("SITE_BLOCKED");
    expect(res.status).toBe(503);
    expect(res.message).toContain("locally");
    expect(res.message).toContain("COOKIES_FILE");
  });

  it("maps unsupported sites", () => {
    const res = mapError("ERROR: Unsupported URL: https://example.com/page");
    expect(res.code).toBe("UNSUPPORTED_SITE");
    expect(res.status).toBe(400);
  });

  it("maps timeouts", () => {
    const res = mapError(new Error("Process timed out"));
    expect(res.code).toBe("TIMEOUT");
    expect(res.status).toBe(504);
  });

  it("maps file too large errors", () => {
    const res = mapError("File is larger than max-filesize (500M). Aborting.");
    expect(res.code).toBe("FILE_TOO_LARGE");
    expect(res.status).toBe(413);
  });

  it("never exposes raw server file paths in fallback errors", () => {
    const res = mapError("Unexpected crash at /var/app/secret/path/file.ts:42");
    expect(res.code).toBe("DOWNLOAD_ERROR");
    expect(res.message).not.toContain("/var/app/secret");
  });
});

import { describe, expect, it } from "vitest";
import {
  isPrivateIp,
  validateUrl,
  validateUrlSyntax,
} from "@/lib/url-validation";

describe("isPrivateIp", () => {
  it("blocks private, loopback, link-local, and multicast IPv4 ranges", () => {
    const blocked = [
      "127.0.0.1",
      "127.255.255.254",
      "10.0.0.1",
      "10.255.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.0.1",
      "192.168.1.100",
      "169.254.169.254",
      "0.0.0.0",
      "100.64.0.1",
      "224.0.0.1",
      "255.255.255.255",
    ];
    for (const ip of blocked) {
      expect(isPrivateIp(ip), `expected ${ip} to be private`).toBe(true);
    }
  });

  it("allows public IPv4 addresses", () => {
    const allowed = ["8.8.8.8", "1.1.1.1", "142.250.190.46", "172.15.0.1", "172.32.0.1"];
    for (const ip of allowed) {
      expect(isPrivateIp(ip), `expected ${ip} to be public`).toBe(false);
    }
  });

  it("blocks IPv6 loopback, link-local, ULA, and IPv4-mapped private addresses", () => {
    const blocked = [
      "::1",
      "::",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
      "::ffff:169.254.169.254",
      "::ffff:7f00:1",
    ];
    for (const ip of blocked) {
      expect(isPrivateIp(ip), `expected ${ip} to be private`).toBe(true);
    }
  });

  it("allows public IPv6 addresses", () => {
    expect(isPrivateIp("2606:4700:4700::1111")).toBe(false);
  });
});

describe("validateUrlSyntax", () => {
  it("accepts valid http and https links", () => {
    expect(validateUrlSyntax("https://www.youtube.com/watch?v=dQw4w9WgXcQ").valid).toBe(true);
    expect(validateUrlSyntax("http://example.com/video.mp4").valid).toBe(true);
  });

  it("rejects flag-like inputs starting with a hyphen", () => {
    expect(validateUrlSyntax("--exec=whoami").valid).toBe(false);
    expect(validateUrlSyntax("-f best https://example.com").valid).toBe(false);
  });

  it("rejects non-http/https protocols", () => {
    expect(validateUrlSyntax("file:///etc/passwd").valid).toBe(false);
    expect(validateUrlSyntax("ftp://example.com/file").valid).toBe(false);
    expect(validateUrlSyntax("javascript:alert(1)").valid).toBe(false);
  });

  it("rejects localhost and private IP literals", () => {
    expect(validateUrlSyntax("http://localhost:3000/test").valid).toBe(false);
    expect(validateUrlSyntax("http://sub.localhost/test").valid).toBe(false);
    expect(validateUrlSyntax("http://127.0.0.1:8080").valid).toBe(false);
    expect(validateUrlSyntax("http://192.168.1.1/admin").valid).toBe(false);
    expect(validateUrlSyntax("http://169.254.169.254/latest/meta-data/").valid).toBe(false);
    expect(validateUrlSyntax("http://[::1]:3000/").valid).toBe(false);
  });
});

describe("validateUrl with DNS resolution", () => {
  it("accepts domains resolving to public IPs", async () => {
    const res = await validateUrl("https://example.com/watch?v=123", async () => [
      "93.184.216.34",
    ]);
    expect(res.valid).toBe(true);
  });

  it("rejects domains that resolve to private/loopback IPs (DNS rebinding)", async () => {
    const res = await validateUrl("https://evil.example.com/video", async () => [
      "93.184.216.34",
      "127.0.0.1",
    ]);
    expect(res.valid).toBe(false);
    expect(res.code).toBe("BLOCKED_HOST");
  });

  it("rejects domains when DNS lookup fails", async () => {
    const res = await validateUrl("https://nonexistent.invalid/video", async () => {
      throw new Error("ENOTFOUND");
    });
    expect(res.valid).toBe(false);
    expect(res.code).toBe("DNS_FAILURE");
  });
});

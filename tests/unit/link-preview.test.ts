import { describe, expect, it } from "vitest";
import { isPublicAddress, parseMetadata, firstLink } from "@/server/services/link-preview";

describe("SSRF address policy", () => {
  it("blocks loopback, private, link-local, CGNAT, metadata and mapped addresses", () => {
    for (const a of ["127.0.0.1", "10.0.0.5", "172.16.3.4", "192.168.1.57", "169.254.169.254", "100.64.0.1", "0.0.0.0", "255.255.255.255", "224.0.0.1", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"]) {
      expect(isPublicAddress(a), a).toBe(false);
    }
  });
  it("allows public unicast addresses", () => {
    for (const a of ["93.184.216.34", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) expect(isPublicAddress(a), a).toBe(true);
  });
  it("rejects garbage", () => {
    expect(isPublicAddress("localhost")).toBe(false);
    expect(isPublicAddress("")).toBe(false);
  });
});

describe("metadata parsing", () => {
  const base = new URL("https://example.org/articles/1");
  it("prefers Open Graph, decodes entities, resolves relative images", () => {
    const md = parseMetadata(
      `<html><head><title>Fallback</title><meta property="og:title" content="Rock &amp; Roll &#8211; Live"><meta name="description" content="desc"><meta property="og:image" content="/img/cover.jpg"><meta property="og:site_name" content="Example News"></head></html>`,
      base,
    );
    expect(md).toEqual({ title: "Rock & Roll – Live", description: "desc", siteName: "Example News", image: "https://example.org/img/cover.jpg" });
  });
  it("falls back to <title>, twitter tags and the hostname; strips markup and ignores unsafe images", () => {
    const md = parseMetadata(`<title>Plain <b>title</b></title><meta name="twitter:description" content="tw"><meta property="og:image" content="javascript:alert(1)">`, base);
    expect(md.title).toBe("Plain title");
    expect(md.description).toBe("tw");
    expect(md.siteName).toBe("example.org");
    expect(md.image).toBeNull();
  });
  it("truncates very long values", () => {
    const md = parseMetadata(`<meta property="og:title" content="${"x".repeat(500)}">`, base);
    expect(Array.from(md.title!).length).toBe(120);
  });
  it("finds the first http(s) link in post text", () => {
    expect(firstLink("see example.org/a and https://b.example")).toBe("https://example.org/a");
    expect(firstLink("no links here")).toBeNull();
  });
});

import type { MetadataRoute } from "next";

/** Demo environment with fictional, per-visitor content: nothing should be indexed. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}

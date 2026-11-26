import { notFound } from "next/navigation";

/**
 * Only real handle shapes reach profile pages. Requests such as /favicon.ico or
 * /robots.txt (or any path with a dot) get a 404 instead of rendering a profile.
 * Existing short seed handles are allowed, so the check is shape-only (1–15 chars).
 */
const HANDLE_SHAPE = /^[A-Za-z0-9_]{1,15}$/;

export default async function HandleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  if (!HANDLE_SHAPE.test(decodeURIComponent(handle))) notFound();
  return children;
}

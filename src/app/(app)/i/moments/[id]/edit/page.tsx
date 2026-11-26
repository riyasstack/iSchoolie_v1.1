import type { Metadata } from "next";
import { MomentEditor } from "@/features/collections/moments";

export const metadata: Metadata = { title: "Edit Moment" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MomentEditor id={id} />;
}

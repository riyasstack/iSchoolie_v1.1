import type { Metadata } from "next";
import { MomentView } from "@/features/collections/moments";

export const metadata: Metadata = { title: "Moment" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MomentView id={id} />;
}

import type { Metadata } from "next";
import { ListView } from "@/features/collections/lists";

export const metadata: Metadata = { title: "List" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ListView id={id} />;
}

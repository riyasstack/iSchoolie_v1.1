import type { Metadata } from "next";
import { ListEditor } from "@/features/collections/lists";

export const metadata: Metadata = { title: "Edit List" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ListEditor id={id} />;
}

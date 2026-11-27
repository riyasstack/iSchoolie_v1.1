import type { Metadata } from "next";
import { ListPeopleView } from "@/features/collections/lists";

export const metadata: Metadata = { title: "Circle followers" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ListPeopleView id={id} kind="followers" />;
}

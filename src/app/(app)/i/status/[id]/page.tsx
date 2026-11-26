import { StatusRedirect } from "@/features/posts/detail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StatusRedirect id={id} />;
}

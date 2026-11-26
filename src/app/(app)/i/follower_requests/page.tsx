import type { Metadata } from "next";
import { FollowerRequestsView } from "@/features/collections/misc-views";

export const metadata: Metadata = { title: "Follower requests" };

export default function Page() {
  return <FollowerRequestsView />;
}

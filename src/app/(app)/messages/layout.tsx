import { MessagesLayout } from "@/features/messages/messages";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <MessagesLayout>{children}</MessagesLayout>;
}

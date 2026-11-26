import { SessionGate } from "@/components/providers";
import { AppShell } from "@/components/layout/app-shell";

export default function AppLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  return (
    <SessionGate>
      <AppShell modal={modal}>{children}</AppShell>
    </SessionGate>
  );
}

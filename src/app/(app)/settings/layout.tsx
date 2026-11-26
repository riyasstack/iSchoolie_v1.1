import { SettingsLayout } from "@/features/settings/settings";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <SettingsLayout>{children}</SettingsLayout>;
}

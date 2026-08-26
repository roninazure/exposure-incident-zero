import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Exposure // Incident Zero",
  description: "Agent-native infrastructure intelligence for a governed incident response workflow.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

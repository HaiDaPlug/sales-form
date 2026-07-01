import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Digital Kontakt Sales Portal",
  description: "Internal Pipedrive sales workflow portal"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}

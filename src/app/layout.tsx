import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import Layout from "@/components/Layout";

export const metadata: Metadata = {
  title: "ShipScout — Vessel Intelligence",
  description: "Find scrap-eligible vessels before anyone else does.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Layout>{children}</Layout>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import Layout from "@/components/Layout";
import ErrorBoundary from "@/components/ErrorBoundary";

export const metadata: Metadata = {
  title: "ShipScout — Vessel Intelligence",
  description: "Find scrap-eligible vessels before anyone else does.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Layout>
          <ErrorBoundary label="page">{children}</ErrorBoundary>
        </Layout>
      </body>
    </html>
  );
}

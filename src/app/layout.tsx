import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { APP } from "@/lib/domain";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: `${APP.name}`,
  description: `${APP.name} — ${APP.subtitle}`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}

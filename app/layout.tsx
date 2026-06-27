import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Duped — a globally consistent economy kernel for online games",
  description:
    "Duped makes item & gold duplication unrepresentable in the authoritative state — exclusive ownership rows with version-guarded transfers, conserved balances on a balanced ledger, atomic and strongly consistent across regions on Aurora DSQL, with DynamoDB powering the live world read model.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="duped-grain antialiased">
        <div className="duped-aurora" aria-hidden />
        <div className="duped-stars" aria-hidden />
        {children}
      </body>
    </html>
  );
}

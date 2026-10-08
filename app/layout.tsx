import "./globals.css";
import Link from "next/link";

export const metadata = { title: "Truck P&L" };

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@500;600;700&display=swap" />
      </head>
      <body>
        <header>
          <div className="in">
            <b>Truck P&amp;L</b>
            <Link href="/">Summary</Link>
            <Link href="/trips">Trips</Link>
            <Link href="/expenses">Owner expenses</Link>
            <Link href="/setup">Setup and cash</Link>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'CC-Worker Dashboard',
  description: 'Distributed Claude Code Worker Management System',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-background">
          {/* Navigation */}
          <nav className="border-b">
            <div className="container mx-auto px-4">
              <div className="flex h-16 items-center justify-between">
                <div className="flex items-center gap-8">
                  <Link href="/" className="text-xl font-bold">
                    CC-Worker
                  </Link>
                  <div className="flex gap-6">
                    <Link
                      href="/workers"
                      className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Workers
                    </Link>
                    <Link
                      href="/tasks"
                      className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Tasks
                    </Link>
                    <Link
                      href="/templates"
                      className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Templates
                    </Link>
                    <Link
                      href="/analytics"
                      className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Analytics
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </nav>

          {/* Main Content */}
          <main className="container mx-auto px-4 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}

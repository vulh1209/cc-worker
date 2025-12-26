import type { Metadata } from 'next';
import { IBM_Plex_Mono, JetBrains_Mono } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

// IBM Plex Mono - distinctive technical monospace
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

// JetBrains Mono for code blocks
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CC-Worker Terminal',
  description: 'Distributed Claude Code Worker Management System',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${ibmPlexMono.variable} ${jetbrainsMono.variable}`}>
        <div className="min-h-screen bg-background scanlines">
          {/* Terminal-style Navigation */}
          <nav className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
            <div className="container mx-auto px-4">
              <div className="flex h-12 items-center justify-between">
                {/* Left: Logo + Nav */}
                <div className="flex items-center gap-6">
                  {/* Logo */}
                  <Link href="/" className="flex items-center gap-2 group">
                    <div className="flex items-center gap-1.5">
                      <span className="text-primary text-lg">❯</span>
                      <span className="font-semibold text-foreground tracking-tight">
                        cc-worker
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground font-normal">
                      v1.0.0
                    </span>
                  </Link>

                  {/* Divider */}
                  <div className="h-4 w-px bg-border" />

                  {/* Nav Links */}
                  <div className="flex items-center gap-1">
                    <NavLink href="/" icon="◈">
                      dashboard
                    </NavLink>
                    <NavLink href="/workers" icon="⬡">
                      workers
                    </NavLink>
                    <NavLink href="/tasks" icon="▤">
                      tasks
                    </NavLink>
                    <NavLink href="/templates" icon="◫">
                      templates
                    </NavLink>
                    <NavLink href="/analytics" icon="◭">
                      analytics
                    </NavLink>
                  </div>
                </div>

                {/* Right: Status + Actions */}
                <div className="flex items-center gap-4">
                  {/* System Status */}
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-secondary/50 border border-border/50">
                    <span className="status-indicator status-online" />
                    <span className="text-xs text-muted-foreground">
                      system online
                    </span>
                  </div>

                  {/* Keyboard shortcut hint */}
                  <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground">
                    <kbd className="kbd">⌘</kbd>
                    <kbd className="kbd">K</kbd>
                  </div>
                </div>
              </div>
            </div>
          </nav>

          {/* Main Content */}
          <main className="container mx-auto px-4 py-6">{children}</main>

          {/* Footer - Terminal style */}
          <footer className="border-t border-border/50 py-4 mt-auto">
            <div className="container mx-auto px-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-4">
                  <span className="terminal-prompt">
                    CC-Worker Dashboard
                  </span>
                  <span className="text-border">|</span>
                  <span>Built with Claude Code SDK</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="status-indicator status-online" />
                    WebSocket connected
                  </span>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="nav-link flex items-center gap-1.5 px-3 py-1.5 rounded hover:bg-secondary/50 transition-colors"
    >
      <span className="text-primary/70 text-xs">{icon}</span>
      <span>{children}</span>
    </Link>
  );
}

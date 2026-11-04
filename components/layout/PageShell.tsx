import Link from "next/link";
import { ConnectButton } from "@/components/ui/ConnectButton";
import { NetworkBadge } from "@/components/botchain/NetworkBadge";
import { BuiltOnBotChain } from "@/components/botchain/BuiltOnBotChain";
import { footerLinks } from "@/lib/botchain/chain";

interface PageShellProps {
  children: React.ReactNode;
  activeTab?: "deals" | "open" | "me";
}

export function PageShell({ children, activeTab }: PageShellProps) {
  const { site, explorer } = footerLinks();

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      {/* Top Banner Navigation */}
      <header className="border-b-2 border-[var(--border-default)] bg-[var(--bg-surface)] sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 group">
              <span className="w-8 h-8 rounded-lg bg-[var(--accent)] text-[var(--accent-ink)] font-display flex items-center justify-center text-sm font-bold shadow-sm">
                M
              </span>
              <span className="font-display font-bold text-lg tracking-tight text-[var(--text-primary)]">
                Midpoint
              </span>
            </Link>

            <nav className="hidden sm:flex items-center gap-1">
              <Link
                href="/"
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === "deals"
                    ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                }`}
              >
                Deals
              </Link>
              <Link
                href="/open"
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === "open"
                    ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                }`}
              >
                Open Deal
              </Link>
              <Link
                href="/me"
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === "me"
                    ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                }`}
              >
                My Escrow
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <NetworkBadge />
            <ConnectButton />
          </div>
        </div>

        {/* Mobile Navigation bar */}
        <div className="sm:hidden flex border-t border-[var(--border-subtle)] px-4 py-2 gap-2 bg-[var(--bg-elevated)]">
          <Link
            href="/"
            className={`flex-1 text-center py-1.5 rounded text-xs font-semibold ${
              activeTab === "deals"
                ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                : "text-[var(--text-secondary)]"
            }`}
          >
            Deals
          </Link>
          <Link
            href="/open"
            className={`flex-1 text-center py-1.5 rounded text-xs font-semibold ${
              activeTab === "open"
                ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                : "text-[var(--text-secondary)]"
            }`}
          >
            Open Deal
          </Link>
          <Link
            href="/me"
            className={`flex-1 text-center py-1.5 rounded text-xs font-semibold ${
              activeTab === "me"
                ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                : "text-[var(--text-secondary)]"
            }`}
          >
            My Escrow
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        {children}
      </main>

      {/* Shared UI Contract Footer with exactly three links */}
      <footer className="border-t-2 border-[var(--border-default)] bg-[var(--bg-surface)] py-6 mt-auto">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-medium text-[var(--text-muted)]">
          <div className="flex items-center gap-2">
            <BuiltOnBotChain />
          </div>
          <div className="flex items-center gap-6">
            <a
              href={site}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--text-primary)] transition-colors"
            >
              botchain.ai
            </a>
            <a
              href={explorer}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--text-primary)] transition-colors"
            >
              BOT Chain Explorer
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

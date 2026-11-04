"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, usePublicClient } from "wagmi";
import { formatEther, type Address } from "viem";
import { PageShell } from "@/components/layout/PageShell";
import { LimitationsBlock } from "@/components/midpoint/LimitationsBlock";
import { NumberLine } from "@/components/midpoint/NumberLine";
import { midpointAbi } from "@/lib/botchain/abi";
import { activeBotChain } from "@/lib/botchain/chain";
import { getDeployment, isDeployed } from "@/lib/botchain/deployment";
import { DealState, type Deal } from "@/lib/midpoint";

export default function HomePage() {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: activeBotChain.id });
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  const deployed = isDeployed(activeBotChain.id);
  const contractAddress = deployed ? getDeployment(activeBotChain.id).address : undefined;

  useEffect(() => {
    async function loadDeals() {
      if (!publicClient || !contractAddress) {
        setLoading(false);
        return;
      }

      try {
        const total = await publicClient.readContract({
          address: contractAddress,
          abi: midpointAbi,
          functionName: "dealCount",
        });

        const count = Number(total);
        if (count === 0) {
          setDeals([]);
          setLoading(false);
          return;
        }

        const items: Deal[] = [];
        // Fetch up to 10 latest deals
        const limit = Math.min(count, 10);
        for (let i = count; i > count - limit; i--) {
          const d = await publicClient.readContract({
            address: contractAddress,
            abi: midpointAbi,
            functionName: "dealOf",
            args: [BigInt(i)],
          });

          items.push({
            id: BigInt(i),
            seller: d.seller as Address,
            buyer: d.buyer as Address,
            state: d.state as DealState,
            commitBy: d.commitBy,
            revealBy: d.revealBy,
            revealSecs: d.revealSecs,
            termsBlock: d.termsBlock,
            ceiling: d.ceiling,
            sellerCommit: d.sellerCommit,
            buyerCommit: d.buyerCommit,
            ask: d.ask,
            bid: d.bid,
            askRevealed: d.askRevealed,
            bidRevealed: d.bidRevealed,
            price: d.price,
            title: d.title,
          });
        }

        setDeals(items);
      } catch (err) {
        console.error("Failed to load deals:", err);
      } finally {
        setLoading(false);
      }
    }

    loadDeals();
    const interval = setInterval(loadDeals, 10000);
    return () => clearInterval(interval);
  }, [publicClient?.chain?.id, contractAddress]);

  return (
    <PageShell activeTab="deals">
      <div className="space-y-8">
        {/* Hero Section */}
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-[var(--text-primary)]">
            Midpoint
          </h1>
          <p className="text-base sm:text-lg text-[var(--text-secondary)] font-medium">
            Both name a price in secret. If they overlap, split the difference.
          </p>
          <div className="pt-2">
            <Link
              href="/open"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--accent)] text-[var(--accent-ink)] font-semibold shadow-sm hover:opacity-95"
            >
              + Open a New Deal
            </Link>
          </div>
        </div>

        {/* Not Deployed State */}
        {!deployed && (
          <div className="p-6 bg-[var(--bg-surface)] border-2 border-[var(--danger)] rounded-xl text-center">
            <h2 className="text-lg font-bold text-[var(--danger)]">
              Not live on this network
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Midpoint is not deployed on chain {activeBotChain.id}. Switch to local anvil or testnet.
            </p>
          </div>
        )}

        {/* Deals Section: Archetype list of small number lines */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-display font-bold text-xl text-[var(--text-primary)]">
              Active &amp; Recent Deals
            </h2>
            <span className="text-xs font-mono text-[var(--text-tertiary)]">
              {deals.length} deals listed
            </span>
          </div>

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="p-5 bg-[var(--bg-surface)] border-2 border-[var(--border-subtle)] rounded-xl animate-pulse h-32"
                />
              ))}
            </div>
          ) : deals.length === 0 ? (
            <div className="p-8 bg-[var(--bg-surface)] border-2 border-[var(--border-default)] rounded-xl text-center space-y-3">
              <span className="text-3xl block">📭</span>
              <p className="font-semibold text-base text-[var(--text-primary)]">
                No deals created yet
              </p>
              <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
                Open a deal with a designated counterparty, set a price ceiling, and seal your prices.
              </p>
              <Link
                href="/open"
                className="inline-block mt-2 px-4 py-2 bg-[var(--accent)] text-[var(--accent-ink)] rounded-md text-xs font-semibold"
              >
                Create Deal 1
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {deals.map((deal) => {
                const isSeller = address?.toLowerCase() === deal.seller.toLowerCase();
                const isBuyer = address?.toLowerCase() === deal.buyer.toLowerCase();
                const roleBadge = isSeller ? "You are Seller" : isBuyer ? "You are Buyer" : null;

                return (
                  <div
                    key={deal.id.toString()}
                    className="p-5 bg-[var(--bg-surface)] border-2 border-[var(--border-default)] rounded-xl shadow-sm hover:border-[var(--accent)] transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 bg-[var(--bg-elevated)] rounded border border-[var(--border-subtle)]">
                            Deal #{deal.id.toString()}
                          </span>
                          <h3 className="font-display font-bold text-base text-[var(--text-primary)]">
                            {deal.title}
                          </h3>
                        </div>
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                          Seller: {deal.seller.slice(0, 6)}...{deal.seller.slice(-4)} · Buyer: {deal.buyer.slice(0, 6)}...{deal.buyer.slice(-4)}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        {roleBadge && (
                          <span className="text-xs font-semibold px-2 py-1 bg-[var(--accent)] text-white rounded">
                            {roleBadge}
                          </span>
                        )}
                        <span
                          className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                            deal.state === DealState.Settled
                              ? "bg-[var(--success)] text-white"
                              : deal.state === DealState.Revealing
                              ? "bg-[var(--accent)] text-white"
                              : deal.state === DealState.Void
                              ? "bg-[var(--danger)] text-white"
                              : "bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-subtle)]"
                          }`}
                        >
                          {DealState[deal.state]}
                        </span>
                        <Link
                          href={`/deal/${deal.id.toString()}`}
                          className="px-3 py-1 bg-[var(--bg-elevated)] hover:bg-[var(--border-subtle)] border border-[var(--border-default)] rounded text-xs font-semibold transition-colors"
                        >
                          View Envelopes →
                        </Link>
                      </div>
                    </div>

                    {/* Compact Number Line representation */}
                    <NumberLine deal={deal} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Limitations Block */}
        <LimitationsBlock />
      </div>
    </PageShell>
  );
}

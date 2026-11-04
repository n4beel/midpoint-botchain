"use client";

import React from "react";
import { formatEther } from "viem";
import { DealState, type Deal } from "@/lib/midpoint";

interface NumberLineProps {
  deal: Deal;
  interactive?: boolean;
}

export function NumberLine({ deal }: NumberLineProps) {
  const ceiling = Number(formatEther(deal.ceiling));
  const ask = deal.askRevealed ? Number(formatEther(deal.ask)) : null;
  const bid = deal.bidRevealed ? Number(formatEther(deal.bid)) : null;
  const settled = deal.state === DealState.Settled;
  const tradePrice = settled ? Number(formatEther(deal.price)) : null;

  // Percentage calculations along 0 -> ceiling
  const askPct = ask !== null && ceiling > 0 ? Math.min(100, Math.max(0, (ask / ceiling) * 100)) : null;
  const bidPct = bid !== null && ceiling > 0 ? Math.min(100, Math.max(0, (bid / ceiling) * 100)) : null;
  const pricePct = tradePrice !== null && ceiling > 0 ? Math.min(100, Math.max(0, (tradePrice / ceiling) * 100)) : null;

  const overlap = ask !== null && bid !== null && bid >= ask;
  const noDeal = ask !== null && bid !== null && bid < ask;

  return (
    <div className="w-full py-4">
      {/* Visual Number Line */}
      <div className="relative w-full h-12 flex items-center">
        {/* Base Track */}
        <div className="w-full h-3 bg-[var(--border-subtle)] rounded-full relative overflow-visible">
          {/* Overlap Bracket if bid >= ask and both revealed */}
          {overlap && askPct !== null && bidPct !== null && (
            <div
              className="absolute top-0 bottom-0 bg-[var(--success)] opacity-35 rounded-full"
              style={{
                left: `${askPct}%`,
                width: `${bidPct - askPct}%`,
              }}
            />
          )}

          {/* Gap highlight if bid < ask */}
          {noDeal && askPct !== null && bidPct !== null && (
            <div
              className="absolute top-0 bottom-0 bg-[var(--danger)] opacity-30 rounded-full"
              style={{
                left: `${bidPct}%`,
                width: `${askPct - bidPct}%`,
              }}
            />
          )}

          {/* Seller Ask Pin */}
          {askPct !== null && (
            <div
              className="absolute -top-3 w-6 h-6 -ml-3 rounded-full bg-[var(--accent)] border-2 border-white shadow flex items-center justify-center text-[10px] font-bold text-white z-10"
              style={{ left: `${askPct}%` }}
              title={`Seller Ask: ${ask} BOT`}
            >
              S
            </div>
          )}

          {/* Buyer Bid Pin */}
          {bidPct !== null && (
            <div
              className="absolute -top-3 w-6 h-6 -ml-3 rounded-full bg-[#1F7A3D] border-2 border-white shadow flex items-center justify-center text-[10px] font-bold text-white z-10"
              style={{ left: `${bidPct}%` }}
              title={`Buyer Bid: ${bid} BOT`}
            >
              B
            </div>
          )}

          {/* Midpoint Settled Pin */}
          {pricePct !== null && (
            <div
              className="absolute -top-4 w-8 h-8 -ml-4 rounded-full bg-[var(--text-primary)] border-2 border-[var(--bg-base)] shadow-lg flex items-center justify-center text-xs font-bold text-white z-20"
              style={{ left: `${pricePct}%` }}
              title={`Midpoint Settled Price: ${tradePrice} BOT`}
            >
              ★
            </div>
          )}
        </div>
      </div>

      {/* Axis Scale Labels */}
      <div className="flex justify-between text-xs font-mono font-medium text-[var(--text-tertiary)] pt-1">
        <span>0 BOT</span>
        {tradePrice !== null && (
          <span className="font-bold text-[var(--text-primary)] text-sm">
            Midpoint: {tradePrice} BOT
          </span>
        )}
        {noDeal && (
          <span className="font-bold text-[var(--danger)]">
            No Deal (Gap: {(ask! - bid!).toFixed(4)} BOT)
          </span>
        )}
        <span>{ceiling} BOT (Ceiling)</span>
      </div>

      {/* Text Equivalent Accessibility Summary */}
      <div className="mt-3 p-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg text-xs leading-relaxed space-y-1">
        <p className="font-semibold text-[var(--text-primary)]">Line Summary:</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <span className="text-[var(--text-muted)]">Seller Ask: </span>
            <span className="font-mono font-semibold">
              {ask !== null ? `${ask} BOT` : "Sealed in envelope"}
            </span>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">Buyer Bid: </span>
            <span className="font-mono font-semibold">
              {bid !== null ? `${bid} BOT` : "Sealed in envelope"}
            </span>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">Outcome: </span>
            <span className="font-mono font-semibold">
              {settled
                ? `Traded at ${tradePrice} BOT`
                : deal.state === DealState.Void
                ? "Void / No Deal"
                : "Awaiting Reveals"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

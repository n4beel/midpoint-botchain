"use client";

import React, { useState } from "react";
import { formatEther, type Address, type Hex } from "viem";
import { Button } from "@/components/ui/Button";
import {
  DealState,
  commitment,
  randomSalt,
  saltFile,
  storeSaltLocally,
  type Deal,
} from "@/lib/midpoint";

interface EnvelopeCardProps {
  role: "seller" | "buyer";
  deal: Deal;
  currentAddress?: Address;
  onCommit: (commitHash: Hex, salt: Hex, price: bigint) => Promise<void>;
  onReveal: (price: bigint, salt: Hex) => Promise<void>;
  submitting?: boolean;
}

export function EnvelopeCard({
  role,
  deal,
  currentAddress,
  onCommit,
  onReveal,
  submitting,
}: EnvelopeCardProps) {
  const isSeller = role === "seller";
  const partyAddress = isSeller ? deal.seller : deal.buyer;
  const committed = isSeller ? deal.sellerCommit !== "0x0000000000000000000000000000000000000000000000000000000000000000" : deal.buyerCommit !== "0x0000000000000000000000000000000000000000000000000000000000000000";
  const revealed = isSeller ? deal.askRevealed : deal.bidRevealed;
  const revealedPrice = isSeller ? deal.ask : deal.bid;

  const isCurrentParty = currentAddress?.toLowerCase() === partyAddress.toLowerCase();

  // Commitment form state
  const [priceInput, setPriceInput] = useState("");
  const [salt, setSalt] = useState<Hex>(() => randomSalt());
  const [saltDownloaded, setSaltDownloaded] = useState(false);
  const [rememberLocal, setRememberLocal] = useState(true);

  // Reveal form state
  const [revealPriceInput, setRevealPriceInput] = useState("");
  const [revealSaltInput, setRevealSaltInput] = useState<string>("");

  const ceilingBot = formatEther(deal.ceiling);

  const handleDownloadSalt = () => {
    if (!priceInput || isNaN(Number(priceInput)) || Number(priceInput) <= 0) return;
    const priceWei = BigInt(Math.floor(Number(priceInput) * 1e18));
    const commitHash = commitment(deal.id, partyAddress, priceWei, salt);
    const jsonStr = saltFile(deal.id, role, partyAddress, priceWei, salt, commitHash);

    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `midpoint-deal-${deal.id}-${role}-salt.json`;
    a.click();
    URL.revokeObjectURL(url);
    setSaltDownloaded(true);
  };

  const handleCommitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!priceInput || !saltDownloaded) return;
    const priceWei = BigInt(Math.floor(Number(priceInput) * 1e18));
    if (priceWei > deal.ceiling) return;

    const commitHash = commitment(deal.id, partyAddress, priceWei, salt);
    if (rememberLocal) {
      storeSaltLocally(deal.id, partyAddress, priceWei, salt);
    }
    await onCommit(commitHash, salt, priceWei);
  };

  const handleRevealSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revealPriceInput || !revealSaltInput) return;
    const priceWei = BigInt(Math.floor(Number(revealPriceInput) * 1e18));
    await onReveal(priceWei, revealSaltInput as Hex);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const obj = JSON.parse(text);
        if (obj.price) setRevealPriceInput(obj.price);
        if (obj.salt) setRevealSaltInput(obj.salt);
      } catch {}
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex-1 envelope-card p-6 flex flex-col justify-between">
      {/* Top Header */}
      <div>
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full ${
                revealed
                  ? "bg-[var(--success)]"
                  : committed
                  ? "bg-[var(--accent)]"
                  : "bg-[var(--border-default)]"
              }`}
            />
            <h3 className="font-display font-bold text-base capitalize text-[var(--text-primary)]">
              {role}&apos;s Envelope
            </h3>
          </div>
          <span className="text-xs font-mono text-[var(--text-tertiary)]">
            {partyAddress.slice(0, 6)}...{partyAddress.slice(-4)}
          </span>
        </div>

        {/* Envelope Status Content */}
        {!committed ? (
          <div className="space-y-4">
            <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg text-center">
              <span className="text-2xl block mb-1">✉️</span>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Unsealed Envelope
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Waiting for {role} to seal their secret price.
              </p>
              {!isSeller && (
                <p className="text-xs font-semibold text-[var(--accent)] mt-2">
                  Buyer locks ceiling in escrow: {ceilingBot} BOT
                </p>
              )}
            </div>

            {/* Commit Form if Current Party and deal is Open */}
            {isCurrentParty && deal.state === DealState.Open && (
              <form onSubmit={handleCommitSubmit} className="space-y-3 pt-2">
                <div className="text-xs font-medium text-[var(--text-secondary)]">
                  Seal your {role} price. You cannot change it, and you must reveal it later.
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Your Secret {isSeller ? "Ask" : "Bid"} Price (BOT)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    max={ceilingBot}
                    required
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    placeholder={`e.g. ${(Number(ceilingBot) * 0.75).toFixed(2)}`}
                    className="w-full px-3 py-2 bg-white border border-[var(--border-default)] rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                  <span className="text-[11px] text-[var(--text-muted)]">
                    Maximum allowed ceiling: {ceilingBot} BOT
                  </span>
                </div>

                <div className="p-3 bg-white border border-[var(--border-default)] rounded-md space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold">Secret Salt Key:</span>
                    <button
                      type="button"
                      onClick={() => setSalt(randomSalt())}
                      className="text-[var(--accent)] hover:underline text-[11px]"
                    >
                      Regenerate
                    </button>
                  </div>
                  <p className="text-[11px] font-mono break-all text-[var(--text-tertiary)] bg-[var(--bg-elevated)] p-1.5 rounded">
                    {salt}
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-full text-xs"
                    onClick={handleDownloadSalt}
                    disabled={!priceInput || Number(priceInput) <= 0}
                  >
                    {saltDownloaded ? "✓ Salt File Downloaded" : "Download Secret Key (.json)"}
                  </Button>
                </div>

                <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberLocal}
                    onChange={(e) => setRememberLocal(e.target.checked)}
                    className="rounded text-[var(--accent)]"
                  />
                  Remember salt on this device for reveal
                </label>

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  disabled={!saltDownloaded || submitting || !priceInput || Number(priceInput) > Number(ceilingBot)}
                >
                  {submitting
                    ? "Sealing..."
                    : isSeller
                    ? "Seal Ask Price (0 BOT)"
                    : `Seal Bid Price (Escrow ${ceilingBot} BOT)`}
                </Button>
              </form>
            )}
          </div>
        ) : !revealed ? (
          <div className="space-y-4">
            <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg text-center">
              <span className="text-2xl block mb-1">🔒</span>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Sealed Envelope
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Hash: {isSeller ? deal.sellerCommit.slice(0, 10) : deal.buyerCommit.slice(0, 10)}...
              </p>
            </div>

            {/* Reveal Form if deal is in Revealing state and current party hasn't revealed */}
            {isCurrentParty && deal.state === DealState.Revealing && (
              <form onSubmit={handleRevealSubmit} className="space-y-3 pt-2">
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  Reveal your secret price:
                </div>

                <div className="text-xs text-[var(--text-muted)]">
                  Upload your saved salt file or enter details:
                </div>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  className="text-xs text-[var(--text-secondary)] w-full file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-[var(--accent)] file:text-white"
                />

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Price (BOT)
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={revealPriceInput}
                    onChange={(e) => setRevealPriceInput(e.target.value)}
                    placeholder="Exact sealed price"
                    className="w-full px-3 py-2 bg-white border border-[var(--border-default)] rounded-md text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Salt (0x...)
                  </label>
                  <input
                    type="text"
                    required
                    value={revealSaltInput}
                    onChange={(e) => setRevealSaltInput(e.target.value)}
                    placeholder="0x..."
                    className="w-full px-3 py-2 bg-white border border-[var(--border-default)] rounded-md text-xs font-mono"
                  />
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  disabled={submitting || !revealPriceInput || !revealSaltInput}
                >
                  {submitting ? "Revealing..." : "Reveal Price to Chain"}
                </Button>
              </form>
            )}
          </div>
        ) : (
          <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg text-center">
            <span className="text-2xl block mb-1">📖</span>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Envelope Opened
            </p>
            <p className="text-xl font-mono font-bold text-[var(--accent)] my-2">
              {formatEther(revealedPrice)} BOT
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Publicly verified on-chain.
            </p>
          </div>
        )}
      </div>

      {/* Role Tag Footer */}
      <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex justify-between items-center text-xs text-[var(--text-tertiary)]">
        <span>Role: <strong className="capitalize">{role}</strong></span>
        <span>{committed ? "Committed" : "Pending Commit"}</span>
      </div>
    </div>
  );
}

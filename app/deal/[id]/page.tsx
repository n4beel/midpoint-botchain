"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { useAccount, usePublicClient } from "wagmi";
import { formatEther, type Address, type Hex } from "viem";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";
import { NumberLine } from "@/components/midpoint/NumberLine";
import { EnvelopeCard } from "@/components/midpoint/EnvelopeCard";
import { LimitationsBlock } from "@/components/midpoint/LimitationsBlock";
import BotChainGate from "@/components/botchain/BotChainGate";
import { useWriteContract } from "@/lib/useChainWrite";
import { midpointAbi } from "@/lib/botchain/abi";
import { activeBotChain } from "@/lib/botchain/chain";
import { getDeployment, isDeployed } from "@/lib/botchain/deployment";
import { describeError } from "@/lib/errors";
import { DealState, type Deal } from "@/lib/midpoint";

export default function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const dealIdStr = resolvedParams.id;
  const dealId = BigInt(dealIdStr);

  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: activeBotChain.id });
  const { writeContractAsync } = useWriteContract();

  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const deployed = isDeployed(activeBotChain.id);
  const contractAddress = deployed ? getDeployment(activeBotChain.id).address : undefined;

  async function refetchDeal() {
    if (!publicClient || !contractAddress) return;
    try {
      const d = await publicClient.readContract({
        address: contractAddress,
        abi: midpointAbi,
        functionName: "dealOf",
        args: [dealId],
      });

      setDeal({
        id: dealId,
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
    } catch (err) {
      console.error("Failed to load deal:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refetchDeal();
    const interval = setInterval(refetchDeal, 5000);
    return () => clearInterval(interval);
  }, [publicClient?.chain?.id, contractAddress, dealId]);

  const handleCommit = async (commitHash: Hex, _salt: Hex, price: bigint) => {
    if (!contractAddress || !publicClient || !deal) return;
    setActionError(null);
    setActionSuccess(null);
    setSubmitting(true);

    try {
      const isSeller = address?.toLowerCase() === deal.seller.toLowerCase();
      const valueToSend = isSeller ? 0n : deal.ceiling;

      const txHash = await writeContractAsync({
        address: contractAddress,
        abi: midpointAbi,
        functionName: "commit",
        args: [dealId, commitHash],
        value: valueToSend,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status === "success") {
        setActionSuccess("Sealed commitment submitted to chain!");
        await refetchDeal();
      } else {
        setActionError("Transaction failed on chain.");
      }
    } catch (err) {
      setActionError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReveal = async (price: bigint, salt: Hex) => {
    if (!contractAddress || !publicClient || !deal) return;
    setActionError(null);
    setActionSuccess(null);
    setSubmitting(true);

    try {
      const txHash = await writeContractAsync({
        address: contractAddress,
        abi: midpointAbi,
        functionName: "reveal",
        args: [dealId, price, salt],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status === "success") {
        setActionSuccess("Price revealed on chain!");
        await refetchDeal();
      } else {
        setActionError("Reveal transaction failed on chain.");
      }
    } catch (err) {
      setActionError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSettle = async () => {
    if (!contractAddress || !publicClient || !deal) return;
    setActionError(null);
    setActionSuccess(null);
    setSubmitting(true);

    try {
      const txHash = await writeContractAsync({
        address: contractAddress,
        abi: midpointAbi,
        functionName: "settle",
        args: [dealId],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status === "success") {
        setActionSuccess("Deal settled successfully!");
        await refetchDeal();
      } else {
        setActionError("Settle transaction failed on chain.");
      }
    } catch (err) {
      setActionError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!contractAddress || !publicClient || !deal) return;
    setActionError(null);
    setActionSuccess(null);
    setSubmitting(true);

    try {
      const txHash = await writeContractAsync({
        address: contractAddress,
        abi: midpointAbi,
        functionName: "cancel",
        args: [dealId],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status === "success") {
        setActionSuccess("Deal cancelled.");
        await refetchDeal();
      } else {
        setActionError("Cancel transaction failed on chain.");
      }
    } catch (err) {
      setActionError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <PageShell>
        <div className="p-12 text-center text-sm font-medium animate-pulse">
          Loading deal details from chain...
        </div>
      </PageShell>
    );
  }

  if (!deal) {
    return (
      <PageShell>
        <div className="p-8 bg-[var(--bg-surface)] border-2 border-[var(--danger)] rounded-xl text-center space-y-3">
          <p className="font-bold text-base text-[var(--danger)]">Deal #{dealIdStr} not found</p>
          <Link href="/" className="inline-block text-xs font-semibold underline text-[var(--text-secondary)]">
            ← Back to Deals
          </Link>
        </div>
      </PageShell>
    );
  }

  const isSeller = address?.toLowerCase() === deal.seller.toLowerCase();
  const isBuyer = address?.toLowerCase() === deal.buyer.toLowerCase();
  const bothCommitted =
    deal.sellerCommit !== "0x0000000000000000000000000000000000000000000000000000000000000000" &&
    deal.buyerCommit !== "0x0000000000000000000000000000000000000000000000000000000000000000";
  const bothRevealed = deal.askRevealed && deal.bidRevealed;

  return (
    <PageShell>
      <div className="space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1"
          >
            ← Back to all deals
          </Link>
          <span className="text-xs font-mono text-[var(--text-muted)]">
            Deal ID #{deal.id.toString()}
          </span>
        </div>

        {/* Top Header Card */}
        <div className="p-6 bg-[var(--bg-surface)] border-2 border-[var(--border-default)] rounded-xl shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="font-display font-bold text-2xl text-[var(--text-primary)]">
                {deal.title}
              </h1>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Seller: <span className="font-mono">{deal.seller}</span> · Buyer: <span className="font-mono">{deal.buyer}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wider bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                State: {DealState[deal.state]}
              </span>
            </div>
          </div>

          {/* Number Line Visualisation */}
          <div className="pt-2 border-t border-[var(--border-subtle)]">
            <NumberLine deal={deal} />
          </div>

          {/* Counterparty handover instructions */}
          <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg text-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <span className="font-semibold text-[var(--text-primary)]">Share deal link with counterparty: </span>
              <span className="font-mono text-[11px] text-[var(--text-muted)]">
                {typeof window !== "undefined" ? window.location.href : ""}
              </span>
            </div>
            <button
              onClick={() => {
                if (typeof navigator !== "undefined") {
                  navigator.clipboard.writeText(window.location.href);
                  alert("Link copied to clipboard!");
                }
              }}
              className="px-2.5 py-1 bg-white border border-[var(--border-default)] rounded font-semibold text-xs hover:bg-[var(--bg-surface)] cursor-pointer"
            >
              Copy Link
            </button>
          </div>
        </div>

        {/* Toast Alerts */}
        {actionError && (
          <div className="p-4 bg-red-50 border border-[var(--danger)] text-[var(--danger)] rounded-lg text-xs font-medium">
            {actionError}
          </div>
        )}
        {actionSuccess && (
          <div className="p-4 bg-green-50 border border-[var(--success)] text-[var(--success)] rounded-lg text-xs font-medium">
            {actionSuccess}
          </div>
        )}

        {/* Archetype: Two Envelopes Container */}
        <div className="flex flex-col md:flex-row gap-6">
          <EnvelopeCard
            role="seller"
            deal={deal}
            currentAddress={address}
            onCommit={handleCommit}
            onReveal={handleReveal}
            submitting={submitting}
          />

          <EnvelopeCard
            role="buyer"
            deal={deal}
            currentAddress={address}
            onCommit={handleCommit}
            onReveal={handleReveal}
            submitting={submitting}
          />
        </div>

        {/* Deal Actions Panel: Settle, Cancel */}
        <div className="p-6 bg-[var(--bg-surface)] border-2 border-[var(--border-default)] rounded-xl shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-[var(--text-secondary)] space-y-1">
            <p className="font-semibold text-sm text-[var(--text-primary)]">Lifecycle Actions</p>
            {deal.state === DealState.Open && (
              <p>Commitment window closes at unix timestamp {deal.commitBy.toString()}.</p>
            )}
            {deal.state === DealState.Revealing && (
              <p>Reveal window closes at unix timestamp {deal.revealBy.toString()}.</p>
            )}
            {deal.state === DealState.Settled && (
              <p className="text-[var(--success)] font-bold">
                Deal Settled! Final Trade Price: {formatEther(deal.price)} BOT
              </p>
            )}
            {deal.state === DealState.Void && (
              <p className="text-[var(--danger)] font-bold">
                Deal Void. No money moved to seller; buyer ceiling refunded to pending.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isSeller && deal.state === DealState.Open && !deal.buyerCommit && (
              <Button
                variant="danger"
                size="sm"
                onClick={handleCancel}
                disabled={submitting}
              >
                Cancel Deal
              </Button>
            )}

            {(bothRevealed || deal.state === DealState.Revealing || deal.state === DealState.Open) &&
              deal.state !== DealState.Settled &&
              deal.state !== DealState.Void && (
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleSettle}
                  disabled={submitting}
                >
                  {submitting ? "Settling..." : "Settle Deal"}
                </Button>
              )}
          </div>
        </div>

        {/* Limitations Block */}
        <LimitationsBlock />
      </div>
    </PageShell>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, usePublicClient } from "wagmi";
import { formatEther } from "viem";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";
import BotChainGate from "@/components/botchain/BotChainGate";
import { useWriteContract } from "@/lib/useChainWrite";
import { midpointAbi } from "@/lib/botchain/abi";
import { activeBotChain } from "@/lib/botchain/chain";
import { getDeployment, isDeployed } from "@/lib/botchain/deployment";
import { describeError } from "@/lib/errors";

export default function MyEscrowPage() {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: activeBotChain.id });
  const { writeContractAsync } = useWriteContract();

  const [pendingBal, setPendingBal] = useState<bigint | null>(null);
  const [partyDealIds, setPartyDealIds] = useState<bigint[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const deployed = isDeployed(activeBotChain.id);
  const contractAddress = deployed ? getDeployment(activeBotChain.id).address : undefined;

  async function loadUserData() {
    if (!publicClient || !contractAddress || !address) {
      setLoading(false);
      return;
    }

    try {
      const bal = await publicClient.readContract({
        address: contractAddress,
        abi: midpointAbi,
        functionName: "pending",
        args: [address],
      });
      setPendingBal(bal);

      const [ids] = await publicClient.readContract({
        address: contractAddress,
        abi: midpointAbi,
        functionName: "byParty",
        args: [address, 0n, 50n],
      });
      setPartyDealIds([...ids]);
    } catch (err) {
      console.error("Failed to load user escrow data:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUserData();
    const interval = setInterval(loadUserData, 6000);
    return () => clearInterval(interval);
  }, [publicClient?.chain?.id, contractAddress, address]);

  const handleWithdraw = async () => {
    if (!contractAddress || !publicClient) return;
    setErrorMsg(null);
    setStatusMsg(null);
    setSubmitting(true);

    try {
      const txHash = await writeContractAsync({
        address: contractAddress,
        abi: midpointAbi,
        functionName: "withdraw",
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status === "success") {
        setStatusMsg("Withdrawal successful! Funds transferred to your wallet.");
        await loadUserData();
      } else {
        setErrorMsg("Withdrawal transaction failed.");
      }
    } catch (err) {
      setErrorMsg(describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell activeTab="me">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-[var(--text-primary)]">
            My Escrow &amp; History
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Pull-payment pending balance from settled deals or refunds, and your deal history.
          </p>
        </div>

        <BotChainGate>
          <div className="space-y-6">
            {/* Pending Balance Panel */}
            <div className="p-6 bg-[var(--bg-surface)] border-2 border-[var(--border-default)] rounded-xl shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
              <div>
                <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider block">
                  Pending Balance to Withdraw
                </span>
                <p className="text-3xl font-mono font-bold text-[var(--text-primary)] mt-1">
                  {pendingBal !== null ? `${formatEther(pendingBal)} BOT` : "—"}
                </p>
                <p className="text-[11px] text-[var(--text-tertiary)] mt-1">
                  Pull payments prevent reentrancy and transfer failures.
                </p>
              </div>

              <Button
                variant="primary"
                size="lg"
                onClick={handleWithdraw}
                disabled={submitting || !pendingBal || pendingBal === 0n}
              >
                {submitting ? "Withdrawing..." : "Withdraw Funds"}
              </Button>
            </div>

            {statusMsg && (
              <div className="p-4 bg-green-50 border border-[var(--success)] text-[var(--success)] rounded-lg text-xs font-medium">
                {statusMsg}
              </div>
            )}
            {errorMsg && (
              <div className="p-4 bg-red-50 border border-[var(--danger)] text-[var(--danger)] rounded-lg text-xs font-medium">
                {errorMsg}
              </div>
            )}

            {/* My Deals History */}
            <div className="p-6 bg-[var(--bg-surface)] border-2 border-[var(--border-default)] rounded-xl shadow-sm space-y-3">
              <h2 className="font-display font-bold text-lg text-[var(--text-primary)]">
                Your Deals ({partyDealIds.length})
              </h2>

              {loading ? (
                <div className="text-xs text-[var(--text-muted)] py-4 animate-pulse">
                  Loading your deal history...
                </div>
              ) : partyDealIds.length === 0 ? (
                <div className="text-xs text-[var(--text-muted)] py-4">
                  You are not yet a party to any deals.
                </div>
              ) : (
                <div className="divide-y divide-[var(--border-subtle)]">
                  {partyDealIds.map((id) => (
                    <div
                      key={id.toString()}
                      className="py-3 flex items-center justify-between gap-2"
                    >
                      <span className="text-xs font-mono font-semibold">
                        Deal #{id.toString()}
                      </span>
                      <Link
                        href={`/deal/${id.toString()}`}
                        className="text-xs font-semibold px-3 py-1 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded hover:bg-white"
                      >
                        Open Envelopes →
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </BotChainGate>
      </div>
    </PageShell>
  );
}

"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, usePublicClient } from "wagmi";
import { parseEther, isAddress, type Address } from "viem";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";
import BotChainGate from "@/components/botchain/BotChainGate";
import { useWriteContract } from "@/lib/useChainWrite";
import { midpointAbi } from "@/lib/botchain/abi";
import { activeBotChain } from "@/lib/botchain/chain";
import { getDeployment, isDeployed } from "@/lib/botchain/deployment";
import { describeError } from "@/lib/errors";

export default function OpenDealPage() {
  const router = useRouter();
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: activeBotChain.id });
  const { writeContractAsync } = useWriteContract();

  const [buyerInput, setBuyerInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [termsInput, setTermsInput] = useState("");
  const [ceilingInput, setCeilingInput] = useState("1.0");
  const [commitHours, setCommitHours] = useState("24");
  const [revealHours, setRevealHours] = useState("24");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const deployed = isDeployed(activeBotChain.id);
  const contractAddress = deployed ? getDeployment(activeBotChain.id).address : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractAddress || !publicClient) return;
    setErrorMsg(null);

    if (!isAddress(buyerInput)) {
      setErrorMsg("Please enter a valid checksummed Ethereum address for the buyer.");
      return;
    }

    if (buyerInput.toLowerCase() === address?.toLowerCase()) {
      setErrorMsg("The buyer address cannot be yourself.");
      return;
    }

    try {
      setSubmitting(true);
      const ceilingWei = parseEther(ceilingInput);
      const commitSecs = BigInt(Math.max(1, Number(commitHours))) * 3600n;
      const revealSecs = Number(Math.max(1, Number(revealHours))) * 3600;

      const txHash = await writeContractAsync({
        address: contractAddress,
        abi: midpointAbi,
        functionName: "open",
        args: [
          buyerInput as Address,
          titleInput,
          termsInput,
          ceilingWei,
          commitSecs,
          revealSecs,
        ],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status === "success") {
        router.push("/");
      } else {
        setErrorMsg("Transaction mined but failed.");
      }
    } catch (err: unknown) {
      setErrorMsg(describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell activeTab="open">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-[var(--text-primary)]">
            Open a Midpoint Deal
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Specify the buyer and terms. Both sides will seal secret prices within the ceiling.
          </p>
        </div>

        <BotChainGate>
          <div className="p-6 bg-[var(--bg-surface)] border-2 border-[var(--border-default)] rounded-xl shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                  Buyer Counterparty Address
                </label>
                <input
                  type="text"
                  required
                  value={buyerInput}
                  onChange={(e) => setBuyerInput(e.target.value.trim())}
                  placeholder="0x..."
                  className="w-full px-3 py-2 bg-white border border-[var(--border-default)] rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
                <span className="text-[11px] text-[var(--text-muted)]">
                  Only this designated address can commit the buyer&apos;s bid.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                  Deal Title ({titleInput.length}/64 bytes)
                </label>
                <input
                  type="text"
                  required
                  maxLength={64}
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  placeholder="e.g. 1968 Chronograph Watch"
                  className="w-full px-3 py-2 bg-white border border-[var(--border-default)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                  Terms &amp; Description ({termsInput.length}/300 bytes)
                </label>
                <textarea
                  required
                  rows={3}
                  maxLength={300}
                  value={termsInput}
                  onChange={(e) => setTermsInput(e.target.value)}
                  placeholder="Describe goods, condition, delivery method, and expectations..."
                  className="w-full px-3 py-2 bg-white border border-[var(--border-default)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Price Ceiling (BOT)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    max="100000"
                    required
                    value={ceilingInput}
                    onChange={(e) => setCeilingInput(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[var(--border-default)] rounded-md text-sm font-mono"
                  />
                  <span className="text-[11px] text-[var(--text-muted)]">
                    Buyer escrows this full ceiling.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Commit Window (Hours)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="168"
                    required
                    value={commitHours}
                    onChange={(e) => setCommitHours(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[var(--border-default)] rounded-md text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Reveal Window (Hours)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="168"
                    required
                    value={revealHours}
                    onChange={(e) => setRevealHours(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[var(--border-default)] rounded-md text-sm font-mono"
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 bg-red-50 border border-[var(--danger)] text-[var(--danger)] rounded text-xs font-medium">
                  {errorMsg}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                className="w-full mt-4"
                disabled={submitting}
              >
                {submitting ? "Opening Deal..." : "Open Deal on Chain (0 BOT)"}
              </Button>
            </form>
          </div>
        </BotChainGate>
      </div>
    </PageShell>
  );
}

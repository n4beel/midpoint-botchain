import React from "react";

export function LimitationsBlock() {
  return (
    <div className="p-5 bg-[var(--bg-surface)] border-2 border-[var(--border-default)] rounded-xl shadow-sm space-y-3">
      <h3 className="font-display font-bold text-sm text-[var(--text-primary)]">
        What the midpoint can&apos;t do
      </h3>
      <ul className="text-xs text-[var(--text-secondary)] space-y-2 list-disc list-inside leading-relaxed">
        <li>
          It moves money only. It doesn&apos;t check the goods or the hand-over.
        </li>
        <li>
          Honest prices aren&apos;t guaranteed. Either side can shade their number.
        </li>
        <li>
          With no deal, both numbers become public. If someone doesn&apos;t reveal, there&apos;s no deal.
        </li>
      </ul>
    </div>
  );
}

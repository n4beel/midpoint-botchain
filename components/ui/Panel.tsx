import React from "react";

interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "envelope" | "flat" | "elevated";
}

export function Panel({
  children,
  className = "",
  variant = "envelope",
  ...props
}: PanelProps) {
  let baseClass = "p-5 ";
  if (variant === "envelope") {
    baseClass +=
      "bg-[var(--bg-surface)] border-2 border-[var(--border-default)] rounded-xl shadow-sm ";
  } else if (variant === "elevated") {
    baseClass +=
      "bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl ";
  } else {
    baseClass += "bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg ";
  }

  return (
    <div className={`${baseClass} ${className}`} {...props}>
      {children}
    </div>
  );
}

export default Panel;

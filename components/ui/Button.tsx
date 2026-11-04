import React from "react";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}

export function Button({
  children,
  className = "",
  variant = "primary",
  size = "md",
  disabled,
  ...props
}: ButtonProps) {
  let vClass = "";
  if (variant === "primary") {
    vClass =
      "bg-[var(--accent)] text-[var(--accent-ink)] hover:opacity-95 active:scale-[0.99] shadow-sm";
  } else if (variant === "secondary") {
    vClass =
      "bg-[var(--bg-surface)] text-[var(--text-primary)] border-2 border-[var(--border-default)] hover:bg-[var(--bg-elevated)]";
  } else if (variant === "danger") {
    vClass = "bg-[var(--danger)] text-white hover:opacity-95 shadow-sm";
  } else {
    vClass = "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]";
  }

  let sClass = "px-4 py-2 text-sm";
  if (size === "sm") sClass = "px-2.5 py-1 text-xs";
  if (size === "lg") sClass = "px-6 py-3 text-base font-semibold";

  return (
    <button
      disabled={disabled}
      className={`font-semibold rounded-lg transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none inline-flex items-center justify-center gap-2 ${vClass} ${sClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

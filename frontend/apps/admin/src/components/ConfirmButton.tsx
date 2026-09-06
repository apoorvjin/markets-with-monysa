import { useState } from "react";
import type { ReactNode } from "react";

// Two-step destructive action: first click arms it, second confirms. Used by
// Subscriptions "Remove" and Alerts "Delete", which previously fired
// immediately on a single click — inconsistent with the Users page's
// delete-account flow, which already required a second confirm click.
export function ConfirmButton({
  onConfirm,
  disabled,
  children,
  confirmLabel = "Confirm",
  className = "btn btn-danger btn-sm",
}: {
  onConfirm: () => void;
  disabled?: boolean;
  children: ReactNode;
  confirmLabel?: string;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <span style={{ display: "flex", gap: "var(--s2)" }}>
        <button
          className={className}
          disabled={disabled}
          onClick={() => { setConfirming(false); onConfirm(); }}
        >
          {confirmLabel}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button className={className} disabled={disabled} onClick={() => setConfirming(true)}>
      {children}
    </button>
  );
}

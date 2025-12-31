"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type Props = {
  className?: string;
  pendingText?: string;
  children: ReactNode;
  type?: "submit" | "button";
  disabled?: boolean;
};

export default function AdminActionButton({
  className,
  pendingText = "Folyamatban...",
  children,
  type = "submit",
  disabled = false,
}: Props) {
  const { pending } = useFormStatus();
  const label = pending ? pendingText : children;
  const isDisabled = disabled || pending;

  return (
    <button
      type={type}
      className={className}
      disabled={isDisabled}
      aria-busy={pending}
      data-pending={pending ? "true" : "false"}
    >
      {label}
    </button>
  );
}

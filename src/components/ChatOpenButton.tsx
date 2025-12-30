"use client";

import type { CSSProperties, ReactNode } from "react";

type Props = {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

export default function ChatOpenButton({ className, style, children }: Props) {
  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={() => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("sg:chat:open"));
        }
      }}
    >
      {children}
    </button>
  );
}

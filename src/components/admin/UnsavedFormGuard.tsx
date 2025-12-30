"use client";

import { useEffect, useRef } from "react";

type Props = {
  formId: string;
  message?: string;
};

export default function UnsavedFormGuard({
  formId,
  message = "Nem mentett változtatások vannak. Biztosan kilépsz?",
}: Props) {
  const dirtyRef = useRef(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;

    const markDirty = () => {
      if (submittingRef.current) return;
      dirtyRef.current = true;
    };

    const onSubmit = () => {
      submittingRef.current = true;
      dirtyRef.current = false;
    };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = message;
    };

    const onClickCapture = (e: MouseEvent) => {
      if (!dirtyRef.current) return;
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const ok = window.confirm(message);
      if (ok) return;

      e.preventDefault();
      e.stopPropagation();
      (e as any).stopImmediatePropagation?.();
    };

    form.addEventListener("input", markDirty, true);
    form.addEventListener("change", markDirty, true);
    form.addEventListener("submit", onSubmit, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClickCapture, true);

    return () => {
      form.removeEventListener("input", markDirty, true);
      form.removeEventListener("change", markDirty, true);
      form.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [formId, message]);

  return null;
}

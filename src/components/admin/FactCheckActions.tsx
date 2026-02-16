"use client";

import { useEffect } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import AdminActionButton from "@/components/admin/AdminActionButton";

type ActionState = { ok: boolean; message: string };

const initialState: ActionState = { ok: false, message: "" };

type Props = {
  articleId: string;
  articleSlug: string;
  onFactCheck: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  onFactFix: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
};

export default function FactCheckActions({
  articleId,
  articleSlug,
  onFactCheck,
  onFactFix,
}: Props) {
  const router = useRouter();
  const [checkState, checkAction] = useActionState(onFactCheck, initialState);
  const [fixState, fixAction] = useActionState(onFactFix, initialState);

  const message = fixState.message || checkState.message;
  const isOk = fixState.message ? fixState.ok : checkState.ok;

  useEffect(() => {
    // Fact-check/fix can change article content on the server.
    // Refresh to ensure editor shows the latest persisted text.
    if (fixState.ok || checkState.ok) {
      router.refresh();
    }
  }, [fixState.ok, checkState.ok, router]);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <form action={checkAction}>
        <input type="hidden" name="article_id" value={articleId} />
        <input type="hidden" name="article_slug" value={articleSlug} />
        <AdminActionButton
          className="text-sm font-semibold rounded-lg px-3 py-2 border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 transition"
          pendingText="Fact-check fut..."
        >
          AI fact-check futtatása
        </AdminActionButton>
      </form>
      <form action={fixAction}>
        <input type="hidden" name="article_id" value={articleId} />
        <input type="hidden" name="article_slug" value={articleSlug} />
        <AdminActionButton
          className="text-sm font-semibold rounded-lg px-3 py-2 border border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 transition"
          pendingText="Javítás fut..."
        >
          Fix with AI
        </AdminActionButton>
      </form>
      {message ? (
        <div
          className={
            isOk
              ? "text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2"
              : "text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
          }
        >
          {message}
        </div>
      ) : null}
    </div>
  );
}

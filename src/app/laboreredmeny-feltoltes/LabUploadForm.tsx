"use client";

import { useMemo, useState } from "react";

const allowed = ".pdf,.png,.jpg,.jpeg,.webp";

function logUploadEvent(eventName: string, payload: Record<string, unknown> = {}) {
  fetch("/api/mi-hianyzik/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "labor_upload_form",
      eventName,
      mode: "landing",
      payload,
    }),
    keepalive: true,
  }).catch(() => null);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function LabUploadForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fileLabel = useMemo(() => {
    if (!file) return "PDF, JPG, PNG vagy WEBP";
    return `${file.name} · ${formatFileSize(file.size)}`;
  }, [file]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!name.trim()) return setError("Add meg a neved.");
    if (!email.trim()) return setError("Add meg az e-mail címed.");
    if (!file) return setError("Töltsd fel a laboreredményt.");

    setIsSubmitting(true);
    try {
      const body = new FormData();
      body.append("name", name.trim());
      body.append("email", email.trim());
      body.append("file", file);

      const response = await fetch("/api/labor-upload", {
        method: "POST",
        body,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Nem sikerült feltölteni a laboreredményt.");

      logUploadEvent("lab_upload_completed", {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || "unknown",
      });
      setSuccess("A laboreredményt sikeresen megkaptuk. Hamarosan e-mailben jelentkezünk az összefoglalóval.");
      setName("");
      setEmail("");
      setFile(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Váratlan hiba történt.";
      setError(message);
      logUploadEvent("lab_upload_failed", { message });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="lab-name" className="block text-sm font-semibold text-slate-900">
          Név
        </label>
        <input
          id="lab-name"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded-2xl border border-slate-900/12 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-500"
          placeholder="Teljes neved"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="lab-email" className="block text-sm font-semibold text-slate-900">
          E-mail
        </label>
        <input
          id="lab-email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-2xl border border-slate-900/12 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-500"
          placeholder="nev@email.hu"
        />
      </div>

      <div className="space-y-2">
        <span className="block text-sm font-semibold text-slate-900">Laboreredmény feltöltése</span>
        <label className="block cursor-pointer rounded-3xl border border-dashed border-slate-900/20 bg-slate-50 px-4 py-5 transition hover:border-orange-500 hover:bg-orange-50/40">
          <input
            type="file"
            accept={allowed}
            className="sr-only"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-600 text-xl font-black text-white">
              ↑
            </div>
            <div>
              <div className="text-base font-black text-slate-900">Laboreredmény feltöltése</div>
              <div className="text-sm text-slate-600">{fileLabel}</div>
            </div>
          </div>
        </label>
      </div>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex min-h-[52px] items-center justify-center rounded-full bg-orange-600 px-6 text-base font-black text-white shadow-[0_16px_32px_rgba(194,65,12,0.22)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Feltöltés folyamatban..." : "Laboreredmény feltöltése"}
      </button>
    </form>
  );
}

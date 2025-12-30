"use client";

import React, { useEffect, useRef, useState } from "react";

type Props = {
  name: string;
  initialHtml: string;
};

export default function HtmlEditor({ name, initialHtml }: Props) {
  const [mode, setMode] = useState<"visual" | "html">("visual");
  const [html, setHtml] = useState<string>(initialHtml || "");
  const editorRef = useRef<HTMLDivElement | null>(null);

  // Keep visual editor DOM in sync when switching back from HTML view
  useEffect(() => {
    if (mode !== "visual") return;
    if (!editorRef.current) return;

    if (editorRef.current.innerHTML !== html) {
      editorRef.current.innerHTML = html;
    }
  }, [html, mode]);

  function updateFromDom() {
    setHtml(editorRef.current?.innerHTML || "");
  }

  function ensureStyleWithCss() {
    try {
      document.execCommand("styleWithCSS", false, "true");
    } catch {}
  }

  function normalizeLegacyFontTags(root: HTMLElement) {
    const map: Record<string, string> = {
      "1": "12px",
      "2": "14px",
      "3": "16px",
      "4": "18px",
      "5": "22px",
      "6": "26px",
      "7": "32px",
    };

    const fonts = Array.from(root.querySelectorAll("font[size]"));
    for (const f of fonts) {
      const size = f.getAttribute("size") || "3";
      const span = document.createElement("span");
      span.style.fontSize = map[size] || "16px";

      while (f.firstChild) span.appendChild(f.firstChild);
      f.replaceWith(span);
    }
  }

  function applyFontSizePx(px: string) {
    if (mode !== "visual") return;
    const root = editorRef.current;
    if (!root) return;

    root.focus();
    ensureStyleWithCss();

    const bucket =
      px === "14px" ? "2" :
      px === "16px" ? "3" :
      px === "18px" ? "4" :
      px === "22px" ? "5" : "3";

    try {
      document.execCommand("fontSize", false, bucket);
    } catch {}

    normalizeLegacyFontTags(root);
    updateFromDom();
  }

  function exec(cmd: string) {
    if (mode !== "visual") return;
    editorRef.current?.focus();
    document.execCommand(cmd);
    updateFromDom();
  }

  function applyBlock(block: "p" | "h2" | "h3" | "blockquote") {
    if (mode !== "visual") return;
    editorRef.current?.focus();
    try {
      // execCommand expects tags like <p>, <h2>...
      document.execCommand("formatBlock", false, `<${block}>`);
    } catch {}
    updateFromDom();
  }

  return (
      <div className="space-y-2">
        {/* Hidden input for server action */}
        <input type="hidden" name={name} value={html} />

        {/* Toolbar */}
        <div className="rounded-xl border bg-white p-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
                type="button"
                className="px-3 py-1.5 rounded-lg border text-sm hover:bg-gray-50"
                onClick={() => exec("bold")}
            >
              B
            </button>
            <button
                type="button"
                className="px-3 py-1.5 rounded-lg border text-sm hover:bg-gray-50 italic"
                onClick={() => exec("italic")}
            >
              i
            </button>
            <button
                type="button"
                className="px-3 py-1.5 rounded-lg border text-sm hover:bg-gray-50"
                onClick={() => exec("underline")}
            >
              U
            </button>

            <span className="mx-1 h-6 w-px bg-gray-200" />

            <button
                type="button"
                className="px-3 py-1.5 rounded-lg border text-sm hover:bg-gray-50"
                onClick={() => exec("insertUnorderedList")}
                title="Felsorolás"
            >
              • Lista
            </button>
            <button
                type="button"
                className="px-3 py-1.5 rounded-lg border text-sm hover:bg-gray-50"
                onClick={() => exec("insertOrderedList")}
                title="Számozott lista"
            >
              1. Lista
            </button>

            <span className="mx-1 h-6 w-px bg-gray-200" />

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600">Méret</span>
              <select
                  className="border rounded-lg px-2 py-1 text-sm"
                  defaultValue=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    applyFontSizePx(v);
                    e.target.value = "";
                  }}
              >
                <option value="">—</option>
                <option value="14px">Kicsi</option>
                <option value="16px">Normál</option>
                <option value="18px">Nagy</option>
                <option value="22px">XL</option>
              </select>
            </div>

            <span className="mx-1 h-6 w-px bg-gray-200" />

            <button
              type="button"
              className="px-3 py-1.5 rounded-lg border text-sm hover:bg-gray-50"
              onClick={() => {
                const root = editorRef.current;
                if (!root) return;
                root.focus();
                ensureStyleWithCss();
                try {
                  document.execCommand("removeFormat");
                  document.execCommand("unlink");
                } catch {}
                updateFromDom();
              }}
            >
              Formázás törlése
            </button>

            <span className="mx-1 h-6 w-px bg-gray-200" />

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600">Stílus</span>
              <select
                className="border rounded-lg px-2 py-1 text-sm bg-white"
                defaultValue=""
                onChange={(e) => {
                  const v = e.target.value as "p" | "h2" | "h3" | "blockquote" | "";
                  if (!v) return;
                  applyBlock(v);
                  e.target.value = "";
                }}
              >
                <option value="">—</option>
                <option value="p">Szöveg</option>
                <option value="h2">Címsor (H2)</option>
                <option value="h3">Alcím (H3)</option>
                <option value="blockquote">Idézet</option>
              </select>
            </div>

            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border text-sm hover:bg-gray-50"
                onClick={() => setMode((m) => (m === "visual" ? "html" : "visual"))}
              >
                {mode === "visual" ? "HTML nézet" : "Vizuális nézet"}
              </button>
            </div>
          </div>
        </div>

        {/* Editor */}
        {mode === "html" ? (
            <textarea
                className="w-full border rounded-xl p-3 font-mono text-sm min-h-[260px] bg-white"
                value={html}
                onChange={(e) => setHtml(e.target.value)}
            />
        ) : (
            <div
                ref={editorRef}
                className="html-editor-content border rounded-xl p-4 bg-white min-h-[320px]"
                contentEditable
                suppressContentEditableWarning
                onInput={updateFromDom}
                onBlur={updateFromDom}
            />
        )}

        {/* Make bullets/numbers visible INSIDE the editor */}
        <style jsx global>{`
        .html-editor-content {
          line-height: 1.7;
          font-size: 16px;
          color: #111827;
        }

        .html-editor-content p {
          margin: 0.75rem 0;
        }

        .html-editor-content h2 {
          font-size: 1.5rem;
          line-height: 1.25;
          margin: 1.25rem 0 0.75rem;
          font-weight: 700;
        }

        .html-editor-content h3 {
          font-size: 1.25rem;
          line-height: 1.25;
          margin: 1rem 0 0.5rem;
          font-weight: 700;
        }

        .html-editor-content blockquote {
          margin: 1rem 0;
          padding: 0.75rem 1rem;
          border-left: 4px solid rgba(194, 65, 11, 0.45);
          background: rgba(194, 65, 11, 0.06);
          border-radius: 12px;
          color: #374151;
        }

        /* Lists: more indent + outside markers so they don't hug the border */
        .html-editor-content ul,
        .html-editor-content ol {
          list-style-position: outside;
          padding-left: 2rem;
          margin: 0.9rem 0;
        }

        .html-editor-content ul { list-style-type: disc; }
        .html-editor-content ol { list-style-type: decimal; }

        .html-editor-content li {
          margin: 0.35rem 0;
          padding-left: 0.25rem;
        }

        /* If pasted content wraps <p> inside <li>, remove extra margins */
        .html-editor-content li > p {
          margin: 0.25rem 0;
        }
      `}</style>
      </div>
  );
}
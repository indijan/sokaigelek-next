"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "sg_cookie_notice_hidden";

export default function CookieNotice() {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const v = window.localStorage.getItem(STORAGE_KEY);
    setHidden(v === "1");
  }, []);

  if (hidden) return null;

  return (
    <div className="fixed bottom-3 left-3 right-3 z-50">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white/90 px-4 py-3 text-xs text-gray-700 shadow-md backdrop-blur">
        <div>
          Az oldal sütiket használ a jobb élményért. A folytatással elfogadod.
        </div>
        <button
          type="button"
          onClick={() => {
            window.localStorage.setItem(STORAGE_KEY, "1");
            window.dispatchEvent(new CustomEvent("sg:consent:gtm"));
            setHidden(true);
          }}
          className="shrink-0 rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          Rendben
        </button>
      </div>
    </div>
  );
}

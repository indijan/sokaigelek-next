"use client";

import { useState } from "react";

export default function YouTubeEmbed({
  videoId,
  title,
}: {
  videoId: string;
  title: string;
}) {
  const [active, setActive] = useState(false);
  const thumbUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return (
    <div style={{ position: "relative", paddingTop: "56.25%", borderRadius: 14, overflow: "hidden", background: "#000" }}>
      {active ? (
        <iframe
          src={`https://www.youtube.com/embed/${videoId}`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setActive(true)}
          aria-label={`${title} – lejátszás`}
          style={{
            position: "absolute",
            inset: 0,
            display: "block",
            padding: 0,
            border: 0,
            background: "transparent",
            cursor: "pointer",
          }}
        >
          <img
            src={thumbUrl}
            alt=""
            loading="lazy"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              background: "linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.45))",
            }}
          >
            <span
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.9)",
                display: "grid",
                placeItems: "center",
                boxShadow: "0 10px 24px rgba(0,0,0,0.25)",
              }}
            >
              <span
                style={{
                  display: "block",
                  width: 0,
                  height: 0,
                  borderTop: "10px solid transparent",
                  borderBottom: "10px solid transparent",
                  borderLeft: "16px solid #111",
                  marginLeft: 4,
                }}
              />
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

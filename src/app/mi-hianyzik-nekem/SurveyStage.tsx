"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

type SurveyStageProps = {
  id?: string;
  title?: string;
  description?: string;
  children: ReactNode;
};

function clamp(v: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, v));
}

export default function SurveyStage({ id, title, description, children }: SurveyStageProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const onScroll = () => {
      const rect = node.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const start = vh * 0.9;
      const end = -vh * 0.2;
      const p = clamp((start - rect.top) / (start - end));
      setProgress(p);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <section
      id={id}
      ref={ref}
      className="mh-survey-stage"
      style={{ "--survey-progress": progress } as CSSProperties}
    >
      <div className="mh-survey-stage-sticky">
        <div className="mh-survey-stage-bg" aria-hidden />
        <div className="mh-survey-stage-content">
          {title ? <h2>{title}</h2> : null}
          {description ? <p>{description}</p> : null}
          <div className="mh-survey-app-frame">{children}</div>
        </div>
      </div>
    </section>
  );
}

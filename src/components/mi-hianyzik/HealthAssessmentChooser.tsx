"use client";

import { useState } from "react";
import WhatMayBeMissingMiniApp from "./WhatMayBeMissingMiniApp";
import LabResultChecker from "./LabResultChecker";
import "./HealthAssessmentChooser.css";

type HealthAssessmentChooserProps = {
  mode?: "landing" | "inline_article";
};

export default function HealthAssessmentChooser({ mode = "landing" }: HealthAssessmentChooserProps) {
  const [surveyState, setSurveyState] = useState({ started: false, hasResult: false, entrySelected: false });
  const surveyInProgress = surveyState.started && !surveyState.hasResult;

  return (
    <div className={`mh-choice-shell${surveyInProgress ? " is-survey-focused" : ""}`}>
      {!surveyInProgress ? (
        <>
          <div className="mh-choice-intro">
            <span>Válassz indulási módot</span>
            <h2>Indulhat?</h2>
            <p>
              Ha van friss, digitális laboreredményed, abból is tudunk érthető összefoglalót és támogatási irányt adni.
              Ha nincs, marad a gyors állapotfelmérés.
            </p>
          </div>

          <div className="mh-choice-grid" aria-label="Állapotfelmérés indulási mód">
            <a className="mh-choice-card mh-choice-card-primary" href="#kerdoiv">
              <span className="mh-choice-icon" aria-hidden>
                ✦
              </span>
              <strong>Kérdőíves állapotfelmérés</strong>
              <small>Legfeljebb 5 kérdés, a tüneteid és céljaid alapján.</small>
            </a>
            <a className="mh-choice-card" href="#labor-checker">
              <span className="mh-choice-icon" aria-hidden>
                ◌
              </span>
              <strong>Laboreredmény checker</strong>
              <small>Digitális vérvizsgálati leletből eltérések, összefoglaló és termékirány.</small>
            </a>
          </div>
        </>
      ) : null}

      <section id="kerdoiv" className="mh-choice-panel">
        {!surveyInProgress ? (
          <div className="mh-choice-panel-heading">
            <span>1. opció</span>
            <h3>Kérdőíves állapotfelmérés</h3>
          </div>
        ) : null}
        <WhatMayBeMissingMiniApp mode={mode} onFlowStateChange={setSurveyState} />
      </section>

      {!surveyInProgress ? (
        <section id="labor-checker" className="mh-choice-panel mh-choice-panel-lab">
          <div className="mh-choice-panel-heading">
            <span>2. opció</span>
            <h3>Laboreredmény checker</h3>
            <p>
              Tölts fel digitális laboreredményt, és kapsz egy rövid, közérthető összefoglalót. Nem diagnózis, hanem
              edukatív értelmezés és következő lépés.
            </p>
          </div>
          <LabResultChecker />
        </section>
      ) : null}
    </div>
  );
}

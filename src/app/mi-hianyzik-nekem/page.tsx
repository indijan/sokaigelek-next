import type { Metadata } from "next";
import HealthAssessmentChooser from "@/components/mi-hianyzik/HealthAssessmentChooser";
import SurveyStage from "./SurveyStage";
import "./page.css";

export const metadata: Metadata = {
  title: "Mi hiányzik nekem? | Sokáig élek",
  description:
    "2 perces állapotfelmérés, ami legfeljebb 5 kérdésből személyre szabott irányt mutat, gyakorlati tanácsokat és releváns termékajánlást ad.",
  alternates: { canonical: "/mi-hianyzik-nekem" },
};

export default function MiHianyzikNekemPage() {
  return (
    <div className="mh-landing">
      <section className="mh-landing-hero">
        <div className="mh-landing-eyebrow">2 perces állapotfelmérés</div>
        <h1>Mi hiányzik nekem?</h1>
        <p>
          Néha a tested nem hangosan szól, csak apró jeleket küld: fáradtabb vagy, nehezebben regenerálódsz,
          szétesik a fókuszod, érzékenyebb az emésztésed, görcsöl az izmod, vagy egyszerűen nem érzed magad igazán
          egyben. Ez az állapotfelmérés abban segít, hogy ezekből a jelekből érthetőbb mintát láss.
        </p>
        <p className="mh-landing-trust">
          Nem diagnózis, hanem egy személyre szabott iránytű. A válaszaid alapján csak olyan kérdéseket kapsz, amelyek
          kapcsolódnak ahhoz, amit érzel, a végén pedig kapsz egy valószínű mintát, érthető magyarázatot, gyakorlati
          következő lépéseket és hozzád illő támogatási javaslatokat.
        </p>
        <div className="mh-landing-actions">
          <a href="#felmeres" className="mh-landing-btn mh-landing-btn-primary">
            Kezdem a felmérést
          </a>
        </div>
      </section>

      <section id="hogyan-mukodik" className="mh-landing-block">
        <h2>Nem hosszú teszt. Pár kérdés, ami tényleg rád koncentrál.</h2>
        <p>
          Két úton indulhatsz: végigmész a rövid kérdőíven, vagy ha van friss digitális laboreredményed, feltöltöd, és
          abból kapsz közérthető összefoglalót. A kérdőív nem végigzavar egy sablonos kérdéssoron, hanem azon az ágon
          halad tovább, ami a válaszaid alapján releváns. A labor checker pedig a leletedben szereplő értékekből emeli
          ki, mi kérhet figyelmet. Mindkét út rövid, gyakorlati és személyre szabott irányt ad.
        </p>
        <div className="mh-landing-benefits">
          <article>
            <div className="mh-benefit-icon" aria-hidden>
              ⚡
            </div>
            <h3>Gyors</h3>
            <p>Legfeljebb 5 kérdés.</p>
          </article>
          <article>
            <div className="mh-benefit-icon" aria-hidden>
              🎯
            </div>
            <h3>Releváns</h3>
            <p>Csak a hozzád illő kérdéseket látod.</p>
          </article>
          <article>
            <div className="mh-benefit-icon" aria-hidden>
              ✅
            </div>
            <h3>Hasznos</h3>
            <p>A végén konkrét következő lépést kapsz.</p>
          </article>
        </div>
      </section>

      <SurveyStage id="felmeres">
        <HealthAssessmentChooser mode="landing" />
      </SurveyStage>

      <section className="mh-landing-block">
        <h2>A tested nem ellened dolgozik</h2>
        <p>
          Sokszor már jóval hamarabb jelez, mint ahogy komolyabb problémát érzékelnél. Minél hamarabb felismered a
          visszatérő mintázatokat, annál könnyebben tudsz jól reagálni rájuk. Ez az állapotfelmérő ebben segít: nem
          megijeszteni akar, hanem irányt adni.
        </p>
      </section>

      <section className="mh-landing-closing">
        <h2>Nem kell mindent egyszerre megoldanod</h2>
        <p>
          Elég, ha azzal a területtel kezded, amire most a tested a leghangosabban jelez. A következetes, jól
          megválasztott apró lépések számítanak igazán.
        </p>
      </section>
    </div>
  );
}

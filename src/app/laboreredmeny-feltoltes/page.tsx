import type { Metadata } from "next";
import LabUploadForm from "./LabUploadForm";

export const metadata: Metadata = {
  title: "Töltsd fel a laboreredményed | Sokáig élek",
  description:
    "PDF, kép vagy fotó formátumban töltsd fel a laboreredményedet, és e-mailben küldünk érthető összefoglalót gyakorlati tanácsokkal.",
  alternates: { canonical: "/laboreredmeny-feltoltes" },
};

export default function LaborEredmenyFeltoltesPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <div className="rounded-[28px] border border-slate-900/10 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] md:p-8">
        <div className="space-y-4">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Laborfeltöltés</div>
          <h1 className="text-3xl md:text-4xl font-black tracking-[-0.02em] text-slate-900">
            Töltsd fel a laboreredményed
          </h1>
          <p className="text-base leading-7 text-slate-700">
            Itt tudod elküldeni nekünk a laboreredményedet. PDF, kép vagy fotó is megfelelő, ha az értékek jól
            olvashatók.
          </p>
          <p className="text-base leading-7 text-slate-700">
            Átnézzük az eredményedet, és e-mailben küldünk egy érthető összefoglalót, gyakorlati tanácsokkal és
            személyre szabott támogatási irányokkal.
          </p>
        </div>

        <div className="mt-8">
          <LabUploadForm />
        </div>

        <div className="mt-8 rounded-2xl border border-slate-900/10 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
          <strong className="block text-slate-900 mb-1">Adatvédelmi rövid szöveg</strong>
          Az adataidat kizárólag a laboreredményed elemzésére és az eredmény elküldésére használjuk. Nem adjuk tovább
          harmadik félnek.
        </div>
      </div>
    </main>
  );
}

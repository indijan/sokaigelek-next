import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kapcsolat | Sokáig élek",
  description: "Kapcsolatfelvétel a Sokáig élek csapatával emailen, WhatsAppon vagy Messengeren.",
};

type ContactCardProps = {
  title: string;
  description: string;
  href: string;
  cta: string;
};

function ContactCard({ title, description, href, cta }: ContactCardProps) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer noopener" : undefined}
      className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="text-lg font-semibold text-slate-900">{title}</div>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
      <div className="mt-4 text-sm font-semibold text-orange-700">{cta} →</div>
    </a>
  );
}

export default function ContactPage() {
  return (
    <main className="container mx-auto px-4 py-8 md:py-10">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-b from-orange-50 to-white p-6 md:p-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Kapcsolat</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-700">
          Kérdésed van cikkekről, termékekről vagy a feliratkozásról? Írj nekünk az alábbi csatornák egyikén, és
          segítünk.
        </p>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <ContactCard
          title="Email"
          description="Általános kérdések, adatmódosítás és együttműködés."
          href="mailto:csakazertis@sokaigelek.hu"
          cta="Írok emailt"
        />
        <ContactCard
          title="WhatsApp"
          description="Gyors üzenetküldés mobilról vagy asztali gépről."
          href="https://wa.me/64275665850"
          cta="Megnyitom WhatsAppon"
        />
        <ContactCard
          title="Messenger"
          description="Írj nekünk Facebook Messengeren keresztül."
          href="https://m.me/sokaigelek"
          cta="Megnyitom Messengeren"
        />
      </section>
    </main>
  );
}

import Link from "next/link";

type SearchParams = {
    q?: string;
    type?: "minden" | "termek" | "cikk";
};

function isThenable<T>(v: unknown): v is Promise<T> {
    return !!v && typeof v === "object" && "then" in (v as any);
}

function toText(v: unknown) {
    return typeof v === "string" ? v : "";
}

function stripHtml(html: string) {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeHu(s: string) {
    return (s || "")
        .toLowerCase()
        // ékezetek eltávolítása
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        // néhány gyakori ligatúra / külön karakter
        .replace(/ß/g, "ss")
        // nem betű/szám -> szóköz
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function queryTokens(q: string) {
    const base = normalizeHu(q);
    const tokens = base.split(" ").filter(Boolean);
    // rövid, zajos szavak kiszűrése (hu stoplista minimálisan)
    const stop = new Set([
        "a",
        "az",
        "es",
        "és",
        "de",
        "hogy",
        "nem",
        "van",
        "vagy",
        "ami",
        "mint",
        "ha",
        "is",
        "egy",
        "egyik",
        "mert",
        "csak",
        // gyakori “töltelék” igék/szavak
        "vagyok",
        "vagyunk",
        "leszek",
        "lesz",
        "szeretnek",
        "szeretnem",
        "kell",
        "kene",
        "kellene",
        "nagyon",
        "picit",
        "kicsit",
        "most",
        "mar",
    ]);
    return tokens.filter((t) => t.length >= 3 && !stop.has(t));
}

// Később bővíthető: szinonimák / rövidítések / tipikus hibák
const SYNONYMS: Record<string, string[]> = {
    "torokfajas": ["torok", "mandula", "mandulagyulladas", "garat", "kohoges"],
    "fejfajas": ["migren", "fajdalomcsillapito", "homlok"],
    "immunrendszer": ["immun", "vedekezokepesseg", "megfazas", "influenza"],
    "gyulladas": ["gyulladasok", "gyulladascsokkentes", "izuletek"],
};

function stemVariants(token: string) {
    const t = normalizeHu(token);
    const out = new Set<string>();
    if (!t) return [];

    out.add(t);

    // 1) nagyon gyakori magyar toldalékok (durva, de hasznos)
    const suffixes = [
        // többes szám
        "ok",
        "ek",
        "ak",
        "k",

        // birtokos / személyragok + tárgyrag kombók (durva, de sokat segít)
        "edet",
        "odat",
        "adat",
        "emet",
        "omat",
        "amat",
        "ed",
        "od",
        "ad",
        "em",
        "om",
        "am",
        "unk",
        "etek",
        "otok",
        "atok",

        // esetek
        "ban",
        "ben",
        "nak",
        "nek",
        "val",
        "vel",
        "rol",
        "ról",
        "tol",
        "tól",
        "hoz",
        "hez",
        "höz",
        "ra",
        "re",
        "ba",
        "be",
        "on",
        "en",
        "ön",
        "n",

        // igerag / képző jellegű levágások (csak pár gyakori)
        "heted",
        "het",
        "hato",
        "heto",

        // egyéb gyakori végződések
        "t",
        "ot",
        "et",
        "at",
        "al",
        "el",
        "ul",
        "ig",
        "s",
        "os",
        "es",
        "as",
    ];

    for (const suf of suffixes) {
        if (t.endsWith(suf) && t.length > suf.length + 2) {
            out.add(t.slice(0, -suf.length));
        }
    }

    // 2) -s/-es/-os jelzős alakok: stresszes -> stressz, ideges -> ideg
    if (t.endsWith("es") && t.length > 5) out.add(t.slice(0, -2));
    if (t.endsWith("os") && t.length > 5) out.add(t.slice(0, -2));
    if (t.endsWith("s") && t.length > 5) out.add(t.slice(0, -1));

    // 3) ha a végén 'e'/'a' marad a levágások után, próbáljuk azt is eldobni
    for (const v of Array.from(out)) {
        if (v.endsWith("e") && v.length > 4) out.add(v.slice(0, -1));
        if (v.endsWith("a") && v.length > 4) out.add(v.slice(0, -1));
    }

    // 4) rövid, de még értelmes visszaesés (pl. borproblemak -> borproblem)
    for (const v of Array.from(out)) {
        if (v.length >= 6) {
            out.add(v.slice(0, v.length - 1));
        }
    }

    // túl rövid zaj kiszűrés
    return Array.from(out).filter((x) => x.length >= 3);
}

function expandTokens(tokens: string[]) {
    const out = new Set<string>();

    for (const raw of tokens) {
        // token variánsok (szótő + toldalék-levágás)
        for (const v of stemVariants(raw)) out.add(v);

        // szinonimák a token *normalizált* kulcsára
        const key = normalizeHu(raw);
        const syns = SYNONYMS[key];
        if (syns) syns.forEach((x) => stemVariants(x).forEach((v) => out.add(v)));

        // szinonimák a levágott/stem kulcsokra is
        for (const stem of stemVariants(raw)) {
            const syns2 = SYNONYMS[stem];
            if (syns2) syns2.forEach((x) => stemVariants(x).forEach((v) => out.add(v)));
        }
    }

    return Array.from(out);
}

function tokenMatch(haystackRaw: string, tokenVariant: string) {
  const h = normalizeHu(haystackRaw);
  const v = normalizeHu(tokenVariant);
  if (!v) return false;

  // gyors teljes sztring match
  if (h.includes(v)) return true;

  const hayTokens = h.split(" ").filter(Boolean);

  // prefix match (energiaszint -> energiaszintedet)
  if (hayTokens.some(ht => ht.startsWith(v) || (v.length >= 6 && v.startsWith(ht)))) {
    return true;
  }

  // közös prefix match (növelése -> növelheted)
  const min = 5;
  for (const ht of hayTokens) {
    let i = 0;
    const max = Math.min(ht.length, v.length);
    while (i < max && ht[i] === v[i]) i++;
    if (i >= min) return true;
  }

  return false;
}

function matchesQuery(haystackRaw: string, qRaw: string) {
    const h = normalizeHu(haystackRaw);
    const baseTokens = queryTokens(qRaw);
    if (baseTokens.length === 0) {
        // ha a query túl rövid / zajos, akkor fallback a sima normalize+includes
        return h.includes(normalizeHu(qRaw));
    }

    let matched = 0;
    for (const base of baseTokens) {
      const variants = expandTokens([base]);
      const ok = variants.some(v => tokenMatch(haystackRaw, v));
      if (ok) matched++;
    }

    // 1 szavas keresésnél 1 találat is elég, 2+ szavasnál minimum 2 token kell
    return matched >= Math.min(2, baseTokens.length);
}

function scoreMatch(haystackRaw: string, qRaw: string) {
    const h = normalizeHu(haystackRaw);
    const baseTokens = queryTokens(qRaw);
    if (baseTokens.length === 0) return h.includes(normalizeHu(qRaw)) ? 1 : 0;

    let score = 0;

    for (const base of baseTokens) {
        const variants = expandTokens([base]);

        // pontos token egyezés a legerősebb
        if (tokenMatch(haystackRaw, base)) {
            score += 3;
            continue;
        }

        // szótő / variáns egyezés
        if (variants.some((v) => tokenMatch(haystackRaw, v))) {
            score += 2;
            continue;
        }

        // ha valamiért nincs match, 0 pont
    }

    // teljes kifejezés egyezés extra
    if (h.includes(normalizeHu(qRaw))) score += 2;

    return score;
}

function excerptFrom(htmlOrText: string, max = 160) {
    const txt = stripHtml(htmlOrText || "");
    if (txt.length <= max) return txt;
    return txt.slice(0, max).replace(/\s+\S*$/, "").trim() + "…";
}

function safeImg(src?: string | null) {
    const s = (src || "").trim();
    if (!s) return null;
    // next/image remote loader + onError event handler problémák helyett egyszerű <img>
    return s;
}

export default async function KeresesPage(props: {
    searchParams?: SearchParams | Promise<SearchParams>;
}) {
    const sp = isThenable<SearchParams>(props.searchParams)
        ? await props.searchParams
        : (props.searchParams || {});

    const qRaw = toText(sp.q);
    const q = qRaw.trim();
    const type: SearchParams["type"] =
        sp.type === "termek" || sp.type === "cikk" ? sp.type : "minden";

    // Supabase kliens: direkt, server oldalon. (Ha nálad máshol van egy közös helper,
    // később kiválthatjuk.)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    let products: any[] = [];
    let articles: any[] = [];
    let errorMsg = "";

    if (q && supabaseUrl && supabaseKey) {
        try {
            const { createClient } = await import("@supabase/supabase-js");
            const supabase = createClient(supabaseUrl, supabaseKey, {
                auth: { persistSession: false },
            });

            // Termékek
            if (type === "minden" || type === "termek") {
                // Mivel a migrációk miatt a termék tábla mezőnevei eltérhetnek,
                // itt nem támaszkodunk konkrét oszlopnevekre. Kevés termék van,
                // ezért biztonságos a szerver-oldali "select *" + JS szűrés.
                const { data, error } = await supabase
                    .from("products")
                    .select("*")
                    // legyen stabil a találatok köre (ne essen ki releváns elem csak azért, mert túl alacsony a limit)
                    .order("id", { ascending: false })
                    .limit(2000);

                if (error) throw error;

                const rows = (data || []) as any[];
                const qForMatch = q;

                const textOf = (v: any) => (typeof v === "string" ? v : "");
                const haystackOf = (p: any) => {
                    const parts = [
                        textOf(p.name),
                        textOf(p.title),
                        textOf(p.post_title),
                        textOf(p.product_title),

                        textOf(p.short_description),
                        textOf(p.excerpt),
                        textOf(p.post_excerpt),

                        textOf(p.description),
                        textOf(p.content),
                        textOf(p.post_content),
                    ];
                    return parts.join("\n");
                };

                products = rows
                    .map((p) => {
                        const hay = haystackOf(p);
                        const score = scoreMatch(hay, qForMatch);
                        return { p, score, hay };
                    })
                    .filter((x) => {
                        if (!matchesQuery(x.hay, qForMatch)) return false;
                        const toks = queryTokens(qForMatch);

                        // Lazább beengedés: legyenek találatok
                        const minScore = toks.length >= 2 ? 3 : 1;
                        return x.score >= minScore;
                    })
                    .sort((a, b) => {
                        // Erősebb rangsorolás: score + cím egyezés bónusz
                        const titleBonusA = a.p.name?.toLowerCase().includes(qForMatch) ? 5 : 0;
                        const titleBonusB = b.p.name?.toLowerCase().includes(qForMatch) ? 5 : 0;
                        return (b.score + titleBonusB) - (a.score + titleBonusA);
                    })
                    .slice(0, 5)
                    .map((x) => x.p);
            }

            // Cikkek
            if (type === "minden" || type === "cikk") {
                // Ugyanaz a stratégia, mint a termékeknél: kevés cikk van,
                // ezért a legstabilabb a `select *` + JS szűrés. Így nem tud
                // elhasalni attól, hogy pl. `intro` vagy `cover_url` oszlop nincs.
                const { data, error } = await supabase
                    .from("articles")
                    .select("*")
                    // legyen stabil a találatok köre (ne essen ki releváns elem csak azért, mert túl alacsony a limit)
                    .order("id", { ascending: false })
                    .limit(2000);

                if (error) throw error;

                const rows = (data || []) as any[];
                const qForMatch = q;

                const textOf = (v: any) => (typeof v === "string" ? v : "");
                const haystackOf = (a: any) => {
                    const parts = [
                        textOf(a.title),
                        textOf(a.post_title),

                        // opcionális mezők (ha léteznek, akkor lesz benne szöveg)
                        textOf(a.intro),
                        textOf(a.excerpt),
                        textOf(a.post_excerpt),
                        textOf(a.content),
                        textOf(a.post_content),
                    ];
                    return parts.join("\n");
                };

                articles = rows
                    .map((a) => {
                        const hay = haystackOf(a);
                        const score = scoreMatch(hay, qForMatch);
                        return { a, score, hay };
                    })
                    .filter((x) => {
                        if (!matchesQuery(x.hay, qForMatch)) return false;
                        const toks = queryTokens(qForMatch);

                        const minScore = toks.length >= 2 ? 3 : 1;
                        return x.score >= minScore;
                    })
                    .sort((a, b) => {
                        const titleBonusA = a.a.title?.toLowerCase().includes(qForMatch) ? 5 : 0;
                        const titleBonusB = b.a.title?.toLowerCase().includes(qForMatch) ? 5 : 0;
                        return (b.score + titleBonusB) - (a.score + titleBonusA);
                    })
                    .slice(0, 5)
                    .map((x) => x.a);
            }
        } catch (e: any) {
            errorMsg = e?.message || "Ismeretlen hiba a keresés közben.";
        }
    }

    const hasEnv = !!supabaseUrl && !!supabaseKey;
    const total = (type === "termek" ? products.length : 0) +
        (type === "cikk" ? articles.length : 0) +
        (type === "minden" ? products.length + articles.length : 0);

    return (
        <main className="container" style={{ paddingTop: 28, paddingBottom: 48 }}>
            <div className="stack" style={{ gap: 16 }}>
                <header className="card" style={{ padding: 18 }}>
                  <div className="stack" style={{ gap: 14 }}>
                    <div className="stack" style={{ gap: 6 }}>
                      <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.15 }}>
                        Keresés
                      </h1>
                      <p className="muted" style={{ margin: 0, maxWidth: 780 }}>
                        Írd be, mi zavar / mire keresel megoldást – először a releváns cikkeket mutatom, majd a kapcsolódó termékeket.
                      </p>
                    </div>

                    <form action="/kereses" method="get" className="stack" style={{ gap: 12 }}>
                      <div
                        className="row"
                        style={{
                          gap: 10,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <input
                          name="q"
                          defaultValue={qRaw}
                          placeholder="Pl: fejfájás, gyulladás, alvászavar, immunrendszer…"
                          className="input"
                          style={{ flex: "1 1 360px", minHeight: 44 }}
                        />

                          <select
                              name="type"
                              defaultValue={type}
                              className="input"
                              style={{
                                  width: 190,
                                  minHeight: 44,
                                  padding: "10px 12px",
                                  borderRadius: 12,
                                  border: "1px solid var(--border)",
                                  background: "var(--surface)",
                                  color: "var(--text)",
                                  boxShadow: "0 1px 0 rgba(0,0,0,.04)",
                                  appearance: "none",
                                  WebkitAppearance: "none",
                                  MozAppearance: "none",
                              }}
                          >
                          <option value="minden">Minden</option>
                          <option value="cikk">Cikkek</option>
                          <option value="termek">Termékek</option>
                        </select>

                          <button
                            className="btn btn-terracotta"
                            type="submit"
                            style={{
                              minHeight: 44,
                              padding: "10px 18px",
                              borderRadius: 12,
                              border: "1px solid rgba(0,0,0,.08)",
                              background: "linear-gradient(135deg, #c2410b, #d3541a)",
                              color: "#ffffff",
                              fontWeight: 700,
                              boxShadow: "0 10px 22px rgba(194,65,11,.35)",
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                              transition: "transform .15s ease, box-shadow .15s ease, filter .15s ease",
                            }}
                          >
                            Keresés
                          </button>
                      </div>

                      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                        {[
                          "Immunrendszer erősítése",
                          "Alvászavar",
                          "Gyulladások csökkentése",
                          "Bélflóra egyensúlya",
                          "Energiaszint növelése",
                        ].map((chip) => (
                          <Link
                            key={chip}
                            className="chip"
                            href={`/kereses?q=${encodeURIComponent(chip)}`}
                          >
                            {chip}
                          </Link>
                        ))}
                      </div>
                    </form>
                    <style>{`
                      /* Keresés gomb: terrakotta + finom hover (JS nélkül) */
                      .btn-terracotta:hover {
                        transform: translateY(-1px);
                        box-shadow: 0 14px 28px rgba(194,65,11,.45);
                        filter: brightness(1.05);
                      }
                      .btn-terracotta:active {
                        transform: translateY(0px);
                        box-shadow: 0 10px 22px rgba(194,65,11,.35);
                        filter: none;
                      }
                    `}</style>
                  </div>
                </header>

                {!q ? (
                    <section className="card" style={{ padding: 18 }}>
                        <h2 style={{ marginTop: 0 }}>Hogyan működik?</h2>
                        <ol className="muted" style={{ margin: 0, paddingLeft: 18 }}>
                            <li>Beírsz egy problémát vagy célt.</li>
                            <li>Mutatom a kapcsolódó termékeket és cikkeket.</li>
                        </ol>
                    </section>
                ) : !hasEnv ? (
                    <section className="card" style={{ padding: 18 }}>
                        <h2 style={{ marginTop: 0 }}>Keresés nincs bekötve</h2>
                        <p className="muted" style={{ margin: 0 }}>
                            Hiányzó env: <code>NEXT_PUBLIC_SUPABASE_URL</code> és/vagy{" "}
                            <code>SUPABASE_SERVICE_ROLE_KEY</code> /{" "}
                            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
                        </p>
                    </section>
                ) : errorMsg ? (
                    <section className="card" style={{ padding: 18 }}>
                        <h2 style={{ marginTop: 0 }}>Hiba a keresés közben</h2>
                        <p className="muted" style={{ margin: 0 }}>
                            {errorMsg}
                        </p>
                    </section>
                ) : (
                    <>
                        <section className="card" style={{ padding: 18 }}>
                            <div
                                className="row"
                                style={{ alignItems: "baseline", justifyContent: "space-between" }}
                            >
                                <h2 style={{ margin: 0 }}>
                                    Találatok: <span className="muted">{total}</span>
                                </h2>
                                <div className="muted" style={{ fontSize: 13 }}>
                                    Kifejezés: <strong>{q}</strong>
                                </div>
                            </div>
                            <p className="muted" style={{ margin: "6px 0 0 0", fontSize: 13 }}>
                              Először a leginkább releváns cikkeket mutatjuk, majd a kapcsolódó termékeket.
                            </p>
                        </section>

                        {(type === "minden" || type === "cikk") && (
                            <section className="stack" style={{ gap: 12, marginTop: 12 }}>
                                <div className="row" style={{ justifyContent: "space-between" }}>
                                    <h3 style={{ margin: 0 }}>Cikkek</h3>
                                    <Link className="link" href={`/cikkek?q=${encodeURIComponent(q)}`}>
                                        Összes cikk megnyitása →
                                    </Link>
                                </div>

                                {articles.length === 0 ? (
                                    <div className="card" style={{ padding: 16 }}>
                                        <p className="muted" style={{ margin: 0 }}>
                                            Nincs cikk találat erre: <strong>{q}</strong>
                                        </p>
                                    </div>
                                ) : (
                                    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
                                        {articles.map((a) => {
                                            const img = safeImg(a.cover_image_url || a.featured_image_url || a.cover_url);
                                            const text = excerptFrom(a.excerpt || a.intro || a.content || "", 110);

                                            return (
                                                <article key={a.id} className="card card-hover" style={{ padding: 16 }}>
                                                    <Link href={`/cikkek/${a.slug}`} className="stack" style={{ gap: 12, textDecoration: "none", color: "inherit" }}>
                                                      <div
                                                        style={{
                                                          borderRadius: 12,
                                                          overflow: "hidden",
                                                          aspectRatio: "4 / 3",
                                                          background: "var(--surface-2)",
                                                          border: "1px solid var(--border)",
                                                          display: "flex",
                                                          alignItems: "center",
                                                          justifyContent: "center",
                                                        }}
                                                      >
                                                        {img ? (
                                                          <img
                                                            src={img}
                                                            alt={a.title || "Cikk"}
                                                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                                            loading="lazy"
                                                            referrerPolicy="no-referrer"
                                                          />
                                                        ) : (
                                                          <div className="muted" style={{ fontSize: 13 }}>
                                                            Nincs kép
                                                          </div>
                                                        )}
                                                      </div>

                                                      <div className="stack" style={{ gap: 6 }}>
                                                        <h4 style={{ margin: 0, color: "var(--text)" }}>
                                                          {a.title}
                                                        </h4>
                                                        {text ? (
                                                          <p className="muted" style={{ margin: 0, lineHeight: 1.35 }}>
                                                            {text}
                                                          </p>
                                                        ) : null}
                                                        <span className="link" style={{ marginTop: 6 }}>
                                                          Elolvasom →
                                                        </span>
                                                      </div>
                                                    </Link>
                                                </article>
                                            );
                                        })}
                                    </div>
                                )}
                            </section>
                        )}

                        {(type === "minden" || type === "termek") && (
                            <section className="stack" style={{ gap: 12 }}>
                                <div className="row" style={{ justifyContent: "space-between" }}>
                                    <h3 style={{ margin: 0 }}>Termékek</h3>
                                    <Link className="link" href={`/termek?q=${encodeURIComponent(q)}`}>
                                        Összes termék megnyitása →
                                    </Link>
                                </div>

                                {products.length === 0 ? (
                                    <div className="card" style={{ padding: 16 }}>
                                        <p className="muted" style={{ margin: 0 }}>
                                            Nincs termék találat erre: <strong>{q}</strong>
                                        </p>
                                    </div>
                                ) : (
                                    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
                                        {products.map((p) => {
                                            const img = safeImg(p.featured_image_url || p.image_url);
                                            const price = p.price ?? null;
                                            const regular = p.regular_price ?? null;
                                            const text = excerptFrom(
                                                p.excerpt || p.post_excerpt || p.short_description || p.description || p.post_content || "",
                                                96
                                            );

                                            return (
                                                <article key={p.id} className="card" style={{ padding: 16 }}>
                                                    <Link href={`/termek/${p.slug}`} className="stack" style={{ gap: 12, textDecoration: "none", color: "inherit" }}>
                                                        <div
                                                            style={{
                                                                borderRadius: 12,
                                                                overflow: "hidden",
                                                                aspectRatio: "4 / 3",
                                                                background: "var(--surface-2)",
                                                                display: "flex",
                                                                alignItems: "center",
                                                                justifyContent: "center",
                                                            }}
                                                        >
                                                            {img ? (
                                                                // sima img: nem kell next/image config, és nincs onError handler
                                                                <img
                                                                    src={img}
                                                                    alt={(p.title || p.name || p.post_title || p.product_title) || "Termék"}
                                                                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                                                    loading="lazy"
                                                                    referrerPolicy="no-referrer"
                                                                />
                                                            ) : (
                                                                <div className="muted" style={{ fontSize: 13 }}>
                                                                    Nincs kép
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="stack" style={{ gap: 6 }}>
                                                            <h4 style={{ margin: 0, color: "var(--text)" }}>
                                                                {p.title || p.name || p.post_title || p.product_title}
                                                            </h4>
                                                            {text ? (
                                                                <p className="muted" style={{ margin: 0, lineHeight: 1.35 }}>
                                                                    {text}
                                                                </p>
                                                            ) : null}

                                                            <div
                                                                className="row"
                                                                style={{ justifyContent: "space-between", alignItems: "center", marginTop: 6 }}
                                                            >
                                                                <div>
                                                                    {regular != null && price != null && Number(regular) > Number(price) ? (
                                                                        <div className="muted" style={{ fontSize: 13, textDecoration: "line-through" }}>
                                                                            {Number(regular).toLocaleString("hu-HU")} Ft
                                                                        </div>
                                                                    ) : null}
                                                                    {price != null ? (
                                                                        <div style={{ fontWeight: 700 }}>
                                                                            {Number(price).toLocaleString("hu-HU")} Ft
                                                                        </div>
                                                                    ) : (
                                                                        <div className="muted" style={{ fontSize: 13 }}>
                                                                            Ár: –
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                <span className="link" style={{ fontWeight: 700 }}>
                                                                  Megnézem →
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </Link>
                                                </article>
                                            );
                                        })}
                                    </div>
                                )}
                            </section>
                        )}

                    </>
                )}
            </div>
        </main>
    );
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const REDIRECTS = new Map<string, string>([
  ["/adatvedelmi-nyilatkozat", "https://www.sokaigelek.hu/adatvedelem"],
  ["/altalanos-szerzodesi-feltetelek", "https://www.sokaigelek.hu/aszf"],
  ["/termekkategoria/etrendkiegeszitok/folyekony", "https://www.sokaigelek.hu/termek"],
  ["/termekkategoria/etrendkiegeszitok/folyekony/page/1", "https://www.sokaigelek.hu/termek"],
  ["/termekkategoria/etrendkiegeszitok/page/3", "https://www.sokaigelek.hu/termek"],
  ["/termekkategoria/etrendkiegeszitok/kapszula", "https://www.sokaigelek.hu/termek"],
  ["/termekkategoria/etrendkiegeszitok/kapszula/page/1", "https://www.sokaigelek.hu/termek"],
  ["/miert-fontos-a-megfelelo-hidratacio-es-elektrolit-egyensuly", "https://www.sokaigelek.hu/cikkek/miert-fontos-a-megfelelo-hidratacio-es-elektrolit-egyensuly"],
  ["/hogyan-novelheted-termeszetesen-az-energiaszintedet", "https://www.sokaigelek.hu/cikkek/hogyan-novelheted-termeszetesen-az-energiaszintedet"],
  ["/tudomanyos-es-orvosi-hatter", "https://www.sokaigelek.hu/cikkek/tudomanyos-es-orvosi-hatter"],
  ["/mire-van-szuksegem", "https://www.sokaigelek.hu/kereses"],
  ["/category/tudatos-elet/energia-es-mentalis-frissesseg", "https://www.sokaigelek.hu/cikkek?cat=energia-es-mentalis-frissesseg"],
  ["/tudatos-elet/energia-es-mentalis-frissesseg/hogyan-novelheted-termeszetesen-az-energiaszintedet", "https://www.sokaigelek.hu/cikkek/hogyan-novelheted-termeszetesen-az-energiaszintedet"],
  ["/ketszintu-kedvezmenyrendszer-az-egeszsegedert", "https://www.sokaigelek.hu/cikkek/ketszintu-kedvezmenyrendszer-az-egeszsegedert"],
  ["/hogyan-erositheted-immunrendszered-termeszetes-modon", "https://www.sokaigelek.hu/cikkek/hogyan-erositheted-immunrendszered-termeszetes-modon"],
  ["/blog/category/optimalis-megoldas", "https://www.sokaigelek.hu/cikkek?cat=optimalis-megoldas"],
  ["/mik-a-kollagenhiany-kovetkezmenyi", "https://www.sokaigelek.hu/cikkek/hogyan-novelheted-termeszetesen-az-energiaszintedet"],
]);

const GONE_PATHS = new Set<string>([
  "/termekcimke/keringesi-rendszer-tamogatasa",
  "/termekcimke/izuleti-fajdalom",
  "/termekcimke/alvaszavar",
  "/termekcimke/vorosvertest-termeles",
  "/termekcimke/bor-egeszsege",
  "/termekcimke/idegrendszer-tamogatasa",
  "/termekcimke/anyagcsere-szabalyozasa",
  "/osszetevo/glukozamin-szulfat",
  "/osszetevo/omega-6",
  "/osszetevo/libanoni-zsalya",
  "/osszetevo/oszi-margitviraglevel",
  "/osszetevo/kondroitin-szulfat",
  "/osszetevo/fluor",
  "/osszetevo/babmag",
  "/osszetevo/b9-vitamin-folsav",
  "/osszetevo/inulin-kozonseges-cikoria-katang-gyokerbol",
  "/osszetevo/kecskeruta",
  "/osszetevo/vorosgyokeru-zsalya",
  "/osszetevo/kollagen",
  "/osszetevo/spirulina",
  "/osszetevo/cedrusolaj-cedrusmagolaj",
  "/panaszok/keringesi-problemak",
  "/panaszok/stresszes-eletmod",
  "/panaszok/hangulatzavarok",
  "/author/indijanmac",
  "/tag/tiszta",
  "/tag/termeszetes",
]);

const GONE_PREFIXES = [
  "/termekcimke/",
  "/osszetevo/",
  "/panaszok/",
  "/wp-content/",
  "/wp-content/plugins/",
];

function normalizePath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function middleware(req: NextRequest) {
  const rawPath = req.nextUrl.pathname;
  const pathname = normalizePath(rawPath);

  const redirectTarget = REDIRECTS.get(pathname);
  if (redirectTarget) {
    return NextResponse.redirect(redirectTarget, 301);
  }

  if (GONE_PATHS.has(pathname)) {
    return new NextResponse(null, { status: 410 });
  }

  if (GONE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return new NextResponse(null, { status: 410 });
  }

  return NextResponse.next();
}

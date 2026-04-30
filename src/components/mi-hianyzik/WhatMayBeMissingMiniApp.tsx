"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import spec from "@/data/mi-hianyzik-spec.json";
import newSpecSource from "@/data/new_questionnaire.json";
import "./WhatMayBeMissingMiniApp.css";

type MiniAppMode = "landing" | "inline_article";

type MiniAppEventName =
  | "miniapp_started"
  | "miniapp_entry_selected"
  | "miniapp_followup_answered"
  | "miniapp_completed"
  | "miniapp_result_viewed"
  | "miniapp_product_clicked"
  | "miniapp_restarted";

type MiniAppEventPayload = {
  entrySelections: string[];
  primaryResult?: string;
  secondaryResult?: string;
  questionCountSeen: number;
  recommendedProducts?: string[];
  mode: MiniAppMode;
  event?: string;
};

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

type EntryOption = {
  id: string;
  label: string;
  mapsTo: string[];
};

type FollowupOption = {
  id: string;
  label: string;
  scores: Record<string, number>;
};

type FollowupQuestion = {
  id: string;
  text: string;
  type: "single_select";
  options: FollowupOption[];
};

type Pathway = {
  id: string;
  label: string;
  priority: number;
  triggerTags: string[];
  questions: FollowupQuestion[];
};

type DomainDefinition = {
  label: string;
  summary: string;
  tips: string[];
  productGroups: string[];
  products: string[];
};

type ProductCatalogItem = {
  name: string;
  url: string;
  groups: string[];
};

type ProductVisual = {
  slug: string;
  image_url: string | null;
};

type ResultPersonalization = {
  headline?: string;
  explanation?: string;
  advice?: string[];
  productReason?: string;
};

type MiniAppProps = {
  mode?: MiniAppMode;
  className?: string;
  onAnalyticsEvent?: (eventName: MiniAppEventName, payload: MiniAppEventPayload) => void;
  onFlowStateChange?: (state: { started: boolean; hasResult: boolean; entrySelected: boolean }) => void;
};

type LegacySpec = {
  meta: { maxQuestionsPerUser: number };
  copy: {
    stepLabels: { entry: string; triage: string; result: string };
    buttons: { next: string; back: string; restart: string; seeProducts: string; toArticle: string };
    resultIntro: string;
    secondaryIntro: string;
    productSectionTitle: string;
    finalDisclaimer: string;
  };
  entryScreen: {
    title: string;
    description: string;
    minSelect: number;
    maxSelect: number;
    options: EntryOption[];
  };
  pathways: Pathway[];
  domainDefinitions: Record<string, DomainDefinition>;
  productCatalog: ProductCatalogItem[];
  analytics: {
    events: MiniAppEventName[];
  };
  logic: {
    limits: {
      absoluteQuestionCap: number;
      entryCountsAsQuestion: boolean;
      defaultFollowupCount: number;
      maxFollowupCount: number;
    };
  };
};

type NewSpec = {
  limits?: { minQuestions?: number; maxQuestions?: number; entryCountsAsQuestion?: boolean };
  branches?: Record<
    string,
    {
      primaryDomains?: string[];
      allowedSecondaryDomains?: string[];
      questionOrder?: string[];
      questions?: Array<{
        id: string;
        title?: string;
        type?: "single_select";
        nextQuestionMap?: Record<string, string>;
        options?: Array<{ id: string; label: string; scores?: Record<string, number> }>;
      }>;
    }
  >;
  globalQuestion?: {
    id: string;
    title?: string;
    type?: "single_select";
    options?: Array<{ id: string; label: string; scores?: Record<string, number> }>;
  };
  outputs?: Record<
    string,
    {
      label?: string;
      headline?: string;
      explanation?: string;
      practicalAdvice?: string[];
      products?: string[];
    }
  >;
  resultLogic?: {
    confidence?: { high?: string; medium?: string; mixed?: string };
  };
  engine?: {
    resultRules?: {
      secondary?: string;
      confidence?: { high?: string; medium?: string; mixed?: string };
    };
  };
  resultAssembler?: {
    primaryTitle?: string;
    secondaryTitle?: string;
    mixedTitle?: string;
    secondaryRule?: { showIfSecondaryAtLeastRatio?: number };
  };
  finalQuestionPolicy?: { alwaysIncludeIntensity?: boolean; intensityQuestionId?: string };
  disclaimer?: string;
  entryQuestion?: {
    title?: string;
    description?: string;
    minSelect?: number;
    maxSelect?: number;
    options?: Array<{ id: string; label: string; seedScores?: Record<string, number>; firstQuestionId?: string; branchId?: string }>;
  };
  questions?: Array<{
    id: string;
    title?: string;
    type?: "single_select";
    appliesToEntries?: string[];
    nextQuestionMap?: Record<string, string>;
    options?: Array<{ id: string; label: string; scores?: Record<string, number> }>;
  }>;
  domainOutputs?: Record<
    string,
    {
      label?: string;
      headline?: string;
      explanation?: string;
      practicalAdvice?: string[];
      productGroups?: string[];
      products?: string[];
    }
  >;
  productCatalog?: Array<{ name: string; url: string }>;
  analytics?: { events?: string[] };
};

function toLegacySpec(base: LegacySpec, incoming: NewSpec): LegacySpec {
  const hasBranches = Boolean(incoming.branches && Object.keys(incoming.branches).length > 0);
  const entryOptions = (incoming.entryQuestion?.options || []).map((opt) => ({
    id: opt.id,
    label: opt.label,
    mapsTo: Object.keys(opt.seedScores || {}),
  }));

  const branchQuestions = hasBranches
    ? [
        ...Object.values(incoming.branches || {}).flatMap((b) => b.questions || []),
        ...(incoming.globalQuestion ? [incoming.globalQuestion] : []),
      ]
    : [];

  const adaptiveQuestions = (hasBranches ? branchQuestions : incoming.questions || [])
    .filter((q) => q?.id && Array.isArray(q.options) && q.options.length > 0)
    .map((q) => ({
      id: q.id,
      text: q.title || q.id,
      type: "single_select" as const,
      options: (q.options || []).map((o) => ({
        id: o.id,
        label: o.label,
        scores: Object.fromEntries(
          Object.entries(o.scores || {}).filter(([k, v]) => k !== "global_confidence" && Number(v || 0) !== 0)
        ),
      })),
    }));

  const domainDefinitions: LegacySpec["domainDefinitions"] = { ...base.domainDefinitions };
  const outputSource = hasBranches ? incoming.outputs || {} : incoming.domainOutputs || {};
  for (const [domainId, content] of Object.entries(outputSource)) {
    domainDefinitions[domainId] = {
      label: content.label || domainDefinitions[domainId]?.label || domainId,
      summary:
        [content?.headline, content?.explanation].filter(Boolean).join(" ") ||
        domainDefinitions[domainId]?.summary ||
        "",
      tips:
        (content?.practicalAdvice || []).slice(0, 3).length > 0
          ? (content?.practicalAdvice || []).slice(0, 3)
          : domainDefinitions[domainId]?.tips || [],
      productGroups: (content as { productGroups?: string[] }).productGroups || domainDefinitions[domainId]?.productGroups || [],
      products: content.products || domainDefinitions[domainId]?.products || [],
    };
  }

  const limits = incoming.limits || {};
  const maxQuestions = Number(limits.maxQuestions || base.meta.maxQuestionsPerUser || 5);
  const followups = Math.max(1, Math.min(5, maxQuestions - (limits.entryCountsAsQuestion === false ? 0 : 1)));

  return {
    ...base,
    meta: {
      ...base.meta,
      maxQuestionsPerUser: maxQuestions,
    },
    copy: {
      ...base.copy,
      resultIntro:
        incoming.resultAssembler?.primaryTitle ||
        "A válaszaid alapján ez a minta rajzolódik ki legerősebben nálad",
      secondaryIntro:
        incoming.resultAssembler?.secondaryTitle ||
        "A háttérben ez a második mintázat is látszik",
      finalDisclaimer: humanizeUiText(incoming.disclaimer || base.copy.finalDisclaimer),
    },
    entryScreen: {
      ...base.entryScreen,
      title: incoming.entryQuestion?.title || base.entryScreen.title,
      description: incoming.entryQuestion?.description || base.entryScreen.description,
      minSelect: Number(incoming.entryQuestion?.minSelect || 1),
      maxSelect: Number(incoming.entryQuestion?.maxSelect || 1),
      options: entryOptions.length > 0 ? entryOptions : base.entryScreen.options,
    },
    pathways: [
      {
        id: "adaptive",
        label: "Adaptív útvonal",
        priority: 1,
        triggerTags: Object.keys(outputSource),
        questions: adaptiveQuestions.length > 0 ? adaptiveQuestions : base.pathways[0].questions,
      },
    ],
    productCatalog:
      (incoming.productCatalog || []).map((p) => ({ name: p.name, url: p.url, groups: [] })) || base.productCatalog,
    domainDefinitions,
    logic: {
      ...base.logic,
      limits: {
        absoluteQuestionCap: maxQuestions,
        entryCountsAsQuestion: limits.entryCountsAsQuestion !== false,
        defaultFollowupCount: followups,
        maxFollowupCount: followups,
      },
    },
  };
}

const baseSpec = spec as LegacySpec;
const incomingSpec = newSpecSource as unknown as NewSpec;
const typedSpec = toLegacySpec(baseSpec, incomingSpec);
const eventSet = new Set(
  typedSpec.analytics.events.length > 0 ? typedSpec.analytics.events : ["miniapp_started", "miniapp_completed"]
);
const hasBranchSchema = Boolean(incomingSpec.branches && Object.keys(incomingSpec.branches).length > 0);

type IncomingEntry = NonNullable<NonNullable<NewSpec["entryQuestion"]>["options"]>[number];
type IncomingQuestion = NonNullable<NewSpec["questions"]>[number];

const incomingEntries = (incomingSpec.entryQuestion?.options || []) as IncomingEntry[];
const incomingQuestions = (
  hasBranchSchema
    ? [
        ...Object.values(incomingSpec.branches || {}).flatMap((b) => b.questions || []),
        ...(incomingSpec.globalQuestion ? [incomingSpec.globalQuestion] : []),
      ]
    : incomingSpec.questions || []
) as IncomingQuestion[];
const incomingQuestionById = new Map(incomingQuestions.map((q) => [q.id, q]));
const entryById = new Map(incomingEntries.map((e) => [e.id, e]));
const secondaryRatio = Number(incomingSpec.resultAssembler?.secondaryRule?.showIfSecondaryAtLeastRatio || 0.6);
const mixedTitle = incomingSpec.resultAssembler?.mixedTitle || "Nálad két terület együtt látszik erősen";

function asScoreMap() {
  return new Map<string, number>();
}

function addScore(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) || 0) + value);
}

function sortScoresDesc(scores: Map<string, number>) {
  return Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
}

function normalizeProductName(input: string) {
  return String(input || "").trim().toLowerCase();
}

function productInitial(input: string) {
  const normalized = String(input || "").trim();
  if (!normalized) return "T";
  return normalized.slice(0, 1).toUpperCase();
}

function productSlugFromUrl(url: string) {
  const parts = String(url || "").split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

function humanizeUiText(input: string) {
  return String(input || "").replace(/miniapp/gi, "felmérés");
}

function buildProductList(
  primaryDomainId: string,
  secondaryDomainId?: string,
  secondaryLimit = 2
): ProductCatalogItem[] {
  const defs = typedSpec.domainDefinitions;
  const catalog = typedSpec.productCatalog;
  const byName = new Map<string, ProductCatalogItem>();
  for (const item of catalog) byName.set(normalizeProductName(item.name), item);

  const collectByDomain = (domainId: string, hardLimit?: number) => {
    const domain = defs[domainId];
    if (!domain) return [] as ProductCatalogItem[];

    const result: ProductCatalogItem[] = [];
    const pushIf = (item?: ProductCatalogItem) => {
      if (!item) return;
      if (result.some((r) => r.url === item.url)) return;
      result.push(item);
    };

    for (const name of domain.products || []) pushIf(byName.get(normalizeProductName(name)));

    for (const group of domain.productGroups || []) {
      for (const item of catalog) {
        if ((item.groups || []).includes(group)) pushIf(item);
        if (hardLimit && result.length >= hardLimit) return result;
      }
    }
    return hardLimit ? result.slice(0, hardLimit) : result;
  };

  const primary = collectByDomain(primaryDomainId);
  const secondary = secondaryDomainId ? collectByDomain(secondaryDomainId, secondaryLimit) : [];
  const merged: ProductCatalogItem[] = [];
  for (const p of [...primary, ...secondary]) {
    if (!merged.some((m) => m.url === p.url)) merged.push(p);
  }
  return merged;
}

function includesAny(values: string[], expected: string[]) {
  return expected.some((item) => values.includes(item));
}

function getPersonalizedResultCopy(primaryDomainId: string, answerIds: string[]): ResultPersonalization {
  if (primaryDomainId === "energy") {
    if (includesAny(answerIds, ["energy_identity_morning", "energy_pattern_unrested", "energy_recovery_sleep"])) {
      return {
        headline: "Nálad inkább az látszik, hogy a nap már eleve alacsony töltöttséggel indul.",
        explanation:
          "Ez nem egyszerű napközbeni fáradtság: a válaszaid alapján a visszatöltődés minősége lehet a szűk keresztmetszet. Ilyenkor a szervezet hiába kap több alvásidőt, ha nem jut elég mély, rendezett regenerációhoz.",
        advice: [
          "Először az esti visszaváltást figyeld meg: mikor kezded el tényleg lezárni a napot, és mennyi inger marad az utolsó órára.",
          "Reggel ne azonnal pörgetéssel kezdd. Folyadék, fény és könnyű mozgás sokszor jobb jelzést ad a rendszernek, mint egy gyors koffeinlöket.",
        ],
        productReason:
          "Az ajánlott termékek itt nem gyors felpörgetésre, hanem a visszatöltődés és a tartósabb energiatámogatás irányára illeszkednek.",
      };
    }
    if (includesAny(answerIds, ["energy_identity_afternoon", "energy_recovery_food", "energy_pattern_hunger"])) {
      return {
        headline: "Nálad inkább energia-ingadozás rajzolódik ki, nem állandó kimerültség.",
        explanation:
          "A délutáni bezuhanás, az éhséghez vagy evéshez kötött változás inkább anyagcsere-ritmusra utal. Ilyenkor nem az a fő kérdés, hogy van-e energiád, hanem hogy mennyire egyenletesen tudod tartani.",
        advice: [
          "Figyeld meg 3-4 napig, mikor jön a bezuhanás, és mi volt előtte: étkezés, kihagyott folyadék, stressz vagy hosszú ülés.",
          "A cél ne egy nagy energialöket legyen, hanem kevesebb kilengés. Ezért érdemes a nap ritmusát és az étkezések kiszámíthatóságát rendezni.",
        ],
        productReason:
          "Az ajánlások az energia mellett az anyagcsere-hullámzás és a stabilabb közérzet támogatását is figyelembe veszik.",
      };
    }
    if (includesAny(answerIds, ["energy_identity_effort", "energy_pattern_low_reserve"])) {
      return {
        headline: "Nálad inkább tartalékhiány-érzet és gyors kifáradás látszik.",
        explanation:
          "A válaszaid alapján nem csak mentális fáradtságról van szó. A fizikai terhelésre jelentkező gyors elfogyás inkább mélyebb vitalitási és tartalékoldali mintát jelez.",
        advice: [
          "Ne csak azt figyeld, mennyire vagy fáradt, hanem azt is, milyen gyorsan fogysz el kisebb terhelésre.",
          "Ha a regeneráció lassú, a támogatást ne egyszeri lendületként, hanem több hétig tartó tartaléképítésként érdemes kezelni.",
        ],
        productReason:
          "Itt azok a termékek kerülnek előre, amelyek az energia mellett az általános vitalitás és tartalékérzet támogatásához kapcsolódnak.",
      };
    }
  }

  if (primaryDomainId === "mind") {
    if (includesAny(answerIds, ["mind_identity_evening", "mind_trigger_evening", "mind_discriminator_head"])) {
      return {
        headline: "Nálad inkább az látszik, hogy fejben nehezen tudsz visszaváltani nyugalmi állapotba.",
        explanation:
          "Ez nem sima stressz: a válaszaid alapján az idegrendszered sokáig készenléti módban marad. Emiatt este is pöröghet az agyad, miközben fizikailag már fáradt vagy.",
        advice: [
          "Az esti képernyős pihenést kezeld külön: ha információt fogyasztasz, az az agynak továbbra is munka.",
          "Próbálj ki 10 perc valódi ingermentességet este. Nem relaxációs teljesítmény kell, csak kevesebb input.",
        ],
        productReason:
          "Az ajánlások a mentális túlterhelés, fókusz és esti lecsendesedés irányát támogatják.",
      };
    }
    if (includesAny(answerIds, ["mind_identity_unrested", "mind_discriminator_rest"])) {
      return {
        headline: "Nálad a mentális terhelés és a gyenge regeneráció kapcsolódhat össze.",
        explanation:
          "A válaszaid alapján nem csak az a gond, hogy sok inger ér, hanem az is, hogy a pihenés nem hoz elég visszatöltődést. Ezért jelenhet meg egyszerre szétesettség és fáradtság.",
        advice: [
          "A regenerációt ne csak alvásidőben mérd. Figyeld, hogy reggel tisztább-e a fejed, vagy csak túlélted az éjszakát.",
          "Ha az agyi köd és a fáradtság együtt jár, a napközbeni ingerterhelés csökkentése is alvásminőségi kérdés.",
        ],
        productReason:
          "A termékajánló a mentális fókusz mellett a regeneráció és idegrendszeri egyensúly oldalát is figyelembe veszi.",
      };
    }
  }

  if (primaryDomainId === "hydration" || primaryDomainId === "minerals") {
    if (includesAny(answerIds, ["hydration_response_not_enough", "hydration_identity_cramps", "hydration_discriminator_evening"])) {
      return {
        headline: "Nálad nem csak folyadékbevitelről, hanem elektrolit- és ásványi egyensúlyról is szó lehet.",
        explanation:
          "Ha a sima víz nem elég, vagy estére izomoldali tünetek jönnek elő, akkor a probléma gyakran nem mennyiségi, hanem egyensúlyi kérdés.",
        advice: [
          "Figyeld külön, mi történik sima vízzel és mi történik ásványi/elektrolit támogatással. A különbség sokat elárul.",
          "Az esti görcs vagy feszülés inkább ásványi oldalra mutat, míg a napközbeni tompaság gyakrabban hidratációs jelzés.",
        ],
        productReason:
          "Az ajánlott termékek a folyadékpótlás mellett az elektrolit- és ásványi egyensúlyt is célba veszik.",
      };
    }
  }

  if (primaryDomainId === "digestion" || primaryDomainId === "gut" || primaryDomainId === "liver_detox") {
    if (includesAny(answerIds, ["digestion_identity_stomach", "digestion_discriminator_comfort"])) {
      return {
        headline: "Nálad inkább gyomor- és emésztési komfort irány rajzolódik ki.",
        explanation:
          "A válaszaid alapján nem általános bélflóra-kérdés áll előtérben, hanem az, hogy az emésztés mennyire kényelmes, nyugodt és kiszámítható étkezés után.",
        advice: [
          "Figyeld, hogy a kellemetlenség étkezés után mennyi idővel indul. Ez segít elválasztani a gyomoroldali és béloldali mintákat.",
          "A kapkodó étkezés önmagában is ronthatja a komfortot. Itt a tempó és a környezet is része a megoldásnak.",
        ],
        productReason:
          "A termékek az emésztési komfort, gyomorérzékenység és béloldali egyensúly irányából lettek válogatva.",
      };
    }
    if (includesAny(answerIds, ["digestion_identity_microbiome", "digestion_discriminator_microbiome"])) {
      return {
        headline: "Nálad inkább mélyebb bélflóra-egyensúlyi minta látszik.",
        explanation:
          "Ez nem feltétlenül egy-egy étkezés utáni panasz, hanem inkább hullámzó, kiszámíthatatlanabb emésztési és közérzeti minta.",
        advice: [
          "Itt több hétben érdemes gondolkodni, nem gyors reakcióban. A bélflóra lassabban válaszol, mint egy gyomorkomfort-probléma.",
          "A rost, a rendszeres étkezés és a célzott mikrobiom-támogatás együtt működik igazán, külön-külön gyakran kevés.",
        ],
        productReason:
          "Az ajánlások a mikrobiom, rostbevitel és emésztési egyensúly támogatását helyezik előtérbe.",
      };
    }
  }

  if (primaryDomainId === "immunity" || primaryDomainId === "upper_resp") {
    if (includesAny(answerIds, ["immunity_identity_upper", "immunity_goal_seasonal", "immunity_discriminator_upper"])) {
      return {
        headline: "Nálad inkább visszatérő felső légúti érzékenység rajzolódik ki.",
        explanation:
          "A válaszaid alapján nem általános lemerülés áll a fókuszban, hanem az, hogy szezonálisan vagy terheltebb időszakokban könnyebben érintetté válik a felső légúti oldal.",
        advice: [
          "Figyeld meg, mikor indul a minta: időjárásváltásnál, közösségi időszakban, kevés alvás után vagy stresszesebb hetekben.",
          "A cél ne csak az legyen, hogy akkor reagálj, amikor már érzed. A felső légúti támogatás megelőző, szezon előtti rutinként működik jobban.",
          "Ha gyakran ugyanott jelentkezik az érzékenység, az immunoldal mellett a nyálkahártyák és a regeneráció támogatása is fontos lehet.",
        ],
        productReason: "Az ajánlások a szezonális és felső légúti támogatás irányára illeszkednek.",
      };
    }
    if (includesAny(answerIds, ["immunity_identity_recovery", "immunity_goal_reserve", "immunity_discriminator_load"])) {
      return {
        headline: "Nálad az immunoldal inkább tartalék- és regenerációhiánnyal kapcsolódik össze.",
        explanation:
          "A mintázat nem csak arról szól, hogy könnyebben kibillensz, hanem arról is, hogy lassabban állsz vissza, és terheltebb időszakok után kevesebb belső tartalékot érzel.",
        advice: [
          "Nézd meg, mennyi idő alatt jössz vissza egy sűrű hét vagy gyengébb időszak után. A visszaállási idő jó jelzője a tartalékoknak.",
          "Itt a rendszeres alvás és a terhelés okos visszavétele ugyanannyira része a támogatásnak, mint a célzott termék.",
          "Ha a gyengébb ellenállóképesség fáradtsággal is jár, ne csak immunerősítésben gondolkodj: energia- és antioxidáns oldal is beleszólhat.",
        ],
        productReason: "Az ajánlások az immunrendszer mellett a vitalitás és visszaállás támogatását is figyelembe veszik.",
      };
    }
  }

  if (primaryDomainId === "cardio" || primaryDomainId === "metabolism" || primaryDomainId === "weight") {
    if (includesAny(answerIds, ["cardiometabolic_discriminator_metabolism", "cardiometabolic_context_crash"])) {
      return {
        headline: "Nálad inkább anyagcsere- és energiaingadozási minta látszik.",
        explanation:
          "A válaszaid alapján a fő jel nem egyetlen keringési panasz, hanem az, hogy a közérzeted és energiaszinted hullámzik. Ez gyakran étkezéshez, terheléshez vagy napi ritmushoz kötődik.",
        advice: [
          "Ne csak a testsúlyt vagy a számokat figyeld. A stabilabb energiaszint és kevesebb sóvárgás legalább ilyen fontos jel.",
          "Ha a rosszabb állapot evéshez vagy éhséghez kötődik, az anyagcsere-ritmus rendezése lehet az első lépés.",
        ],
        productReason:
          "A termékajánló az anyagcsere, vércukor-egyensúly és testsúlyoldali támogatás metszetére épül.",
      };
    }
  }

  if (
    primaryDomainId === "joint_support" ||
    primaryDomainId === "bone_support" ||
    primaryDomainId === "cartilage_support" ||
    primaryDomainId === "movement_tension"
  ) {
    if (primaryDomainId === "joint_support") {
      return {
        headline: "Nálad most az ízületi komfort és a hétköznapi mozgás könnyedsége a fő irány.",
        explanation:
          "Az ízületi útvonalnál az a lényeg, mikor válik kényelmetlenebbé a mozgás: elinduláskor, terhelés után vagy tartósabban a mindennapokban.",
        advice: [
          "Figyeld külön az indulási merevséget és a terhelés utáni reakciót. Ezek más típusú támogatási igényre utalhatnak.",
          "Ne csak pihentetéssel próbálkozz. A finom, rendszeres átmozgatás sokszor pontosabb visszajelzést ad, mint a teljes kímélés.",
          "Ha aktív nap után rosszabb, a regenerációt is kezeld részként: folyadék, alvás és kötőszöveti támogatás együtt számít.",
        ],
        productReason: "Az ajánlások az ízületi komfort és kötőszöveti támogatás irányából lettek válogatva.",
      };
    }
    if (primaryDomainId === "bone_support") {
      return {
        headline: "Nálad inkább hosszabb távú csonttámogatási, fenntartó irány látszik.",
        explanation:
          "Ez nem gyors érzetjavító útvonal. A válaszaid alapján a stabil alap, a megelőzés és a következetes csonttámogatás fontosabb, mint egy azonnali komfortváltozás.",
        advice: [
          "Gondolkodj fenntartó rutinban: a csontok támogatása hetek-hónapok alatt épül, nem egyik napról a másikra.",
          "A kalcium- és D-vitamin oldal mellett a biztonságos, rendszeres terhelés is fontos inger a csontoknak.",
          "Ha életkor vagy hormonális változás miatt került elő a téma, érdemes ezt nem kampányszerűen, hanem hosszabb távú rendszerként kezelni.",
        ],
        productReason: "Az ajánlások a csontok célzott, hosszabb távú támogatására fókuszálnak.",
      };
    }
    if (primaryDomainId === "cartilage_support") {
      return {
        headline: "Nálad a porcok, kötőszövetek és a simább mozgásminőség támogatása erősödött meg.",
        explanation:
          "A válaszok alapján nem csak általános mozgáskomfort a kérdés, hanem az is, mennyire gördülékeny és terhelhető a mozgásod aktívabb napok után.",
        advice: [
          "Figyeld a másnapi állapotot is. A porc- és kötőszöveti terhelhetőségről sokszor nem a mozgás közbeni, hanem az utólagos reakció árul el többet.",
          "A kollagénes támogatást következetesen érdemes kezelni, mert a szerkezeti oldal lassabban ad visszajelzést.",
          "Ha kevésbé akadozó mozgást szeretnél, a célzott támogatás mellé a fokozatos terhelésépítés is fontos.",
        ],
        productReason: "Az ajánlások a kollagénes, porc- és mozgásminőségi támogatáshoz illeszkednek.",
      };
    }
    return {
      headline: "Nálad a mozgáskomfort mellé izomfeszülés vagy ásványi egyensúly oldali minta is társulhat.",
      explanation:
        "Ez nem tisztán ízületi útvonal. A válaszok alapján az izmok feszülése, esti merevség, görcsös jelzések vagy terhelés utáni visszaállás is fontos része a képnek.",
      advice: [
        "Külön figyeld, hogy a kellemetlenség mozgásból, izomfeszülésből vagy görcsös jellegből indul-e. Ez segít eldönteni, mire érdemes először fókuszálni.",
        "Ha estére rosszabb, a folyadék- és ásványi oldal sokszor fontosabb, mint elsőre gondolnád.",
        "Aktívabb napok után a regenerációt ne hagyd ki: az izomműködés, elektrolitok és kötőszöveti támogatás együtt adhat stabilabb eredményt.",
      ],
      productReason: "Az ajánlások az izomműködés, ásványi egyensúly és mozgáskomfort közös metszetére épülnek.",
    };
  }

  if (
    primaryDomainId === "skin_support" ||
    primaryDomainId === "hair_support" ||
    primaryDomainId === "nail_support" ||
    primaryDomainId === "skin_hair_nails"
  ) {
    if (primaryDomainId === "skin_support") {
      return {
        headline: "Nálad most a bőr állapota adja a legerősebb visszajelzést.",
        explanation:
          "A válaszaid alapján a bőrminőség nem különálló esztétikai kérdés, hanem összefügghet a regenerációval, stresszel, folyadékkal és belső tápanyagoldallal.",
        advice: [
          "Figyeld, hogy a bőröd stressz, kevés alvás, étrendi kilengés vagy ciklusváltozás után romlik-e látványosabban.",
          "A bőr támogatásánál a külső ápolás mellé érdemes belső alapot is adni: folyadék, zsírsavak, kollagén és antioxidáns oldal együtt számít.",
          "Ha a bőröd gyorsan mutatja a terhelést, akkor a regeneráció és az esti ritmus javítása is közvetlenül látszódhat rajta.",
        ],
        productReason: "Az ajánlások a bőrminőség, bőrfeszesség és belső regeneráció támogatására fókuszálnak.",
      };
    }
    if (primaryDomainId === "hair_support") {
      return {
        headline: "Nálad a haj állapota lett a fő jelzés: erő, sűrűség, növekedés vagy töredezés oldalról.",
        explanation:
          "A haj lassan reagál, ezért itt a válaszokból nem gyors korrekció, hanem több hetes, következetes belső támogatási irány rajzolódik ki.",
        advice: [
          "Válaszd szét, hogy inkább hullásról, töredezésről, fakóságról vagy lassabb növekedésről van szó. Ezek nem ugyanazt a mintát jelentik.",
          "A haj állapota gyakran késleltetve reagál a stresszre és hiányosabb időszakokra, ezért legalább 6-8 hetes követéssel érdemes gondolkodni.",
          "A célzott hajtámogatás mellé figyelj a fehérjebevitelre, mikrotápanyagokra és arra, hogy mennyi külső hő- vagy vegyi terhelést kap a hajad.",
        ],
        productReason: "Az ajánlások a hajminőség, növekedés és célzott hajtámogatás irányából lettek válogatva.",
      };
    }
    if (primaryDomainId === "nail_support") {
      return {
        headline: "Nálad most a körmök erőssége és szerkezeti minősége került előtérbe.",
        explanation:
          "A körömprobléma jó visszajelzés lehet a tápanyagellátásról és a külső terhelésről is. A válaszaid alapján nem csak szépészeti, hanem szerkezeti támogatási igény látszik.",
        advice: [
          "Figyeld meg, hogy törés, rétegesedés, puhaság vagy lassú növekedés a fő gond. A pontos jelleg segít célzottabban támogatni.",
          "A körömnél türelem kell: a javulás először az újonnan növő részen látszik, nem azon, ami már korábban meggyengült.",
          "Ha sok külső terhelést kap a körmöd, a belső támogatás mellé a vegyszerek, lemosók és mechanikai igénybevétel csökkentése is számít.",
        ],
        productReason: "Az ajánlások a köröm szerkezeti erősítéséhez és belülről építkező támogatásához illeszkednek.",
      };
    }
  }

  if (primaryDomainId === "hormonal") {
    if (includesAny(answerIds, ["hormonal_identity_cycle", "hormonal_discriminator_rhythm"])) {
      return {
        headline: "Nálad inkább ciklushoz és ritmushoz kötődő hormonális kibillenés látszik.",
        explanation:
          "A válaszaid alapján a fő kérdés nem egyetlen tünet, hanem az, mennyire kiszámítható a tested ritmusa és közérzete a ciklus különböző szakaszaiban.",
        advice: [
          "Kövesd legalább két cikluson át, mely napokon romlik a közérzet, alvás, hangulat vagy energiaszint.",
          "A hormonális ritmus érzékenyen reagál a stresszre és alváshiányra, ezért a regeneráció itt nem mellékes, hanem alapfeltétel.",
          "Ne csak a kellemetlen napokra készülj. A stabilabb napi ritmus és következetes támogatás előre dolgozik, nem utólag kapkod.",
        ],
        productReason: "Az ajánlások a ciklusritmus, női egyensúly és regeneráció támogatását veszik figyelembe.",
      };
    }
    if (includesAny(answerIds, ["hormonal_identity_stress", "hormonal_context_mental", "hormonal_discriminator_mental"])) {
      return {
        headline: "Nálad a hormonális egyensúly és az idegrendszeri terhelés erősen összekapcsolódhat.",
        explanation:
          "A válaszok alapján stresszesebb időszakban nem csak fejben billensz ki, hanem a tested finomabb ritmusai is érzékenyebben reagálhatnak.",
        advice: [
          "Figyeld meg, hogy a hormonális jelzések stresszesebb hetek után erősödnek-e. Ez segít megkülönböztetni a ritmus- és terhelésoldali mintát.",
          "Itt a lecsendesítés nem extra wellness, hanem része a hormonális egyensúly támogatásának.",
          "Ha a hangulat, alvás és ciklus együtt mozdul, ne külön-külön kezeld őket: egy közös stressz-regenerációs tengelyt jelezhetnek.",
        ],
        productReason: "Az ajánlások a női egyensúly mellett az idegrendszeri nyugalom és regeneráció irányát is figyelembe veszik.",
      };
    }
  }

  if (primaryDomainId === "sexual" || primaryDomainId === "prostate") {
    if (primaryDomainId === "prostate" || includesAny(answerIds, ["male_identity_targeted", "male_context_targeted", "male_discriminator_targeted"])) {
      return {
        headline: "Nálad inkább célzott férfi támogatási irány rajzolódik ki.",
        explanation:
          "A válaszaid alapján nem csak általános vitalitásról van szó, hanem olyan férfi-specifikus területről, ahol a megelőző, fenntartó szemlélet fontosabb lehet.",
        advice: [
          "Ezt a területet érdemes előre gondolkodva kezelni, nem csak akkor, amikor már zavaróvá válik.",
          "A célzott férfi támogatás mellett az általános energiaszint és napi ritmus is számít, mert a kettő ritkán független egymástól.",
          "A rendszeresség itt többet ér, mint az alkalmi kapkodás. Fenntartó rutinban gondolkodj.",
        ],
        productReason: "Az ajánlások célzott férfi támogatási irányra épülnek.",
      };
    }
    if (includesAny(answerIds, ["male_identity_stress", "male_context_stress", "male_discriminator_calm"])) {
      return {
        headline: "Nálad a férfi vitalitásba a stressz és idegrendszeri túlterhelés is beleszólhat.",
        explanation:
          "A válaszok alapján nem csak fizikai oldalról érdemes nézni a vitalitást. A tartós feszültség, mentális terhelés és lemerültség ezen a területen is gyorsan megjelenhet.",
        advice: [
          "Figyeld, hogy stresszesebb időszakban romlik-e a vitalitás vagy motiváció. Ha igen, nem csak célzott, hanem idegrendszeri oldal is érintett.",
          "A regenerációt kezeld teljesítménytényezőként. Ha nincs visszatöltődés, a vitalitás sem tud stabil lenni.",
          "A túlzott pörgetés helyett tartósabb energiaritmust érdemes építeni: alvás, mozgás, stresszkezelés és célzott támogatás együtt.",
        ],
        productReason: "Az ajánlások a férfi vitalitás mellett a stresszterhelés és tartalékérzet irányát is figyelembe veszik.",
      };
    }
  }

  return {};
}

function getSecondaryBridge(primaryLabel?: string, secondaryLabel?: string) {
  if (!primaryLabel || !secondaryLabel) return "";
  return `Ez azért fontos, mert nálad nem egyetlen irány látszik. A(z) ${primaryLabel} mellett a(z) ${secondaryLabel} is beleszólhat abba, hogyan érzed magad, ezért a következő lépéseknél érdemes együtt kezelni őket.`;
}

export default function WhatMayBeMissingMiniApp({
  mode = "landing",
  className,
  onAnalyticsEvent,
  onFlowStateChange,
}: MiniAppProps) {
  const [entrySelections, setEntrySelections] = useState<string[]>([]);
  const [started, setStarted] = useState(false);
  const [progressStepCount, setProgressStepCount] = useState(0);
  const [questionOrder, setQuestionOrder] = useState<string[]>([]);
  const [followupIndex, setFollowupIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [resultRequested, setResultRequested] = useState(false);
  const [entryTooltip, setEntryTooltip] = useState("");
  const [productVisuals, setProductVisuals] = useState<Record<string, string>>({});
  const resultSeenRef = useRef(false);
  const resultTopRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);

  const scrollToAppTop = useCallback(() => {
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      const node = rootRef.current;
      if (!node) return;
      const prefersReducedMotion =
        typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const top = window.scrollY + node.getBoundingClientRect().top - 12;
      window.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion ? "auto" : "smooth" });
    }, 40);
  }, []);

  const emit = useCallback(
    (eventName: MiniAppEventName, payload: MiniAppEventPayload) => {
      if (!eventSet.has(eventName)) return;
      onAnalyticsEvent?.(eventName, payload);
      if (typeof window !== "undefined") {
        if (!Array.isArray(window.dataLayer)) window.dataLayer = [];
        window.dataLayer.push({
          event: eventName,
          miniappId: "mi-hianyzik-nekem-miniapp",
          ...payload,
        });
        window.setTimeout(() => {
          fetch("/api/mi-hianyzik/event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              source: "miniapp",
              eventName,
              mode,
              payload,
            }),
            keepalive: true,
          }).catch(() => null);
        }, 0);
      }
    },
    [mode, onAnalyticsEvent]
  );

  const activeEntryId = entrySelections[0] || "";
  const activeBranchId = entryById.get(activeEntryId)?.branchId || "";
  const activeBranch = hasBranchSchema ? incomingSpec.branches?.[activeBranchId] : undefined;
  const branchScopeDomains = useMemo(() => {
    if (!hasBranchSchema || !activeBranch) return [] as string[];
    const prim = activeBranch.primaryDomains || [];
    const sec = activeBranch.allowedSecondaryDomains || [];
    return Array.from(new Set([...prim, ...sec]));
  }, [activeBranch]);
  const orderedQuestions = useMemo(
    () =>
      questionOrder
        .map((id) => incomingQuestionById.get(id))
        .filter((q): q is IncomingQuestion => Boolean(q))
        .map((q) => ({
          id: q.id,
          text: q.title || q.id,
          type: "single_select" as const,
          options: (q.options || []).map((o) => ({ id: o.id, label: o.label, scores: o.scores || {} })),
          nextQuestionMap: q.nextQuestionMap || {},
        })),
    [questionOrder]
  );

  const scoreState = useMemo(() => {
    const map = asScoreMap();
    const entrySeed = entryById.get(activeEntryId)?.seedScores || {};
    const seedEntries =
      hasBranchSchema && branchScopeDomains.length > 0
        ? Object.entries(entrySeed).filter(([domain]) => branchScopeDomains.includes(domain))
        : Object.entries(entrySeed);
    for (const [domain, amount] of seedEntries) addScore(map, domain, Number(amount || 0));
    for (const qId of questionOrder) {
      const answerId = answers[qId];
      if (!answerId) continue;
      const q = incomingQuestionById.get(qId);
      const opt = q?.options?.find((o) => o.id === answerId);
      if (!opt) continue;
      for (const [domain, amount] of Object.entries(opt.scores || {})) {
        if (domain === "global_confidence") continue;
        if (hasBranchSchema && branchScopeDomains.length > 0 && !branchScopeDomains.includes(domain)) continue;
        addScore(map, domain, Number(amount || 0));
      }
    }
    return map;
  }, [activeEntryId, answers, questionOrder, branchScopeDomains]);

  const ranking = useMemo(() => sortScoresDesc(scoreState), [scoreState]);
  const primaryScore = ranking[0]?.[1] || 0;
  const secondaryScore = ranking[1]?.[1] || 0;
  const diffPct = primaryScore > 0 ? (primaryScore - secondaryScore) / primaryScore : 0;
  const confidence: "high" | "medium" | "mixed" =
    diffPct <= 0.12 ? "mixed" : primaryScore >= secondaryScore * 1.28 ? "high" : "medium";

  const answeredCount = orderedQuestions.filter((q) => Boolean(answers[q.id])).length;
  const currentQuestion = orderedQuestions[followupIndex] || null;
  const hasUnansweredCurrent = Boolean(currentQuestion && !answers[currentQuestion.id]);

  const minQuestions = Number(incomingSpec.limits?.minQuestions || 4);
  const maxQuestions = Number(incomingSpec.limits?.maxQuestions || 6);
  const entryCounts = incomingSpec.limits?.entryCountsAsQuestion !== false;
  const askedWithEntry = answeredCount + (entryCounts ? 1 : 0);
  const maxFollowups = Math.max(1, maxQuestions - (entryCounts ? 1 : 0));

  const chooseDiscriminatorQuestion = useCallback(
    (exclude: Set<string>) => {
      if (hasBranchSchema && activeBranch) {
        const branchQuestions = new Set((activeBranch.questionOrder || []).filter((q) => q !== incomingSpec.globalQuestion?.id));
        const remaining = Array.from(branchQuestions).filter((id) => !exclude.has(id));
        return remaining[0] || "";
      }
      const topDomains = ranking.slice(0, 3).map(([domain]) => domain);
      const available = incomingQuestions.filter((q) => {
        if (exclude.has(q.id)) return false;
        if (q.id === incomingSpec.finalQuestionPolicy?.intensityQuestionId) return false;
        if (q.appliesToEntries && activeEntryId) return q.appliesToEntries.includes(activeEntryId);
        return true;
      });
      if (available.length === 0) return "";
      const scored = available.map((q) => {
        const domainTotals = topDomains.map((d) =>
          (q.options || []).reduce((sum, opt) => sum + Number(opt.scores?.[d] || 0), 0)
        );
        const max = Math.max(...domainTotals, 0);
        const min = Math.min(...domainTotals, 0);
        const spread = max - min;
        const coverage = domainTotals.filter((v) => v > 0).length;
        return { id: q.id, spread, coverage };
      });
      scored.sort((a, b) => (b.spread !== a.spread ? b.spread - a.spread : b.coverage - a.coverage));
      return scored[0]?.id || "";
    },
    [activeEntryId, ranking, activeBranch]
  );

  const nextQuestionId = useMemo(() => {
    if (!started || hasUnansweredCurrent) return "";
    if (answeredCount >= maxFollowups) return "";
    const asked = new Set(questionOrder);
    if (hasBranchSchema && activeBranch) {
      const lastQuestionId = questionOrder[Math.max(0, questionOrder.length - 1)];
      const lastAnswerId = answers[lastQuestionId];
      const lastQuestion = incomingQuestionById.get(lastQuestionId);
      const mapped = lastQuestion?.nextQuestionMap?.[lastAnswerId];
      if (mapped && incomingQuestionById.has(mapped) && !asked.has(mapped)) return mapped;

      const ordered = (activeBranch.questionOrder || []).filter((id) => incomingQuestionById.has(id));
      const nextFromOrder = ordered.find((id) => !asked.has(id));
      return nextFromOrder || "";
    }
    const lastQuestionId = questionOrder[Math.max(0, questionOrder.length - 1)];
    const lastAnswerId = answers[lastQuestionId];
    const lastQuestion = incomingQuestionById.get(lastQuestionId);
    const mapped = lastQuestion?.nextQuestionMap?.[lastAnswerId];
    if (mapped && !asked.has(mapped)) return mapped;

    const shouldStopByConfidence = askedWithEntry >= minQuestions && confidence === "high";
    const needsExtraDiscriminator = askedWithEntry >= minQuestions && confidence === "mixed";
    const intensityId = incomingSpec.finalQuestionPolicy?.intensityQuestionId || "global_intensity";
    const intensityEnabled = incomingSpec.finalQuestionPolicy?.alwaysIncludeIntensity === true;
    const shouldAskIntensity = intensityEnabled && !asked.has(intensityId) && answeredCount < maxFollowups;

    if (shouldStopByConfidence && !needsExtraDiscriminator) {
      return shouldAskIntensity ? intensityId : "";
    }

    if (needsExtraDiscriminator) {
      const forced = chooseDiscriminatorQuestion(asked);
      if (forced) return forced;
      return shouldAskIntensity ? intensityId : "";
    }

    const picked = chooseDiscriminatorQuestion(asked);
    if (picked) return picked;
    return shouldAskIntensity ? intensityId : "";
  }, [
    activeBranch,
    answers,
    askedWithEntry,
    answeredCount,
    chooseDiscriminatorQuestion,
    confidence,
    hasUnansweredCurrent,
    maxFollowups,
    minQuestions,
    questionOrder,
    started,
  ]);

  const canFinish = started && !hasUnansweredCurrent && !nextQuestionId && answeredCount > 0;
  const hasResult = canFinish && resultRequested;

  const result = useMemo(() => {
    if (!hasResult) return null;
    const primary = ranking[0];
    const secondary = ranking[1];
    if (!primary) return null;

    const primaryId = primary[0];
    const primaryScore = primary[1];
    const secondaryId = secondary?.[0];
    const secondaryScore = secondary?.[1] || 0;
    const showSecondary = Boolean(secondaryId) && (secondaryScore >= primaryScore * secondaryRatio || confidence === "mixed");

    const primaryDef = typedSpec.domainDefinitions[primaryId];
    const secondaryDef = secondaryId ? typedSpec.domainDefinitions[secondaryId] : undefined;
    const answerIds = Object.values(answers).filter(Boolean);
    const personalized = getPersonalizedResultCopy(primaryId, answerIds);
    const products = buildProductList(primaryId, showSecondary ? secondaryId : undefined, confidence === "mixed" ? 2 : 3);
    const basePrimaryTips = personalized.advice?.length ? personalized.advice : primaryDef?.tips || [];
    const primaryTips = basePrimaryTips.slice(0, confidence === "mixed" && secondaryDef ? 2 : 3);
    const secondaryTips = confidence === "mixed" && secondaryDef ? (secondaryDef.tips || []).slice(0, 2) : [];
    const summary = [personalized.headline || primaryDef?.label || primaryId, personalized.explanation || primaryDef?.summary]
      .filter(Boolean)
      .join(" ");

    return {
      primaryId,
      primaryDef: primaryDef ? { ...primaryDef, summary } : primaryDef,
      secondaryId: showSecondary ? secondaryId : undefined,
      secondaryDef: showSecondary ? secondaryDef : undefined,
      products,
      confidence,
      productReason: personalized.productReason,
      secondaryBridge: showSecondary ? getSecondaryBridge(primaryDef?.label, secondaryDef?.label) : "",
      tips: [...primaryTips, ...secondaryTips],
    };
  }, [answers, confidence, hasResult, ranking]);

  useEffect(() => {
    if (!hasResult || !result || resultSeenRef.current) return;
    const payload: MiniAppEventPayload = {
      entrySelections,
      primaryResult: result.primaryId,
      secondaryResult: result.secondaryId,
      questionCountSeen: askedWithEntry,
      recommendedProducts: result.products.map((p) => p.name),
      mode,
      event: "result",
    };
    emit("miniapp_completed", payload);
    emit("miniapp_result_viewed", payload);
    resultSeenRef.current = true;
  }, [hasResult, result, entrySelections, askedWithEntry, mode, emit]);

  useEffect(() => {
    if (!hasResult) return;
    const node = resultTopRef.current;
    if (!node) return;
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const top = window.scrollY + node.getBoundingClientRect().top - 14;
    window.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion ? "auto" : "smooth" });
  }, [hasResult]);

  const totalStages = progressStepCount > 0 ? progressStepCount : 0;
  const stageIndex = hasResult ? totalStages - 1 : started ? Math.min(totalStages - 2, answeredCount + 1) : 0;
  const progress = Math.max(0, Math.min(100, Math.round((stageIndex / (totalStages - 1)) * 100)));
  const stageTitle = hasResult ? "Az eredményed" : started ? "Folytassuk" : "Indulhat?";
  const stageDescription = hasResult
    ? "Ezek alapján ez tűnik most a legerősebb iránynak, rövid gyakorlati lépésekkel."
    : started
      ? "Haladjunk a következő rövid kérdéssel, hogy pontosabb eredményt kapj."
      : "Válassz ki egy fő témát, ami most a legjobban igaz rád. Utána indulhat is a felmérés.";

  useEffect(() => {
    onFlowStateChange?.({ started, hasResult, entrySelected: entrySelections.length > 0 });
  }, [entrySelections.length, hasResult, onFlowStateChange, started]);

  useEffect(() => {
    let active = true;
    fetch("/api/products/cards")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ProductVisual[]) => {
        if (!active || !Array.isArray(rows)) return;
        const map: Record<string, string> = {};
        for (const row of rows) {
          if (row?.slug && row?.image_url) map[String(row.slug).toLowerCase()] = String(row.image_url);
        }
        setProductVisuals(map);
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, []);

  const toggleEntry = (id: string) => {
    setEntrySelections((prev) => {
      if (typedSpec.entryScreen.maxSelect === 1) {
        const next = [id];
        setEntryTooltip("Szuper, mehetünk tovább a személyre szabott kérdésekkel.");
        return next;
      }
      if (prev.includes(id)) {
        const next = prev.filter((v) => v !== id);
        setEntryTooltip(
          next.length === 0
            ? "Válassz legalább egy témát a folytatáshoz."
            : `Még ${typedSpec.entryScreen.maxSelect - next.length} opciót választhatsz, de már most is továbbléphetsz.`
        );
        return next;
      }
      if (prev.length >= typedSpec.entryScreen.maxSelect) {
        setEntryTooltip(`Maximum ${typedSpec.entryScreen.maxSelect} témát lehet kijelölni. Ha készen vagy, lépj tovább.`);
        return prev;
      }
      const next = [...prev, id];
      setEntryTooltip(
        next.length < typedSpec.entryScreen.maxSelect
          ? `Még ${typedSpec.entryScreen.maxSelect - next.length} opciót választhatsz, de nem kötelező.`
          : `Megvan a ${typedSpec.entryScreen.maxSelect} választás. Mehetsz tovább.`
      );
      return next;
    });
  };

  const handleStart = () => {
    if (entrySelections.length < typedSpec.entryScreen.minSelect) return;
    const firstQuestionId = hasBranchSchema
      ? (incomingSpec.branches?.[entryById.get(entrySelections[0])?.branchId || ""]?.questionOrder || []).find((id) =>
          incomingQuestionById.has(id)
        ) || ""
      : entryById.get(entrySelections[0])?.firstQuestionId || "";
    const fixedStages = Math.max(3, maxFollowups + 2);
    setStarted(true);
    setProgressStepCount(fixedStages);
    setFollowupIndex(0);
    setAnswers({});
    setResultRequested(false);
    setQuestionOrder(firstQuestionId ? [firstQuestionId] : []);
    resultSeenRef.current = false;

    const basePayload: MiniAppEventPayload = {
      entrySelections,
      questionCountSeen: 1,
      mode,
      event: "entry",
    };
    emit("miniapp_started", basePayload);
    emit("miniapp_entry_selected", basePayload);
    scrollToAppTop();
  };

  const handleFollowupAnswer = (questionId: string, optionId: string) => {
    const currentQuestionIndex = orderedQuestions.findIndex((q) => q.id === questionId);
    const staleQuestionIds = currentQuestionIndex >= 0 ? orderedQuestions.slice(currentQuestionIndex + 1).map((q) => q.id) : [];
    setQuestionOrder((prev) => (currentQuestionIndex >= 0 ? prev.slice(0, currentQuestionIndex + 1) : prev));
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: optionId };
      for (const staleQuestionId of staleQuestionIds) delete next[staleQuestionId];
      return next;
    });
    setResultRequested(false);
    emit("miniapp_followup_answered", {
      entrySelections,
      questionCountSeen: 1 + followupIndex + 1,
      mode,
      event: questionId,
    });
  };

  const goNext = () => {
    if (!currentQuestion) return;
    if (!answers[currentQuestion.id]) return;
    if (followupIndex < orderedQuestions.length - 1) {
      setFollowupIndex((v) => v + 1);
      scrollToAppTop();
      return;
    }
    if (nextQuestionId) {
      setQuestionOrder((prev) => (prev.includes(nextQuestionId) ? prev : [...prev, nextQuestionId]));
      setFollowupIndex((v) => v + 1);
      setResultRequested(false);
      scrollToAppTop();
      return;
    }
    setResultRequested(true);
  };

  const goBack = () => {
    if (!started) return;
    if (hasResult) {
      setResultRequested(false);
      setFollowupIndex(Math.max(0, orderedQuestions.length - 1));
      return;
    }
    if (followupIndex > 0) {
      const currentId = orderedQuestions[followupIndex]?.id;
      if (currentId) {
        setAnswers((prev) => {
          const next = { ...prev };
          delete next[currentId];
          return next;
        });
      }
      setFollowupIndex((v) => v - 1);
    } else {
      setStarted(false);
      setAnswers({});
      setResultRequested(false);
    }
  };

  const restart = () => {
    setStarted(false);
    setProgressStepCount(0);
    setEntrySelections([]);
    setQuestionOrder([]);
    setFollowupIndex(0);
    setAnswers({});
    setResultRequested(false);
    resultSeenRef.current = false;
    emit("miniapp_restarted", {
      entrySelections: [],
      questionCountSeen: 0,
      mode,
      event: "restart",
    });
  };

  const rootClass = `mh-miniapp ${mode === "inline_article" ? "is-inline" : "is-landing"}${className ? ` ${className}` : ""}`;

  return (
    <section ref={rootRef} className={rootClass} aria-label="Mi hiányzik nekem állapotfelmérés">
      <header className="mh-stage-header">
        <h2>{stageTitle}</h2>
        <p>{stageDescription}</p>
      </header>
      <div className="mh-progress-wrap" aria-live="polite">
        <div
          className={`mh-progress-segments${started ? "" : " is-hidden"}`}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          {started &&
            Array.from({ length: totalStages }).map((_, i) => {
              const done = i < stageIndex;
              const active = i === stageIndex;
              return <span key={i} className={`mh-progress-segment${done ? " is-done" : ""}${active ? " is-active" : ""}`} />;
            })}
        </div>
      </div>

      {!started ? (
        <div className="mh-panel">
          <h3 className="mh-question-title">{typedSpec.entryScreen.title}</h3>
          <p className="mh-question-description">{typedSpec.entryScreen.description}</p>

          <div className="mh-chip-grid">
            {typedSpec.entryScreen.options.map((option) => {
              const active = entrySelections.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`mh-chip${active ? " is-active" : ""}`}
                  onClick={() => toggleEntry(option.id)}
                  aria-pressed={active}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className={`mh-entry-helper${entrySelections.length >= typedSpec.entryScreen.maxSelect ? " is-max" : ""}`}>
            {entryTooltip ||
              (entrySelections.length === 0
                ? "Válassz legalább egy opciót a folytatáshoz."
                : entrySelections.length < typedSpec.entryScreen.maxSelect
                  ? `Még ${typedSpec.entryScreen.maxSelect - entrySelections.length} opciót választhatsz, vagy már most továbbléphetsz.`
                  : "Elérted a maximum kiválasztást, mehetsz tovább.")}
          </p>

          <div className="mh-actions">
            <button
              type="button"
              className="mh-btn mh-btn-primary"
              onClick={handleStart}
              disabled={entrySelections.length < typedSpec.entryScreen.minSelect}
            >
              Kezdem a felmérést
            </button>
          </div>
        </div>
      ) : hasResult && result ? (
        <div className="mh-panel">
          <div ref={resultTopRef} className="mh-result-block mh-result-block-primary">
            <h3 className="mh-result-title">{result.confidence === "mixed" ? mixedTitle : typedSpec.copy.resultIntro}</h3>
            <div className="mh-result-card">
              <strong>{result.primaryDef?.label || result.primaryId}</strong>
              <p>{result.primaryDef?.summary}</p>
            </div>
          </div>

          {result.secondaryId && result.secondaryDef ? (
            <div className="mh-result-block">
              <h4 className="mh-secondary-title">{typedSpec.copy.secondaryIntro}</h4>
              <div className="mh-result-card mh-result-card-secondary">
                <strong>{result.secondaryDef.label}</strong>
                <p>{result.secondaryDef.summary}</p>
                {result.secondaryBridge ? <p>{result.secondaryBridge}</p> : null}
              </div>
            </div>
          ) : null}

          <div className="mh-result-block mh-result-block-tips">
            <h4 className="mh-secondary-title">Gyakorlati tanácsok, következő lépések</h4>
            <ul className="mh-tips">
              {result.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>

          <div className="mh-result-block mh-result-block-products">
            <h4 className="mh-secondary-title">{typedSpec.copy.productSectionTitle}</h4>
            {result.productReason ? <p className="mh-product-reason">{result.productReason}</p> : null}
            <div className="mh-product-grid">
              {result.products.slice(0, 6).map((product) => (
                <Link
                  key={product.url}
                  href={product.url}
                  className="mh-product-card"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    emit("miniapp_product_clicked", {
                      entrySelections,
                      primaryResult: result.primaryId,
                      secondaryResult: result.secondaryId,
                      questionCountSeen: askedWithEntry,
                      recommendedProducts: result.products.map((p) => p.name),
                      mode,
                      event: product.name,
                    })
                  }
                >
                  <div className="mh-product-thumb" aria-hidden>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={
                        productVisuals[productSlugFromUrl(product.url)] ||
                        "/images/home/topic-optimalis-megoldas.jpg"
                      }
                      alt=""
                    />
                    <span className="mh-product-thumb-badge">{productInitial(product.name)}</span>
                  </div>
                  <strong>{product.name}</strong>
                  <small>{productSlugFromUrl(product.url).replace(/-/g, " ")}</small>
                  <span>{typedSpec.copy.buttons.seeProducts} →</span>
                </Link>
              ))}
            </div>
          </div>

          <p className="mh-disclaimer">{humanizeUiText(typedSpec.copy.finalDisclaimer)}</p>

          <button type="button" className="mh-btn mh-btn-soft mh-restart-btn" onClick={restart}>
            {typedSpec.copy.buttons.restart}
          </button>
        </div>
      ) : (
        <div className="mh-panel">
          {currentQuestion ? (
            <>
              <h3 className="mh-question-title">{currentQuestion.text}</h3>
              <div className="mh-chip-grid">
                {currentQuestion.options.map((option) => {
                  const active = answers[currentQuestion.id] === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`mh-chip${active ? " is-active" : ""}`}
                      onClick={() => handleFollowupAnswer(currentQuestion.id, option.id)}
                      aria-pressed={active}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}

          <div className="mh-actions">
            <button type="button" className="mh-btn mh-btn-soft" onClick={goBack}>
              {typedSpec.copy.buttons.back}
            </button>
            <button
              type="button"
              className="mh-btn mh-btn-primary"
              onClick={goNext}
              disabled={!currentQuestion || !answers[currentQuestion.id]}
            >
              {nextQuestionId || followupIndex < orderedQuestions.length - 1 ? typedSpec.copy.buttons.next : typedSpec.copy.stepLabels.result}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

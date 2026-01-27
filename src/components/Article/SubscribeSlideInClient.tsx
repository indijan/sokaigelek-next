"use client";

import SubscribeSlideIn from "@/components/Article/SubscribeSlideIn";

type Props = {
  categorySlug: string;
  categoryLabel?: string | null;
};

export default function SubscribeSlideInClient({ categorySlug, categoryLabel }: Props) {
  return <SubscribeSlideIn categorySlug={categorySlug} categoryLabel={categoryLabel} />;
}

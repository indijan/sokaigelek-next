export type Product = {
    slug: string;
    name: string;
    short: string;
    image?: string;
    tags: string[];
    affiliate1: { label: string; url: string };
    affiliate2: { label: string; url: string };
};

export const products: Product[] = [
    {
        slug: "duolife-aloes",
        name: "DuoLife AloeS",
        short: "Aloe vera alapú termék, az emésztés és általános jóllét támogatására.",
        tags: ["emésztés", "immun", "aloe"],
        affiliate1: { label: "Megnézem (Partner 1)", url: "https://example.com/partner1" },
        affiliate2: { label: "Megnézem (Partner 2)", url: "https://example.com/partner2" },
    },
];
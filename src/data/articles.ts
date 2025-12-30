export type ArticleSection = {
    heading: string;
    body: string;
};

export type ProductSlotData = {
    afterSection: number;
    products: string[];
    reason?: string;
};

export type Article = {
    slug: string;
    title: string;
    category: string;
    intro: string;
    sections: ArticleSection[];
    productSlots: ProductSlotData[];
};

export const articles: Article[] = [
    {
        slug: "eros-immunrendszer-lepesrol-lepesre",
        title: "A mindennapi apró szokások ereje – így épül fel lépésről lépésre egy erős immunrendszer",
        category: "tudatos-elet",
        intro:
            "Az immunrendszer nem egyik napról a másikra lesz erős. Apró, következetes szokásokkal tudjuk támogatni a működését.",
        sections: [
            {
                heading: "Miért fontos az immunrendszer egyensúlya?",
                body:
                    "Az immunrendszer feladata, hogy megvédje a szervezetet a külső hatásokkal szemben. Ha kibillen az egyensúlyból, gyakrabban betegszünk meg."
            },
            {
                heading: "Alvás és regeneráció szerepe",
                body:
                    "A minőségi alvás az egyik legfontosabb tényező az immunrendszer megfelelő működésében."
            },
            {
                heading: "Tápanyagok és természetes támogatás",
                body:
                    "Bizonyos növényi kivonatok és mikrotápanyagok segíthetnek az immunrendszer támogatásában."
            }
        ],
        productSlots: [
            {
                afterSection: 1,
                products: ["duolife-aloes"],
                reason: "Az aloe vera természetes módon támogathatja az emésztést és az immunrendszert."
            }
        ]
    }
];
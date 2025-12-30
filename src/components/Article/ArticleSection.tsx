import { ArticleSection as Section } from "@/data/articles";

export default function ArticleSection({ section }: { section: Section }) {
    return (
        <section className="space-y-2">
            <h2 className="text-2xl font-semibold">{section.heading}</h2>
            <p className="text-gray-700 leading-relaxed">
                {section.body}
            </p>
        </section>
    );
}
import { ProductSlotData } from "@/data/articles";

export default function ProductSlot({ slot }: { slot: ProductSlotData }) {
    return (
        <div className="border rounded-2xl p-6 bg-gray-50 space-y-3 card-hover">
            <div className="font-semibold">Ajánlott termék</div>
            <p className="text-sm text-gray-600">{slot.reason}</p>

            <div className="flex gap-3">
                {slot.products.map((p) => (
                    <a
                        key={p}
                        href={`/termek/${p}`}
                        className="px-4 py-2 rounded-xl bg-black text-white text-sm"
                    >
                        Megnézem
                    </a>
                ))}
            </div>
        </div>
    );
}

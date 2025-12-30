import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import iconv from "iconv-lite";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
    console.error("Hiányzó env: NEXT_PUBLIC_SUPABASE_URL vagy SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
});

function looksBroken(s = "") {
    return /[√≈¬‚Ñ]/.test(s); // tipikus hibajelek
}

// UTF-8 bájtok -> tévesen MacRoman-ként megjelenítve -> visszaalakítás
function fixMojibake(s = "") {
    if (!s || !looksBroken(s)) return s;
    const bytes = iconv.encode(s, "macintosh"); // visszaállítjuk az eredeti bájtokat
    return iconv.decode(bytes, "utf8");         // majd helyesen UTF-8-ként dekódoljuk
}

async function run() {
    const { data: products, error } = await sb
        .from("products")
        .select("id, name, short, description")
        .limit(2000);

    if (error) throw error;

    let fixed = 0;

    for (const p of products ?? []) {
        const next = {
            short: fixMojibake(p.short ?? ""),
            description: fixMojibake(p.description ?? ""),
            name: fixMojibake(p.name ?? ""),
        };

        const changed =
            next.name !== (p.name ?? "") ||
            next.short !== (p.short ?? "") ||
            next.description !== (p.description ?? "");

        if (!changed) continue;

        const { error: upErr } = await sb
            .from("products")
            .update(next)
            .eq("id", p.id);

        if (upErr) {
            console.error("Update hiba:", p.id, upErr.message);
            continue;
        }

        fixed++;
        if (fixed % 25 === 0) console.log("Javítva:", fixed);
    }

    console.log("Kész. Javított termékek:", fixed);
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
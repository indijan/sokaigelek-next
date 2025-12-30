import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function AdminHome({
    searchParams,
}: {
    searchParams?: Promise<{ err?: string | string[] }>;
}) {
    const cookieStore = await cookies();
    const ok = cookieStore.get("admin_ok")?.value === "1";

    if (ok) redirect("/admin/products");

    const params = (await searchParams) ?? {};
    const errParam = (params as any).err;
    const errMessage = Array.isArray(errParam) ? errParam[0] : errParam;

    return (
        <main className="max-w-md mx-auto px-4 py-10 space-y-4">
            <h1 className="text-2xl font-bold">Admin belépés</h1>
            {errMessage ? (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
                    Hibás jelszó.
                </div>
            ) : null}

            <form
                action={async (formData) => {
                    "use server";
                    const pass = String(formData.get("password") || "");
                    const expected = process.env.ADMIN_PASSWORD || "";

                    if (pass && expected && pass === expected) {
                        const cs = await cookies();
                        cs.set("admin_ok", "1", { httpOnly: true, sameSite: "lax", path: "/" });
                        redirect("/admin/products");
                    }
                    redirect("/admin?err=1");
                }}
                className="space-y-3"
            >
                <input
                    name="password"
                    type="password"
                    className="w-full border rounded-xl px-3 py-2"
                    placeholder="Admin jelszó"
                />
                <button className="w-full bg-black text-white rounded-xl py-2">
                    Belépés
                </button>
            </form>

            <p className="text-sm text-gray-500">
                Tipp: használj hosszú, egyedi jelszót.
            </p>
        </main>
    );
}

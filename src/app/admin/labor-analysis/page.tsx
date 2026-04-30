import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminLaborAnalysisTool from "./tool";

export default async function AdminLaborAnalysisPage() {
  const cookieStore = await cookies();
  if (cookieStore.get("admin_ok")?.value !== "1") redirect("/admin");

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Labor elemző modul</h1>
        <p className="text-sm text-slate-600">
          PDF feltöltés, OpenAI-kompatibilis elemzés, szerkeszthető hírlevél preview, e-mail küldés és PDF mentés.
        </p>
      </div>
      <AdminLaborAnalysisTool />
    </main>
  );
}

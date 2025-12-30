export function slugifyHu(input: string): string {
    return (input || "")
        .toLowerCase()
        .normalize("NFD")                 // ékezetek szétbontása
        .replace(/[\u0300-\u036f]/g, "")  // ékezet jelek eltávolítása (ő→o, ű→u, á→a, stb.)
        .replace(/[^a-z0-9\s-]/g, "")     // csak betű, szám, space, kötőjel
        .trim()
        .replace(/\s+/g, "-")             // szóköz → kötőjel
        .replace(/-+/g, "-");             // több kötőjel → egy
}
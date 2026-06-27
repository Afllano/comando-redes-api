// Almacenamiento simple en archivo JSON.
// Funciona gratis sin base de datos para arrancar.
// Cuando crezcas, cambia este archivo por un cliente de Postgres (Supabase/Neon) usando schema.sql.
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const FILE = new URL("../data.json", import.meta.url);
let cache = null;

async function load() {
  if (cache) return cache;
  if (existsSync(FILE)) {
    try { cache = JSON.parse(await readFile(FILE, "utf8")); }
    catch { cache = { brands: [], posts: [] }; }
  } else {
    cache = { brands: [], posts: [] };
  }
  return cache;
}
async function persist() { await writeFile(FILE, JSON.stringify(cache, null, 2)); }

export const db = {
  async brands() { return (await load()).brands; },
  async brand(id) { return (await load()).brands.find(b => b.id === id); },
  async upsertBrand(b) {
    const d = await load();
    const i = d.brands.findIndex(x => x.id === b.id);
    if (i >= 0) d.brands[i] = { ...d.brands[i], ...b }; else d.brands.push(b);
    await persist(); return b;
  },
  async deleteBrand(id) {
    const d = await load();
    d.brands = d.brands.filter(b => b.id !== id);
    d.posts = d.posts.filter(p => p.brandId !== id);
    await persist();
  },
  async posts() { return (await load()).posts; },
  async setPosts(posts) { const d = await load(); d.posts = posts; await persist(); },
};

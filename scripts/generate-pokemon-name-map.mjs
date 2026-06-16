import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const statsPath = path.join(projectRoot, "public/data/pokemon_stats.json");
const outputPath = path.join(projectRoot, "src/lib/pogo/pokemonNameMap.ts");

const stats = JSON.parse(await fs.readFile(statsPath, "utf8"));
const ids = [...new Set(stats.map((entry) => entry.pokemon_id))].sort((a, b) => a - b);

async function fetchSpeciesName(id) {
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
  if (!res.ok) {
    throw new Error(`failed to fetch species ${id}: ${res.status}`);
  }
  const json = await res.json();
  const jaName = json.names?.find((name) => name.language?.name === "ja")?.name;
  if (!jaName) {
    throw new Error(`missing ja name for species ${id}`);
  }
  return jaName;
}

const entries = [];
for (const id of ids) {
  // Keep the request volume gentle for the public API.
  // eslint-disable-next-line no-await-in-loop
  const jaName = await fetchSpeciesName(id);
  entries.push([id, jaName]);
}

const content = `export const pokemonNameMapJa: Record<number, string> = ${JSON.stringify(
  Object.fromEntries(entries),
  null,
  2,
)} as const;\n`;

await fs.writeFile(outputPath, content, "utf8");
console.log(`Wrote ${outputPath} with ${entries.length} entries.`);

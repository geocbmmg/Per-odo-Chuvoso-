// Copia o worker do MapLibre GL para public/vendor/maplibre-gl/ (servido pela
// própria aplicação). A v6 localiza o worker por import.meta.url, o que o
// empacotamento do Next não preserva; ver lib/mapa/worker.ts.
// Roda no postinstall (local e na Vercel). Os arquivos copiados não são versionados.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origem = join(raiz, "node_modules", "maplibre-gl", "dist");
const destino = join(raiz, "public", "vendor", "maplibre-gl");

mkdirSync(destino, { recursive: true });
for (const arquivo of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(origem, arquivo), join(destino, arquivo));
}
console.log("[postinstall] worker do MapLibre copiado para public/vendor/maplibre-gl/");

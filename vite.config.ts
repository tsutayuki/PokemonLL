import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const imageRoot = path.join(projectRoot, "Image");

const mimeByExt: Record<string, string> = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function pokemonPickCounts(): Plugin {
  const file = path.join(projectRoot, "work/pokemon-pick-counts.json");
  const read = () => {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, number>;
    } catch {
      return {};
    }
  };
  const write = (counts: Record<string, number>) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(counts));
  };

  return {
    name: "pokemon-pick-counts",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (url !== "/api/pokemon-picks") return next();
        if (req.method === "GET") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(read()));
          return;
        }
        if (req.method === "POST") {
          const chunks: Buffer[] = [];
          req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          req.on("end", () => {
            const body = JSON.parse(Buffer.concat(chunks).toString() || "{}") as { id?: number };
            const id = String(Math.floor(Number(body.id)));
            if (!/^\d+$/.test(id) || id === "0") {
              res.statusCode = 400;
              res.end("bad id");
              return;
            }
            const counts = read();
            counts[id] = (counts[id] ?? 0) + 1;
            write(counts);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(counts));
          });
          return;
        }
        next();
      });
    },
  };
}

function rootImageDir(): Plugin {
  let clientOutDir = path.join(projectRoot, "dist", "client");
  return {
    name: "root-image-dir",
    configResolved(config) {
      const fromClient = config.environments?.client?.build?.outDir;
      if (fromClient) clientOutDir = path.resolve(config.root, fromClient);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/Image/")) return next();
        const relative = decodeURIComponent(url.slice("/Image/".length));
        const filePath = path.resolve(imageRoot, relative);
        if (!filePath.startsWith(imageRoot) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          return next();
        }
        const ext = path.extname(filePath).toLowerCase();
        res.setHeader("Content-Type", mimeByExt[ext] ?? "application/octet-stream");
        fs.createReadStream(filePath).pipe(res);
      });
    },
    closeBundle() {
      if (!fs.existsSync(imageRoot)) return;
      const dest = path.join(clientOutDir, "Image");
      fs.mkdirSync(clientOutDir, { recursive: true });
      fs.cpSync(imageRoot, dest, { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), cloudflare(), rootImageDir(), pokemonPickCounts()],
  build: {
    outDir: "dist",
  },
});

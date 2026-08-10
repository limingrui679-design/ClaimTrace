import { access, cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { gzipSync } from "node:zlib";
import type { Plugin } from "vite";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

interface EmbeddedAsset {
  body: string;
  contentType: string;
}

const publicBuildExclusions = new Set([
  ".assetsignore",
  ".openai",
  "client",
  "server",
  "wrangler.json",
]);

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function extension(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot).toLowerCase() : "";
}

async function collectPublicFiles(
  directory: string,
  buildRoot: string,
): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (directory === buildRoot && publicBuildExclusions.has(entry.name)) {
      continue;
    }
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectPublicFiles(absolutePath, buildRoot));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }
  return files.sort();
}

async function createEmbeddedAssets(buildRoot: string): Promise<Record<string, EmbeddedAsset>> {
  const assets: Record<string, EmbeddedAsset> = {};
  for (const file of await collectPublicFiles(buildRoot, buildRoot)) {
    const route = `/${relative(buildRoot, file).split(sep).join("/")}`;
    assets[route] = {
      body: gzipSync(await readFile(file), { level: 9 }).toString("base64"),
      contentType: contentTypes[extension(route)] ?? "application/octet-stream",
    };
  }
  return assets;
}

async function copyPublicBuild(buildRoot: string, clientDirectory: string): Promise<void> {
  await rm(clientDirectory, { recursive: true, force: true });
  await mkdir(clientDirectory, { recursive: true });
  for (const entry of await readdir(buildRoot, { withFileTypes: true })) {
    if (publicBuildExclusions.has(entry.name)) {
      continue;
    }
    const source = join(buildRoot, entry.name);
    if ((await stat(source)).isDirectory()) {
      await cp(source, join(clientDirectory, entry.name), { recursive: true });
    } else {
      await cp(source, join(clientDirectory, entry.name));
    }
  }
}

// Packages Sites metadata and migrations after Vite finishes compiling.
export function sites(): Plugin {
  let root = process.cwd();

  return {
    name: "sites",
    apply: "build",
    configResolved(config) {
      root = config.root;
    },
    async closeBundle() {
      const buildRoot = resolve(root, "dist");
      const outputDirectory = resolve(buildRoot, ".openai");
      const clientDirectory = resolve(buildRoot, "client");
      const serverDirectory = resolve(buildRoot, "server");
      const hostingConfig = resolve(root, ".openai", "hosting.json");
      const drizzleSource = resolve(root, "drizzle");

      await rm(outputDirectory, { recursive: true, force: true });
      await mkdir(outputDirectory, { recursive: true });

      if (await exists(hostingConfig)) {
        await cp(hostingConfig, resolve(outputDirectory, "hosting.json"));
      }
      if (await exists(drizzleSource)) {
        await cp(drizzleSource, resolve(outputDirectory, "drizzle"), {
          recursive: true,
        });
      }

      // Sites normally binds files from dist/client. Keep the regular Vite
      // output at dist/ for Cloudflare preview while mirroring public files for
      // the hosted runtime.
      await copyPublicBuild(buildRoot, clientDirectory);
      await writeFile(
        resolve(clientDirectory, ".assetsignore"),
        ".vite\nwrangler.json\n.dev.vars\n",
        "utf8",
      );
      await writeFile(
        resolve(clientDirectory, "_headers"),
        "/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n",
        "utf8",
      );

      // Sites requires a Workers-compatible entry. The compressed embedded map
      // is a deterministic fallback for runtimes where the ASSETS binding is
      // present but was not populated from a static-only Vite build.
      const embeddedAssets = await createEmbeddedAssets(buildRoot);
      await mkdir(serverDirectory, { recursive: true });
      await writeFile(
        resolve(serverDirectory, "index.js"),
        `const assets = ${JSON.stringify(embeddedAssets)};\n\nfunction decode(body) {\n  const bytes = Uint8Array.from(atob(body), (character) => character.charCodeAt(0));\n  return new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));\n}\n\nfunction embeddedResponse(request) {\n  const url = new URL(request.url);\n  const exactPath = url.pathname === "/" ? "/index.html" : url.pathname;\n  const acceptsHtml = request.headers.get("accept")?.includes("text/html");\n  const selected = assets[exactPath] ?? (acceptsHtml ? assets["/index.html"] : undefined);\n  if (!selected) return new Response("Not found", { status: 404 });\n  const headers = new Headers({\n    "content-type": selected.contentType,\n    "x-content-type-options": "nosniff",\n    "cache-control": exactPath.startsWith("/assets/")\n      ? "public, max-age=31536000, immutable"\n      : "public, max-age=0, must-revalidate",\n  });\n  return new Response(request.method === "HEAD" ? null : decode(selected.body), { headers });\n}\n\nexport default {\n  async fetch(request, env) {\n    if (request.method !== "GET" && request.method !== "HEAD") {\n      return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });\n    }\n    if (env?.ASSETS?.fetch) {\n      try {\n        const response = await env.ASSETS.fetch(request);\n        if (response.status !== 404) return response;\n      } catch {\n        // Fall through to the deterministic embedded build.\n      }\n    }\n    return embeddedResponse(request);\n  },\n};\n`,
        "utf8",
      );
      await writeFile(
        resolve(serverDirectory, "wrangler.json"),
        JSON.stringify({
          topLevelName: "claimtrace",
          name: "claimtrace",
          compatibility_date: "2026-08-08",
          main: "index.js",
          no_bundle: true,
          rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }],
          assets: { directory: "../client" },
          observability: { enabled: true },
        }),
        "utf8",
      );
    },
  };
}

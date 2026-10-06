import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = path.join(root, "docs"),
  assets = path.join(docs, "assets");
await fs.mkdir(assets, { recursive: true });
const options = {
  absWorkingDir: root,
  entryPoints: [path.join(root, "src/main.js")],
  bundle: true,
  minify: true,
  format: "esm",
  target: ["es2022"],
  charset: "utf8",
  outdir: assets,
  entryNames: "app-[hash]",
  metafile: true,
  legalComments: "none",
};
let outputs;
if (process.env.ROADMAP_ESBUILD_BINARY) {
  const meta = path.join(docs, "build-meta.json");
  execFileSync(
    process.env.ROADMAP_ESBUILD_BINARY,
    [
      options.entryPoints[0],
      "--bundle",
      "--minify",
      "--format=esm",
      "--target=es2022",
      "--charset=utf8",
      "--outdir=" + assets,
      "--entry-names=app-[hash]",
      "--metafile=" + meta,
      "--legal-comments=none",
    ],
    { cwd: root, stdio: "inherit" },
  );
  outputs = JSON.parse(await fs.readFile(meta, "utf8")).outputs;
  await fs.unlink(meta);
} else {
  const { build } = await import("esbuild");
  outputs = (await build(options)).metafile.outputs;
}
const files = Object.keys(outputs),
  js = files.find((f) => f.endsWith(".js")),
  css = files.find((f) => f.endsWith(".css"));
const relative = (f) =>
  "./" + path.relative(docs, path.resolve(root, f)).replaceAll("\\", "/");
const html = (await fs.readFile(path.join(root, "src/index.html"), "utf8"))
  .replaceAll("__JS__", relative(js))
  .replaceAll("__CSS__", relative(css))
  .replace(/>\s+</g, "><")
  .replace(/\n[ \t]*/g, " ");
await fs.writeFile(path.join(docs, "index.html"), html);
await fs.writeFile(path.join(docs, ".nojekyll"), "");
// Keep one previous generation so an already cached HTML document still loads.
const manifestPath = path.join(docs, "asset-manifest.json");
let oldManifest = { current: [], previous: [] };
try {
  oldManifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
} catch {}
const current = files.map((f) => path.basename(f)).sort();
const previous =
  JSON.stringify(oldManifest.current) === JSON.stringify(current)
    ? oldManifest.previous
    : oldManifest.current;
const manifest = { current, previous };
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
const keep = new Set([...current, ...previous]);
for (const file of await fs.readdir(assets))
  if (!keep.has(file)) await fs.unlink(path.join(assets, file));
console.log(
  JSON.stringify(
    {
      version: "3.4",
      htmlBytes: Buffer.byteLength(html),
      assets: files.map((f) => ({
        file: path.basename(f),
        bytes: outputs[f].bytes,
      })),
    },
    null,
    2,
  ),
);

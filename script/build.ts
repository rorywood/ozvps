import { build as esbuild } from "esbuild";
import { build as viteBuild, createServer } from "vite";
import { rm, readFile, mkdir, cp } from "fs/promises";
import path from "path";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });
  await rm("admin-dist", { recursive: true, force: true });

  console.log("building main client...");
  await viteBuild();

  console.log("building main server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  // Build admin panel
  console.log("building admin client...");
  await mkdir("admin-dist", { recursive: true });

  await viteBuild({
    root: "admin-client",
    build: {
      outDir: "../admin-dist/client",
      emptyOutDir: true,
    },
  });

  console.log("building admin server...");
  await esbuild({
    entryPoints: ["admin-server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "admin-dist/server.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  console.log("build complete!");
}

buildAll().catch((err) => {
  console.error("Build failed!");
  if (err.errors && Array.isArray(err.errors)) {
    console.error("Errors:");
    err.errors.forEach((e: any, i: number) => {
      console.error(`  ${i + 1}. ${e.text || e.message || JSON.stringify(e)}`);
      if (e.location) {
        console.error(`     at ${e.location.file}:${e.location.line}:${e.location.column}`);
      }
    });
  } else if (err.message) {
    console.error(err.message);
  } else {
    console.error(JSON.stringify(err, null, 2));
  }
  if (err.stack) {
    console.error("\nStack trace:");
    console.error(err.stack);
  }
  process.exit(1);
});

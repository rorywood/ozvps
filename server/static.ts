import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Serve static assets with aggressive caching for hashed files
  // Vite adds content hashes to JS/CSS filenames, so they can be cached forever
  app.use(express.static(distPath, {
    maxAge: '1y', // Cache hashed assets for 1 year
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      // Don't cache HTML files - they need to be fresh to pick up new hashed assets
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
      // Hashed assets (contain hash in filename) can be cached aggressively
      else if (/\.[a-f0-9]{8,}\.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|ico|webp)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
      // Other static assets - moderate caching
      else {
        res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
      }
    },
  }));

  // fall through to index.html if the file doesn't exist (SPA routing)
  app.use("*", (_req, res) => {
    // Don't cache the index.html fallback
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

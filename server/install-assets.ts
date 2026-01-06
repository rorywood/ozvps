import { type Express } from "express";
import path from "path";
import fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import crypto from "crypto";
import { log } from "./index";

const execAsync = promisify(exec);

export function registerInstallAssets(app: Express) {
  app.get('/update-ozvps.sh', async (req, res) => {
    try {
      const scriptPath = path.join(process.cwd(), 'public', 'update-ozvps.sh');
      const script = await fs.readFile(scriptPath, 'utf8');
      
      res.setHeader('Content-Type', 'text/x-shellscript; charset=utf-8');
      res.setHeader('Content-Disposition', 'inline; filename="update-ozvps.sh"');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(script);
    } catch (error: any) {
      log(`Error serving update script: ${error.message}`, 'api');
      res.status(404).send('# Update script not found');
    }
  });

  app.get('/install.sh', async (req, res) => {
    try {
      const scriptPath = path.join(process.cwd(), 'public', 'install.sh');
      let script = await fs.readFile(scriptPath, 'utf8');
      
      const replitUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : process.env.REPL_SLUG && process.env.REPL_OWNER
          ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
          : `https://${req.get('host')}`;
      
      const virtfusionUrl = process.env.VIRTFUSION_PANEL_URL || '';
      
      script = script.replace(
        'DOWNLOAD_URL="${OZVPS_DOWNLOAD_URL:-}"',
        `DOWNLOAD_URL="${replitUrl}/download.tar.gz"`
      );
      script = script.replace(
        'PRECONFIGURED_VIRTFUSION_URL=""',
        `PRECONFIGURED_VIRTFUSION_URL="${virtfusionUrl}"`
      );
      
      res.setHeader('Content-Type', 'text/x-shellscript; charset=utf-8');
      res.setHeader('Content-Disposition', 'inline; filename="install.sh"');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(script);
    } catch (error: any) {
      log(`Error serving install script: ${error.message}`, 'api');
      res.status(404).send('# Install script not found');
    }
  });

  app.get('/download.tar.gz', async (req, res) => {
    try {
      const cwd = process.cwd();
      const uniqueId = crypto.randomBytes(8).toString('hex');
      const archivePath = path.join('/tmp', `ozvps-panel-${uniqueId}.tar.gz`);
      
      const potentialFiles = [
        'client',
        'server', 
        'shared',
        'public',
        'script',
        'package.json',
        'package-lock.json',
        'tsconfig.json',
        'vite.config.ts',
        'vite-plugin-meta-images.ts',
        'postcss.config.js',
        'drizzle.config.ts',
        'tailwind.config.ts',
        'components.json',
        'INSTALL.md'
      ];
      
      const existingFiles: string[] = [];
      for (const file of potentialFiles) {
        try {
          await fs.access(path.join(cwd, file));
          existingFiles.push(file);
        } catch {
        }
      }
      
      if (existingFiles.length === 0) {
        return res.status(500).send('No files found to archive');
      }
      
      const quotedFiles = existingFiles.map(f => `'${f.replace(/'/g, "'\\''")}'`).join(' ');
      const tarCommand = `tar -czf '${archivePath}' --exclude='node_modules' --exclude='.env' --exclude='*.log' --exclude='.git' --exclude='dist' --exclude='.replit' --exclude='replit.nix' -C '${cwd}' ${quotedFiles}`;
      
      await execAsync(tarCommand);
      
      const archive = await fs.readFile(archivePath);
      
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', 'attachment; filename="ozvps-panel.tar.gz"');
      res.setHeader('Content-Length', archive.length);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(archive);
      
      await fs.unlink(archivePath).catch(() => {});
    } catch (error: any) {
      log(`Error creating download archive: ${error.message}`, 'api');
      res.status(500).send('Failed to create download archive');
    }
  });
}

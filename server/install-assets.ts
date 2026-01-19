import { type Express } from "express";
import path from "path";
import fs from "fs/promises";
import { spawn } from "child_process";
import crypto from "crypto";
import { log } from './log';
import { VERSION, VERSION_HISTORY } from "@shared/version";

/**
 * Execute a command safely using spawn (no shell injection risk)
 */
function execSafe(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false, // SECURITY: Never use shell
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

export function registerInstallAssets(app: Express) {
  // Version check endpoint for update script
  app.get('/api/version', (req, res) => {
    const latestChanges = VERSION_HISTORY[0]?.changes || [];
    res.json({
      version: VERSION,
      date: VERSION_HISTORY[0]?.date || new Date().toISOString().split('T')[0],
      changes: latestChanges
    });
  });

  // Serve the ozvps control panel script
  app.get('/ozvps', async (req, res) => {
    try {
      const scriptPath = path.join(process.cwd(), 'scripts', 'ozvps');
      const script = await fs.readFile(scriptPath, 'utf8');

      res.setHeader('Content-Type', 'text/x-shellscript; charset=utf-8');
      res.setHeader('Content-Disposition', 'inline; filename="ozvps"');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(script);
    } catch (error: any) {
      log(`Error serving ozvps control script: ${error.message}`, 'api');
      res.status(404).send('# Control script not found');
    }
  });

  // Serve the unified installer script
  app.get('/ozvps-install.sh', async (req, res) => {
    try {
      const scriptPath = path.join(process.cwd(), 'scripts', 'ozvps-install.sh');
      const script = await fs.readFile(scriptPath, 'utf8');

      res.setHeader('Content-Type', 'text/x-shellscript; charset=utf-8');
      res.setHeader('Content-Disposition', 'inline; filename="ozvps-install.sh"');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(script);
    } catch (error: any) {
      log(`Error serving installer script: ${error.message}`, 'api');
      res.status(404).send('# Installer script not found');
    }
  });

  app.get('/install.sh', async (req, res) => {
    try {
      const scriptPath = path.join(process.cwd(), 'public', 'install.sh');
      let script = await fs.readFile(scriptPath, 'utf8');

      const baseUrl = process.env.APP_DOMAIN
        ? `https://${process.env.APP_DOMAIN}`
        : `https://${req.get('host')}`;

      const virtfusionUrl = process.env.VIRTFUSION_PANEL_URL || '';

      script = script.replace(
        'DOWNLOAD_URL="${OZVPS_DOWNLOAD_URL:-}"',
        `DOWNLOAD_URL="${baseUrl}/download.tar.gz"`
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

      // SECURITY: Hardcoded allowlist of files to include
      // This prevents any path traversal or injection attacks
      const allowedFiles = [
        'client',
        'server',
        'shared',
        'public',
        'script',
        'dist',
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

      // Verify each file exists and is within cwd
      const existingFiles: string[] = [];
      for (const file of allowedFiles) {
        const fullPath = path.join(cwd, file);
        // SECURITY: Ensure file is within cwd (prevent path traversal)
        const resolvedPath = path.resolve(fullPath);
        if (!resolvedPath.startsWith(cwd)) {
          log(`Security: Blocked path traversal attempt: ${file}`, 'security');
          continue;
        }
        try {
          await fs.access(fullPath);
          existingFiles.push(file);
        } catch {
          // File doesn't exist, skip it
        }
      }

      if (existingFiles.length === 0) {
        return res.status(500).send('No files found to archive');
      }

      // SECURITY: Use spawn with argument array to prevent shell injection
      // Each argument is passed directly to the process, no shell interpretation
      const tarArgs = [
        '-czf',
        archivePath,
        '--exclude=node_modules',
        '--exclude=.env',
        '--exclude=*.log',
        '--exclude=.git',
        '--exclude=.replit',
        '--exclude=replit.nix',
        '-C',
        cwd,
        ...existingFiles
      ];

      await execSafe('tar', tarArgs);

      const archive = await fs.readFile(archivePath);

      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', 'attachment; filename="ozvps-panel.tar.gz"');
      res.setHeader('Content-Length', archive.length);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(archive);

      // Cleanup temp file
      await fs.unlink(archivePath).catch(() => {});
    } catch (error: any) {
      log(`Error creating download archive: ${error.message}`, 'api');
      res.status(500).send('Failed to create download archive');
    }
  });
}

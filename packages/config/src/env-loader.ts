import fs from 'fs';
import path from 'path';

export function loadEnvFile(): void {
  try {
    let currentDir = process.cwd();
    while (currentDir) {
      const envPath = path.join(currentDir, '.env');
      if (fs.existsSync(envPath)) {
        if (typeof process.loadEnvFile === 'function') {
          process.loadEnvFile(envPath);
        }
        break;
      }
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) break;
      currentDir = parentDir;
    }
  } catch {
    // Ignore error if env file is missing or unreadable
  }
}

// Automatically execute on import
loadEnvFile();

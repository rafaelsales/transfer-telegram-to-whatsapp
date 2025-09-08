import {
  promises as fs,
  existsSync,
  statSync,
  createReadStream,
  createWriteStream,
} from 'fs';
import { dirname, resolve, join } from 'path';
import { createHash } from 'crypto';
import { pipeline } from 'stream/promises';

/**
 * FileUtils - Utility functions for file system operations
 * Provides cross-platform file operations with atomic writes and error handling
 */
export class FileUtils {
  /**
   * Ensures a directory exists, creating it if necessary
   */
  static async ensureDir(dirPath) {
    const absolutePath = resolve(dirPath);

    try {
      await fs.access(absolutePath);
      const stats = await fs.stat(absolutePath);
      if (!stats.isDirectory()) {
        throw new Error(`Path exists but is not a directory: ${absolutePath}`);
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        await fs.mkdir(absolutePath, { recursive: true });
      } else {
        throw error;
      }
    }

    return absolutePath;
  }

  /**
   * Reads a JSON file and parses it
   */
  static async readJSON(filePath) {
    const absolutePath = resolve(filePath);

    try {
      const content = await fs.readFile(absolutePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${absolutePath}`);
      } else if (error instanceof SyntaxError) {
        throw new Error(
          `Invalid JSON in file: ${absolutePath} - ${error.message}`
        );
      } else {
        throw new Error(
          `Failed to read JSON file: ${absolutePath} - ${error.message}`
        );
      }
    }
  }

  /**
   * Writes data to a JSON file atomically
   */
  static async writeJSON(filePath, data, options = {}) {
    const absolutePath = resolve(filePath);
    const tempPath = `${absolutePath}.tmp`;

    try {
      // Ensure directory exists
      await FileUtils.ensureDir(dirname(absolutePath));

      // Serialize data
      const jsonString = JSON.stringify(data, null, options.indent || 2);

      // Write to temporary file first
      await fs.writeFile(tempPath, jsonString, 'utf8');

      // Atomically move to final location
      await fs.rename(tempPath, absolutePath);

      return absolutePath;
    } catch (error) {
      // Clean up temporary file if it exists
      try {
        await fs.unlink(tempPath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }

      throw new Error(
        `Failed to write JSON file: ${absolutePath} - ${error.message}`
      );
    }
  }

  /**
   * Appends a line to a JSONL file atomically
   */
  static async appendJSONL(filePath, data) {
    const absolutePath = resolve(filePath);

    try {
      // Ensure directory exists
      await FileUtils.ensureDir(dirname(absolutePath));

      // Serialize data as single line
      const jsonLine = JSON.stringify(data) + '\n';

      // Append to file
      await fs.appendFile(absolutePath, jsonLine, 'utf8');

      return absolutePath;
    } catch (error) {
      throw new Error(
        `Failed to append to JSONL file: ${absolutePath} - ${error.message}`
      );
    }
  }

  /**
   * Reads all lines from a JSONL file
   */
  static async readJSONL(filePath) {
    const absolutePath = resolve(filePath);

    try {
      const content = await fs.readFile(absolutePath, 'utf8');
      const lines = content
        .trim()
        .split('\n')
        .filter(line => line.trim());

      return lines.map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          throw new Error(
            `Invalid JSON on line ${index + 1} in ${absolutePath}: ${error.message}`
          );
        }
      });
    } catch (error) {
      if (error.code === 'ENOENT') {
        return []; // Return empty array if file doesn't exist
      } else {
        throw new Error(
          `Failed to read JSONL file: ${absolutePath} - ${error.message}`
        );
      }
    }
  }

  /**
   * Copies a file with progress callback
   */
  static async copyFile(sourcePath, destPath, options = {}) {
    const sourceAbsolute = resolve(sourcePath);
    const destAbsolute = resolve(destPath);

    try {
      // Ensure destination directory exists
      await FileUtils.ensureDir(dirname(destAbsolute));

      // Check source file exists
      const sourceStats = await fs.stat(sourceAbsolute);
      if (!sourceStats.isFile()) {
        throw new Error(`Source is not a file: ${sourceAbsolute}`);
      }

      // Copy file
      if (options.progress) {
        await FileUtils._copyFileWithProgress(
          sourceAbsolute,
          destAbsolute,
          sourceStats.size,
          options.progress
        );
      } else {
        await fs.copyFile(sourceAbsolute, destAbsolute);
      }

      return destAbsolute;
    } catch (error) {
      throw new Error(
        `Failed to copy file from ${sourceAbsolute} to ${destAbsolute}: ${error.message}`
      );
    }
  }

  /**
   * Copies a file with progress reporting
   */
  static async _copyFileWithProgress(
    sourcePath,
    destPath,
    totalSize,
    progressCallback
  ) {
    const sourceStream = createReadStream(sourcePath);
    const destStream = createWriteStream(destPath);

    let copiedBytes = 0;

    sourceStream.on('data', chunk => {
      copiedBytes += chunk.length;
      const percentage = Math.round((copiedBytes / totalSize) * 100);
      progressCallback({ copiedBytes, totalSize, percentage });
    });

    await pipeline(sourceStream, destStream);
  }

  /**
   * Moves a file atomically
   */
  static async moveFile(sourcePath, destPath) {
    const sourceAbsolute = resolve(sourcePath);
    const destAbsolute = resolve(destPath);

    try {
      // Ensure destination directory exists
      await FileUtils.ensureDir(dirname(destAbsolute));

      // Try atomic rename first (works on same filesystem)
      try {
        await fs.rename(sourceAbsolute, destAbsolute);
        return destAbsolute;
      } catch (error) {
        if (error.code === 'EXDEV') {
          // Cross-filesystem move - copy then delete
          await FileUtils.copyFile(sourceAbsolute, destAbsolute);
          await fs.unlink(sourceAbsolute);
          return destAbsolute;
        } else {
          throw error;
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to move file from ${sourceAbsolute} to ${destAbsolute}: ${error.message}`
      );
    }
  }

  /**
   * Deletes a file or directory
   */
  static async remove(path) {
    const absolutePath = resolve(path);

    try {
      const stats = await fs.stat(absolutePath);

      if (stats.isDirectory()) {
        await fs.rmdir(absolutePath, { recursive: true });
      } else {
        await fs.unlink(absolutePath);
      }

      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false; // File/directory doesn't exist
      } else {
        throw new Error(`Failed to remove: ${absolutePath} - ${error.message}`);
      }
    }
  }

  /**
   * Checks if a path exists and returns type
   */
  static async pathInfo(path) {
    const absolutePath = resolve(path);

    try {
      const stats = await fs.stat(absolutePath);

      return {
        exists: true,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        absolutePath,
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          exists: false,
          absolutePath,
        };
      } else {
        throw new Error(
          `Failed to get path info: ${absolutePath} - ${error.message}`
        );
      }
    }
  }

  /**
   * Calculates file hash
   */
  static async calculateHash(filePath, algorithm = 'sha256') {
    const absolutePath = resolve(filePath);

    try {
      const hash = createHash(algorithm);
      const stream = createReadStream(absolutePath);

      for await (const chunk of stream) {
        hash.update(chunk);
      }

      return hash.digest('hex');
    } catch (error) {
      throw new Error(
        `Failed to calculate hash for ${absolutePath}: ${error.message}`
      );
    }
  }

  /**
   * Finds files matching a pattern
   */
  static async findFiles(dirPath, pattern) {
    const absolutePath = resolve(dirPath);
    const regex = new RegExp(pattern);
    const results = [];

    try {
      const entries = await fs.readdir(absolutePath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(absolutePath, entry.name);

        if (entry.isFile() && regex.test(entry.name)) {
          results.push(fullPath);
        } else if (entry.isDirectory()) {
          // Recursively search subdirectories
          const subResults = await FileUtils.findFiles(fullPath, pattern);
          results.push(...subResults);
        }
      }

      return results;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      } else {
        throw new Error(
          `Failed to find files in ${absolutePath}: ${error.message}`
        );
      }
    }
  }

  /**
   * Creates a backup of a file
   */
  static async backup(filePath, backupSuffix = '.backup') {
    const absolutePath = resolve(filePath);

    if (!existsSync(absolutePath)) {
      throw new Error(`File not found for backup: ${absolutePath}`);
    }

    const backupPath = `${absolutePath}${backupSuffix}`;
    await FileUtils.copyFile(absolutePath, backupPath);

    return backupPath;
  }

  /**
   * Safely updates a file with backup
   */
  static async safeUpdate(filePath, updateFunction) {
    const absolutePath = resolve(filePath);
    let backupPath = null;

    try {
      // Create backup if file exists
      if (existsSync(absolutePath)) {
        backupPath = await FileUtils.backup(
          absolutePath,
          `.backup.${Date.now()}`
        );
      }

      // Read current content
      let currentData = null;
      if (existsSync(absolutePath)) {
        currentData = await FileUtils.readJSON(absolutePath);
      }

      // Apply update function
      const updatedData = await updateFunction(currentData);

      // Write updated data
      await FileUtils.writeJSON(absolutePath, updatedData);

      // Clean up backup on success
      if (backupPath) {
        await FileUtils.remove(backupPath);
      }

      return updatedData;
    } catch (error) {
      // Restore from backup on error
      if (backupPath && existsSync(backupPath)) {
        try {
          await FileUtils.moveFile(backupPath, absolutePath);
        } catch (restoreError) {
          console.error('Failed to restore backup:', restoreError.message);
        }
      }

      throw new Error(
        `Safe update failed for ${absolutePath}: ${error.message}`
      );
    }
  }

  /**
   * Gets directory size
   */
  static async getDirectorySize(dirPath) {
    const absolutePath = resolve(dirPath);
    let totalSize = 0;

    try {
      const entries = await fs.readdir(absolutePath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(absolutePath, entry.name);

        if (entry.isFile()) {
          const stats = await fs.stat(fullPath);
          totalSize += stats.size;
        } else if (entry.isDirectory()) {
          totalSize += await FileUtils.getDirectorySize(fullPath);
        }
      }

      return totalSize;
    } catch (error) {
      throw new Error(
        `Failed to get directory size for ${absolutePath}: ${error.message}`
      );
    }
  }

  /**
   * Synchronous path existence check
   */
  static exists(path) {
    return existsSync(resolve(path));
  }

  /**
   * Synchronous file stats
   */
  static statSync(path) {
    const absolutePath = resolve(path);

    try {
      const stats = statSync(absolutePath);
      return {
        exists: true,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        absolutePath,
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          exists: false,
          absolutePath,
        };
      } else {
        throw error;
      }
    }
  }

  /**
   * Format file size for display
   */
  static formatSize(bytes) {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(2)} KB`;
    }
    return `${bytes} B`;
  }
}

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { FileUtils } from '../../src/lib/FileUtils.js';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

const TEST_DIR = join(tmpdir(), 'file-utils-unit-test');

describe('FileUtils Unit Tests', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('ensureDir', () => {
    it('should create directory if it does not exist', async () => {
      const testDir = join(TEST_DIR, 'new-dir');

      const result = await FileUtils.ensureDir(testDir);

      expect(existsSync(testDir)).toBe(true);
      expect(result).toBe(resolve(testDir));
    });

    it('should not fail if directory already exists', async () => {
      const testDir = join(TEST_DIR, 'existing-dir');
      mkdirSync(testDir, { recursive: true });

      await expect(FileUtils.ensureDir(testDir)).resolves.toBeDefined();
    });
  });

  describe('writeJSON and readJSON', () => {
    it('should write and read JSON data correctly', async () => {
      const testFile = join(TEST_DIR, 'test.json');
      const testData = { name: 'test', value: 42, array: [1, 2, 3] };

      await FileUtils.writeJSON(testFile, testData);
      const readData = await FileUtils.readJSON(testFile);

      expect(readData).toEqual(testData);
      expect(existsSync(testFile)).toBe(true);
    });

    it('should handle nested directory creation', async () => {
      const testFile = join(TEST_DIR, 'nested', 'deep', 'test.json');
      const testData = { nested: true };

      await FileUtils.writeJSON(testFile, testData);
      const readData = await FileUtils.readJSON(testFile);

      expect(readData).toEqual(testData);
    });

    it('should reject reading non-existent file', async () => {
      const nonExistentFile = join(TEST_DIR, 'missing.json');

      await expect(FileUtils.readJSON(nonExistentFile)).rejects.toThrow(
        'File not found'
      );
    });
  });

  describe('appendJSONL and readJSONL', () => {
    it('should append and read JSONL data correctly', async () => {
      const testFile = join(TEST_DIR, 'test.jsonl');

      await FileUtils.appendJSONL(testFile, { id: 1, message: 'first' });
      await FileUtils.appendJSONL(testFile, { id: 2, message: 'second' });

      const data = await FileUtils.readJSONL(testFile);

      expect(data).toHaveLength(2);
      expect(data[0]).toEqual({ id: 1, message: 'first' });
      expect(data[1]).toEqual({ id: 2, message: 'second' });
    });

    it('should return empty array for non-existent JSONL file', async () => {
      const nonExistentFile = join(TEST_DIR, 'missing.jsonl');

      const data = await FileUtils.readJSONL(nonExistentFile);

      expect(data).toEqual([]);
    });
  });

  describe('pathInfo', () => {
    it('should return correct info for existing file', async () => {
      const testFile = join(TEST_DIR, 'info-test.json');
      await FileUtils.writeJSON(testFile, { test: true });

      const info = await FileUtils.pathInfo(testFile);

      expect(info.exists).toBe(true);
      expect(info.isFile).toBe(true);
      expect(info.isDirectory).toBe(false);
      expect(info.size).toBeGreaterThan(0);
    });

    it('should return correct info for non-existent path', async () => {
      const nonExistentPath = join(TEST_DIR, 'missing');

      const info = await FileUtils.pathInfo(nonExistentPath);

      expect(info.exists).toBe(false);
    });
  });

  describe('exists (sync)', () => {
    it('should correctly identify existing files', async () => {
      const testFile = join(TEST_DIR, 'sync-test.json');
      await FileUtils.writeJSON(testFile, { test: true });

      expect(FileUtils.exists(testFile)).toBe(true);
      expect(FileUtils.exists(join(TEST_DIR, 'missing.json'))).toBe(false);
    });
  });

  describe('formatSize', () => {
    it('should format file sizes correctly', () => {
      expect(FileUtils.formatSize(500)).toBe('500 B');
      expect(FileUtils.formatSize(1536)).toBe('1.50 KB');
      expect(FileUtils.formatSize(2097152)).toBe('2.00 MB');
      expect(FileUtils.formatSize(3221225472)).toBe('3.00 GB');
    });
  });

  describe('safeUpdate', () => {
    it('should safely update JSON file with backup', async () => {
      const testFile = join(TEST_DIR, 'safe-update.json');
      const initialData = { version: 1, data: 'original' };

      await FileUtils.writeJSON(testFile, initialData);

      const updatedData = await FileUtils.safeUpdate(testFile, currentData => {
        return { ...currentData, version: 2, data: 'updated' };
      });

      expect(updatedData.version).toBe(2);
      expect(updatedData.data).toBe('updated');

      const fileContent = await FileUtils.readJSON(testFile);
      expect(fileContent).toEqual(updatedData);
    });

    it('should restore from backup on error', async () => {
      const testFile = join(TEST_DIR, 'backup-test.json');
      const initialData = { version: 1 };

      await FileUtils.writeJSON(testFile, initialData);

      await expect(
        FileUtils.safeUpdate(testFile, () => {
          throw new Error('Update failed');
        })
      ).rejects.toThrow('Safe update failed');

      // File should be restored to original state
      const restoredData = await FileUtils.readJSON(testFile);
      expect(restoredData).toEqual(initialData);
    });
  });
});

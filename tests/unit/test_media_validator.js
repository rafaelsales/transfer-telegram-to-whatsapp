import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MediaValidator } from '../../src/services/MediaValidator.js';
import { CLIConfig } from '../../src/models/CLIConfig.js';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

const TEST_DIR = join(tmpdir(), 'media-validator-unit-test');

describe('MediaValidator Unit Tests', () => {
  let testDir;
  let validator;
  let config;

  beforeEach(() => {
    testDir = join(TEST_DIR, 'media');
    mkdirSync(testDir, { recursive: true });

    config = CLIConfig.createDefault();
    validator = new MediaValidator(config);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('validateFile', () => {
    it('should validate existing file successfully', async () => {
      const testFile = join(testDir, 'test.txt');
      writeFileSync(testFile, 'test content');

      const result = await validator.validateFile(testFile, 'text/plain');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.fileInfo.size).toBeGreaterThan(0);
    });

    it('should reject non-existent file', async () => {
      const nonExistentFile = join(testDir, 'missing.txt');

      const result = await validator.validateFile(
        nonExistentFile,
        'text/plain'
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('File does not exist');
    });

    it('should reject unsupported MIME type', async () => {
      const testFile = join(testDir, 'test.exe');
      writeFileSync(testFile, 'binary content');

      const result = await validator.validateFile(
        testFile,
        'application/x-executable'
      );

      expect(result.valid).toBe(false);
      expect(
        result.errors.some(err => err.includes('Unsupported media type'))
      ).toBe(true);
    });

    it('should validate file size limits', async () => {
      const testFile = join(testDir, 'large.txt');
      const largeContent = 'x'.repeat(20 * 1024 * 1024); // 20MB
      writeFileSync(testFile, largeContent);

      const result = await validator.validateFile(testFile, 'text/plain');

      expect(result.valid).toBe(false);
      expect(result.errors.some(err => err.includes('exceeds limit'))).toBe(
        true
      );
    });
  });

  describe('_inferMimeType', () => {
    it('should infer MIME type from common extensions', () => {
      expect(validator._inferMimeType('.jpg')).toBe('image/jpeg');
      expect(validator._inferMimeType('.png')).toBe('image/png');
      expect(validator._inferMimeType('.mp4')).toBe('video/mp4');
      expect(validator._inferMimeType('.pdf')).toBe('application/pdf');
    });

    it('should return null for unknown extensions', () => {
      expect(validator._inferMimeType('.unknown')).toBe(null);
    });
  });

  describe('_validateFileSize', () => {
    it('should pass validation for normal file sizes', () => {
      const validation = { errors: [], warnings: [], mimeType: 'text/plain' };
      const normalSize = 1024; // 1KB

      validator._validateFileSize(validation, normalSize);

      expect(validation.errors).toHaveLength(0);
    });

    it('should add warning for large files', () => {
      const validation = { errors: [], warnings: [], mimeType: 'text/plain' };
      const largeSize = 15 * 1024 * 1024; // 15MB

      validator._validateFileSize(validation, largeSize);

      expect(validation.warnings.some(w => w.includes('Large file size'))).toBe(
        true
      );
    });
  });

  describe('validateFiles', () => {
    it('should validate multiple files', async () => {
      const file1 = join(testDir, 'test1.txt');
      const file2 = join(testDir, 'test2.jpg');

      writeFileSync(file1, 'content1');
      writeFileSync(file2, 'image content');

      const files = [
        { filePath: file1, mimeType: 'text/plain' },
        { filePath: file2, mimeType: 'image/jpeg' },
      ];

      const results = await validator.validateFiles(files);

      expect(results.totalFiles).toBe(2);
      expect(results.validFiles).toBe(2);
      expect(results.invalidFiles).toBe(0);
    });
  });

  describe('isMediaTypeSupported', () => {
    it('should correctly identify supported types', () => {
      expect(config.isMediaTypeSupported('image/jpeg')).toBe(true);
      expect(config.isMediaTypeSupported('video/mp4')).toBe(true);
      expect(config.isMediaTypeSupported('application/pdf')).toBe(true);
    });

    it('should correctly identify unsupported types', () => {
      expect(config.isMediaTypeSupported('application/x-executable')).toBe(
        false
      );
      expect(config.isMediaTypeSupported('video/x-flv')).toBe(false);
    });
  });

  describe('getValidationSummary', () => {
    it('should generate correct summary', () => {
      const validationResults = [
        { valid: true, errors: [], fileInfo: { size: 1024 } },
        { valid: false, errors: ['File does not exist'], fileInfo: null },
        {
          valid: false,
          errors: ['Unsupported media type'],
          fileInfo: { size: 2048 },
        },
      ];

      const summary = validator.getValidationSummary(validationResults);

      expect(summary.totalFiles).toBe(3);
      expect(summary.validFiles).toBe(1);
      expect(summary.invalidFiles).toBe(2);
      expect(summary.issues.missing).toBe(1);
      expect(summary.issues.unsupportedType).toBe(1);
      expect(summary.totalSize).toBe(3072);
    });
  });

  describe('static methods', () => {
    it('should validate file with static method', async () => {
      const testFile = join(testDir, 'static_test.txt');
      writeFileSync(testFile, 'test content');

      const result = await MediaValidator.validateFile(testFile, 'text/plain');

      expect(result.valid).toBe(true);
    });

    it('should get supported MIME types', () => {
      const supportedTypes = MediaValidator.getSupportedMimeTypes();

      expect(Array.isArray(supportedTypes)).toBe(true);
      expect(supportedTypes.length).toBeGreaterThan(0);
      expect(supportedTypes).toContain('image/jpeg');
      expect(supportedTypes).toContain('application/pdf');
    });
  });
});

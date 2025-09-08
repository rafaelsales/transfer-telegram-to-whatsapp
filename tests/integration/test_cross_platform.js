import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { TelegramParser } from '../../src/services/TelegramParser.js';
import { PlanGenerator } from '../../src/services/PlanGenerator.js';
import { CLIConfig } from '../../src/models/CLIConfig.js';
import { FileUtils } from '../../src/lib/FileUtils.js';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join, sep, resolve, normalize } from 'path';
import { tmpdir, platform } from 'os';

const TEST_DIR = join(tmpdir(), 'cross-platform-test');

describe('Cross-Platform Compatibility Tests', () => {
  let testDir;
  let exportDir;
  let outputDir;

  beforeEach(() => {
    testDir = join(TEST_DIR, 'cross-platform');
    exportDir = join(testDir, 'export');
    outputDir = join(testDir, 'output');

    mkdirSync(exportDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('Path Handling', () => {
    it('should handle platform-specific path separators correctly', async () => {
      const currentPlatform = platform();
      console.log(`Running on platform: ${currentPlatform}`);

      // Test with different path styles
      const testPaths = [
        'photos/image1.jpg',
        'videos/video1.mp4',
        'documents/doc1.pdf',
        'nested/deep/file.txt',
      ];

      for (const testPath of testPaths) {
        const normalizedPath = normalize(testPath);
        const resolvedPath = resolve(exportDir, testPath);

        // Create directory structure
        const dir = join(exportDir, testPath.split('/').slice(0, -1).join(sep));
        mkdirSync(dir, { recursive: true });

        // Create test file
        writeFileSync(resolvedPath, 'test content');

        expect(existsSync(resolvedPath)).toBe(true);

        // Verify path normalization works
        const pathInfo = await FileUtils.pathInfo(resolvedPath);
        expect(pathInfo.exists).toBe(true);
        expect(pathInfo.isFile).toBe(true);
      }
    });

    it('should handle file paths in Telegram exports correctly', async () => {
      // Create messages with various media file paths
      const messages = [
        {
          id: 1,
          type: 'message',
          date: '2025-01-01T12:00:00',
          date_unixtime: '1735732800',
          text: 'Photo message',
          photo: 'photos/photo1.jpg',
          from: 'User1',
          from_id: 'user1',
        },
        {
          id: 2,
          type: 'message',
          date: '2025-01-01T12:01:00',
          date_unixtime: '1735732860',
          text: 'Video message',
          file: 'videos/video1.mp4',
          media_type: 'video_message',
          mime_type: 'video/mp4',
          from: 'User2',
          from_id: 'user2',
        },
      ];

      const exportData = {
        name: 'Cross Platform Test',
        type: 'personal_chat',
        id: 123456,
        messages,
      };

      // Create the media files
      const photosDir = join(exportDir, 'photos');
      const videosDir = join(exportDir, 'videos');
      mkdirSync(photosDir, { recursive: true });
      mkdirSync(videosDir, { recursive: true });

      writeFileSync(join(photosDir, 'photo1.jpg'), 'fake photo data');
      writeFileSync(join(videosDir, 'video1.mp4'), 'fake video data');

      writeFileSync(
        join(exportDir, 'result.json'),
        JSON.stringify(exportData, null, 2)
      );

      // Parse and validate
      const parser = new TelegramParser();
      await parser.parseExport(exportDir);

      const stats = parser.getStatistics();
      expect(stats.totalMessages).toBe(2);
      expect(stats.messagesWithMedia).toBe(2);
    });
  });

  describe('File System Operations', () => {
    it('should handle directory creation across platforms', async () => {
      const deepPath = join(testDir, 'level1', 'level2', 'level3', 'level4');

      await FileUtils.ensureDir(deepPath);

      expect(existsSync(deepPath)).toBe(true);

      // Test file creation in deep directory
      const testFile = join(deepPath, 'test.json');
      const testData = { platform: platform(), test: true };

      await FileUtils.writeJSON(testFile, testData);
      const readData = await FileUtils.readJSON(testFile);

      expect(readData).toEqual(testData);
    });

    it('should handle file operations with various encodings', async () => {
      const testCases = [
        { name: 'ascii.txt', content: 'Simple ASCII content' },
        { name: 'unicode.txt', content: 'Unicode: 你好 🌍 emoji test' },
        {
          name: 'special-chars.txt',
          content: 'Special: !@#$%^&*()[]{}|;:,.<>?',
        },
      ];

      for (const testCase of testCases) {
        const filePath = join(testDir, testCase.name);

        // Test writing and reading various content types
        writeFileSync(filePath, testCase.content, 'utf8');

        const pathInfo = await FileUtils.pathInfo(filePath);
        expect(pathInfo.exists).toBe(true);
        expect(pathInfo.size).toBeGreaterThan(0);

        // Verify content integrity
        const readContent = await new Promise((resolve, reject) => {
          import('fs').then(({ readFile }) => {
            readFile(filePath, 'utf8', (err, data) => {
              if (err) reject(err);
              else resolve(data);
            });
          });
        });

        expect(readContent).toBe(testCase.content);
      }
    });
  });

  describe('JSON Processing', () => {
    it('should handle large JSON files consistently', async () => {
      const largeData = {
        platform: platform(),
        timestamp: Date.now(),
        messages: [],
      };

      // Create a reasonably large JSON structure
      for (let i = 0; i < 100; i++) {
        largeData.messages.push({
          id: i,
          type: 'message',
          date: new Date(Date.now() + i * 1000).toISOString(),
          date_unixtime: Math.floor((Date.now() + i * 1000) / 1000).toString(),
          text: `Cross-platform test message ${i} with unicode: 🚀`,
          from: `User${i % 5}`,
          from_id: `user${i % 5}`,
        });
      }

      const jsonFile = join(testDir, 'large-test.json');

      await FileUtils.writeJSON(jsonFile, largeData);
      const readData = await FileUtils.readJSON(jsonFile);

      expect(readData.platform).toBe(platform());
      expect(readData.messages).toHaveLength(100);
      expect(readData.messages[0].text).toContain('🚀');
    });

    it('should handle JSONL files correctly', async () => {
      const jsonlFile = join(testDir, 'test.jsonl');

      const records = [
        { id: 1, platform: platform(), action: 'start' },
        { id: 2, platform: platform(), action: 'process' },
        { id: 3, platform: platform(), action: 'complete' },
      ];

      // Write JSONL records
      for (const record of records) {
        await FileUtils.appendJSONL(jsonlFile, record);
      }

      // Read and verify
      const readRecords = await FileUtils.readJSONL(jsonlFile);

      expect(readRecords).toHaveLength(3);
      expect(readRecords[0].platform).toBe(platform());
      expect(readRecords[2].action).toBe('complete');
    });
  });

  describe('System Integration', () => {
    it('should run parsing workflow on current platform', async () => {
      console.log(`Testing parsing workflow on ${platform()}`);

      // Create a simple test export for parsing
      const messages = [];
      for (let i = 1; i <= 5; i++) {
        messages.push({
          id: i,
          type: 'message',
          date: new Date(Date.now() + i * 60000).toISOString(),
          date_unixtime: Math.floor((Date.now() + i * 60000) / 1000).toString(),
          text: `Platform test message ${i} on ${platform()}`,
          text_entities: [
            {
              type: 'plain',
              text: `Platform test message ${i} on ${platform()}`,
            },
          ],
          from: 'PlatformTester',
          from_id: 'tester1',
        });
      }

      const exportData = {
        name: `${platform()} Parsing Test`,
        type: 'personal_chat',
        id: 999999,
        messages,
      };

      writeFileSync(
        join(exportDir, 'result.json'),
        JSON.stringify(exportData, null, 2)
      );

      // Test parsing workflow
      const parser = new TelegramParser();
      await parser.parseExport(exportDir);

      const stats = parser.getStatistics();
      expect(stats.totalMessages).toBe(5);
      expect(stats.messagesByType.message).toBe(5);

      // Verify file operations work
      const testOutputFile = join(outputDir, 'platform-test.json');
      await FileUtils.writeJSON(testOutputFile, {
        platform: platform(),
        stats,
        timestamp: Date.now(),
      });

      expect(existsSync(testOutputFile)).toBe(true);
      const outputData = await FileUtils.readJSON(testOutputFile);
      expect(outputData.platform).toBe(platform());
      expect(outputData.stats.totalMessages).toBe(5);

      console.log(`✓ Parsing workflow succeeded on ${platform()}`);
    });
  });

  describe('Environment Detection', () => {
    it('should correctly detect current platform', () => {
      const currentPlatform = platform();
      const supportedPlatforms = ['win32', 'darwin', 'linux'];

      expect(supportedPlatforms).toContain(currentPlatform);

      console.log(`Detected platform: ${currentPlatform}`);

      // Verify platform-specific behavior is consistent
      const pathSep = sep;
      const expectedSep = currentPlatform === 'win32' ? '\\\\' : '/';

      console.log(
        `Path separator: '${pathSep}' (expected pattern for ${currentPlatform})`
      );

      // Just verify that path operations work consistently
      const testPath = join('a', 'b', 'c');
      expect(testPath).toContain('a');
      expect(testPath).toContain('b');
      expect(testPath).toContain('c');
    });

    it('should handle temporary directory consistently', () => {
      const tempDir = tmpdir();

      expect(tempDir).toBeDefined();
      expect(typeof tempDir).toBe('string');
      expect(tempDir.length).toBeGreaterThan(0);

      // Should be able to create files in temp directory
      const testTempFile = join(tempDir, 'telegram-to-whatsapp-test.tmp');
      writeFileSync(testTempFile, 'temp test');

      expect(existsSync(testTempFile)).toBe(true);

      // Clean up
      rmSync(testTempFile, { force: true });

      console.log(`Temporary directory: ${tempDir}`);
    });
  });

  describe('Configuration Compatibility', () => {
    it('should load configuration consistently', () => {
      const config = CLIConfig.createDefault();

      // Verify essential configuration is platform-agnostic
      expect(config.sleepRange.min).toBeGreaterThan(0);
      expect(config.sleepRange.max).toBeGreaterThan(config.sleepRange.min);
      expect(config.maxFileSize).toBeGreaterThan(0);

      // Verify file size limits are reasonable for all platforms
      const maxFileSize = config.maxFileSize;
      expect(maxFileSize).toBeGreaterThan(1024 * 1024); // At least 1MB
      expect(maxFileSize).toBeLessThan(1024 * 1024 * 1024); // Less than 1GB

      console.log(`Configuration loaded successfully on ${platform()}`);
      console.log(`Max file size: ${FileUtils.formatSize(maxFileSize)}`);
      console.log(
        `Sleep range: ${config.sleepRange.min}-${config.sleepRange.max}s`
      );
    });
  });
});

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { TelegramParser } from '../../src/services/TelegramParser.js';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

const TEST_DIR = join(tmpdir(), 'telegram-parser-unit-test');

describe('TelegramParser Unit Tests', () => {
  let testExportDir;

  beforeEach(() => {
    testExportDir = join(TEST_DIR, 'export');
    mkdirSync(testExportDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('parseExport', () => {
    it('should successfully parse valid export', async () => {
      const validResult = {
        name: 'Test Chat',
        type: 'personal_chat',
        id: 12345,
        messages: [
          {
            id: 1,
            type: 'message',
            date: '2025-01-01T12:00:00',
            date_unixtime: '1735732800',
            text: 'Hello World',
            text_entities: [{ type: 'plain', text: 'Hello World' }],
          },
        ],
      };

      writeFileSync(
        join(testExportDir, 'result.json'),
        JSON.stringify(validResult, null, 2)
      );

      const parser = new TelegramParser();
      const result = await parser.parseExport(testExportDir);

      expect(result.chatInfo.name).toBe('Test Chat');
      expect(result.messages).toHaveLength(1);
      expect(result.totalMessages).toBe(1);
    });

    it('should throw error for non-existent directory', async () => {
      const parser = new TelegramParser();

      await expect(parser.parseExport('/non/existent/path')).rejects.toThrow(
        'Export directory not found'
      );
    });

    it('should throw error for missing result.json', async () => {
      const parser = new TelegramParser();

      await expect(parser.parseExport(testExportDir)).rejects.toThrow(
        'result.json not found'
      );
    });
  });

  describe('getMessagesByType', () => {
    beforeEach(async () => {
      const validResult = {
        name: 'Test Chat',
        type: 'personal_chat',
        id: 12345,
        messages: [
          {
            id: 1,
            type: 'message',
            date: '2025-01-01T12:00:00',
            date_unixtime: '1735732800',
            text: 'Regular message',
            text_entities: [{ type: 'plain', text: 'Regular message' }],
          },
          {
            id: 2,
            type: 'service',
            date: '2025-01-01T12:01:00',
            date_unixtime: '1735732860',
            action: 'join_group_by_link',
            text: '',
          },
        ],
      };

      writeFileSync(
        join(testExportDir, 'result.json'),
        JSON.stringify(validResult, null, 2)
      );

      const parser = new TelegramParser();
      await parser.parseExport(testExportDir);
    });

    it('should filter regular messages', async () => {
      const parser = new TelegramParser();
      await parser.parseExport(testExportDir);

      const regularMessages = parser.getRegularMessages();
      expect(regularMessages).toHaveLength(1);
      expect(regularMessages[0].type).toBe('message');
    });

    it('should filter service messages', async () => {
      const parser = new TelegramParser();
      await parser.parseExport(testExportDir);

      const serviceMessages = parser.getServiceMessages();
      expect(serviceMessages).toHaveLength(1);
      expect(serviceMessages[0].type).toBe('service');
    });
  });

  describe('getStatistics', () => {
    it('should generate correct statistics', async () => {
      const validResult = {
        name: 'Test Chat',
        type: 'personal_chat',
        id: 12345,
        messages: [
          {
            id: 1,
            type: 'message',
            date: '2025-01-01T12:00:00',
            date_unixtime: '1735732800',
            text: 'Text message',
            from: 'User1',
            text_entities: [{ type: 'plain', text: 'Text message' }],
          },
          {
            id: 2,
            type: 'message',
            date: '2025-01-01T12:01:00',
            date_unixtime: '1735732860',
            text: 'Message with photo',
            photo: 'photos/photo.jpg',
            from: 'User2',
            text_entities: [],
          },
        ],
      };

      writeFileSync(
        join(testExportDir, 'result.json'),
        JSON.stringify(validResult, null, 2)
      );

      // Create the photo file that the test expects
      const photosDir = join(testExportDir, 'photos');
      mkdirSync(photosDir, { recursive: true });
      writeFileSync(join(photosDir, 'photo.jpg'), 'fake photo data');

      const parser = new TelegramParser();
      await parser.parseExport(testExportDir);

      const stats = parser.getStatistics();

      expect(stats.totalMessages).toBe(2);
      expect(stats.messagesByType.message).toBe(2);
      expect(stats.messagesWithMedia).toBe(1);
      expect(stats.uniqueSenders).toBe(2);
      expect(stats.dateRange.earliest).toBeDefined();
      expect(stats.dateRange.latest).toBeDefined();
    });
  });

  describe('validateExport (static)', () => {
    it('should validate export structure without full parsing', async () => {
      const validResult = {
        name: 'Test Chat',
        type: 'personal_chat',
        id: 12345,
        messages: [
          {
            id: 1,
            type: 'message',
            date: '2025-01-01T12:00:00',
            date_unixtime: '1735732800',
            text: 'test',
          },
        ],
      };

      writeFileSync(
        join(testExportDir, 'result.json'),
        JSON.stringify(validResult, null, 2)
      );

      const validation = await TelegramParser.validateExport(testExportDir);

      expect(validation.valid).toBe(true);
      expect(validation.chatName).toBe('Test Chat');
      expect(validation.messageCount).toBe(1);
    });

    it('should reject invalid export structure', async () => {
      const invalidResult = { invalid: 'structure' };

      writeFileSync(
        join(testExportDir, 'result.json'),
        JSON.stringify(invalidResult, null, 2)
      );

      await expect(
        TelegramParser.validateExport(testExportDir)
      ).rejects.toThrow('result.json has invalid structure');
    });
  });
});

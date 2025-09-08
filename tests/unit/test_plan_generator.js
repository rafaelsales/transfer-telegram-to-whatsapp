import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PlanGenerator } from '../../src/services/PlanGenerator.js';
import { CLIConfig } from '../../src/models/CLIConfig.js';
import { TelegramMessage } from '../../src/models/TelegramMessage.js';
import { ImportPlan } from '../../src/models/ImportPlan.js';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

const TEST_DIR = join(tmpdir(), 'plan-generator-unit-test');

describe('PlanGenerator Unit Tests', () => {
  let testDir;
  let generator;
  let config;

  beforeEach(() => {
    testDir = join(TEST_DIR, 'plan-gen');
    mkdirSync(testDir, { recursive: true });

    // Clear all cached validators to pick up schema changes
    ImportPlan._validator = null;

    config = CLIConfig.createDefault();
    generator = new PlanGenerator(config);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('_determineWhatsAppType', () => {
    it('should determine correct WhatsApp message types', () => {
      const textMessage = new TelegramMessage({
        id: 1,
        type: 'message',
        date: '2025-01-01T12:00:00',
        date_unixtime: '1735732800',
        text: 'Hello',
      });

      const photoMessage = new TelegramMessage({
        id: 2,
        type: 'message',
        date: '2025-01-01T12:00:00',
        date_unixtime: '1735732800',
        photo: 'photos/image.jpg',
        text: '',
      });

      expect(generator._determineWhatsAppType(textMessage)).toBe('text');
      expect(generator._determineWhatsAppType(photoMessage)).toBe('image');
    });
  });

  describe('_shouldSkipMessage', () => {
    it('should skip service messages', () => {
      const serviceMessage = new TelegramMessage({
        id: 1,
        type: 'service',
        date: '2025-01-01T12:00:00',
        date_unixtime: '1735732800',
        action: 'join_group',
        text: '',
      });

      const result = generator._shouldSkipMessage(serviceMessage, {});

      expect(result.skip).toBe(true);
      expect(result.skipReason).toBe('service_message');
    });

    it('should not skip regular messages', () => {
      const regularMessage = new TelegramMessage({
        id: 1,
        type: 'message',
        date: '2025-01-01T12:00:00',
        date_unixtime: '1735732800',
        text: 'Regular message',
      });

      const result = generator._shouldSkipMessage(regularMessage, {});

      expect(result.skip).toBe(false);
    });

    it('should skip empty messages', () => {
      const emptyMessage = new TelegramMessage({
        id: 1,
        type: 'message',
        date: '2025-01-01T12:00:00',
        date_unixtime: '1735732800',
        text: '',
      });

      const result = generator._shouldSkipMessage(emptyMessage, {});

      expect(result.skip).toBe(true);
      expect(result.skipReason).toBe('empty_message');
    });
  });

  describe('_extractContent', () => {
    it('should extract text content', () => {
      const message = new TelegramMessage({
        id: 1,
        type: 'message',
        date: '2025-01-01T12:00:00',
        date_unixtime: '1735732800',
        text: 'Hello world',
        text_entities: [{ type: 'plain', text: 'Hello world' }],
      });

      const content = generator._extractContent(message);

      expect(content).toBe('Hello world');
    });

    it('should return empty string for media-only messages', () => {
      const message = new TelegramMessage({
        id: 1,
        type: 'message',
        date: '2025-01-01T12:00:00',
        date_unixtime: '1735732800',
        photo: 'photos/image.jpg',
        text: '',
      });

      const content = generator._extractContent(message);

      expect(content).toBe('');
    });
  });

  describe('_inferMimeType', () => {
    it('should infer MIME types from file extensions', () => {
      expect(generator._inferMimeType('photo.jpg')).toBe('image/jpeg');
      expect(generator._inferMimeType('video.mp4')).toBe('video/mp4');
      expect(generator._inferMimeType('document.pdf')).toBe('application/pdf');
      expect(generator._inferMimeType('audio.mp3')).toBe('audio/mpeg');
    });

    it('should return default MIME type for unknown extensions', () => {
      expect(generator._inferMimeType('unknown.xyz')).toBe(
        'application/octet-stream'
      );
    });
  });

  describe('getSupportedMessageTypes', () => {
    it('should return list of supported message types', () => {
      const supportedTypes = generator.getSupportedMessageTypes();

      expect(Array.isArray(supportedTypes)).toBe(true);
      expect(supportedTypes.length).toBeGreaterThan(0);
      expect(supportedTypes).toContain('text');
      expect(supportedTypes).toContain('photo');
    });
  });

  describe('getSkipReasons', () => {
    it('should return skip reasons mapping', () => {
      const skipReasons = generator.getSkipReasons();

      expect(typeof skipReasons).toBe('object');
      expect(skipReasons.service_message).toBeDefined();
      expect(skipReasons.unsupported_media).toBeDefined();
    });
  });

  describe('static methods', () => {
    it('should generate plan with static method', async () => {
      const exportDir = join(testDir, 'export');
      const outputDir = join(testDir, 'output');

      mkdirSync(exportDir, { recursive: true });

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
            text: 'Test message',
            text_entities: [{ type: 'plain', text: 'Test message' }],
          },
        ],
      };

      writeFileSync(
        join(exportDir, 'result.json'),
        JSON.stringify(validResult)
      );

      const result = await PlanGenerator.generatePlan(exportDir, outputDir, {
        targetChatId: 'test@c.us',
      });

      expect(result.plan).toBeDefined();
      expect(result.statistics).toBeDefined();
    });

    it('should preview plan without creating files', async () => {
      const exportDir = join(testDir, 'preview-export');

      mkdirSync(exportDir, { recursive: true });

      const validResult = {
        name: 'Preview Chat',
        type: 'personal_chat',
        id: 12345,
        messages: [
          {
            id: 1,
            type: 'message',
            date: '2025-01-01T12:00:00',
            date_unixtime: '1735732800',
            text: 'Message 1',
          },
          {
            id: 2,
            type: 'service',
            date: '2025-01-01T12:01:00',
            date_unixtime: '1735732860',
            action: 'join',
          },
        ],
      };

      writeFileSync(
        join(exportDir, 'result.json'),
        JSON.stringify(validResult)
      );

      const preview = await PlanGenerator.previewPlan(exportDir);

      expect(preview.totalMessages).toBe(2);
      expect(preview.estimatedSupported).toBe(1);
      expect(preview.estimatedSkipped).toBe(1);
    });
  });
});

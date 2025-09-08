import { describe, it, expect, beforeAll } from '@jest/globals';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

describe('ImportPlan Schema Contract', () => {
  let ajv;
  let validateImportPlan;
  let schema;

  beforeAll(() => {
    // Load the JSON Schema
    const schemaPath = resolve('specs/001-this-project-is/contracts/file-formats.json');
    const schemaContent = JSON.parse(readFileSync(schemaPath, 'utf8'));
    
    ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    
    // Add schema and compile validator
    ajv.addSchema(schemaContent);
    schema = schemaContent.definitions.ImportPlan;
    validateImportPlan = ajv.compile({
      ...schema,
      definitions: schemaContent.definitions
    });
  });

  describe('Valid ImportPlan Objects', () => {
    it('should validate minimal valid ImportPlan', () => {
      const validPlan = {
        version: '1.0.0',
        metadata: {
          generatedAt: '2025-01-01T12:00:00Z',
          telegramExportPath: '/path/to/export',
          outputPath: '/path/to/output',
          totalMessages: 1,
          supportedMessages: 1,
          skippedMessages: 0,
          mediaFiles: 0
        },
        messages: [
          {
            id: '12345678-1234-4123-a123-123456789abc',
            telegramId: 1,
            type: 'text',
            content: 'Hello World',
            timestamp: 1735732800000,
            sender: 'Test User',
            chatId: 'test@c.us',
            status: 'pending'
          }
        ],
        skippedMessages: [],
        statistics: {
          messageTypes: { text: 1 },
          mediaTypes: {},
          totalSize: 0,
          dateRange: {
            earliest: '2025-01-01T12:00:00Z',
            latest: '2025-01-01T12:00:00Z'
          }
        }
      };

      const isValid = validateImportPlan(validPlan);
      if (!isValid) {
        console.error('Validation errors:', validateImportPlan.errors);
      }
      expect(isValid).toBe(true);
    });

    it('should validate ImportPlan with media messages', () => {
      const planWithMedia = {
        version: '1.2.3',
        metadata: {
          generatedAt: '2025-01-01T12:00:00Z',
          telegramExportPath: '/path/to/export',
          outputPath: '/path/to/output',
          totalMessages: 2,
          supportedMessages: 2,
          skippedMessages: 0,
          mediaFiles: 1
        },
        messages: [
          {
            id: '12345678-1234-4123-a123-123456789abc',
            telegramId: 1,
            type: 'text',
            content: 'Hello World',
            timestamp: 1735732800000,
            sender: 'Test User',
            chatId: 'test@c.us',
            status: 'pending'
          },
          {
            id: '87654321-4321-4321-b321-cba987654321',
            telegramId: 2,
            type: 'image',
            content: 'Photo description',
            mediaPath: 'photos/image1.jpg',
            mediaType: 'image/jpeg',
            timestamp: 1735732900000,
            sender: 'Test User',
            chatId: 'test@c.us',
            status: 'pending'
          }
        ],
        skippedMessages: [],
        statistics: {
          messageTypes: { text: 1, image: 1 },
          mediaTypes: { image_jpeg: 1 },
          totalSize: 1048576,
          dateRange: {
            earliest: '2025-01-01T12:00:00Z',
            latest: '2025-01-01T12:01:40Z'
          }
        }
      };

      const isValid = validateImportPlan(planWithMedia);
      if (!isValid) {
        console.error('Validation errors:', validateImportPlan.errors);
      }
      expect(isValid).toBe(true);
    });

    it('should validate ImportPlan with skipped messages', () => {
      const planWithSkipped = {
        version: '1.0.0',
        metadata: {
          generatedAt: '2025-01-01T12:00:00Z',
          telegramExportPath: '/path/to/export',
          outputPath: '/path/to/output',
          totalMessages: 2,
          supportedMessages: 1,
          skippedMessages: 1,
          mediaFiles: 0
        },
        messages: [
          {
            id: '12345678-1234-4123-a123-123456789abc',
            telegramId: 1,
            type: 'text',
            content: 'Hello World',
            timestamp: 1735732800000,
            sender: 'Test User',
            chatId: 'test@c.us',
            status: 'pending'
          }
        ],
        skippedMessages: [
          {
            telegramId: 2,
            reason: 'service_message',
            originalMessage: {
              id: 2,
              type: 'service',
              date: '2025-01-01T12:01:40Z',
              date_unixtime: '1735732900',
              text: '',
              text_entities: [],
              action: 'chat_created',
              actor: 'Test User'
            },
            explanation: 'Service messages are not supported for WhatsApp import'
          }
        ],
        statistics: {
          messageTypes: { text: 1 },
          mediaTypes: {},
          totalSize: 0,
          dateRange: {
            earliest: '2025-01-01T12:00:00Z',
            latest: '2025-01-01T12:01:40Z'
          }
        }
      };

      const isValid = validateImportPlan(planWithSkipped);
      if (!isValid) {
        console.error('Validation errors:', validateImportPlan.errors);
      }
      expect(isValid).toBe(true);
    });
  });

  describe('Invalid ImportPlan Objects', () => {
    it('should reject ImportPlan missing required version field', () => {
      const invalidPlan = {
        // version missing
        metadata: {
          generatedAt: '2025-01-01T12:00:00Z',
          telegramExportPath: '/path/to/export',
          outputPath: '/path/to/output',
          totalMessages: 0,
          supportedMessages: 0,
          skippedMessages: 0,
          mediaFiles: 0
        },
        messages: [],
        skippedMessages: [],
        statistics: {
          messageTypes: {},
          mediaTypes: {},
          totalSize: 0,
          dateRange: {
            earliest: '2025-01-01T12:00:00Z',
            latest: '2025-01-01T12:00:00Z'
          }
        }
      };

      const isValid = validateImportPlan(invalidPlan);
      expect(isValid).toBe(false);
      expect(validateImportPlan.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            instancePath: '',
            schemaPath: '#/required',
            keyword: 'required',
            params: { missingProperty: 'version' }
          })
        ])
      );
    });

    it('should reject ImportPlan with invalid version format', () => {
      const invalidPlan = {
        version: 'invalid-version',
        metadata: {
          generatedAt: '2025-01-01T12:00:00Z',
          telegramExportPath: '/path/to/export',
          outputPath: '/path/to/output',
          totalMessages: 0,
          supportedMessages: 0,
          skippedMessages: 0,
          mediaFiles: 0
        },
        messages: [],
        skippedMessages: [],
        statistics: {
          messageTypes: {},
          mediaTypes: {},
          totalSize: 0,
          dateRange: {
            earliest: '2025-01-01T12:00:00Z',
            latest: '2025-01-01T12:00:00Z'
          }
        }
      };

      const isValid = validateImportPlan(invalidPlan);
      expect(isValid).toBe(false);
      expect(validateImportPlan.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            instancePath: '/version',
            schemaPath: '#/properties/version/pattern'
          })
        ])
      );
    });

    it('should reject ImportPlan with invalid message UUID', () => {
      const invalidPlan = {
        version: '1.0.0',
        metadata: {
          generatedAt: '2025-01-01T12:00:00Z',
          telegramExportPath: '/path/to/export',
          outputPath: '/path/to/output',
          totalMessages: 1,
          supportedMessages: 1,
          skippedMessages: 0,
          mediaFiles: 0
        },
        messages: [
          {
            id: 'invalid-uuid',
            telegramId: 1,
            type: 'text',
            content: 'Hello World',
            timestamp: 1735732800000,
            sender: 'Test User',
            chatId: 'test@c.us',
            status: 'pending'
          }
        ],
        skippedMessages: [],
        statistics: {
          messageTypes: { text: 1 },
          mediaTypes: {},
          totalSize: 0,
          dateRange: {
            earliest: '2025-01-01T12:00:00Z',
            latest: '2025-01-01T12:00:00Z'
          }
        }
      };

      const isValid = validateImportPlan(invalidPlan);
      expect(isValid).toBe(false);
      expect(validateImportPlan.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            instancePath: '/messages/0/id',
            schemaPath: '#/definitions/WhatsAppMessage/properties/id/pattern'
          })
        ])
      );
    });

    it('should reject ImportPlan with invalid message status', () => {
      const invalidPlan = {
        version: '1.0.0',
        metadata: {
          generatedAt: '2025-01-01T12:00:00Z',
          telegramExportPath: '/path/to/export',
          outputPath: '/path/to/output',
          totalMessages: 1,
          supportedMessages: 1,
          skippedMessages: 0,
          mediaFiles: 0
        },
        messages: [
          {
            id: '12345678-1234-4123-a123-123456789abc',
            telegramId: 1,
            type: 'text',
            content: 'Hello World',
            timestamp: 1735732800000,
            sender: 'Test User',
            chatId: 'test@c.us',
            status: 'invalid-status'
          }
        ],
        skippedMessages: [],
        statistics: {
          messageTypes: { text: 1 },
          mediaTypes: {},
          totalSize: 0,
          dateRange: {
            earliest: '2025-01-01T12:00:00Z',
            latest: '2025-01-01T12:00:00Z'
          }
        }
      };

      const isValid = validateImportPlan(invalidPlan);
      expect(isValid).toBe(false);
      expect(validateImportPlan.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            instancePath: '/messages/0/status',
            schemaPath: '#/definitions/WhatsAppMessage/properties/status/enum'
          })
        ])
      );
    });

    it('should reject ImportPlan with negative statistics values', () => {
      const invalidPlan = {
        version: '1.0.0',
        metadata: {
          generatedAt: '2025-01-01T12:00:00Z',
          telegramExportPath: '/path/to/export',
          outputPath: '/path/to/output',
          totalMessages: -1, // Invalid negative value
          supportedMessages: 0,
          skippedMessages: 0,
          mediaFiles: 0
        },
        messages: [],
        skippedMessages: [],
        statistics: {
          messageTypes: {},
          mediaTypes: {},
          totalSize: -100, // Invalid negative value
          dateRange: {
            earliest: '2025-01-01T12:00:00Z',
            latest: '2025-01-01T12:00:00Z'
          }
        }
      };

      const isValid = validateImportPlan(invalidPlan);
      expect(isValid).toBe(false);
      expect(validateImportPlan.errors.length).toBeGreaterThan(0);
      
      const negativeValueErrors = validateImportPlan.errors.filter(err => 
        err.keyword === 'minimum'
      );
      expect(negativeValueErrors.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should validate empty ImportPlan', () => {
      const emptyPlan = {
        version: '1.0.0',
        metadata: {
          generatedAt: '2025-01-01T12:00:00Z',
          telegramExportPath: '/path/to/export',
          outputPath: '/path/to/output',
          totalMessages: 0,
          supportedMessages: 0,
          skippedMessages: 0,
          mediaFiles: 0
        },
        messages: [],
        skippedMessages: [],
        statistics: {
          messageTypes: {},
          mediaTypes: {},
          totalSize: 0,
          dateRange: {
            earliest: '2025-01-01T12:00:00Z',
            latest: '2025-01-01T12:00:00Z'
          }
        }
      };

      const isValid = validateImportPlan(emptyPlan);
      if (!isValid) {
        console.error('Validation errors:', validateImportPlan.errors);
      }
      expect(isValid).toBe(true);
    });

    it('should validate ImportPlan with all message types', () => {
      const planWithAllTypes = {
        version: '1.0.0',
        metadata: {
          generatedAt: '2025-01-01T12:00:00Z',
          telegramExportPath: '/path/to/export',
          outputPath: '/path/to/output',
          totalMessages: 5,
          supportedMessages: 5,
          skippedMessages: 0,
          mediaFiles: 4
        },
        messages: [
          {
            id: '12345678-1234-4123-a123-123456789001',
            telegramId: 1,
            type: 'text',
            content: 'Text message',
            timestamp: 1735732800000,
            sender: 'Test User',
            chatId: 'test@c.us',
            status: 'pending'
          },
          {
            id: '12345678-1234-4123-a123-123456789002',
            telegramId: 2,
            type: 'image',
            content: 'Image message',
            mediaPath: 'photos/image.jpg',
            mediaType: 'image/jpeg',
            timestamp: 1735732900000,
            sender: 'Test User',
            chatId: 'test@c.us',
            status: 'pending'
          },
          {
            id: '12345678-1234-4123-a123-123456789003',
            telegramId: 3,
            type: 'video',
            content: 'Video message',
            mediaPath: 'videos/video.mp4',
            mediaType: 'video/mp4',
            timestamp: 1735733000000,
            sender: 'Test User',
            chatId: 'test@c.us',
            status: 'pending'
          },
          {
            id: '12345678-1234-4123-a123-123456789004',
            telegramId: 4,
            type: 'audio',
            content: 'Audio message',
            mediaPath: 'voice_messages/audio.ogg',
            mediaType: 'audio/ogg',
            timestamp: 1735733100000,
            sender: 'Test User',
            chatId: 'test@c.us',
            status: 'pending'
          },
          {
            id: '12345678-1234-4123-a123-123456789005',
            telegramId: 5,
            type: 'document',
            content: 'Document message',
            mediaPath: 'files/document.pdf',
            mediaType: 'application/pdf',
            timestamp: 1735733200000,
            sender: 'Test User',
            chatId: 'test@c.us',
            status: 'pending'
          }
        ],
        skippedMessages: [],
        statistics: {
          messageTypes: { text: 1, image: 1, video: 1, audio: 1, document: 1 },
          mediaTypes: { image_jpeg: 1, video_mp4: 1, audio_ogg: 1, application_pdf: 1 },
          totalSize: 10485760,
          dateRange: {
            earliest: '2025-01-01T12:00:00Z',
            latest: '2025-01-01T12:06:40Z'
          }
        }
      };

      const isValid = validateImportPlan(planWithAllTypes);
      if (!isValid) {
        console.error('Validation errors:', validateImportPlan.errors);
      }
      expect(isValid).toBe(true);
    });
  });
});
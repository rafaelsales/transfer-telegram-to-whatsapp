import { describe, it, expect, beforeAll } from '@jest/globals';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('ProgressRecord Schema Contract', () => {
  let ajv;
  let validateProgressRecord;
  let validateProgressSummary;
  let schema;

  beforeAll(() => {
    // Load the JSON Schema
    const schemaPath = resolve('specs/001-this-project-is/contracts/file-formats.json');
    const schemaContent = JSON.parse(readFileSync(schemaPath, 'utf8'));
    
    ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    
    // Add schema and compile validators
    ajv.addSchema(schemaContent);
    schema = schemaContent.definitions;
    
    validateProgressRecord = ajv.compile({
      ...schema.ProgressRecord,
      definitions: schemaContent.definitions
    });
    
    validateProgressSummary = ajv.compile({
      ...schema.ProgressSummary,
      definitions: schemaContent.definitions
    });
  });

  describe('Valid ProgressRecord Objects', () => {
    it('should validate successful ProgressRecord', () => {
      const validRecord = {
        messageId: '12345678-1234-4123-a123-123456789abc',
        telegramId: 123,
        status: 'sent',
        timestamp: 1735732800000,
        retryCount: 0,
        sentMessageId: 'whatsapp_message_id_abc123'
      };

      const isValid = validateProgressRecord(validRecord);
      if (!isValid) {
        console.error('Validation errors:', validateProgressRecord.errors);
      }
      expect(isValid).toBe(true);
    });

    it('should validate failed ProgressRecord', () => {
      const validRecord = {
        messageId: '87654321-4321-4321-b321-cba987654321',
        telegramId: 456,
        status: 'failed',
        timestamp: 1735732900000,
        errorMessage: 'WhatsApp rate limit exceeded',
        retryCount: 3
      };

      const isValid = validateProgressRecord(validRecord);
      if (!isValid) {
        console.error('Validation errors:', validateProgressRecord.errors);
      }
      expect(isValid).toBe(true);
    });

    it('should validate ProgressRecord with zero retry count', () => {
      const validRecord = {
        messageId: '12345678-1234-4123-a123-123456789abc',
        telegramId: 789,
        status: 'sent',
        timestamp: 1735733000000,
        retryCount: 0,
        sentMessageId: 'whatsapp_msg_xyz789'
      };

      const isValid = validateProgressRecord(validRecord);
      if (!isValid) {
        console.error('Validation errors:', validateProgressRecord.errors);
      }
      expect(isValid).toBe(true);
    });

    it('should validate ProgressRecord with high retry count', () => {
      const validRecord = {
        messageId: '11111111-2222-4333-a444-555555555555',
        telegramId: 101112,
        status: 'failed',
        timestamp: 1735733100000,
        errorMessage: 'Network timeout after multiple retries',
        retryCount: 10
      };

      const isValid = validateProgressRecord(validRecord);
      if (!isValid) {
        console.error('Validation errors:', validateProgressRecord.errors);
      }
      expect(isValid).toBe(true);
    });
  });

  describe('Invalid ProgressRecord Objects', () => {
    it('should reject ProgressRecord with invalid UUID format', () => {
      const invalidRecord = {
        messageId: 'invalid-uuid-format',
        telegramId: 123,
        status: 'sent',
        timestamp: 1735732800000,
        retryCount: 0
      };

      const isValid = validateProgressRecord(invalidRecord);
      expect(isValid).toBe(false);
      expect(validateProgressRecord.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            instancePath: '/messageId',
            schemaPath: '#/properties/messageId/pattern'
          })
        ])
      );
    });

    it('should reject ProgressRecord with invalid status', () => {
      const invalidRecord = {
        messageId: '12345678-1234-4123-a123-123456789abc',
        telegramId: 123,
        status: 'invalid_status',
        timestamp: 1735732800000,
        retryCount: 0
      };

      const isValid = validateProgressRecord(invalidRecord);
      expect(isValid).toBe(false);
      expect(validateProgressRecord.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            instancePath: '/status',
            schemaPath: '#/properties/status/enum'
          })
        ])
      );
    });

    it('should reject ProgressRecord with negative timestamp', () => {
      const invalidRecord = {
        messageId: '12345678-1234-4123-a123-123456789abc',
        telegramId: 123,
        status: 'sent',
        timestamp: -1,
        retryCount: 0
      };

      const isValid = validateProgressRecord(invalidRecord);
      expect(isValid).toBe(false);
      expect(validateProgressRecord.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            instancePath: '/timestamp',
            schemaPath: '#/properties/timestamp/minimum'
          })
        ])
      );
    });

    it('should reject ProgressRecord with negative retry count', () => {
      const invalidRecord = {
        messageId: '12345678-1234-4123-a123-123456789abc',
        telegramId: 123,
        status: 'sent',
        timestamp: 1735732800000,
        retryCount: -1
      };

      const isValid = validateProgressRecord(invalidRecord);
      expect(isValid).toBe(false);
      expect(validateProgressRecord.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            instancePath: '/retryCount',
            schemaPath: '#/properties/retryCount/minimum'
          })
        ])
      );
    });

    it('should reject ProgressRecord missing required fields', () => {
      const invalidRecord = {
        messageId: '12345678-1234-4123-a123-123456789abc',
        // telegramId missing
        status: 'sent',
        timestamp: 1735732800000
        // retryCount missing
      };

      const isValid = validateProgressRecord(invalidRecord);
      expect(isValid).toBe(false);
      
      const missingFields = validateProgressRecord.errors
        .filter(err => err.keyword === 'required')
        .map(err => err.params.missingProperty);
      
      expect(missingFields).toEqual(
        expect.arrayContaining(['telegramId', 'retryCount'])
      );
    });
  });

  describe('Valid ProgressSummary Objects', () => {
    it('should validate running ProgressSummary', () => {
      const validSummary = {
        planPath: '/path/to/import-plan.json',
        startedAt: '2025-01-01T12:00:00Z',
        lastUpdated: '2025-01-01T12:05:30Z',
        totalMessages: 100,
        processedMessages: 45,
        successfulMessages: 43,
        failedMessages: 2,
        currentPosition: 45,
        status: 'running'
      };

      const isValid = validateProgressSummary(validSummary);
      if (!isValid) {
        console.error('Validation errors:', validateProgressSummary.errors);
      }
      expect(isValid).toBe(true);
    });

    it('should validate completed ProgressSummary', () => {
      const validSummary = {
        planPath: '/path/to/import-plan.json',
        startedAt: '2025-01-01T12:00:00Z',
        lastUpdated: '2025-01-01T12:15:00Z',
        totalMessages: 100,
        processedMessages: 100,
        successfulMessages: 98,
        failedMessages: 2,
        currentPosition: 100,
        status: 'completed'
      };

      const isValid = validateProgressSummary(validSummary);
      if (!isValid) {
        console.error('Validation errors:', validateProgressSummary.errors);
      }
      expect(isValid).toBe(true);
    });

    it('should validate failed ProgressSummary', () => {
      const validSummary = {
        planPath: '/path/to/import-plan.json',
        startedAt: '2025-01-01T12:00:00Z',
        lastUpdated: '2025-01-01T12:03:45Z',
        totalMessages: 100,
        processedMessages: 25,
        successfulMessages: 20,
        failedMessages: 5,
        currentPosition: 25,
        status: 'failed'
      };

      const isValid = validateProgressSummary(validSummary);
      if (!isValid) {
        console.error('Validation errors:', validateProgressSummary.errors);
      }
      expect(isValid).toBe(true);
    });

    it('should validate paused ProgressSummary', () => {
      const validSummary = {
        planPath: '/path/to/import-plan.json',
        startedAt: '2025-01-01T12:00:00Z',
        lastUpdated: '2025-01-01T12:02:15Z',
        totalMessages: 100,
        processedMessages: 15,
        successfulMessages: 15,
        failedMessages: 0,
        currentPosition: 15,
        status: 'paused'
      };

      const isValid = validateProgressSummary(validSummary);
      if (!isValid) {
        console.error('Validation errors:', validateProgressSummary.errors);
      }
      expect(isValid).toBe(true);
    });
  });

  describe('Invalid ProgressSummary Objects', () => {
    it('should reject ProgressSummary with invalid status', () => {
      const invalidSummary = {
        planPath: '/path/to/import-plan.json',
        startedAt: '2025-01-01T12:00:00Z',
        lastUpdated: '2025-01-01T12:05:30Z',
        totalMessages: 100,
        processedMessages: 45,
        successfulMessages: 43,
        failedMessages: 2,
        currentPosition: 45,
        status: 'invalid_status'
      };

      const isValid = validateProgressSummary(invalidSummary);
      expect(isValid).toBe(false);
      expect(validateProgressSummary.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            instancePath: '/status',
            schemaPath: '#/properties/status/enum'
          })
        ])
      );
    });

    it('should reject ProgressSummary with negative message counts', () => {
      const invalidSummary = {
        planPath: '/path/to/import-plan.json',
        startedAt: '2025-01-01T12:00:00Z',
        lastUpdated: '2025-01-01T12:05:30Z',
        totalMessages: -10,
        processedMessages: -5,
        successfulMessages: -3,
        failedMessages: -2,
        currentPosition: -5,
        status: 'running'
      };

      const isValid = validateProgressSummary(invalidSummary);
      expect(isValid).toBe(false);
      
      const negativeValueErrors = validateProgressSummary.errors.filter(err => 
        err.keyword === 'minimum'
      );
      expect(negativeValueErrors.length).toBeGreaterThan(0);
    });

    it('should reject ProgressSummary with invalid date format', () => {
      const invalidSummary = {
        planPath: '/path/to/import-plan.json',
        startedAt: 'invalid-date-format',
        lastUpdated: '2025-01-01T12:05:30Z',
        totalMessages: 100,
        processedMessages: 45,
        successfulMessages: 43,
        failedMessages: 2,
        currentPosition: 45,
        status: 'running'
      };

      const isValid = validateProgressSummary(invalidSummary);
      expect(isValid).toBe(false);
      expect(validateProgressSummary.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            instancePath: '/startedAt',
            schemaPath: '#/properties/startedAt/format'
          })
        ])
      );
    });

    it('should reject ProgressSummary missing required fields', () => {
      const invalidSummary = {
        planPath: '/path/to/import-plan.json',
        startedAt: '2025-01-01T12:00:00Z',
        // lastUpdated missing
        totalMessages: 100,
        // processedMessages missing
        successfulMessages: 43,
        failedMessages: 2,
        currentPosition: 45,
        status: 'running'
      };

      const isValid = validateProgressSummary(invalidSummary);
      expect(isValid).toBe(false);
      
      const missingFields = validateProgressSummary.errors
        .filter(err => err.keyword === 'required')
        .map(err => err.params.missingProperty);
      
      expect(missingFields).toEqual(
        expect.arrayContaining(['lastUpdated', 'processedMessages'])
      );
    });
  });

  describe('Edge Cases', () => {
    it('should validate ProgressSummary with zero values', () => {
      const validSummary = {
        planPath: '/path/to/empty-plan.json',
        startedAt: '2025-01-01T12:00:00Z',
        lastUpdated: '2025-01-01T12:00:01Z',
        totalMessages: 0,
        processedMessages: 0,
        successfulMessages: 0,
        failedMessages: 0,
        currentPosition: 0,
        status: 'completed'
      };

      const isValid = validateProgressSummary(validSummary);
      if (!isValid) {
        console.error('Validation errors:', validateProgressSummary.errors);
      }
      expect(isValid).toBe(true);
    });

    it('should validate ProgressRecord with minimum timestamp', () => {
      const validRecord = {
        messageId: '12345678-1234-4123-a123-123456789abc',
        telegramId: 1,
        status: 'sent',
        timestamp: 0,
        retryCount: 0,
        sentMessageId: 'msg_id_0'
      };

      const isValid = validateProgressRecord(validRecord);
      if (!isValid) {
        console.error('Validation errors:', validateProgressRecord.errors);
      }
      expect(isValid).toBe(true);
    });

    it('should validate ProgressRecord with large numbers', () => {
      const validRecord = {
        messageId: '99999999-9999-4999-a999-999999999999',
        telegramId: 2147483647, // Max 32-bit signed int
        status: 'sent',
        timestamp: 9007199254740991, // Max safe integer in JS
        retryCount: 1000,
        sentMessageId: 'very_long_whatsapp_message_id_with_lots_of_characters'
      };

      const isValid = validateProgressRecord(validRecord);
      if (!isValid) {
        console.error('Validation errors:', validateProgressRecord.errors);
      }
      expect(isValid).toBe(true);
    });
  });
});
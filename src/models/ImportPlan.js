import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { WhatsAppMessage } from './WhatsAppMessage.js';

/**
 * ImportPlan model for managing WhatsApp import execution plans
 * Contains metadata, messages, skipped messages, and statistics
 */
export class ImportPlan {
  constructor(data) {
    this.version = data.version;
    this.metadata = data.metadata;
    this.messages = data.messages || [];
    this.skippedMessages = data.skippedMessages || [];
    this.statistics = data.statistics;
  }

  /**
   * Validates an ImportPlan against the schema
   */
  static validate(data) {
    if (!ImportPlan._validator) {
      ImportPlan._initValidator();
    }

    const valid = ImportPlan._validator(data);
    if (!valid) {
      throw new Error(
        `ImportPlan validation failed: ${ImportPlan._formatErrors(ImportPlan._validator.errors)}`
      );
    }

    // Additional business logic validation
    ImportPlan._validateBusinessRules(data);

    return true;
  }

  /**
   * Validates business rules beyond schema validation
   */
  static _validateBusinessRules(data) {
    // Validate semantic versioning
    if (!ImportPlan._isValidSemVer(data.version)) {
      throw new Error(`Invalid semantic version: ${data.version}`);
    }

    // Check messages are sorted by timestamp
    if (data.messages && data.messages.length > 1) {
      for (let i = 1; i < data.messages.length; i++) {
        if (data.messages[i].timestamp < data.messages[i - 1].timestamp) {
          throw new Error(
            `Messages must be sorted by timestamp. Message at index ${i} is out of order.`
          );
        }
      }
    }

    // Validate telegramId references exist and are unique
    const telegramIds = new Set();
    if (data.messages) {
      for (const message of data.messages) {
        if (telegramIds.has(message.telegramId)) {
          throw new Error(
            `Duplicate telegramId reference: ${message.telegramId}`
          );
        }
        telegramIds.add(message.telegramId);
      }
    }

    // Validate statistics match actual counts
    if (data.statistics && data.messages) {
      const actualCounts = ImportPlan._calculateActualCounts(data.messages);

      if (data.statistics.messageTypes) {
        for (const [type, count] of Object.entries(
          data.statistics.messageTypes
        )) {
          if (actualCounts.messageTypes[type] !== count) {
            throw new Error(
              `Statistics mismatch for message type '${type}': expected ${count}, found ${actualCounts.messageTypes[type] || 0}`
            );
          }
        }
      }

      if (data.statistics.mediaTypes) {
        for (const [type, count] of Object.entries(
          data.statistics.mediaTypes
        )) {
          if (actualCounts.mediaTypes[type] !== count) {
            throw new Error(
              `Statistics mismatch for media type '${type}': expected ${count}, found ${actualCounts.mediaTypes[type] || 0}`
            );
          }
        }
      }
    }

    // Validate metadata counts
    if (data.metadata) {
      const totalMessages =
        (data.messages?.length || 0) + (data.skippedMessages?.length || 0);
      if (data.metadata.totalMessages !== totalMessages) {
        throw new Error(
          `Metadata totalMessages mismatch: expected ${totalMessages}, found ${data.metadata.totalMessages}`
        );
      }

      if (data.metadata.supportedMessages !== (data.messages?.length || 0)) {
        throw new Error(
          `Metadata supportedMessages mismatch: expected ${data.messages?.length || 0}, found ${data.metadata.supportedMessages}`
        );
      }

      if (
        data.metadata.skippedMessages !== (data.skippedMessages?.length || 0)
      ) {
        throw new Error(
          `Metadata skippedMessages mismatch: expected ${data.skippedMessages?.length || 0}, found ${data.metadata.skippedMessages}`
        );
      }
    }
  }

  /**
   * Calculate actual counts from messages for validation
   */
  static _calculateActualCounts(messages) {
    const messageTypes = {};
    const mediaTypes = {};

    for (const message of messages) {
      // Count message types
      messageTypes[message.type] = (messageTypes[message.type] || 0) + 1;

      // Count media types
      if (message.type !== 'text' && message.mediaType) {
        mediaTypes[message.mediaType] =
          (mediaTypes[message.mediaType] || 0) + 1;
      }
    }

    return { messageTypes, mediaTypes };
  }

  /**
   * Validates semantic version format
   */
  static _isValidSemVer(version) {
    const semVerRegex =
      /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
    return semVerRegex.test(version);
  }

  /**
   * Creates an ImportPlan instance with validation
   */
  static fromData(data) {
    ImportPlan.validate(data);
    return new ImportPlan(data);
  }

  /**
   * Creates a new import plan from components
   */
  static create(metadata, messages, skippedMessages = [], statistics = null) {
    if (!statistics) {
      statistics = ImportPlan.generateStatistics(messages);
    }

    const planData = {
      version: '1.0.0',
      metadata: {
        ...metadata,
        totalMessages: messages.length + skippedMessages.length,
        supportedMessages: messages.length,
        skippedMessages: skippedMessages.length,
        mediaFiles: messages.filter(m => m.type !== 'text').length,
      },
      messages: messages.sort((a, b) => a.timestamp - b.timestamp),
      skippedMessages,
      statistics,
    };

    return ImportPlan.fromData(planData);
  }

  /**
   * Generate statistics from messages array
   */
  static generateStatistics(messages) {
    const messageTypes = {};
    const mediaTypes = {};
    const totalSize = 0;
    let earliestTimestamp = Infinity;
    let latestTimestamp = 0;

    for (const message of messages) {
      // Count message types
      messageTypes[message.type] = (messageTypes[message.type] || 0) + 1;

      // Count media types and size
      if (message.type !== 'text' && message.mediaType) {
        mediaTypes[message.mediaType] =
          (mediaTypes[message.mediaType] || 0) + 1;
        // Note: We would need file size info for accurate totalSize
      }

      // Track date range
      if (message.timestamp < earliestTimestamp) {
        earliestTimestamp = message.timestamp;
      }
      if (message.timestamp > latestTimestamp) {
        latestTimestamp = message.timestamp;
      }
    }

    return {
      messageTypes,
      mediaTypes,
      totalSize,
      dateRange: {
        earliest:
          messages.length > 0
            ? new Date(earliestTimestamp).toISOString()
            : new Date().toISOString(),
        latest:
          messages.length > 0
            ? new Date(latestTimestamp).toISOString()
            : new Date().toISOString(),
      },
    };
  }

  /**
   * Utility methods
   */
  getMessageCount() {
    return this.messages.length;
  }

  getSkippedCount() {
    return this.skippedMessages.length;
  }

  getTotalCount() {
    return this.getMessageCount() + this.getSkippedCount();
  }

  getMediaCount() {
    return this.messages.filter(m => m.type !== 'text').length;
  }

  getMessagesInRange(startIndex, endIndex) {
    return this.messages.slice(startIndex, endIndex);
  }

  getUnprocessedMessages() {
    return this.messages.filter(m => m.status === 'pending');
  }

  getFailedMessages() {
    return this.messages.filter(m => m.status === 'failed');
  }

  updateMessageStatus(messageId, status, errorMessage = null, sentAt = null) {
    const message = this.messages.find(m => m.id === messageId);
    if (!message) {
      throw new Error(`Message not found: ${messageId}`);
    }

    if (message.status === status) {
      return; // No change needed
    }

    // Validate status transition using WhatsAppMessage
    const tempMessage = new WhatsAppMessage(message);
    if (!tempMessage.canTransitionTo(status)) {
      throw new Error(
        `Invalid status transition from ${message.status} to ${status}`
      );
    }

    message.status = status;
    if (errorMessage) {
      message.errorMessage = errorMessage;
    }
    if (sentAt) {
      message.sentAt = sentAt;
    }
  }

  toJSON() {
    return {
      version: this.version,
      metadata: this.metadata,
      messages: this.messages,
      skippedMessages: this.skippedMessages,
      statistics: this.statistics,
    };
  }

  /**
   * Initialize AJV validator
   */
  static _initValidator() {
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);

    const schema = {
      type: 'object',
      required: ['version', 'metadata', 'messages', 'statistics'],
      properties: {
        version: { type: 'string' },
        metadata: {
          type: 'object',
          required: [
            'generatedAt',
            'telegramExportPath',
            'outputPath',
            'totalMessages',
            'supportedMessages',
            'skippedMessages',
            'mediaFiles',
          ],
          properties: {
            generatedAt: { type: 'string', format: 'date-time' },
            telegramExportPath: { type: 'string' },
            outputPath: { type: 'string' },
            totalMessages: { type: 'number', minimum: 0 },
            supportedMessages: { type: 'number', minimum: 0 },
            skippedMessages: { type: 'number', minimum: 0 },
            mediaFiles: { type: 'number', minimum: 0 },
          },
        },
        messages: {
          type: 'array',
          items: {
            type: 'object',
            required: [
              'id',
              'telegramId',
              'type',
              'content',
              'timestamp',
              'sender',
              'chatId',
              'status',
            ],
            properties: {
              id: { type: 'string', format: 'uuid' },
              telegramId: { type: 'number' },
              type: {
                type: 'string',
                enum: ['text', 'image', 'video', 'audio', 'document'],
              },
              content: { type: 'string' },
              mediaPath: { type: ['string', 'null'] },
              mediaType: { type: ['string', 'null'] },
              timestamp: { type: 'number', minimum: 0 },
              sender: { type: 'string' },
              chatId: { type: 'string' },
              quotedMessage: { type: ['string', 'null'] },
              status: {
                type: 'string',
                enum: ['pending', 'processing', 'sent', 'failed', 'skipped'],
              },
              errorMessage: { type: 'string' },
              sentAt: { type: 'number', minimum: 0 },
            },
          },
        },
        skippedMessages: {
          type: 'array',
          items: {
            type: 'object',
            required: ['telegramId', 'reason', 'explanation'],
            properties: {
              telegramId: { type: 'number' },
              reason: {
                type: 'string',
                enum: [
                  'service_message',
                  'unsupported_media',
                  'poll_message',
                  'community_feature',
                  'missing_file',
                  'empty_message',
                  'unsupported_features',
                  'missing_media_path',
                  'media_validation_failed',
                  'file_too_large',
                  'transformation_error',
                ],
              },
              originalMessage: { type: 'object' },
              explanation: { type: 'string' },
            },
          },
        },
        statistics: {
          type: 'object',
          required: ['messageTypes', 'mediaTypes', 'totalSize', 'dateRange'],
          properties: {
            messageTypes: { type: 'object' },
            mediaTypes: { type: 'object' },
            totalSize: { type: 'number', minimum: 0 },
            dateRange: {
              type: 'object',
              required: ['earliest', 'latest'],
              properties: {
                earliest: { type: 'string', format: 'date-time' },
                latest: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
    };

    ImportPlan._validator = ajv.compile(schema);
  }

  /**
   * Format validation errors for display
   */
  static _formatErrors(errors) {
    return errors.map(err => `${err.instancePath} ${err.message}`).join(', ');
  }
}

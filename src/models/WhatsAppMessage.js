import { randomUUID } from 'crypto';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { existsSync } from 'fs';

/**
 * WhatsAppMessage model with validation and status management
 *
 * Represents a message ready for WhatsApp import with full validation
 * according to the data model specification.
 */
export class WhatsAppMessage {
  constructor(data = {}) {
    // Initialize with provided data or defaults
    this.id = data.id || randomUUID();
    this.telegramId = data.telegramId;
    this.type = data.type;
    this.content = data.content || '';
    this.mediaPath = data.mediaPath;
    this.mediaType = data.mediaType;
    this.timestamp = data.timestamp;
    this.sender = data.sender || '';
    this.chatId = data.chatId;
    this.quotedMessage = data.quotedMessage;
    this.status = data.status || 'pending';
    this.errorMessage = data.errorMessage;
    this.sentAt = data.sentAt;

    // Validate the instance after construction
    this.validate();
  }

  /**
   * JSON Schema for WhatsApp message validation
   */
  static get schema() {
    return {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
          description: 'Generated UUID for the message',
        },
        telegramId: {
          type: 'number',
          description: 'Reference to original Telegram message ID',
        },
        type: {
          type: 'string',
          enum: ['text', 'image', 'video', 'audio', 'document'],
          description: 'Message type for WhatsApp',
        },
        content: {
          type: 'string',
          description: 'Text content or media caption',
        },
        mediaPath: {
          type: ['string', 'null'],
          description: 'Absolute path to media file',
        },
        mediaType: {
          type: ['string', 'null'],
          description: 'MIME type of media file',
        },
        timestamp: {
          type: 'number',
          minimum: 0,
          description: 'Unix timestamp in milliseconds',
        },
        sender: {
          type: 'string',
          description: 'Original sender name from Telegram',
        },
        chatId: {
          type: 'string',
          minLength: 1,
          description: 'WhatsApp chat/contact ID',
        },
        quotedMessage: {
          type: ['string', 'null'],
          description: 'Reference to quoted message for replies',
        },
        status: {
          type: 'string',
          enum: ['pending', 'processing', 'sent', 'failed', 'skipped'],
          description: 'Processing status of the message',
        },
        errorMessage: {
          type: ['string', 'null'],
          description: 'Error message if status is failed',
        },
        sentAt: {
          type: ['number', 'null'],
          minimum: 0,
          description: 'Unix timestamp when message was sent',
        },
      },
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
      additionalProperties: false,
      allOf: [
        {
          // If type is not 'text', mediaPath must be provided
          if: {
            properties: { type: { not: { const: 'text' } } },
          },
          then: {
            required: ['mediaPath'],
            properties: {
              mediaPath: {
                type: 'string',
                minLength: 1,
              },
            },
          },
        },
        {
          // If mediaPath is provided, mediaType should also be provided
          if: {
            properties: { mediaPath: { type: 'string' } },
          },
          then: {
            properties: {
              mediaType: {
                type: 'string',
                minLength: 1,
              },
            },
          },
        },
      ],
    };
  }

  /**
   * Valid status transitions
   */
  static get statusTransitions() {
    return {
      pending: ['processing'],
      processing: ['sent', 'failed', 'skipped'],
      sent: [], // Terminal state
      failed: ['processing'], // Can retry
      skipped: [], // Terminal state
    };
  }

  /**
   * Create AJV validator instance
   */
  static createValidator() {
    if (!this._validator) {
      const ajv = new Ajv({ allErrors: true, strict: false });
      addFormats(ajv);
      this._validator = ajv.compile(this.schema);
    }
    return this._validator;
  }

  /**
   * Validate the current instance
   * @throws {Error} If validation fails
   */
  validate() {
    const validator = WhatsAppMessage.createValidator();
    const isValid = validator(this);

    if (!isValid) {
      const errors = validator.errors
        .map(err => `${err.instancePath || 'root'}: ${err.message}`)
        .join('; ');
      throw new Error(`WhatsAppMessage validation failed: ${errors}`);
    }

    // Additional business logic validation
    this._validateBusinessRules();
  }

  /**
   * Additional business logic validation beyond JSON schema
   * @private
   */
  _validateBusinessRules() {
    // Validate media path exists if type is not text
    if (this.type !== 'text' && this.mediaPath) {
      if (!existsSync(this.mediaPath)) {
        throw new Error(`Media file does not exist: ${this.mediaPath}`);
      }
    }

    // Validate timestamp is reasonable (not in the future)
    const now = Date.now();
    if (this.timestamp > now) {
      throw new Error(
        `Message timestamp cannot be in the future: ${this.timestamp} > ${now}`
      );
    }

    // Validate sentAt is after timestamp if provided
    if (this.sentAt && this.sentAt < this.timestamp) {
      throw new Error(
        `sentAt (${this.sentAt}) cannot be before original timestamp (${this.timestamp})`
      );
    }
  }

  /**
   * Generate a new UUID for this message
   * @returns {string} New UUID
   */
  generateId() {
    this.id = randomUUID();
    return this.id;
  }

  /**
   * Check if current status can transition to new status
   * @param {string} newStatus - Target status
   * @returns {boolean} True if transition is valid
   */
  canTransitionTo(newStatus) {
    const allowedTransitions =
      WhatsAppMessage.statusTransitions[this.status] || [];
    return allowedTransitions.includes(newStatus);
  }

  /**
   * Update status with validation
   * @param {string} newStatus - New status to set
   * @param {string} [errorMessage] - Error message if status is 'failed'
   * @throws {Error} If status transition is invalid
   */
  updateStatus(newStatus, errorMessage = null) {
    if (!this.canTransitionTo(newStatus)) {
      throw new Error(
        `Invalid status transition from '${this.status}' to '${newStatus}'. ` +
          `Valid transitions: ${WhatsAppMessage.statusTransitions[this.status].join(', ')}`
      );
    }

    const oldStatus = this.status;
    this.status = newStatus;

    // Set error message for failed status
    if (newStatus === 'failed' && errorMessage) {
      this.errorMessage = errorMessage;
    } else if (newStatus !== 'failed') {
      // Clear error message for non-failed states
      this.errorMessage = null;
    }

    // Set sentAt timestamp for sent status
    if (newStatus === 'sent') {
      this.sentAt = Date.now();
    }

    // Re-validate after status update
    this.validate();

    return {
      from: oldStatus,
      to: newStatus,
      timestamp: Date.now(),
    };
  }

  /**
   * Mark message as processing
   * @returns {Object} Status transition info
   */
  markAsProcessing() {
    return this.updateStatus('processing');
  }

  /**
   * Mark message as sent
   * @returns {Object} Status transition info
   */
  markAsSent() {
    return this.updateStatus('sent');
  }

  /**
   * Mark message as failed with error
   * @param {string} errorMessage - Error description
   * @returns {Object} Status transition info
   */
  markAsFailed(errorMessage) {
    return this.updateStatus('failed', errorMessage);
  }

  /**
   * Mark message as skipped
   * @returns {Object} Status transition info
   */
  markAsSkipped() {
    return this.updateStatus('skipped');
  }

  /**
   * Check if message is in a terminal state (cannot be processed further)
   * @returns {boolean} True if in terminal state
   */
  isTerminal() {
    return ['sent', 'skipped'].includes(this.status);
  }

  /**
   * Check if message can be retried (is in failed state)
   * @returns {boolean} True if can be retried
   */
  canRetry() {
    return this.status === 'failed';
  }

  /**
   * Check if message has media content
   * @returns {boolean} True if message has media
   */
  hasMedia() {
    return this.type !== 'text' && Boolean(this.mediaPath);
  }

  /**
   * Get display name for message type
   * @returns {string} Human readable type name
   */
  getTypeDisplayName() {
    const typeNames = {
      text: 'Text Message',
      image: 'Image',
      video: 'Video',
      audio: 'Audio',
      document: 'Document',
    };
    return typeNames[this.type] || this.type;
  }

  /**
   * Create a plain object representation for serialization
   * @returns {Object} Plain object representation
   */
  toJSON() {
    return {
      id: this.id,
      telegramId: this.telegramId,
      type: this.type,
      content: this.content,
      mediaPath: this.mediaPath || undefined,
      mediaType: this.mediaType || undefined,
      timestamp: this.timestamp,
      sender: this.sender,
      chatId: this.chatId,
      quotedMessage: this.quotedMessage || undefined,
      status: this.status,
      errorMessage: this.errorMessage || undefined,
      sentAt: this.sentAt || undefined,
    };
  }

  /**
   * Create WhatsAppMessage from plain object
   * @param {Object} obj - Plain object representation
   * @returns {WhatsAppMessage} New instance
   */
  static fromJSON(obj) {
    return new WhatsAppMessage(obj);
  }

  /**
   * Create multiple WhatsAppMessages from array of objects
   * @param {Array} array - Array of plain objects
   * @returns {WhatsAppMessage[]} Array of WhatsAppMessage instances
   */
  static fromJSONArray(array) {
    return array.map(obj => this.fromJSON(obj));
  }

  /**
   * Validate an array of WhatsAppMessage objects
   * @param {WhatsAppMessage[]} messages - Array of messages to validate
   * @throws {Error} If validation fails
   */
  static validateArray(messages) {
    if (!Array.isArray(messages)) {
      throw new Error('Messages must be an array');
    }

    // Check for duplicate IDs
    const ids = new Set();
    const duplicateIds = [];

    messages.forEach((message, index) => {
      if (!(message instanceof WhatsAppMessage)) {
        throw new Error(
          `Item at index ${index} is not a WhatsAppMessage instance`
        );
      }

      if (ids.has(message.id)) {
        duplicateIds.push(message.id);
      } else {
        ids.add(message.id);
      }

      // Validate individual message
      message.validate();
    });

    if (duplicateIds.length > 0) {
      throw new Error(
        `Duplicate message IDs found: ${duplicateIds.join(', ')}`
      );
    }
  }

  /**
   * Get summary statistics for an array of messages
   * @param {WhatsAppMessage[]} messages - Array of messages
   * @returns {Object} Statistics summary
   */
  static getStatistics(messages) {
    const stats = {
      total: messages.length,
      byType: {},
      byStatus: {},
      hasMedia: 0,
      totalContentLength: 0,
      dateRange: {
        earliest: null,
        latest: null,
      },
    };

    messages.forEach(message => {
      // Count by type
      stats.byType[message.type] = (stats.byType[message.type] || 0) + 1;

      // Count by status
      stats.byStatus[message.status] =
        (stats.byStatus[message.status] || 0) + 1;

      // Count media messages
      if (message.hasMedia()) {
        stats.hasMedia++;
      }

      // Sum content length
      stats.totalContentLength += message.content.length;

      // Track date range
      if (
        !stats.dateRange.earliest ||
        message.timestamp < stats.dateRange.earliest
      ) {
        stats.dateRange.earliest = message.timestamp;
      }
      if (
        !stats.dateRange.latest ||
        message.timestamp > stats.dateRange.latest
      ) {
        stats.dateRange.latest = message.timestamp;
      }
    });

    return stats;
  }
}

// Cache for validator instance
WhatsAppMessage._validator = null;

export default WhatsAppMessage;

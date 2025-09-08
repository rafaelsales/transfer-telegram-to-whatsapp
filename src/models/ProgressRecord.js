import Ajv from 'ajv';
import addFormats from 'ajv-formats';

/**
 * ProgressRecord model for tracking WhatsApp import execution progress
 * Manages both individual progress records and overall progress summary
 */
export class ProgressRecord {
  constructor(data) {
    this.messageId = data.messageId;
    this.telegramId = data.telegramId;
    this.status = data.status;
    this.timestamp = data.timestamp;
    this.errorMessage = data.errorMessage;
    this.retryCount = data.retryCount || 0;
    this.sentMessageId = data.sentMessageId;
  }

  /**
   * Validates a ProgressRecord against the schema
   */
  static validate(data) {
    if (!ProgressRecord._recordValidator) {
      ProgressRecord._initValidators();
    }

    const valid = ProgressRecord._recordValidator(data);
    if (!valid) {
      throw new Error(
        `ProgressRecord validation failed: ${ProgressRecord._formatErrors(ProgressRecord._recordValidator.errors)}`
      );
    }

    // Additional business logic validation
    ProgressRecord._validateBusinessRules(data);

    return true;
  }

  /**
   * Validates business rules beyond schema validation
   */
  static _validateBusinessRules(data) {
    // Validate status-specific requirements
    if (data.status === 'failed' && !data.errorMessage) {
      throw new Error('Failed status requires an error message');
    }

    if (data.status === 'sent' && data.errorMessage) {
      throw new Error('Sent status should not have an error message');
    }

    // Validate timestamp is not in the future
    const now = Date.now();
    if (data.timestamp > now + 60000) {
      // Allow 1 minute tolerance
      throw new Error('Timestamp cannot be in the future');
    }

    // Validate retry count
    if (data.retryCount < 0) {
      throw new Error('Retry count cannot be negative');
    }

    if (data.retryCount > 10) {
      throw new Error('Retry count cannot exceed 10');
    }
  }

  /**
   * Creates a ProgressRecord instance with validation
   */
  static fromData(data) {
    ProgressRecord.validate(data);
    return new ProgressRecord(data);
  }

  /**
   * Creates a new progress record
   */
  static create(
    messageId,
    telegramId,
    status = 'sent',
    errorMessage = null,
    sentMessageId = null
  ) {
    const recordData = {
      messageId,
      telegramId,
      status,
      timestamp: Date.now(),
      errorMessage,
      retryCount: status === 'failed' ? 1 : 0,
      sentMessageId,
    };

    return ProgressRecord.fromData(recordData);
  }

  /**
   * Updates the status of this progress record
   */
  updateStatus(newStatus, errorMessage = null, sentMessageId = null) {
    if (!this.canTransitionTo(newStatus)) {
      throw new Error(
        `Invalid status transition from ${this.status} to ${newStatus}`
      );
    }

    const oldStatus = this.status;
    this.status = newStatus;
    this.timestamp = Date.now();

    if (newStatus === 'failed') {
      if (!errorMessage) {
        throw new Error('Error message required for failed status');
      }
      this.errorMessage = errorMessage;
      if (oldStatus === 'failed') {
        this.retryCount++;
      } else {
        this.retryCount = 1;
      }
    } else if (newStatus === 'sent') {
      this.errorMessage = null;
      this.sentMessageId = sentMessageId;
    }
  }

  /**
   * Checks if this record can transition to a new status
   */
  canTransitionTo(newStatus) {
    const validTransitions = {
      sent: [], // Terminal state
      failed: ['sent', 'failed'], // Can retry or succeed
    };

    return validTransitions[this.status]?.includes(newStatus) ?? false;
  }

  /**
   * Checks if this record is in a terminal state
   */
  isTerminal() {
    return this.status === 'sent';
  }

  /**
   * Checks if this record can be retried
   */
  canRetry() {
    return this.status === 'failed' && this.retryCount < 10;
  }

  toJSON() {
    return {
      messageId: this.messageId,
      telegramId: this.telegramId,
      status: this.status,
      timestamp: this.timestamp,
      errorMessage: this.errorMessage,
      retryCount: this.retryCount,
      sentMessageId: this.sentMessageId,
    };
  }

  /**
   * Formats this record as a JSONL line
   */
  toJSONL() {
    return JSON.stringify(this.toJSON());
  }

  /**
   * Parses a JSONL line into a ProgressRecord
   */
  static fromJSONL(line) {
    try {
      const data = JSON.parse(line.trim());
      return ProgressRecord.fromData(data);
    } catch (error) {
      throw new Error(`Invalid JSONL format: ${error.message}`);
    }
  }
}

/**
 * ProgressSummary model for tracking overall import progress
 */
export class ProgressSummary {
  constructor(data) {
    this.planPath = data.planPath;
    this.startedAt = data.startedAt;
    this.lastUpdated = data.lastUpdated;
    this.totalMessages = data.totalMessages;
    this.processedMessages = data.processedMessages;
    this.successfulMessages = data.successfulMessages;
    this.failedMessages = data.failedMessages;
    this.currentPosition = data.currentPosition;
    this.status = data.status;
  }

  /**
   * Validates a ProgressSummary against the schema
   */
  static validate(data) {
    if (!ProgressRecord._summaryValidator) {
      ProgressRecord._initValidators();
    }

    const valid = ProgressRecord._summaryValidator(data);
    if (!valid) {
      throw new Error(
        `ProgressSummary validation failed: ${ProgressRecord._formatErrors(ProgressRecord._summaryValidator.errors)}`
      );
    }

    // Additional business logic validation
    ProgressSummary._validateBusinessRules(data);

    return true;
  }

  /**
   * Validates business rules beyond schema validation
   */
  static _validateBusinessRules(data) {
    // Validate counts consistency
    if (
      data.processedMessages !==
      data.successfulMessages + data.failedMessages
    ) {
      throw new Error(
        `Processed messages (${data.processedMessages}) must equal successful (${data.successfulMessages}) + failed (${data.failedMessages})`
      );
    }

    if (data.processedMessages > data.totalMessages) {
      throw new Error(
        `Processed messages (${data.processedMessages}) cannot exceed total messages (${data.totalMessages})`
      );
    }

    if (data.currentPosition < 0 || data.currentPosition > data.totalMessages) {
      throw new Error(
        `Current position (${data.currentPosition}) must be between 0 and total messages (${data.totalMessages})`
      );
    }

    // Validate timestamps
    const startedAt = new Date(data.startedAt).getTime();
    const lastUpdated = new Date(data.lastUpdated).getTime();

    if (lastUpdated < startedAt) {
      throw new Error('Last updated cannot be before started at');
    }

    // Validate status consistency
    if (
      data.status === 'completed' &&
      data.currentPosition !== data.totalMessages
    ) {
      throw new Error(
        'Completed status requires current position to equal total messages'
      );
    }

    if (
      data.status === 'completed' &&
      data.processedMessages !== data.totalMessages
    ) {
      throw new Error('Completed status requires all messages to be processed');
    }
  }

  /**
   * Creates a ProgressSummary instance with validation
   */
  static fromData(data) {
    ProgressSummary.validate(data);
    return new ProgressSummary(data);
  }

  /**
   * Creates a new progress summary
   */
  static create(planPath, totalMessages) {
    const now = new Date().toISOString();

    const summaryData = {
      planPath,
      startedAt: now,
      lastUpdated: now,
      totalMessages,
      processedMessages: 0,
      successfulMessages: 0,
      failedMessages: 0,
      currentPosition: 0,
      status: 'running',
    };

    return ProgressSummary.fromData(summaryData);
  }

  /**
   * Updates progress based on a progress record
   */
  updateFromRecord(record) {
    this.lastUpdated = new Date().toISOString();

    if (record.status === 'sent') {
      this.successfulMessages++;
    } else if (record.status === 'failed') {
      this.failedMessages++;
    }

    this.processedMessages = this.successfulMessages + this.failedMessages;

    // Update status based on progress
    if (this.processedMessages >= this.totalMessages) {
      this.status = 'completed';
      this.currentPosition = this.totalMessages;
    } else if (this.failedMessages > 0 && this.successfulMessages === 0) {
      this.status = 'failed';
    }
  }

  /**
   * Updates current position in the import
   */
  updatePosition(position) {
    if (position < 0 || position > this.totalMessages) {
      throw new Error(
        `Position ${position} out of range [0, ${this.totalMessages}]`
      );
    }

    this.currentPosition = position;
    this.lastUpdated = new Date().toISOString();
  }

  /**
   * Marks the import as paused
   */
  pause() {
    if (this.status === 'running') {
      this.status = 'paused';
      this.lastUpdated = new Date().toISOString();
    }
  }

  /**
   * Resumes the import
   */
  resume() {
    if (this.status === 'paused') {
      this.status = 'running';
      this.lastUpdated = new Date().toISOString();
    }
  }

  /**
   * Gets completion percentage
   */
  getCompletionPercentage() {
    if (this.totalMessages === 0) return 100;
    return Math.round((this.processedMessages / this.totalMessages) * 100);
  }

  /**
   * Gets success rate percentage
   */
  getSuccessRate() {
    if (this.processedMessages === 0) return 100;
    return Math.round((this.successfulMessages / this.processedMessages) * 100);
  }

  /**
   * Checks if import is complete
   */
  isComplete() {
    return this.status === 'completed';
  }

  /**
   * Checks if import has failed
   */
  hasFailed() {
    return this.status === 'failed';
  }

  /**
   * Checks if import is running
   */
  isRunning() {
    return this.status === 'running';
  }

  toJSON() {
    return {
      planPath: this.planPath,
      startedAt: this.startedAt,
      lastUpdated: this.lastUpdated,
      totalMessages: this.totalMessages,
      processedMessages: this.processedMessages,
      successfulMessages: this.successfulMessages,
      failedMessages: this.failedMessages,
      currentPosition: this.currentPosition,
      status: this.status,
    };
  }
}

// Shared validator initialization
ProgressRecord._initValidators = function () {
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);

  // Progress Record schema
  const recordSchema = {
    type: 'object',
    required: ['messageId', 'telegramId', 'status', 'timestamp'],
    properties: {
      messageId: { type: 'string', format: 'uuid' },
      telegramId: { type: 'number' },
      status: { type: 'string', enum: ['sent', 'failed'] },
      timestamp: { type: 'number', minimum: 0 },
      errorMessage: { type: ['string', 'null'] },
      retryCount: { type: 'number', minimum: 0, maximum: 10 },
      sentMessageId: { type: ['string', 'null'] },
    },
  };

  // Progress Summary schema
  const summarySchema = {
    type: 'object',
    required: [
      'planPath',
      'startedAt',
      'lastUpdated',
      'totalMessages',
      'processedMessages',
      'successfulMessages',
      'failedMessages',
      'currentPosition',
      'status',
    ],
    properties: {
      planPath: { type: 'string' },
      startedAt: { type: 'string', format: 'date-time' },
      lastUpdated: { type: 'string', format: 'date-time' },
      totalMessages: { type: 'number', minimum: 0 },
      processedMessages: { type: 'number', minimum: 0 },
      successfulMessages: { type: 'number', minimum: 0 },
      failedMessages: { type: 'number', minimum: 0 },
      currentPosition: { type: 'number', minimum: 0 },
      status: {
        type: 'string',
        enum: ['running', 'completed', 'failed', 'paused'],
      },
    },
  };

  ProgressRecord._recordValidator = ajv.compile(recordSchema);
  ProgressRecord._summaryValidator = ajv.compile(summarySchema);
};

/**
 * Format validation errors for display
 */
ProgressRecord._formatErrors = function (errors) {
  return errors.map(err => `${err.instancePath} ${err.message}`).join(', ');
};

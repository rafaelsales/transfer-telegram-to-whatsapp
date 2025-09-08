import Ajv from 'ajv';
import addFormats from 'ajv-formats';

/**
 * CLIConfig model for managing CLI and runtime configuration
 * Provides default settings and validation for all configuration options
 */
export class CLIConfig {
  constructor(data = {}) {
    // Rate limiting configuration
    this.sleepRange = data.sleepRange || { min: 3, max: 10 };

    // Connection settings
    this.whatsappTimeout = data.whatsappTimeout || 30000; // 30 seconds
    this.maxRetries = data.maxRetries || 3;

    // File handling
    this.maxFileSize = data.maxFileSize || 16 * 1024 * 1024; // 16MB default
    this.supportedMediaTypes = data.supportedMediaTypes || [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'audio/mpeg',
      'audio/ogg',
      'audio/wav',
      'audio/webm',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
    ];

    // Output settings
    this.logLevel = data.logLevel || 'info';
    this.outputFormat = data.outputFormat || 'human';
  }

  /**
   * Validates a CLIConfig against the schema
   */
  static validate(data) {
    if (!CLIConfig._validator) {
      CLIConfig._initValidator();
    }

    const valid = CLIConfig._validator(data);
    if (!valid) {
      throw new Error(
        `CLIConfig validation failed: ${CLIConfig._formatErrors(CLIConfig._validator.errors)}`
      );
    }

    // Additional business logic validation
    CLIConfig._validateBusinessRules(data);

    return true;
  }

  /**
   * Validates business rules beyond schema validation
   */
  static _validateBusinessRules(data) {
    // Validate sleep range
    if (data.sleepRange) {
      if (data.sleepRange.min > data.sleepRange.max) {
        throw new Error(
          'Sleep range minimum must be less than or equal to maximum'
        );
      }

      if (data.sleepRange.min < 1) {
        throw new Error('Sleep range minimum must be at least 1 second');
      }

      if (data.sleepRange.max > 60) {
        throw new Error('Sleep range maximum cannot exceed 60 seconds');
      }
    }

    // Validate timeout settings
    if (data.whatsappTimeout && data.whatsappTimeout < 5000) {
      throw new Error('WhatsApp timeout must be at least 5 seconds');
    }

    // Validate retry settings
    if (data.maxRetries && data.maxRetries > 10) {
      throw new Error('Maximum retries cannot exceed 10');
    }

    // Validate file size limits
    if (data.maxFileSize) {
      const maxAllowed = 100 * 1024 * 1024; // 100MB
      if (data.maxFileSize > maxAllowed) {
        throw new Error(
          `Maximum file size cannot exceed ${maxAllowed} bytes (100MB)`
        );
      }
    }

    // Validate media types format
    if (data.supportedMediaTypes) {
      for (const mediaType of data.supportedMediaTypes) {
        if (!CLIConfig._isValidMimeType(mediaType)) {
          throw new Error(`Invalid MIME type: ${mediaType}`);
        }
      }
    }
  }

  /**
   * Validates MIME type format
   */
  static _isValidMimeType(mimeType) {
    const mimeTypeRegex =
      /^[a-zA-Z][a-zA-Z0-9][a-zA-Z0-9!#$&\-^.]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^.]*$/;
    return mimeTypeRegex.test(mimeType);
  }

  /**
   * Creates a CLIConfig instance with validation
   */
  static fromData(data) {
    CLIConfig.validate(data);
    return new CLIConfig(data);
  }

  /**
   * Creates default configuration
   */
  static createDefault() {
    return new CLIConfig();
  }

  /**
   * Merges configuration with overrides
   */
  merge(overrides) {
    const merged = {
      sleepRange: { ...this.sleepRange, ...overrides.sleepRange },
      whatsappTimeout: overrides.whatsappTimeout ?? this.whatsappTimeout,
      maxRetries: overrides.maxRetries ?? this.maxRetries,
      maxFileSize: overrides.maxFileSize ?? this.maxFileSize,
      supportedMediaTypes: overrides.supportedMediaTypes ?? [
        ...this.supportedMediaTypes,
      ],
      logLevel: overrides.logLevel ?? this.logLevel,
      outputFormat: overrides.outputFormat ?? this.outputFormat,
    };

    return CLIConfig.fromData(merged);
  }

  /**
   * Parses sleep range string (e.g., "3-10", "5", "2-8")
   */
  static parseSleepRange(rangeString) {
    if (typeof rangeString !== 'string') {
      throw new Error('Sleep range must be a string');
    }

    const trimmed = rangeString.trim();

    // Single number format
    if (/^\d+$/.test(trimmed)) {
      const value = parseInt(trimmed, 10);
      if (value < 1 || value > 60) {
        throw new Error('Sleep value must be between 1 and 60 seconds');
      }
      return { min: value, max: value };
    }

    // Range format (min-max)
    const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
    if (!rangeMatch) {
      throw new Error('Invalid sleep range format. Use "5" or "3-10"');
    }

    const min = parseInt(rangeMatch[1], 10);
    const max = parseInt(rangeMatch[2], 10);

    if (min < 1 || max > 60) {
      throw new Error('Sleep range values must be between 1 and 60 seconds');
    }

    if (min > max) {
      throw new Error(
        'Sleep range minimum must be less than or equal to maximum'
      );
    }

    return { min, max };
  }

  /**
   * Formats sleep range for display
   */
  formatSleepRange() {
    if (this.sleepRange.min === this.sleepRange.max) {
      return `${this.sleepRange.min}s`;
    }
    return `${this.sleepRange.min}-${this.sleepRange.max}s`;
  }

  /**
   * Gets a random sleep duration within the configured range
   */
  getRandomSleepDuration() {
    const { min, max } = this.sleepRange;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Checks if a media type is supported
   */
  isMediaTypeSupported(mimeType) {
    return this.supportedMediaTypes.includes(mimeType);
  }

  /**
   * Checks if a file size is within limits
   */
  isFileSizeAllowed(size) {
    return size <= this.maxFileSize;
  }

  /**
   * Gets human-readable file size limit
   */
  getMaxFileSizeDisplay() {
    const size = this.maxFileSize;
    if (size >= 1024 * 1024) {
      return `${Math.round(size / (1024 * 1024))}MB`;
    }
    if (size >= 1024) {
      return `${Math.round(size / 1024)}KB`;
    }
    return `${size}B`;
  }

  toJSON() {
    return {
      sleepRange: this.sleepRange,
      whatsappTimeout: this.whatsappTimeout,
      maxRetries: this.maxRetries,
      maxFileSize: this.maxFileSize,
      supportedMediaTypes: this.supportedMediaTypes,
      logLevel: this.logLevel,
      outputFormat: this.outputFormat,
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
      properties: {
        sleepRange: {
          type: 'object',
          required: ['min', 'max'],
          properties: {
            min: { type: 'number', minimum: 1, maximum: 60 },
            max: { type: 'number', minimum: 1, maximum: 60 },
          },
        },
        whatsappTimeout: { type: 'number', minimum: 5000 },
        maxRetries: { type: 'number', minimum: 0, maximum: 10 },
        maxFileSize: { type: 'number', minimum: 1024 }, // 1KB minimum
        supportedMediaTypes: {
          type: 'array',
          items: { type: 'string' },
          uniqueItems: true,
        },
        logLevel: {
          type: 'string',
          enum: ['error', 'warn', 'info', 'debug'],
        },
        outputFormat: {
          type: 'string',
          enum: ['json', 'human'],
        },
      },
    };

    CLIConfig._validator = ajv.compile(schema);
  }

  /**
   * Format validation errors for display
   */
  static _formatErrors(errors) {
    return errors.map(err => `${err.instancePath} ${err.message}`).join(', ');
  }
}

/**
 * RuntimeState model for managing runtime application state
 */
export class RuntimeState {
  constructor() {
    this.whatsappClient = null;
    this.currentPlan = null;
    this.currentProgress = null;
    this.rateLimiter = {
      lastMessageTime: 0,
      messageCount: 0,
      dailyLimit: 1000, // Conservative default
    };
    this.isConnected = false;
    this.isPaused = false;
  }

  /**
   * Sets the WhatsApp client instance
   */
  setWhatsAppClient(client) {
    this.whatsappClient = client;
    this.isConnected = !!client;
  }

  /**
   * Sets the current import plan
   */
  setCurrentPlan(plan) {
    this.currentPlan = plan;
  }

  /**
   * Sets the current progress tracking
   */
  setCurrentProgress(progress) {
    this.currentProgress = progress;
  }

  /**
   * Updates rate limiter after sending a message
   */
  updateRateLimit() {
    this.rateLimiter.lastMessageTime = Date.now();
    this.rateLimiter.messageCount++;
  }

  /**
   * Checks if rate limit allows sending another message
   */
  canSendMessage(config) {
    const now = Date.now();
    const timeSinceLastMessage = now - this.rateLimiter.lastMessageTime;
    const minimumDelay = config.sleepRange.min * 1000;

    // Check time-based rate limit
    if (timeSinceLastMessage < minimumDelay) {
      return false;
    }

    // Check daily message limit
    if (this.rateLimiter.messageCount >= this.rateLimiter.dailyLimit) {
      return false;
    }

    return true;
  }

  /**
   * Gets required wait time before next message
   */
  getRequiredWaitTime(config) {
    const now = Date.now();
    const timeSinceLastMessage = now - this.rateLimiter.lastMessageTime;
    const minimumDelay = config.sleepRange.min * 1000;

    return Math.max(0, minimumDelay - timeSinceLastMessage);
  }

  /**
   * Resets daily rate limit counter
   */
  resetDailyLimit() {
    this.rateLimiter.messageCount = 0;
  }

  /**
   * Pauses the import process
   */
  pause() {
    this.isPaused = true;
  }

  /**
   * Resumes the import process
   */
  resume() {
    this.isPaused = false;
  }

  /**
   * Cleans up resources
   */
  cleanup() {
    if (this.whatsappClient) {
      try {
        this.whatsappClient.destroy();
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    this.whatsappClient = null;
    this.currentPlan = null;
    this.currentProgress = null;
    this.isConnected = false;
  }

  toJSON() {
    return {
      isConnected: this.isConnected,
      isPaused: this.isPaused,
      rateLimiter: this.rateLimiter,
      hasCurrentPlan: !!this.currentPlan,
      hasCurrentProgress: !!this.currentProgress,
    };
  }
}

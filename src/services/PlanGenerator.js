import { join, resolve, basename } from 'path';
import { randomUUID } from 'crypto';
import { WhatsAppMessage } from '../models/WhatsAppMessage.js';
import { ImportPlan } from '../models/ImportPlan.js';
import { TelegramParser } from './TelegramParser.js';
import { MediaValidator } from './MediaValidator.js';

/**
 * PlanGenerator service for converting Telegram messages to WhatsApp import plans
 * Handles message transformation, media validation, and plan creation
 */
export class PlanGenerator {
  constructor(config = null) {
    this.config = config;
    this.mediaValidator = new MediaValidator(config);
    this.transformationRules = new Map();
    this.skipReasons = new Map();

    this._initializeTransformationRules();
    this._initializeSkipReasons();
  }

  /**
   * Generate import plan from Telegram export
   */
  async generatePlan(telegramExportPath, outputPath, options = {}) {
    const startTime = Date.now();

    // Parse Telegram export
    const parser = new TelegramParser();
    const parseResult = await parser.parseExport(telegramExportPath);

    // Options with defaults
    const planOptions = {
      validateMedia: options.validateMedia !== false,
      skipLargeFiles: options.skipLargeFiles || false,
      targetChatId: options.targetChatId || 'unknown@c.us',
      ...options,
    };

    // Transform messages
    const transformResult = await this._transformMessages(
      parseResult.messages,
      telegramExportPath,
      planOptions
    );

    // Generate metadata
    const metadata = {
      generatedAt: new Date().toISOString(),
      telegramExportPath: resolve(telegramExportPath),
      outputPath: resolve(outputPath),
      totalMessages: parseResult.messages.length,
      supportedMessages: transformResult.messages.length,
      skippedMessages: transformResult.skippedMessages.length,
      mediaFiles: transformResult.messages.filter(m => m.type !== 'text')
        .length,
      generationTime: Date.now() - startTime,
      options: planOptions,
    };

    // Create import plan
    const plan = ImportPlan.create(
      metadata,
      transformResult.messages,
      transformResult.skippedMessages
    );

    return {
      plan,
      statistics: {
        parsing: parseResult,
        transformation: transformResult,
        generation: {
          duration: Date.now() - startTime,
          messagesPerSecond: Math.round(
            parseResult.messages.length / ((Date.now() - startTime) / 1000)
          ),
        },
      },
    };
  }

  /**
   * Transform Telegram messages to WhatsApp messages
   */
  async _transformMessages(telegramMessages, exportPath, options) {
    const result = {
      messages: [],
      skippedMessages: [],
      mediaValidation: null,
    };

    // Collect all media files for validation if requested
    if (options.validateMedia) {
      const mediaFiles = this._collectMediaFiles(telegramMessages, exportPath);
      result.mediaValidation =
        await this.mediaValidator.validateFiles(mediaFiles);
    }

    // Transform each message
    for (const telegramMsg of telegramMessages) {
      try {
        const transformation = await this._transformSingleMessage(
          telegramMsg,
          exportPath,
          options,
          result.mediaValidation
        );

        if (transformation.skip) {
          result.skippedMessages.push({
            telegramId: telegramMsg.id,
            reason: transformation.skipReason,
            originalMessage: telegramMsg.toJSON(),
            explanation: transformation.explanation,
          });
        } else {
          result.messages.push(transformation.message);
        }
      } catch (error) {
        // If transformation fails, skip the message
        result.skippedMessages.push({
          telegramId: telegramMsg.id,
          reason: 'transformation_error',
          originalMessage: telegramMsg.toJSON(),
          explanation: `Failed to transform message: ${error.message}`,
        });
      }
    }

    return result;
  }

  /**
   * Transform a single Telegram message to WhatsApp format
   */
  async _transformSingleMessage(
    telegramMsg,
    exportPath,
    options,
    mediaValidation
  ) {
    // Check if message should be skipped
    const skipCheck = this._shouldSkipMessage(telegramMsg, options);
    if (skipCheck.skip) {
      return skipCheck;
    }

    // Determine message type and content
    const messageType = this._determineWhatsAppType(telegramMsg);
    const content = this._extractContent(telegramMsg);

    // Handle media path
    let mediaPath = null;
    let mediaType = null;

    if (telegramMsg.hasMedia()) {
      const mediaResult = this._processMediaFile(
        telegramMsg,
        exportPath,
        options,
        mediaValidation
      );

      if (mediaResult.skip) {
        return mediaResult;
      }

      mediaPath = mediaResult.mediaPath;
      mediaType = mediaResult.mediaType;
    }

    // Create WhatsApp message
    const whatsappMessage = {
      id: randomUUID(),
      telegramId: telegramMsg.id,
      type: messageType,
      content,
      mediaPath,
      mediaType,
      timestamp: telegramMsg.getTimestamp(),
      sender: telegramMsg.from || 'Unknown',
      chatId: options.targetChatId,
      quotedMessage: this._processReply(telegramMsg),
      status: 'pending',
    };

    // Create and validate the WhatsApp message
    const message = new WhatsAppMessage(whatsappMessage);

    return {
      skip: false,
      message,
    };
  }

  /**
   * Check if a message should be skipped
   */
  _shouldSkipMessage(telegramMsg, options) {
    // Service messages
    if (telegramMsg.isServiceMessage()) {
      return {
        skip: true,
        skipReason: 'service_message',
        explanation:
          'Service messages (join/leave notifications, etc.) are not imported',
      };
    }

    // Empty messages
    if (!telegramMsg.text && !telegramMsg.hasMedia()) {
      return {
        skip: true,
        skipReason: 'empty_message',
        explanation: 'Message has no text content or media',
      };
    }

    // Messages with unsupported features (polls, etc.)
    if (this._hasUnsupportedFeatures(telegramMsg)) {
      return {
        skip: true,
        skipReason: 'unsupported_features',
        explanation:
          'Message contains features not supported by WhatsApp (polls, bots, etc.)',
      };
    }

    return { skip: false };
  }

  /**
   * Determine WhatsApp message type from Telegram message
   */
  _determineWhatsAppType(telegramMsg) {
    if (telegramMsg.photo) return 'image';

    if (telegramMsg.file) {
      const mediaType = telegramMsg.getMediaType();

      switch (mediaType) {
        case 'photo':
        case 'image':
          return 'image';
        case 'video_message':
          return 'video';
        case 'voice_message':
          return 'document'; // Send as document to preserve date prefix caption
        case 'document':
          // Determine based on MIME type
          if (telegramMsg.mime_type) {
            if (telegramMsg.mime_type.startsWith('image/')) return 'image';
            if (telegramMsg.mime_type.startsWith('video/')) return 'video';
            if (telegramMsg.mime_type.startsWith('audio/')) return 'document'; // Send as document to preserve date caption
          }
          return 'document';
        default:
          return 'document';
      }
    }

    return 'text';
  }

  /**
   * Extract content from Telegram message
   */
  _extractContent(telegramMsg) {
    const formattedDate = telegramMsg.date.replace('T', ' ');
    const datePrefix = `[${formattedDate}]`;

    if (telegramMsg.text) {
      // Convert text entities to plain text for now
      // In a more sophisticated implementation, you might preserve formatting
      const textContent = this._convertTextEntities(
        telegramMsg.text,
        telegramMsg.text_entities
      );
      return `${datePrefix} ${textContent}`;
    }

    // For media messages, return just the date prefix
    return datePrefix;
  }

  /**
   * Convert Telegram text entities to plain text
   */
  _convertTextEntities(text, entities) {
    if (!entities || entities.length === 0) {
      return text;
    }

    // For now, just return the plain text
    // In the future, this could convert to WhatsApp's formatting
    return text;
  }

  /**
   * Process media file for WhatsApp
   */
  _processMediaFile(telegramMsg, exportPath, options, mediaValidation) {
    const mediaPath = telegramMsg.getMediaPath();
    if (!mediaPath) {
      return {
        skip: true,
        skipReason: 'missing_media_path',
        explanation: 'Media message has no file path',
      };
    }

    const fullPath = join(exportPath, mediaPath);
    const absolutePath = resolve(fullPath);

    // Check media validation results if available
    if (mediaValidation) {
      const validation = mediaValidation.validations.find(
        v => resolve(v.filePath) === absolutePath
      );

      if (validation && !validation.valid) {
        return {
          skip: true,
          skipReason: 'media_validation_failed',
          explanation: `Media validation failed: ${validation.errors.join(', ')}`,
        };
      }
    }

    // Skip large files if requested
    if (options.skipLargeFiles && mediaValidation) {
      const validation = mediaValidation.validations.find(
        v => resolve(v.filePath) === absolutePath
      );

      if (validation && validation.fileInfo) {
        const maxSize = options.maxFileSize || 16 * 1024 * 1024; // 16MB default
        if (validation.fileInfo.size > maxSize) {
          return {
            skip: true,
            skipReason: 'file_too_large',
            explanation: `File size (${this._formatFileSize(validation.fileInfo.size)}) exceeds limit`,
          };
        }
      }
    }

    return {
      skip: false,
      mediaPath: absolutePath,
      mediaType: telegramMsg.mime_type || this._inferMimeType(mediaPath),
    };
  }

  /**
   * Process reply information
   */
  _processReply(telegramMsg) {
    if (telegramMsg.reply_to_message_id) {
      // In a more sophisticated implementation, you'd look up the referenced message
      return `Reply to message ${telegramMsg.reply_to_message_id}`;
    }
    return null;
  }

  /**
   * Check if message has unsupported features
   */
  _hasUnsupportedFeatures(telegramMsg) {
    // Check for polls, bots, inline keyboards, etc.
    // This is a simplified check
    return false;
  }

  /**
   * Collect all media files from messages
   */
  _collectMediaFiles(messages, exportPath) {
    const mediaFiles = [];

    for (const msg of messages) {
      if (msg.hasMedia()) {
        const mediaPath = msg.getMediaPath();
        if (mediaPath) {
          mediaFiles.push({
            filePath: join(exportPath, mediaPath),
            mimeType: msg.mime_type,
          });
        }
      }
    }

    return mediaFiles;
  }

  /**
   * Infer MIME type from file path
   */
  _inferMimeType(filePath) {
    const ext = basename(filePath).split('.').pop()?.toLowerCase();

    const mimeMap = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      mp4: 'video/mp4',
      webm: 'video/webm',
      mov: 'video/quicktime',
      mp3: 'audio/mpeg',
      ogg: 'audio/ogg',
      wav: 'audio/wav',
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      txt: 'text/plain',
    };

    return mimeMap[ext] || 'application/octet-stream';
  }

  /**
   * Format file size for display
   */
  _formatFileSize(bytes) {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(2)}KB`;
    }
    return `${bytes}B`;
  }

  /**
   * Initialize transformation rules
   */
  _initializeTransformationRules() {
    // Define how different Telegram message types should be transformed
    this.transformationRules.set('text', 'text');
    this.transformationRules.set('photo', 'image');
    this.transformationRules.set('video', 'video');
    this.transformationRules.set('voice', 'audio');
    this.transformationRules.set('document', 'document');
    this.transformationRules.set('sticker', 'skip'); // Skip stickers for now
    this.transformationRules.set('animation', 'video'); // GIFs as videos
  }

  /**
   * Initialize skip reasons
   */
  _initializeSkipReasons() {
    this.skipReasons.set(
      'service_message',
      'Service messages are not imported'
    );
    this.skipReasons.set(
      'unsupported_media',
      'Media type not supported by WhatsApp'
    );
    this.skipReasons.set('missing_file', 'Referenced media file not found');
    this.skipReasons.set('file_too_large', 'File exceeds size limits');
    this.skipReasons.set('poll_message', 'Polls are not supported');
    this.skipReasons.set('bot_command', 'Bot commands are not imported');
    this.skipReasons.set(
      'inline_keyboard',
      'Interactive elements not supported'
    );
  }

  /**
   * Get supported message types
   */
  getSupportedMessageTypes() {
    return Array.from(this.transformationRules.keys()).filter(
      type => this.transformationRules.get(type) !== 'skip'
    );
  }

  /**
   * Get skip reasons
   */
  getSkipReasons() {
    return Object.fromEntries(this.skipReasons);
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    this.config = newConfig;
    this.mediaValidator.updateConfig(newConfig);
  }

  /**
   * Static method to generate a plan quickly
   */
  static async generatePlan(exportPath, outputPath, options = {}) {
    const generator = new PlanGenerator(options.config);
    return await generator.generatePlan(exportPath, outputPath, options);
  }

  /**
   * Static method to preview plan generation (without creating files)
   */
  static async previewPlan(exportPath, options = {}) {
    const generator = new PlanGenerator(options.config);

    // Parse without full processing
    const parser = new TelegramParser();
    const parseResult = await parser.parseExport(exportPath);

    const preview = {
      totalMessages: parseResult.messages.length,
      estimatedSupported: 0,
      estimatedSkipped: 0,
      messageTypes: {},
      mediaFiles: 0,
      estimatedSize: 0,
    };

    for (const msg of parseResult.messages) {
      const type = msg.type;
      preview.messageTypes[type] = (preview.messageTypes[type] || 0) + 1;

      if (msg.isServiceMessage()) {
        preview.estimatedSkipped++;
      } else {
        preview.estimatedSupported++;
      }

      if (msg.hasMedia()) {
        preview.mediaFiles++;
      }
    }

    return preview;
  }
}

import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { BaseValidator } from '../lib/BaseValidator.js';

/**
 * TelegramMessage model for validating and managing Telegram message data
 * Based on Telegram's result.json export format
 */
export class TelegramMessage {
  constructor(data) {
    this.id = data.id;
    this.type = data.type;
    this.date = data.date;
    this.date_unixtime = data.date_unixtime;
    this.from = data.from;
    this.from_id = data.from_id;

    // Text content
    this.text = this._normalizeText(data.text) || '';
    this.text_entities = data.text_entities || [];

    // Media content
    this.photo = data.photo;
    this.photo_file_size = data.photo_file_size;
    this.width = data.width;
    this.height = data.height;
    this.file = data.file;
    this.file_name = data.file_name;
    this.file_size = data.file_size;
    this.thumbnail = data.thumbnail;
    this.thumbnail_file_size = data.thumbnail_file_size;
    this.media_type = data.media_type;
    this.mime_type = data.mime_type;
    this.duration_seconds = data.duration_seconds;

    // Message relationships
    this.reply_to_message_id = data.reply_to_message_id;
    this.forwarded_from = data.forwarded_from;

    // Message state
    this.edited = data.edited;
    this.edited_unixtime = data.edited_unixtime;

    // Reactions
    this.reactions = data.reactions;

    // Service message data
    this.actor = data.actor;
    this.actor_id = data.actor_id;
    this.action = data.action;
    this.title = data.title;
    this.members = data.members;
  }

  /**
   * Validates a TelegramMessage against the schema
   */
  static validate(data, exportPath = null) {
    TelegramMessage._lazyValidator.validate(data);

    // Additional business logic validation
    TelegramMessage._validateBusinessRules(data, exportPath);

    return true;
  }

  /**
   * Validates business rules beyond schema validation
   */
  static _validateBusinessRules(data, exportPath) {
    // Validate ISO 8601 date format
    if (!TelegramMessage._isValidISO8601(data.date)) {
      throw new Error(`Invalid date format: ${data.date}`);
    }

    // Check media file existence if specified
    if (exportPath && (data.photo || data.file)) {
      const mediaFile = data.photo || data.file;
      const fullPath = resolve(exportPath, mediaFile);
      if (!existsSync(fullPath)) {
        throw new Error(`Media file not found: ${mediaFile}`);
      }
    }

    // Validate type-specific requirements
    if (data.type === 'service' && !data.action) {
      throw new Error('Service messages must have an action');
    }

    if (data.type === 'message' && !data.text && !data.photo && !data.file) {
      throw new Error(
        'Regular messages must have content (text, photo, or file)'
      );
    }
  }

  /**
   * Normalizes text content (handles both string and array formats)
   */
  _normalizeText(text) {
    if (typeof text === 'string') {
      return text;
    }

    if (Array.isArray(text)) {
      return text
        .map(item => {
          if (typeof item === 'string') {
            return item;
          } else if (item && typeof item === 'object' && item.text) {
            return item.text;
          }
          return '';
        })
        .join('');
    }

    return '';
  }

  /**
   * Validates ISO 8601 date format
   */
  static _isValidISO8601(dateString) {
    // More flexible ISO 8601 validation that accepts Telegram's format
    const iso8601Regex =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})?$/;
    if (!iso8601Regex.test(dateString)) {
      return false;
    }

    const date = new Date(dateString);
    return !isNaN(date.getTime());
  }

  /**
   * Validates an array of TelegramMessages
   */
  static validateArray(messages, exportPath = null) {
    if (!Array.isArray(messages)) {
      throw new Error('Messages must be an array');
    }

    const seenIds = new Set();

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];

      try {
        TelegramMessage.validate(message, exportPath);
      } catch (error) {
        throw new Error(
          `Message at index ${i} (id: ${message.id}): ${error.message}`
        );
      }

      // Check ID uniqueness
      if (seenIds.has(message.id)) {
        throw new Error(`Duplicate message ID found: ${message.id}`);
      }
      seenIds.add(message.id);
    }

    return true;
  }

  /**
   * Creates a TelegramMessage instance with validation
   */
  static fromData(data, exportPath = null) {
    TelegramMessage.validate(data, exportPath);
    return new TelegramMessage(data);
  }

  /**
   * Utility methods
   */
  hasMedia() {
    return !!(this.photo || this.file);
  }

  isServiceMessage() {
    return this.type === 'service';
  }

  getMediaPath() {
    return this.photo || this.file;
  }

  getMediaType() {
    if (this.photo) return 'photo';
    if (this.media_type) return this.media_type;
    if (this.file && this.mime_type) {
      if (this.mime_type.startsWith('image/')) return 'image';
      if (this.mime_type.startsWith('video/')) return 'video';
      if (this.mime_type.startsWith('audio/')) return 'audio';
    }
    return 'document';
  }

  getTimestamp() {
    return new Date(this.date).getTime();
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      date: this.date,
      date_unixtime: this.date_unixtime,
      from: this.from,
      from_id: this.from_id,
      text: this.text,
      text_entities: this.text_entities,
      photo: this.photo,
      photo_file_size: this.photo_file_size,
      width: this.width,
      height: this.height,
      file: this.file,
      file_name: this.file_name,
      file_size: this.file_size,
      thumbnail: this.thumbnail,
      thumbnail_file_size: this.thumbnail_file_size,
      media_type: this.media_type,
      mime_type: this.mime_type,
      duration_seconds: this.duration_seconds,
      reply_to_message_id: this.reply_to_message_id,
      forwarded_from: this.forwarded_from,
      edited: this.edited,
      edited_unixtime: this.edited_unixtime,
      reactions: this.reactions,
      actor: this.actor,
      actor_id: this.actor_id,
      action: this.action,
      title: this.title,
      members: this.members,
    };
  }

  /**
   * Get JSON schema for validation
   */
  static _getSchema() {
    return {
      type: 'object',
      required: ['id', 'type', 'date', 'date_unixtime'],
      properties: {
        id: { type: 'number' },
        type: { type: 'string', enum: ['message', 'service'] },
        date: { type: 'string' },
        date_unixtime: { type: 'string' },
        from: { type: 'string' },
        from_id: { type: 'string' },
        text: {
          oneOf: [
            { type: 'string' },
            {
              type: 'array',
              items: {
                oneOf: [
                  { type: 'string' },
                  {
                    type: 'object',
                    required: ['type', 'text'],
                    properties: {
                      type: { type: 'string' },
                      text: { type: 'string' },
                    },
                  },
                ],
              },
            },
          ],
        },
        text_entities: {
          type: 'array',
          items: {
            type: 'object',
            required: ['type', 'text'],
            properties: {
              type: {
                type: 'string',
                enum: [
                  'plain',
                  'bold',
                  'italic',
                  'code',
                  'pre',
                  'link',
                  'mention',
                ],
              },
              text: { type: 'string' },
              href: { type: 'string' },
            },
          },
        },
        photo: { type: 'string' },
        photo_file_size: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        file: { type: 'string' },
        file_name: { type: 'string' },
        file_size: { type: 'number' },
        thumbnail: { type: 'string' },
        thumbnail_file_size: { type: 'number' },
        media_type: {
          type: 'string',
          enum: ['voice_message', 'video_message', 'video_file', 'document'],
        },
        mime_type: { type: 'string' },
        duration_seconds: { type: 'number' },
        reply_to_message_id: { type: 'number' },
        forwarded_from: { type: 'string' },
        edited: { type: 'string' },
        edited_unixtime: { type: 'string' },
        reactions: {
          type: 'array',
          items: {
            type: 'object',
            required: ['type', 'count', 'emoji'],
            properties: {
              type: { type: 'string', enum: ['emoji'] },
              count: { type: 'number' },
              emoji: { type: 'string' },
              recent: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['from', 'from_id', 'date'],
                  properties: {
                    from: { type: 'string' },
                    from_id: { type: 'string' },
                    date: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        actor: { type: 'string' },
        actor_id: { type: 'string' },
        action: { type: 'string' },
        title: { type: 'string' },
        members: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    };
  }
}

// Initialize lazy validator
TelegramMessage._lazyValidator = BaseValidator.createLazyValidator(
  TelegramMessage._getSchema,
  'TelegramMessage'
);

import { readFileSync, existsSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { TelegramMessage } from '../models/TelegramMessage.js';

/**
 * TelegramParser service for parsing and validating Telegram export data
 * Handles result.json parsing and message validation
 */
export class TelegramParser {
  constructor() {
    this.exportPath = null;
    this.parsedData = null;
    this.messages = [];
    this.chatInfo = null;
  }

  /**
   * Parse Telegram export from a directory
   */
  async parseExport(exportPath) {
    if (!exportPath) {
      throw new Error('Export path is required');
    }

    this.exportPath = resolve(exportPath);

    // Validate export directory exists
    if (!existsSync(this.exportPath)) {
      throw new Error(`Export directory not found: ${exportPath}`);
    }

    const stats = statSync(this.exportPath);
    if (!stats.isDirectory()) {
      throw new Error(`Export path must be a directory: ${exportPath}`);
    }

    // Parse result.json
    await this._parseResultJson();

    // Validate and process messages
    await this._processMessages();

    return {
      chatInfo: this.chatInfo,
      messages: this.messages,
      totalMessages: this.messages.length,
      exportPath: this.exportPath,
    };
  }

  /**
   * Parse the result.json file
   */
  async _parseResultJson() {
    const resultPath = join(this.exportPath, 'result.json');

    if (!existsSync(resultPath)) {
      throw new Error('result.json not found in export directory');
    }

    let rawData;
    try {
      rawData = readFileSync(resultPath, 'utf8');
    } catch (error) {
      throw new Error(`Failed to read result.json: ${error.message}`);
    }

    try {
      this.parsedData = JSON.parse(rawData);
    } catch (error) {
      throw new Error(`Invalid JSON in result.json: ${error.message}`);
    }

    // Validate required structure
    this._validateResultStructure();

    // Extract chat information
    this.chatInfo = {
      name: this.parsedData.name,
      type: this.parsedData.type,
      id: this.parsedData.id,
      messageCount: this.parsedData.messages?.length || 0,
    };
  }

  /**
   * Validate the basic structure of result.json
   */
  _validateResultStructure() {
    if (!this.parsedData.name) {
      throw new Error('result.json missing required field: name');
    }

    if (!this.parsedData.type) {
      throw new Error('result.json missing required field: type');
    }

    if (typeof this.parsedData.id !== 'number') {
      throw new Error(
        'result.json missing or invalid field: id (must be number)'
      );
    }

    if (!Array.isArray(this.parsedData.messages)) {
      throw new Error(
        'result.json missing or invalid field: messages (must be array)'
      );
    }

    if (this.parsedData.messages.length === 0) {
      throw new Error('result.json contains no messages');
    }
  }

  /**
   * Process and validate all messages
   */
  async _processMessages() {
    const messages = this.parsedData.messages;
    this.messages = [];

    for (let i = 0; i < messages.length; i++) {
      const rawMessage = messages[i];

      try {
        // Validate message structure using TelegramMessage model
        TelegramMessage.validate(rawMessage, this.exportPath);

        // Create TelegramMessage instance
        const message = new TelegramMessage(rawMessage);
        this.messages.push(message);
      } catch (error) {
        throw new Error(
          `Message at index ${i} (id: ${rawMessage.id || 'unknown'}): ${error.message}`
        );
      }
    }

    // Validate message ID uniqueness across all messages
    const messageIds = new Set();
    const duplicateIds = [];

    for (const message of this.messages) {
      if (messageIds.has(message.id)) {
        duplicateIds.push(message.id);
      }
      messageIds.add(message.id);
    }

    if (duplicateIds.length > 0) {
      throw new Error(
        `Duplicate message IDs found: ${duplicateIds.join(', ')}`
      );
    }

    // Sort messages by date for consistent processing
    this.messages.sort((a, b) => a.getTimestamp() - b.getTimestamp());
  }

  /**
   * Get messages filtered by type
   */
  getMessagesByType(type) {
    if (!this.messages.length) {
      throw new Error('No messages parsed. Call parseExport() first.');
    }

    return this.messages.filter(msg => msg.type === type);
  }

  /**
   * Get regular (non-service) messages
   */
  getRegularMessages() {
    return this.getMessagesByType('message');
  }

  /**
   * Get service messages
   */
  getServiceMessages() {
    return this.getMessagesByType('service');
  }

  /**
   * Get messages with media
   */
  getMessagesWithMedia() {
    if (!this.messages.length) {
      throw new Error('No messages parsed. Call parseExport() first.');
    }

    return this.messages.filter(msg => msg.hasMedia());
  }

  /**
   * Get messages in date range
   */
  getMessagesInRange(startDate, endDate) {
    if (!this.messages.length) {
      throw new Error('No messages parsed. Call parseExport() first.');
    }

    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();

    return this.messages.filter(msg => {
      const timestamp = msg.getTimestamp();
      return timestamp >= start && timestamp <= end;
    });
  }

  /**
   * Get statistics about the parsed messages
   */
  getStatistics() {
    if (!this.messages.length) {
      throw new Error('No messages parsed. Call parseExport() first.');
    }

    const stats = {
      totalMessages: this.messages.length,
      messagesByType: {},
      messagesWithMedia: 0,
      mediaByType: {},
      dateRange: {
        earliest: null,
        latest: null,
      },
      messageSenders: new Set(),
      totalMediaFiles: 0,
    };

    let earliestTimestamp = Infinity;
    let latestTimestamp = 0;

    for (const message of this.messages) {
      // Count by type
      stats.messagesByType[message.type] =
        (stats.messagesByType[message.type] || 0) + 1;

      // Count media
      if (message.hasMedia()) {
        stats.messagesWithMedia++;
        stats.totalMediaFiles++;

        const mediaType = message.getMediaType();
        stats.mediaByType[mediaType] = (stats.mediaByType[mediaType] || 0) + 1;
      }

      // Track date range
      const timestamp = message.getTimestamp();
      if (timestamp < earliestTimestamp) {
        earliestTimestamp = timestamp;
      }
      if (timestamp > latestTimestamp) {
        latestTimestamp = timestamp;
      }

      // Track senders
      if (message.from) {
        stats.messageSenders.add(message.from);
      }
    }

    stats.dateRange.earliest = new Date(earliestTimestamp).toISOString();
    stats.dateRange.latest = new Date(latestTimestamp).toISOString();
    stats.uniqueSenders = stats.messageSenders.size;
    delete stats.messageSenders; // Don't expose the set

    return stats;
  }

  /**
   * Validate media file existence
   */
  async validateMediaFiles() {
    if (!this.messages.length) {
      throw new Error('No messages parsed. Call parseExport() first.');
    }

    const mediaMessages = this.getMessagesWithMedia();
    const validationResults = {
      totalMedia: mediaMessages.length,
      validFiles: 0,
      missingFiles: [],
      errors: [],
    };

    for (const message of mediaMessages) {
      const mediaPath = message.getMediaPath();
      if (!mediaPath) continue;

      const fullPath = join(this.exportPath, mediaPath);

      try {
        if (existsSync(fullPath)) {
          const stats = statSync(fullPath);
          if (stats.isFile()) {
            validationResults.validFiles++;
          } else {
            validationResults.missingFiles.push({
              messageId: message.id,
              mediaPath,
              reason: 'Path exists but is not a file',
            });
          }
        } else {
          validationResults.missingFiles.push({
            messageId: message.id,
            mediaPath,
            reason: 'File does not exist',
          });
        }
      } catch (error) {
        validationResults.errors.push({
          messageId: message.id,
          mediaPath,
          error: error.message,
        });
      }
    }

    return validationResults;
  }

  /**
   * Get chat information
   */
  getChatInfo() {
    if (!this.chatInfo) {
      throw new Error('No chat info available. Call parseExport() first.');
    }

    return { ...this.chatInfo };
  }

  /**
   * Get all parsed messages
   */
  getAllMessages() {
    if (!this.messages.length) {
      throw new Error('No messages parsed. Call parseExport() first.');
    }

    return [...this.messages];
  }

  /**
   * Clear parsed data
   */
  clear() {
    this.exportPath = null;
    this.parsedData = null;
    this.messages = [];
    this.chatInfo = null;
  }

  /**
   * Static method to quickly parse an export
   */
  static async parse(exportPath) {
    const parser = new TelegramParser();
    return await parser.parseExport(exportPath);
  }

  /**
   * Static method to validate export structure without full parsing
   */
  static async validateExport(exportPath) {
    const parser = new TelegramParser();
    parser.exportPath = resolve(exportPath);

    // Basic directory validation
    if (!existsSync(parser.exportPath)) {
      throw new Error(`Export directory not found: ${exportPath}`);
    }

    const stats = statSync(parser.exportPath);
    if (!stats.isDirectory()) {
      throw new Error(`Export path must be a directory: ${exportPath}`);
    }

    // Check for result.json
    const resultPath = join(parser.exportPath, 'result.json');
    if (!existsSync(resultPath)) {
      throw new Error('result.json not found in export directory');
    }

    // Basic JSON validation
    try {
      const rawData = readFileSync(resultPath, 'utf8');
      const parsedData = JSON.parse(rawData);

      if (
        !parsedData.name ||
        !parsedData.type ||
        typeof parsedData.id !== 'number' ||
        !Array.isArray(parsedData.messages)
      ) {
        throw new Error('result.json has invalid structure');
      }

      return {
        valid: true,
        chatName: parsedData.name,
        chatType: parsedData.type,
        messageCount: parsedData.messages.length,
      };
    } catch (error) {
      throw new Error(`Export validation failed: ${error.message}`);
    }
  }
}

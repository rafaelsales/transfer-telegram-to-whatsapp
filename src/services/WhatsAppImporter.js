import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import { existsSync, readFileSync } from 'fs';
import { basename } from 'path';
import qrcode from 'qrcode-terminal';
import { CLIConfig, RuntimeState } from '../models/CLIConfig.js';
import { ImportPlan } from '../models/ImportPlan.js';
import { ProgressRecord } from '../models/ProgressRecord.js';

/**
 * WhatsAppImporter service for executing WhatsApp import operations
 * Handles WhatsApp client connection, message sending, and rate limiting
 */
export class WhatsAppImporter {
  constructor(config = null) {
    this.config = config || CLIConfig.createDefault();
    this.runtimeState = new RuntimeState();
    this.client = null;
    this.isConnected = false;
    this.isPaused = false;
    this.currentPlan = null;
    this.progressTracker = null;
    this.eventListeners = new Map();

    this._setupEventHandlers();
  }

  /**
   * Initialize and connect to WhatsApp
   */
  async connect() {
    if (this.isConnected) {
      throw new Error('WhatsApp client is already connected');
    }

    try {
      // Create WhatsApp client with persistent session
      this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: 'telegram-to-whatsapp',
          dataPath: './.wwebjs_auth',
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
          ],
        },
      });

      // Set up event handlers
      this._setupClientEventHandlers();

      // Initialize client
      await this.client.initialize();

      // Wait for connection
      await this._waitForConnection();

      this.runtimeState.setWhatsAppClient(this.client);
      this.isConnected = true;

      return {
        connected: true,
        clientInfo: await this._getClientInfo(),
      };
    } catch (error) {
      this.isConnected = false;
      throw new Error(`Failed to connect to WhatsApp: ${error.message}`);
    }
  }

  /**
   * Execute import plan
   */
  async executeImport(plan, progressTracker, options = {}) {
    if (!this.isConnected && !options.dryRun) {
      throw new Error('WhatsApp client not connected. Call connect() first.');
    }

    if (!(plan instanceof ImportPlan)) {
      throw new Error('Invalid plan. Expected ImportPlan instance.');
    }

    this.currentPlan = plan;
    this.progressTracker = progressTracker;
    this.runtimeState.setCurrentPlan(plan);
    this.runtimeState.setCurrentProgress(progressTracker?.getProgressSummary());

    const importOptions = {
      dryRun: options.dryRun || false,
      resume: options.resume || false,
      maxRetries: options.maxRetries || this.config.maxRetries,
      ...options,
    };

    try {
      // Get unprocessed messages
      const messagesToProcess = this._getMessagesToProcess(plan, importOptions);

      if (messagesToProcess.length === 0) {
        return {
          status: 'completed',
          totalMessages: 0,
          processedMessages: 0,
          successfulMessages: 0,
          failedMessages: 0,
          skippedMessages: 0,
        };
      }

      // Import messages
      const result = await this._processMessages(
        messagesToProcess,
        importOptions
      );

      return result;
    } catch (error) {
      if (this.progressTracker) {
        await this.progressTracker.updateProgress({
          status: 'failed',
          error: error.message,
        });
      }

      throw error;
    }
  }

  /**
   * Process messages with rate limiting and error handling
   */
  async _processMessages(messages, options) {
    const result = {
      status: 'running',
      totalMessages: messages.length,
      processedMessages: 0,
      successfulMessages: 0,
      failedMessages: 0,
      skippedMessages: 0,
      errors: [],
    };

    for (let i = 0; i < messages.length; i++) {
      if (this.isPaused) {
        result.status = 'paused';
        break;
      }

      const message = messages[i];

      try {
        // Check rate limiting
        await this._waitForRateLimit();

        // Process single message
        const messageResult = await this._processSingleMessage(
          message,
          options
        );

        // Update counters
        result.processedMessages++;

        if (messageResult.success) {
          result.successfulMessages++;
        } else if (messageResult.skipped) {
          result.skippedMessages++;
        } else {
          result.failedMessages++;
          result.errors.push({
            messageId: message.id,
            error: messageResult.error,
          });
        }

        // Update progress
        if (this.progressTracker) {
          const progressRecord = ProgressRecord.create(
            message.id,
            message.telegramId,
            messageResult.success ? 'sent' : 'failed',
            messageResult.error || null,
            messageResult.whatsappMessageId || null
          );

          await this.progressTracker.recordProgress(progressRecord);
        }

        // Update rate limiter
        if (messageResult.success) {
          this.runtimeState.updateRateLimit();
        }
      } catch (error) {
        result.failedMessages++;
        result.processedMessages++;
        result.errors.push({
          messageId: message.id,
          error: error.message,
        });

        // Record failure
        if (this.progressTracker) {
          const progressRecord = ProgressRecord.create(
            message.id,
            message.telegramId,
            'failed',
            error.message
          );

          await this.progressTracker.recordProgress(progressRecord);
        }
      }

      // Emit progress event
      this._emitProgress({
        current: i + 1,
        total: messages.length,
        successful: result.successfulMessages,
        failed: result.failedMessages,
        percentage: Math.round(((i + 1) / messages.length) * 100),
      });
    }

    // Determine final status
    if (result.processedMessages === result.totalMessages) {
      result.status =
        result.failedMessages === 0 ? 'completed' : 'completed_with_errors';
    }

    return result;
  }

  /**
   * Process a single message
   */
  async _processSingleMessage(message, options) {
    if (options.dryRun) {
      return {
        success: true,
        dryRun: true,
        message: 'Dry run - message not actually sent',
      };
    }

    try {
      // Mark as processing
      message.markAsProcessing();

      let whatsappMessageId = null;

      // Send based on message type
      switch (message.type) {
        case 'text':
          whatsappMessageId = await this._sendTextMessage(message);
          break;
        case 'image':
          whatsappMessageId = await this._sendImageMessage(message);
          break;
        case 'video':
          whatsappMessageId = await this._sendVideoMessage(message);
          break;
        case 'audio':
          whatsappMessageId = await this._sendAudioMessage(message);
          break;
        case 'document':
          whatsappMessageId = await this._sendDocumentMessage(message);
          break;
        default:
          throw new Error(`Unsupported message type: ${message.type}`);
      }

      // Mark as sent
      message.markAsSent(whatsappMessageId);

      return {
        success: true,
        whatsappMessageId,
      };
    } catch (error) {
      // Mark as failed
      message.markAsFailed(error.message);

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send text message
   */
  async _sendTextMessage(message) {
    const chat = await this.client.getChatById(message.chatId);
    const sentMessage = await chat.sendMessage(message.content);
    return sentMessage.id._serialized;
  }

  /**
   * Send image message
   */
  async _sendImageMessage(message) {
    const media = await this._prepareMediaFile(message.mediaPath, 'image');
    const chat = await this.client.getChatById(message.chatId);

    const sentMessage = await chat.sendMessage(media, {
      caption: message.content || undefined,
    });

    return sentMessage.id._serialized;
  }

  /**
   * Send video message
   */
  async _sendVideoMessage(message) {
    const media = await this._prepareMediaFile(message.mediaPath, 'video');
    const chat = await this.client.getChatById(message.chatId);

    const sentMessage = await chat.sendMessage(media, {
      caption: message.content || undefined,
    });

    return sentMessage.id._serialized;
  }

  /**
   * Send audio message
   */
  async _sendAudioMessage(message) {
    const media = await this._prepareMediaFile(message.mediaPath, 'audio');
    const chat = await this.client.getChatById(message.chatId);

    const sentMessage = await chat.sendMessage(media);
    return sentMessage.id._serialized;
  }

  /**
   * Send document message
   */
  async _sendDocumentMessage(message) {
    const media = await this._prepareMediaFile(message.mediaPath, 'document');
    const chat = await this.client.getChatById(message.chatId);

    const sentMessage = await chat.sendMessage(media, {
      caption: message.content || undefined,
    });

    return sentMessage.id._serialized;
  }

  /**
   * Prepare media file for sending
   */
  async _prepareMediaFile(filePath, mediaType) {
    if (!existsSync(filePath)) {
      throw new Error(`Media file not found: ${filePath}`);
    }

    const filename = basename(filePath);
    return MessageMedia.fromFilePath(filePath, filename);
  }

  /**
   * Wait for rate limiting
   */
  async _waitForRateLimit() {
    const waitTime = this.runtimeState.getRequiredWaitTime(this.config);

    if (waitTime > 0) {
      await this._sleep(waitTime);
    }

    // Add random delay within configured range
    const randomDelay = this.config.getRandomSleepDuration() * 1000;
    await this._sleep(randomDelay);
  }

  /**
   * Get messages to process based on options
   */
  _getMessagesToProcess(plan, options) {
    if (options.resume) {
      return plan.getUnprocessedMessages();
    } else {
      // Reset all messages to pending
      for (const message of plan.messages) {
        if (message.status !== 'pending') {
          message.status = 'pending';
          message.errorMessage = null;
          message.sentAt = null;
        }
      }
      return [...plan.messages];
    }
  }

  /**
   * Pause import execution
   */
  pause() {
    this.isPaused = true;
    this.runtimeState.pause();
    this._emit('paused');
  }

  /**
   * Resume import execution
   */
  resume() {
    this.isPaused = false;
    this.runtimeState.resume();
    this._emit('resumed');
  }

  /**
   * Stop import execution
   */
  async stop() {
    this.isPaused = true;

    if (this.progressTracker) {
      await this.progressTracker.updateProgress({
        status: 'paused',
      });
    }

    this._emit('stopped');
  }

  /**
   * Disconnect from WhatsApp
   */
  async disconnect() {
    if (!this.isConnected) {
      return;
    }

    try {
      if (this.client) {
        await this.client.destroy();
      }
    } catch (error) {
      // Ignore disconnect errors
    } finally {
      this.client = null;
      this.isConnected = false;
      this.runtimeState.cleanup();
      this._emit('disconnected');
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      connected: this.isConnected,
      paused: this.isPaused,
      currentPlan: !!this.currentPlan,
      runtimeState: this.runtimeState.toJSON(),
    };
  }

  /**
   * Setup event handlers
   */
  _setupEventHandlers() {
    this.eventListeners.set('progress', []);
    this.eventListeners.set('connected', []);
    this.eventListeners.set('disconnected', []);
    this.eventListeners.set('paused', []);
    this.eventListeners.set('resumed', []);
    this.eventListeners.set('stopped', []);
    this.eventListeners.set('error', []);
  }

  /**
   * Setup WhatsApp client event handlers
   */
  _setupClientEventHandlers() {
    this.client.on('qr', qr => {
      console.log('\n📱 Scan this QR code with WhatsApp:');
      qrcode.generate(qr, { small: true });
      this._emit('qr', qr);
    });

    this.client.on('ready', () => {
      console.log('✅ WhatsApp client is ready!');
      this._emit('ready');
    });

    this.client.on('authenticated', () => {
      console.log('✅ WhatsApp client authenticated');
      this._emit('authenticated');
    });

    this.client.on('auth_failure', msg => {
      console.error('❌ WhatsApp authentication failed:', msg);
      this._emit('auth_failure', msg);
    });

    this.client.on('disconnected', reason => {
      console.log('🔌 WhatsApp client disconnected:', reason);
      this.isConnected = false;
      this._emit('disconnected', reason);
    });
  }

  /**
   * Wait for WhatsApp connection
   */
  async _waitForConnection() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, this.config.whatsappTimeout);

      this.client.on('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.client.on('auth_failure', msg => {
        clearTimeout(timeout);
        reject(new Error(`Authentication failed: ${msg}`));
      });
    });
  }

  /**
   * Get client information
   */
  async _getClientInfo() {
    if (!this.client) return null;

    try {
      const info = this.client.info;
      return {
        wid: info.wid,
        pushname: info.pushname,
        platform: info.platform,
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Sleep utility
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Event emitter methods
   */
  on(event, listener) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).push(listener);
    }
  }

  off(event, listener) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  _emit(event, ...args) {
    if (this.eventListeners.has(event)) {
      for (const listener of this.eventListeners.get(event)) {
        try {
          listener(...args);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      }
    }
  }

  _emitProgress(progress) {
    this._emit('progress', progress);
  }

  /**
   * Static method to create and connect quickly
   */
  static async createAndConnect(config = null) {
    const importer = new WhatsAppImporter(config);
    await importer.connect();
    return importer;
  }

  /**
   * Cleanup on process exit
   */
  async cleanup() {
    await this.disconnect();
  }
}

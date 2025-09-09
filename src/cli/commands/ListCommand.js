import { WhatsAppImporter } from '../../services/WhatsAppImporter.js';
import { CLIConfig } from '../../models/CLIConfig.js';

/**
 * ListCommand - Implementation of the 'list' CLI command
 * Lists recent WhatsApp chats with their names and chat IDs
 */
export class ListCommand {
  constructor() {
    this.config = CLIConfig.createDefault();
    this.importer = null;
  }

  /**
   * Execute the list command
   */
  async execute(options = {}) {
    const startTime = Date.now();

    try {
      // Output initial status
      if (options.format === 'human') {
        console.log('🔍 Retrieving WhatsApp chats...');
      }

      // Initialize WhatsApp importer
      this.importer = this._createImporter();

      // Connect to WhatsApp
      await this._connectToWhatsApp(options);

      // Get chats
      const chats = await this._getRecentChats(options);

      // Output results
      this._outputResults(chats, options, Date.now() - startTime);

      // Cleanup
      await this._cleanup();

      return { success: true, chats };
    } catch (error) {
      await this._cleanup();
      return this._handleError(error, options);
    }
  }

  /**
   * Connect to WhatsApp
   */
  async _connectToWhatsApp(options) {
    try {
      if (options.format === 'human') {
        console.log('🔌 Connecting to WhatsApp...');
      }

      const connectionResult = await this.importer.connect();

      if (options.format === 'human') {
        console.log('✅ Connected to WhatsApp successfully!');
        if (connectionResult.clientInfo) {
          console.log(
            `📱 Logged in as: ${connectionResult.clientInfo.pushname || 'Unknown'}`
          );
        }
      }
    } catch (error) {
      throw new ListCommandError(
        `WhatsApp connection failed: ${error.message}`,
        13,
        null
      );
    }
  }

  /**
   * Get recent chats from WhatsApp
   */
  async _getRecentChats(options) {
    try {
      const limit = options.limit || 100;

      // Get all chats
      const allChats = await this.importer.client.getChats();

      // Sort by last message timestamp (most recent first)
      const sortedChats = allChats
        .filter(chat => chat.lastMessage) // Only chats with messages
        .sort((a, b) => b.lastMessage.timestamp - a.lastMessage.timestamp)
        .slice(0, limit); // Limit to requested number

      // Format chat information
      return sortedChats.map(chat => ({
        id: chat.id._serialized,
        name: chat.name || chat.id.user || 'Unknown',
        isGroup: chat.isGroup,
        lastMessageTime: chat.lastMessage
          ? new Date(chat.lastMessage.timestamp * 1000)
          : null,
        lastMessagePreview: chat.lastMessage
          ? this._getMessagePreview(chat.lastMessage)
          : null,
        participantCount: chat.isGroup
          ? chat.participants
            ? chat.participants.length
            : 0
          : null,
      }));
    } catch (error) {
      throw new ListCommandError(
        `Failed to retrieve chats: ${error.message}`,
        20,
        null
      );
    }
  }

  /**
   * Get a preview of the last message
   */
  _getMessagePreview(message) {
    if (message.body && message.body.length > 0) {
      return message.body.length > 50
        ? message.body.substring(0, 50) + '...'
        : message.body;
    }

    if (message.hasMedia) {
      return '[Media]';
    }

    return '[No content]';
  }

  /**
   * Output results based on format
   */
  _outputResults(chats, options, duration) {
    if (options.format === 'json') {
      this._outputJSON(chats, duration);
    } else {
      this._outputHuman(chats, duration, options);
    }
  }

  /**
   * Output results in JSON format
   */
  _outputJSON(chats, duration) {
    const output = {
      success: true,
      chats: chats.map(chat => ({
        id: chat.id,
        name: chat.name,
        isGroup: chat.isGroup,
        lastMessageTime: chat.lastMessageTime?.toISOString() || null,
        lastMessagePreview: chat.lastMessagePreview,
        participantCount: chat.participantCount,
      })),
      totalChats: chats.length,
      duration,
    };

    console.log(JSON.stringify(output, null, 2));
  }

  /**
   * Output results in human-readable format
   */
  _outputHuman(chats, duration, options) {
    const limit = options.limit || 100;

    console.log(
      `\n💬 Found ${chats.length} recent chats (showing last ${limit}):\n`
    );

    if (chats.length === 0) {
      console.log(
        'No chats found. Make sure you have some conversations in WhatsApp.'
      );
      return;
    }

    // Display chats in concise one-line format
    for (let i = 0; i < chats.length; i++) {
      const chat = chats[i];
      const number = (i + 1).toString().padStart(3, ' ');
      const type = chat.isGroup ? '👥' : '👤';
      const name =
        chat.name.length > 30 ? chat.name.substring(0, 27) + '...' : chat.name;
      const nameColumn = name.padEnd(30, ' ');

      console.log(`${number}. ${type} ${nameColumn} | ${chat.id}`);
    }

    console.log(
      `\n💡 Copy the chat ID (after the |) for use with --target-chat option`
    );
    console.log(`⏱️  Retrieved in ${(duration / 1000).toFixed(2)} seconds`);
  }

  /**
   * Cleanup resources
   */
  async _cleanup() {
    try {
      if (this.importer) {
        await this.importer.disconnect();
      }
    } catch {
      // Ignore cleanup errors
    } finally {
      this.importer = null;
    }
  }

  /**
   * Handle and format errors
   */
  _handleError(error, options) {
    if (error instanceof ListCommandError) {
      if (options.format === 'json') {
        console.error(
          JSON.stringify(
            {
              success: false,
              error: {
                code: error.code,
                message: error.message,
                path: error.path,
              },
            },
            null,
            2
          )
        );
      } else {
        console.error(`❌ Error: ${error.message}`);
        if (error.path) {
          console.error(`   Path: ${error.path}`);
        }

        // Add helpful suggestions
        this._outputErrorSuggestions(error);
      }

      process.exit(error.code);
    } else {
      // Unexpected error
      if (options.format === 'json') {
        console.error(
          JSON.stringify(
            {
              success: false,
              error: {
                code: 99,
                message: error.message,
              },
            },
            null,
            2
          )
        );
      } else {
        console.error(`❌ Unexpected error: ${error.message}`);
      }

      process.exit(99);
    }
  }

  /**
   * Output helpful error suggestions
   */
  _outputErrorSuggestions(error) {
    switch (error.code) {
      case 13:
        console.error(
          '\n💡 Make sure WhatsApp Web is not open in your browser and try again.'
        );
        break;
      case 20:
        console.error(
          '\n💡 Unable to retrieve chats. Make sure you are properly logged into WhatsApp.'
        );
        break;
    }
  }

  /**
   * Create WhatsApp importer instance (can be mocked for testing)
   */
  _createImporter() {
    return new WhatsAppImporter(this.config);
  }

  /**
   * Static factory method
   */
  static create() {
    return new ListCommand();
  }
}

/**
 * Custom error class for list command errors
 */
export class ListCommandError extends Error {
  constructor(message, code, path = null) {
    super(message);
    this.name = 'ListCommandError';
    this.code = code;
    this.path = path;
  }
}

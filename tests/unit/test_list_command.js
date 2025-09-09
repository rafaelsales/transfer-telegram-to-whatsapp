import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  ListCommand,
  ListCommandError,
} from '../../src/cli/commands/ListCommand.js';
import { CLIConfig } from '../../src/models/CLIConfig.js';

describe('ListCommand Unit Tests', () => {
  let listCommand;
  let mockImporter;
  let mockClient;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock client
    mockClient = {
      getChats: jest.fn(),
    };

    // Create mock importer
    mockImporter = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      client: mockClient,
    };

    listCommand = new ListCommand();

    // Mock the WhatsAppImporter constructor by replacing it on the listCommand
    jest
      .spyOn(listCommand, '_createImporter')
      .mockImplementation(() => mockImporter);
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const command = new ListCommand();
      expect(command.config).toBeInstanceOf(CLIConfig);
      expect(command.importer).toBeNull();
    });
  });

  describe('execute', () => {
    it('should connect to WhatsApp and retrieve chats successfully', async () => {
      const mockChats = [
        {
          id: { _serialized: '123456789@c.us' },
          name: 'John Doe',
          isGroup: false,
          lastMessage: {
            timestamp: 1640995200, // 2022-01-01 00:00:00 UTC
            body: 'Hello world',
            hasMedia: false,
          },
        },
        {
          id: { _serialized: '987654321@g.us' },
          name: 'Test Group',
          isGroup: true,
          participants: [{}, {}, {}], // 3 participants
          lastMessage: {
            timestamp: 1640995100,
            body: '',
            hasMedia: true,
          },
        },
      ];

      mockImporter.connect.mockResolvedValue({
        connected: true,
        clientInfo: { pushname: 'Test User' },
      });
      mockClient.getChats.mockResolvedValue(mockChats);

      const result = await listCommand.execute({ format: 'json' });

      expect(result.success).toBe(true);
      expect(result.chats).toHaveLength(2);
      expect(result.chats[0].id).toBe('123456789@c.us');
      expect(result.chats[0].name).toBe('John Doe');
      expect(result.chats[0].isGroup).toBe(false);
      expect(result.chats[1].id).toBe('987654321@g.us');
      expect(result.chats[1].name).toBe('Test Group');
      expect(result.chats[1].isGroup).toBe(true);
      expect(result.chats[1].participantCount).toBe(3);

      expect(mockImporter.connect).toHaveBeenCalledTimes(1);
      expect(mockClient.getChats).toHaveBeenCalledTimes(1);
      expect(mockImporter.disconnect).toHaveBeenCalledTimes(1);
    });

    it('should limit results based on limit option', async () => {
      const mockChats = Array.from({ length: 150 }, (_, i) => ({
        id: { _serialized: `${i}@c.us` },
        name: `Contact ${i}`,
        isGroup: false,
        lastMessage: {
          timestamp: 1640995200 - i, // Descending timestamps
          body: `Message ${i}`,
          hasMedia: false,
        },
      }));

      mockImporter.connect.mockResolvedValue({ connected: true });
      mockClient.getChats.mockResolvedValue(mockChats);

      const result = await listCommand.execute({
        format: 'json',
        limit: 50,
      });

      expect(result.success).toBe(true);
      expect(result.chats).toHaveLength(50);
    });

    it('should sort chats by last message timestamp (most recent first)', async () => {
      const mockChats = [
        {
          id: { _serialized: 'old@c.us' },
          name: 'Old Chat',
          isGroup: false,
          lastMessage: { timestamp: 1000, body: 'Old message' },
        },
        {
          id: { _serialized: 'new@c.us' },
          name: 'New Chat',
          isGroup: false,
          lastMessage: { timestamp: 2000, body: 'New message' },
        },
        {
          id: { _serialized: 'middle@c.us' },
          name: 'Middle Chat',
          isGroup: false,
          lastMessage: { timestamp: 1500, body: 'Middle message' },
        },
      ];

      mockImporter.connect.mockResolvedValue({ connected: true });
      mockClient.getChats.mockResolvedValue(mockChats);

      const result = await listCommand.execute({ format: 'json' });

      expect(result.success).toBe(true);
      expect(result.chats).toHaveLength(3);
      expect(result.chats[0].id).toBe('new@c.us'); // Most recent
      expect(result.chats[1].id).toBe('middle@c.us'); // Middle
      expect(result.chats[2].id).toBe('old@c.us'); // Oldest
    });

    it('should filter out chats without last messages', async () => {
      const mockChats = [
        {
          id: { _serialized: 'with-msg@c.us' },
          name: 'With Message',
          isGroup: false,
          lastMessage: { timestamp: 1000, body: 'Hello' },
        },
        {
          id: { _serialized: 'no-msg@c.us' },
          name: 'No Message',
          isGroup: false,
          // No lastMessage property
        },
      ];

      mockImporter.connect.mockResolvedValue({ connected: true });
      mockClient.getChats.mockResolvedValue(mockChats);

      const result = await listCommand.execute({ format: 'json' });

      expect(result.success).toBe(true);
      expect(result.chats).toHaveLength(1);
      expect(result.chats[0].id).toBe('with-msg@c.us');
    });

    it('should handle connection errors', async () => {
      mockImporter.connect.mockRejectedValue(new Error('Connection failed'));

      // Mock console.error to capture error output
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation();

      await listCommand.execute({ format: 'json' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('WhatsApp connection failed')
      );
      expect(exitSpy).toHaveBeenCalledWith(13);

      consoleSpy.mockRestore();
      exitSpy.mockRestore();
    });

    it('should handle chat retrieval errors', async () => {
      mockImporter.connect.mockResolvedValue({ connected: true });
      mockClient.getChats.mockRejectedValue(new Error('Failed to get chats'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation();

      await listCommand.execute({ format: 'json' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to retrieve chats')
      );
      expect(exitSpy).toHaveBeenCalledWith(20);

      consoleSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });

  describe('_getMessagePreview', () => {
    it('should return message body when available', () => {
      const message = { body: 'Hello world', hasMedia: false };
      const preview = listCommand._getMessagePreview(message);
      expect(preview).toBe('Hello world');
    });

    it('should truncate long messages', () => {
      const longBody = 'A'.repeat(100);
      const message = { body: longBody, hasMedia: false };
      const preview = listCommand._getMessagePreview(message);
      expect(preview).toBe('A'.repeat(50) + '...');
      expect(preview).toHaveLength(53);
    });

    it('should return [Media] for media messages without text', () => {
      const message = { body: '', hasMedia: true };
      const preview = listCommand._getMessagePreview(message);
      expect(preview).toBe('[Media]');
    });

    it('should return [No content] for empty messages', () => {
      const message = { body: '', hasMedia: false };
      const preview = listCommand._getMessagePreview(message);
      expect(preview).toBe('[No content]');
    });
  });

  describe('_cleanup', () => {
    it('should disconnect importer if connected', async () => {
      listCommand.importer = mockImporter;

      await listCommand._cleanup();

      expect(mockImporter.disconnect).toHaveBeenCalledTimes(1);
      expect(listCommand.importer).toBeNull();
    });

    it('should handle disconnect errors gracefully', async () => {
      mockImporter.disconnect.mockRejectedValue(new Error('Disconnect failed'));
      listCommand.importer = mockImporter;

      // Should not throw
      await expect(listCommand._cleanup()).resolves.toBeUndefined();
      expect(listCommand.importer).toBeNull();
    });
  });

  describe('static create', () => {
    it('should create a new ListCommand instance', () => {
      const command = ListCommand.create();
      expect(command).toBeInstanceOf(ListCommand);
    });
  });
});

describe('ListCommandError', () => {
  it('should create error with message and code', () => {
    const error = new ListCommandError('Test error', 42);
    expect(error.message).toBe('Test error');
    expect(error.code).toBe(42);
    expect(error.path).toBeNull();
    expect(error.name).toBe('ListCommandError');
  });

  it('should create error with message, code, and path', () => {
    const error = new ListCommandError('Test error', 42, '/test/path');
    expect(error.message).toBe('Test error');
    expect(error.code).toBe(42);
    expect(error.path).toBe('/test/path');
    expect(error.name).toBe('ListCommandError');
  });
});

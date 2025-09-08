import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { LoginCommand } from '../../src/cli/commands/LoginCommand.js';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock whatsapp-web.js
jest.mock(
  'whatsapp-web.js',
  () => {
    const mockClient = {
      on: jest.fn(),
      initialize: jest.fn(),
      destroy: jest.fn(),
      info: {
        pushname: 'Test User',
        wid: { user: '1234567890' },
      },
      pupPage: null,
    };

    return {
      default: {
        Client: jest.fn(() => mockClient),
        LocalAuth: jest.fn(),
      },
    };
  },
  { virtual: true }
);

// Mock qrcode-terminal
jest.mock(
  'qrcode-terminal',
  () => ({
    generate: jest.fn(),
  }),
  { virtual: true }
);

const TEST_DIR = join(tmpdir(), 'login-command-unit-test');

describe('LoginCommand Unit Tests', () => {
  let testDir;
  let loginCommand;
  let originalConsoleLog;
  let originalConsoleError;
  let logs;
  let errors;

  beforeEach(() => {
    testDir = join(TEST_DIR, 'login-unit');
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);

    loginCommand = new LoginCommand();

    // Capture console output
    logs = [];
    errors = [];
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    console.log = jest.fn((...args) => logs.push(args.join(' ')));
    console.error = jest.fn((...args) => errors.push(args.join(' ')));
  });

  afterEach(() => {
    // Restore console
    console.log = originalConsoleLog;
    console.error = originalConsoleError;

    // Clean up
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      expect(loginCommand.config).toBeDefined();
      expect(loginCommand.client).toBeNull();
      expect(loginCommand.isAuthenticated).toBe(false);
    });
  });

  describe('_updateConfigFromOptions', () => {
    it('should update log level from options', () => {
      const options = { logLevel: 'debug' };
      loginCommand._updateConfigFromOptions(options);

      expect(loginCommand.config.logLevel).toBe('debug');
    });

    it('should not modify config if no relevant options provided', () => {
      const originalLevel = loginCommand.config.logLevel;
      const options = { someOtherOption: 'value' };

      loginCommand._updateConfigFromOptions(options);

      expect(loginCommand.config.logLevel).toBe(originalLevel);
    });
  });

  describe('_successResponse', () => {
    it('should generate proper success response with human format', () => {
      const result = {
        message: 'Test success',
        info: {
          pushname: 'Test User',
          wid: { user: '1234567890' },
        },
      };
      const startTime = Date.now() - 1000;
      const options = { format: 'human' };

      const response = loginCommand._successResponse(
        result,
        startTime,
        options
      );

      expect(response.success).toBe(true);
      expect(response.authenticated).toBe(true);
      expect(response.authPath).toBe('./.wwebjs_auth');
      expect(response.duration).toBeGreaterThanOrEqual(1000);
      expect(response.info).toEqual(result.info);
      expect(response.message).toBe('Test success');

      // Check console output
      expect(
        logs.some(log => log.includes('Login completed successfully'))
      ).toBe(true);
      expect(logs.some(log => log.includes('Test User (1234567890)'))).toBe(
        true
      );
    });

    it('should generate proper success response with JSON format', () => {
      const result = { message: 'Test success' };
      const startTime = Date.now() - 500;
      const options = { format: 'json' };

      const response = loginCommand._successResponse(
        result,
        startTime,
        options
      );

      expect(response.success).toBe(true);
      expect(response.duration).toBeGreaterThanOrEqual(500);

      // Should output JSON to console
      expect(logs.length).toBeGreaterThan(0);
      const jsonOutput = logs.find(log => {
        try {
          JSON.parse(log);
          return true;
        } catch {
          return false;
        }
      });
      expect(jsonOutput).toBeDefined();
    });
  });

  describe('_errorResponse', () => {
    it('should generate proper error response with human format', () => {
      const error = new Error('Test error message');
      const options = { format: 'human' };

      const response = loginCommand._errorResponse(error, options);

      expect(response.success).toBe(false);
      expect(response.authenticated).toBe(false);
      expect(response.error.code).toBe(1);
      expect(response.error.message).toBe('Test error message');

      // Check console output
      expect(
        errors.some(err => err.includes('Login failed: Test error message'))
      ).toBe(true);
      expect(errors.some(err => err.includes('Try the following'))).toBe(true);
    });

    it('should generate proper error response with JSON format', () => {
      const error = new Error('JSON test error');
      const options = { format: 'json' };

      const response = loginCommand._errorResponse(error, options);

      expect(response.success).toBe(false);
      expect(response.error.message).toBe('JSON test error');

      // Should output JSON to console
      expect(errors.length).toBeGreaterThan(0);
      const jsonOutput = errors.find(err => {
        try {
          JSON.parse(err);
          return true;
        } catch {
          return false;
        }
      });
      expect(jsonOutput).toBeDefined();
    });
  });

  describe('static create method', () => {
    it('should create new LoginCommand instance', () => {
      const command = LoginCommand.create();
      expect(command).toBeInstanceOf(LoginCommand);
      expect(command.config).toBeDefined();
    });
  });

  describe('_initializeClient', () => {
    it('should create WhatsApp client with proper configuration', async () => {
      await loginCommand._initializeClient();

      expect(loginCommand.client).toBeDefined();
      // Verify LocalAuth configuration would be called with correct parameters
      // Note: Full testing would require more complex mocking of whatsapp-web.js
    });
  });

  describe('error handling', () => {
    it('should handle client initialization errors gracefully', async () => {
      // Mock client initialization to throw error
      const mockClient = {
        on: jest.fn(),
        initialize: jest.fn().mockRejectedValue(new Error('Init failed')),
        destroy: jest.fn(),
      };

      loginCommand.client = mockClient;

      const result = await loginCommand._checkExistingAuth();

      expect(result.authenticated).toBe(false);
      expect(result.reason).toContain('Init failed');
    });

    it('should handle timeout scenarios', async () => {
      // Mock client that never emits ready event
      const mockClient = {
        on: jest.fn(),
        initialize: jest.fn().mockResolvedValue(),
        destroy: jest.fn(),
      };

      loginCommand.client = mockClient;

      // Use fake timers to speed up timeout
      jest.useFakeTimers();

      const authPromise = loginCommand._checkExistingAuth();

      // Fast forward past the timeout
      jest.advanceTimersByTime(11000);

      const result = await authPromise;

      expect(result.authenticated).toBe(false);
      expect(result.reason).toBe('timeout');

      jest.useRealTimers();
    });
  });
});

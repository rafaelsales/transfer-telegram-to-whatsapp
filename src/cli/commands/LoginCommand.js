import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import { CLIConfig } from '../../models/CLIConfig.js';

/**
 * LoginCommand - Implementation of the 'login' CLI command
 * Handles WhatsApp Web authentication and stores session in ./.wwebjs_auth
 */
export class LoginCommand {
  constructor() {
    this.config = CLIConfig.createDefault();
    this.client = null;
    this.isAuthenticated = false;
  }

  /**
   * Execute the login command
   */
  async execute(options = {}) {
    const startTime = Date.now();

    try {
      // Update configuration with options
      this._updateConfigFromOptions(options);

      // Output initial status
      if (options.format === 'human') {
        console.log('🔐 WhatsApp Authentication');
        console.log('📱 Connecting to WhatsApp Web...');
      }

      // Initialize WhatsApp client
      if (options.debug && options.format === 'human') {
        console.log(
          '🐛 Debug mode enabled - browser window will be visible with dev tools'
        );
      }
      await this._initializeClient(options);

      // Check if already authenticated
      const authStatus = await this._checkExistingAuth();

      if (authStatus.authenticated) {
        return this._successResponse(authStatus, startTime, options);
      }

      // Perform authentication flow
      const authResult = await this._performAuthFlow(options);

      if (authResult.success) {
        return this._successResponse(authResult, startTime, options);
      } else {
        return this._errorResponse(authResult.error, options);
      }
    } catch (error) {
      return this._errorResponse(error, options);
    }
  }

  /**
   * Initialize WhatsApp client with LocalAuth
   */
  async _initializeClient(options = {}) {
    const isDebugMode = options.debug || process.env.DEBUG === 'true';

    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: 'telegram-to-whatsapp',
        dataPath: './.wwebjs_auth',
      }),
      puppeteer: isDebugMode
        ? {
            executablePath:
              '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            headless: false, // Show browser window
            devtools: true, // Open dev tools automatically
            slowMo: 100, // Slow down operations for easier debugging
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-web-security', // For easier debugging
              '--disable-features=VizDisplayCompositor',
              '--start-maximized', // Start browser maximized
            ],
          }
        : {
            executablePath:
              '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            headless: true,
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-accelerated-2d-canvas',
              '--no-first-run',
              '--disable-extensions',
              '--disable-plugins',
              '--disable-background-timer-throttling',
              '--disable-backgrounding-occluded-windows',
              '--disable-renderer-backgrounding',
            ],
          },
    });

    // Set up event listeners
    this._setupEventListeners();
  }

  /**
   * Set up WhatsApp client event listeners
   */
  _setupEventListeners() {
    this.client.on('qr', qr => {
      console.log('\n📱 Scan the QR code below with your WhatsApp mobile app:');
      console.log('   1. Open WhatsApp on your phone');
      console.log('   2. Go to Settings > Linked Devices');
      console.log('   3. Tap "Link a Device"');
      console.log('   4. Scan this QR code:\n');

      qrcode.generate(qr, { small: true });

      console.log('\n⏳ Waiting for QR code to be scanned...');
    });

    this.client.on('authenticated', () => {
      console.log('✅ Authentication successful!');
      console.log('💾 Session saved to ./.wwebjs_auth');
      this.isAuthenticated = true;
    });

    this.client.on('auth_failure', message => {
      console.error('❌ Authentication failed:', message);
      this.isAuthenticated = false;
    });

    this.client.on('ready', () => {
      console.log('✅ WhatsApp client is ready!');
      const info = this.client.info;
      if (info) {
        console.log(`📞 Connected as: ${info.pushname} (${info.wid.user})`);
      }
    });

    this.client.on('disconnected', reason => {
      console.log('🔌 WhatsApp client disconnected:', reason);
      this.isAuthenticated = false;
    });
  }

  /**
   * Check if there's an existing valid authentication
   */
  async _checkExistingAuth() {
    return new Promise(async resolve => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({ authenticated: false, reason: 'timeout' });
        }
      }, 10000);

      this.client.on('ready', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({
            authenticated: true,
            info: this.client.info,
            message: 'Already authenticated with existing session',
          });
        }
      });

      this.client.on('auth_failure', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({ authenticated: false, reason: 'auth_failure' });
        }
      });

      try {
        await this.client.initialize();
      } catch (error) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({ authenticated: false, reason: error.message });
        }
      }
    });
  }

  /**
   * Perform the authentication flow with QR code
   */
  async _performAuthFlow(options) {
    return new Promise(resolve => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.client.destroy();
          resolve({
            success: false,
            error: new Error('Authentication timeout after 5 minutes'),
          });
        }
      }, 300000); // 5 minutes timeout

      this.client.on('ready', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({
            success: true,
            info: this.client.info,
            message: 'Successfully authenticated via QR code',
          });
        }
      });

      this.client.on('auth_failure', message => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          this.client.destroy();
          resolve({
            success: false,
            error: new Error(`Authentication failed: ${message}`),
          });
        }
      });

      // If not already initialized, initialize now
      if (!this.client.pupPage) {
        this.client.initialize().catch(error => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve({
              success: false,
              error: new Error(`Failed to initialize client: ${error.message}`),
            });
          }
        });
      }
    });
  }

  /**
   * Update configuration from command options
   */
  _updateConfigFromOptions(options) {
    if (options.logLevel) {
      this.config.logLevel = options.logLevel;
    }
  }

  /**
   * Generate success response
   */
  _successResponse(result, startTime, options) {
    const duration = Date.now() - startTime;
    const response = {
      success: true,
      authenticated: true,
      authPath: './.wwebjs_auth',
      duration,
      info: result.info || null,
      message: result.message || 'Authentication successful',
    };

    if (options.format === 'human') {
      console.log(`\n✅ Login completed successfully in ${duration}ms`);
      if (result.info) {
        console.log(
          `📞 Account: ${result.info.pushname} (${result.info.wid.user})`
        );
      }
      console.log(`💾 Session stored in: ${response.authPath}`);
      console.log(
        '\n🎉 You can now use the execute command to import messages!'
      );
    } else {
      console.log(JSON.stringify(response, null, 2));
    }

    // Clean up client
    if (this.client) {
      this.client.destroy();
    }

    return response;
  }

  /**
   * Generate error response
   */
  _errorResponse(error, options) {
    const response = {
      success: false,
      authenticated: false,
      error: {
        code: 1,
        message: error.message,
      },
    };

    if (options.format === 'human') {
      console.error('❌ Login failed:', error.message);
      console.error('\n💡 Try the following:');
      console.error('   • Make sure WhatsApp Web is not open in your browser');
      console.error('   • Check your internet connection');
      console.error(
        '   • Ensure your phone has WhatsApp installed and connected'
      );
    } else {
      console.error(JSON.stringify(response, null, 2));
    }

    // Clean up client
    if (this.client) {
      this.client.destroy();
    }

    return response;
  }

  /**
   * Static factory method
   */
  static create() {
    return new LoginCommand();
  }
}

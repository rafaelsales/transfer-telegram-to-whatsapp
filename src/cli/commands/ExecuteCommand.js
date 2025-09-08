import { resolve, join } from 'path';
import { existsSync } from 'fs';
import { WhatsAppImporter } from '../../services/WhatsAppImporter.js';
import { ProgressTracker } from '../../services/ProgressTracker.js';
import { ImportPlan } from '../../models/ImportPlan.js';
import { CLIConfig } from '../../models/CLIConfig.js';
import { FileUtils } from '../../lib/FileUtils.js';

/**
 * ExecuteCommand - Implementation of the 'execute' CLI command
 * Executes WhatsApp import plans with progress tracking and resume capability
 */
export class ExecuteCommand {
  constructor() {
    this.config = CLIConfig.createDefault();
    this.importer = null;
    this.progressTracker = null;
    this.isRunning = false;
    this.isPaused = false;
  }

  /**
   * Execute the import command
   */
  async execute(importPlanPath, options = {}) {
    const startTime = Date.now();

    try {
      // Validate and resolve paths
      const paths = this._validateAndResolvePaths(importPlanPath);

      // Update configuration with options
      this._updateConfigFromOptions(options);

      // Validate required options
      this._validateRequiredOptions(options);

      // Output initial status
      if (options.format === 'human') {
        console.log('🚀 Starting WhatsApp import execution...');
        console.log(`📁 Import plan: ${paths.planPath}`);
        console.log(`💬 Target chat: ${options.targetChat}`);
        if (options.dryRun) {
          console.log('🧪 DRY RUN MODE - No messages will actually be sent');
        }
      }

      // Load import plan
      const plan = await this._loadImportPlan(paths.planPath);

      // Initialize progress tracking
      await this._initializeProgressTracking(
        paths.outputPath,
        paths.planPath,
        plan,
        options
      );

      // Initialize WhatsApp importer
      this.importer = new WhatsAppImporter(this.config, options);

      // Connect to WhatsApp (unless dry run)
      if (!options.dryRun) {
        if (options.debug && options.format === 'human') {
          console.log(
            '🐛 Debug mode enabled - browser window will be visible with dev tools'
          );
        }
        await this._connectToWhatsApp(options);
      } else {
        // Setup progress monitoring for dry run too
        this._setupProgressMonitoring(options);
      }

      // Execute the import
      const result = await this._executeImport(plan, options);

      // Check if import failed and stop execution immediately
      if (result.status === 'failed') {
        throw new ExecuteCommandError(
          `Import failed: ${result.errors[0]?.error || 'Unknown error'}`,
          15,
          null
        );
      }

      // Output results
      this._outputResults(result, options, Date.now() - startTime);

      // Cleanup
      await this._cleanup();

      return { success: true, result, outputPath: paths.outputPath };
    } catch (error) {
      await this._cleanup();
      return this._handleError(error, options);
    }
  }

  /**
   * Validate and resolve file paths
   */
  _validateAndResolvePaths(planPath) {
    const resolvedPlanPath = resolve(planPath);

    // Check if plan path exists
    if (!existsSync(resolvedPlanPath)) {
      throw new ExecuteCommandError(
        'Import plan folder not found',
        10,
        resolvedPlanPath
      );
    }

    // Check if it's a directory
    const pathStats = FileUtils.statSync(resolvedPlanPath);
    if (!pathStats.isDirectory) {
      throw new ExecuteCommandError(
        'Import plan path must be a directory',
        10,
        resolvedPlanPath
      );
    }

    // Check if import-plan.json exists
    const planFilePath = join(resolvedPlanPath, 'import-plan.json');
    if (!existsSync(planFilePath)) {
      throw new ExecuteCommandError(
        'import-plan.json not found in folder',
        10,
        planFilePath
      );
    }

    return {
      planPath: planFilePath,
      outputPath: resolvedPlanPath,
    };
  }

  /**
   * Update configuration from command options
   */
  _updateConfigFromOptions(options) {
    const configOverrides = {};

    if (options.sleep) {
      try {
        configOverrides.sleepRange = CLIConfig.parseSleepRange(options.sleep);
      } catch (error) {
        throw new ExecuteCommandError(
          `Invalid sleep range format: ${error.message}`,
          16,
          options.sleep
        );
      }
    }

    if (options.maxRetries) {
      configOverrides.maxRetries = parseInt(options.maxRetries);
    }

    if (Object.keys(configOverrides).length > 0) {
      this.config = this.config.merge(configOverrides);
    }
  }

  /**
   * Validate required command options
   */
  _validateRequiredOptions(options) {
    if (!options.targetChat) {
      throw new ExecuteCommandError(
        'Target chat ID is required (--target-chat)',
        16,
        null
      );
    }

    // Validate target chat format (basic WhatsApp ID validation)
    if (!this._isValidWhatsAppId(options.targetChat)) {
      throw new ExecuteCommandError(
        'Invalid target chat ID format',
        16,
        options.targetChat
      );
    }

    // Validate sleep range if provided
    if (options.sleep) {
      try {
        CLIConfig.parseSleepRange(options.sleep);
      } catch (error) {
        throw new ExecuteCommandError(
          `Invalid sleep range format: ${error.message}`,
          16,
          options.sleep
        );
      }
    }
  }

  /**
   * Validate WhatsApp ID format
   */
  _isValidWhatsAppId(chatId) {
    // Basic validation for WhatsApp chat IDs
    return /^[\w.-]+@(c|g)\.us$/.test(chatId);
  }

  /**
   * Load and validate import plan
   */
  async _loadImportPlan(planPath) {
    try {
      const planData = await FileUtils.readJSON(planPath);
      ImportPlan.validate(planData);
      return ImportPlan.fromData(planData);
    } catch (error) {
      if (error.message.includes('not found')) {
        throw new ExecuteCommandError(
          'Import plan file not found',
          10,
          planPath
        );
      } else if (error.message.includes('validation failed')) {
        throw new ExecuteCommandError(
          'Invalid import plan format',
          11,
          planPath
        );
      } else {
        throw new ExecuteCommandError(
          `Failed to load import plan: ${error.message}`,
          11,
          planPath
        );
      }
    }
  }

  /**
   * Initialize progress tracking
   */
  async _initializeProgressTracking(outputPath, planPath, plan, options) {
    try {
      if (
        FileUtils.exists(join(outputPath, 'progress.json'))
      ) {
        this.progressTracker = await ProgressTracker.load(outputPath, planPath);

        // Sync plan messages with progress tracker status
        this._syncPlanWithProgress(plan);

        if (options.format === 'human') {
          const summary = this.progressTracker.getProgressSummary();
          console.log(
            `📊 Resuming import - ${summary.successfulMessages}/${summary.totalMessages} messages completed`
          );
        }
      } else {
        this.progressTracker = await ProgressTracker.create(
          outputPath,
          planPath,
          plan.getMessageCount()
        );

        if (options.format === 'human') {
          console.log(
            `📊 Starting new import - ${plan.getMessageCount()} messages to process`
          );
        }
      }
    } catch (error) {
      throw new ExecuteCommandError(
        `Failed to initialize progress tracking: ${error.message}`,
        12,
        outputPath
      );
    }
  }

  /**
   * Connect to WhatsApp
   */
  async _connectToWhatsApp(options) {
    try {
      // Setup progress monitoring
      this._setupProgressMonitoring(options);

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
      throw new ExecuteCommandError(
        `WhatsApp connection failed: ${error.message}`,
        13,
        null
      );
    }
  }

  /**
   * Sync plan messages with progress tracker status
   */
  _syncPlanWithProgress(plan) {
    if (!this.progressTracker) return;

    // Update plan message statuses based on progress records
    for (const message of plan.messages) {
      if (this.progressTracker.isMessageSuccessful(message.id)) {
        // Must go through processing state first
        message.markAsProcessing();
        message.markAsSent();
      } else if (this.progressTracker.isMessageFailed(message.id)) {
        // Must go through processing state first
        message.markAsProcessing();
        message.markAsFailed('Previous attempt failed');
      }
      // Otherwise leave as 'pending'
    }
  }

  /**
   * Setup progress monitoring
   */
  _setupProgressMonitoring(options) {
    if (options.format === 'human') {
      this.importer.on('progress', progress => {
        const bar = this._createProgressBar(progress.percentage);
        const status = `${bar} ${progress.current}/${progress.total} (${progress.percentage}%) - ✅ ${progress.successful} ❌ ${progress.failed}`;
        process.stdout.write(`\r📤 Importing messages: ${status}`);
      });

      this.importer.on('paused', () => {
        console.log('\n⏸️  Import paused');
      });

      this.importer.on('resumed', () => {
        console.log('▶️  Import resumed');
      });
    }
  }

  /**
   * Create progress bar for console output
   */
  _createProgressBar(percentage) {
    const width = 20;
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
  }

  /**
   * Execute the import
   */
  async _executeImport(plan, options) {
    try {
      this.isRunning = true;

      // Check if we should automatically resume
      const shouldResume = options.resume || 
        (this.progressTracker && this.progressTracker.getProgressSummary().processedMessages > 0);

      const importOptions = {
        dryRun: options.dryRun || false,
        resume: shouldResume,
        maxRetries: this.config.maxRetries,
      };

      // Update plan with target chat
      for (const message of plan.messages) {
        message.chatId = options.targetChat;
      }

      if (options.format === 'human' && !options.dryRun) {
        console.log('\n📤 Starting message import...');
      }

      const result = await this.importer.executeImport(
        plan,
        this.progressTracker,
        importOptions
      );

      this.isRunning = false;

      if (options.format === 'human') {
        console.log(); // New line after progress bar
      }

      return result;
    } catch (error) {
      this.isRunning = false;
      throw new ExecuteCommandError(
        `Import execution failed: ${error.message}`,
        14,
        null
      );
    }
  }

  /**
   * Output results based on format
   */
  _outputResults(result, options, duration) {
    if (options.format === 'json') {
      this._outputJSON(result, duration);
    } else {
      this._outputHuman(result, duration, options);
    }
  }

  /**
   * Output results in JSON format
   */
  _outputJSON(result, duration) {
    const progressSummary = this.progressTracker
      ? this.progressTracker.getProgressSummary()
      : {};
    const statistics = this.progressTracker
      ? this.progressTracker.getStatistics()
      : {};

    const output = {
      success: true,
      status: result.status,
      execution: {
        duration,
        totalMessages: result.totalMessages,
        processedMessages: result.processedMessages,
        successfulMessages: result.successfulMessages,
        failedMessages: result.failedMessages,
        skippedMessages: result.skippedMessages,
      },
      progress: progressSummary,
      statistics,
    };

    console.log(JSON.stringify(output, null, 2));
  }

  /**
   * Output results in human-readable format
   */
  _outputHuman(result, duration, options) {
    console.log('\n✅ Import execution completed!\n');

    console.log('📊 Results:');
    console.log(`   Status: ${result.status}`);
    console.log(`   Total messages: ${result.totalMessages.toLocaleString()}`);
    console.log(`   Processed: ${result.processedMessages.toLocaleString()}`);
    console.log(`   Successful: ${result.successfulMessages.toLocaleString()}`);
    console.log(`   Failed: ${result.failedMessages.toLocaleString()}`);
    console.log(`   Skipped: ${result.skippedMessages.toLocaleString()}`);

    if (result.failedMessages > 0) {
      console.log('\n⚠️  Some messages failed to send:');
      const statistics = this.progressTracker.getStatistics();
      if (statistics.errorSummary.length > 0) {
        for (const error of statistics.errorSummary.slice(0, 3)) {
          console.log(`   ${error.error}: ${error.count} messages`);
        }
      }
      console.log('\nSee progress.jsonl for detailed error information.');

      if (statistics.retryable > 0) {
        console.log(
          `\n🔄 ${statistics.retryable} messages can be retried using --resume option.`
        );
      }
    }

    const successRate =
      result.totalMessages > 0
        ? Math.round((result.successfulMessages / result.totalMessages) * 100)
        : 0;
    console.log(`\n📈 Success rate: ${successRate}%`);
    console.log(`⏱️  Completed in ${(duration / 1000).toFixed(2)} seconds`);

    if (options.dryRun) {
      console.log('\n🧪 This was a dry run - no messages were actually sent.');
    }
  }

  /**
   * Pause execution
   */
  pause() {
    if (this.isRunning && this.importer) {
      this.importer.pause();
      this.isPaused = true;
    }
  }

  /**
   * Resume execution
   */
  resume() {
    if (this.isPaused && this.importer) {
      this.importer.resume();
      this.isPaused = false;
    }
  }

  /**
   * Stop execution
   */
  async stop() {
    if (this.isRunning && this.importer) {
      await this.importer.stop();
      this.isRunning = false;
    }
  }

  /**
   * Cleanup resources
   */
  async _cleanup() {
    try {
      if (this.importer) {
        await this.importer.disconnect();
        this.importer = null;
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  /**
   * Handle and format errors
   */
  _handleError(error, options) {
    if (error instanceof ExecuteCommandError) {
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
      case 10:
        console.error(
          '\n💡 Make sure you run the plan command first to generate import-plan.json'
        );
        break;
      case 11:
        console.error(
          '\n💡 The import plan may be corrupted. Try regenerating it with the plan command.'
        );
        break;
      case 13:
        console.error(
          '\n💡 Make sure WhatsApp Web is not open in your browser and try again.'
        );
        break;
      case 16:
        console.error(
          '\n💡 Target chat ID should be in format: number@c.us (contact) or groupid@g.us (group)'
        );
        break;
    }
  }

  /**
   * Static factory method
   */
  static create() {
    return new ExecuteCommand();
  }
}

/**
 * Custom error class for execute command errors
 */
export class ExecuteCommandError extends Error {
  constructor(message, code, path = null) {
    super(message);
    this.name = 'ExecuteCommandError';
    this.code = code;
    this.path = path;
  }
}

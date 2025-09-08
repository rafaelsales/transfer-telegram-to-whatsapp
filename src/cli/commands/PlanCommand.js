import { resolve, join } from 'path';
import { existsSync } from 'fs';
import { TelegramParser } from '../../services/TelegramParser.js';
import { PlanGenerator } from '../../services/PlanGenerator.js';
import { CLIConfig } from '../../models/CLIConfig.js';
import { FileUtils } from '../../lib/FileUtils.js';

/**
 * PlanCommand - Implementation of the 'plan' CLI command
 * Generates WhatsApp import plans from Telegram exports
 */
export class PlanCommand {
  constructor() {
    this.config = CLIConfig.createDefault();
  }

  /**
   * Execute the plan command
   */
  async execute(telegramExportPath, options = {}) {
    const startTime = Date.now();

    try {
      // Validate and resolve paths
      const paths = this._validateAndResolvePaths(
        telegramExportPath,
        options.output
      );

      // Update configuration with options
      this._updateConfigFromOptions(options);

      // Output initial status
      if (options.format === 'human') {
        console.log('🚀 Generating WhatsApp import plan...');
        console.log(`📁 Source: ${paths.exportPath}`);
        console.log(`📁 Output: ${paths.outputPath}`);
      }

      // Validate Telegram export
      await this._validateTelegramExport(paths.exportPath);

      // Generate plan
      const result = await this._generateImportPlan(
        paths.exportPath,
        paths.outputPath,
        options
      );

      // Save plan files
      await this._savePlanFiles(result.plan, paths.outputPath, options);

      // Output results
      this._outputResults(result, options, Date.now() - startTime);

      return { success: true, plan: result.plan, outputPath: paths.outputPath };
    } catch (error) {
      return this._handleError(error, options);
    }
  }

  /**
   * Validate and resolve file paths
   */
  _validateAndResolvePaths(exportPath, outputPath) {
    const resolvedExportPath = resolve(exportPath);

    // Check if export path exists
    if (!existsSync(resolvedExportPath)) {
      throw new PlanCommandError(
        'Export folder not found',
        1,
        resolvedExportPath
      );
    }

    // Check if export path is a directory
    const exportStats = FileUtils.statSync(resolvedExportPath);
    if (!exportStats.isDirectory) {
      throw new PlanCommandError(
        'Export path must be a directory',
        1,
        resolvedExportPath
      );
    }

    // Determine output path
    let resolvedOutputPath;
    if (outputPath) {
      resolvedOutputPath = resolve(outputPath);
    } else {
      // Default: create output directory next to export
      const exportName = resolvedExportPath.split('/').pop();
      resolvedOutputPath = join(
        resolvedExportPath,
        '..',
        `${exportName}-WhatsAppImport`
      );
    }

    return {
      exportPath: resolvedExportPath,
      outputPath: resolvedOutputPath,
    };
  }

  /**
   * Update configuration from command options
   */
  _updateConfigFromOptions(options) {
    const configOverrides = {};

    if (options.maxFileSize) {
      configOverrides.maxFileSize = parseInt(options.maxFileSize);
    }

    if (options.sleepRange) {
      configOverrides.sleepRange = CLIConfig.parseSleepRange(
        options.sleepRange
      );
    }

    if (Object.keys(configOverrides).length > 0) {
      this.config = this.config.merge(configOverrides);
    }
  }

  /**
   * Validate Telegram export structure
   */
  async _validateTelegramExport(exportPath) {
    try {
      const validation = await TelegramParser.validateExport(exportPath);

      if (validation.messageCount === 0) {
        throw new PlanCommandError(
          'Telegram export contains no messages',
          3,
          exportPath
        );
      }

      return validation;
    } catch (error) {
      if (error.message.includes('result.json not found')) {
        throw new PlanCommandError(
          'result.json not found in export folder',
          2,
          exportPath
        );
      } else if (error.message.includes('invalid structure')) {
        throw new PlanCommandError(
          'result.json has invalid format',
          3,
          exportPath
        );
      } else {
        throw new PlanCommandError(
          `Export validation failed: ${error.message}`,
          3,
          exportPath
        );
      }
    }
  }

  /**
   * Generate the import plan
   */
  async _generateImportPlan(exportPath, outputPath, options) {
    const planOptions = {
      validateMedia: options.validateMedia,
      skipLargeFiles: options.skipLargeFiles,
      targetChatId: options.targetChat || 'unknown@c.us',
      config: this.config,
    };

    try {
      const generator = new PlanGenerator(this.config);
      return await generator.generatePlan(exportPath, outputPath, planOptions);
    } catch (error) {
      if (error.message.includes('Media file not found')) {
        throw new PlanCommandError(
          'Media validation failed: files missing',
          5,
          exportPath
        );
      } else if (error.message.includes('missing required fields')) {
        throw new PlanCommandError(
          'result.json missing required fields',
          3,
          exportPath
        );
      } else {
        throw new PlanCommandError(
          `Plan generation failed: ${error.message}`,
          4,
          exportPath
        );
      }
    }
  }

  /**
   * Save plan files to output directory
   */
  async _savePlanFiles(plan, outputPath, options) {
    try {
      // Ensure output directory exists
      await FileUtils.ensureDir(outputPath);

      // Save main import plan
      const planPath = join(outputPath, 'import-plan.json');
      await FileUtils.writeJSON(planPath, plan.toJSON(), {
        indent: options.format === 'human' ? 2 : 0,
      });

      // Save skipped messages separately for easier review
      if (plan.skippedMessages.length > 0) {
        const skippedPath = join(outputPath, 'skipped-messages.json');
        await FileUtils.writeJSON(skippedPath, plan.skippedMessages, {
          indent: 2,
        });
      }

      return {
        planPath,
        skippedPath:
          plan.skippedMessages.length > 0
            ? join(outputPath, 'skipped-messages.json')
            : null,
      };
    } catch (error) {
      throw new PlanCommandError(
        `Failed to save plan files: ${error.message}`,
        6,
        outputPath
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
      this._outputHuman(result, duration);
    }
  }

  /**
   * Output results in JSON format
   */
  _outputJSON(result, duration) {
    const output = {
      success: true,
      statistics: {
        totalMessages: result.plan.metadata.totalMessages,
        supportedMessages: result.plan.metadata.supportedMessages,
        skippedMessages: result.plan.metadata.skippedMessages,
        mediaFiles: result.plan.metadata.mediaFiles,
        generationTime: duration,
      },
      plan: {
        version: result.plan.version,
        outputPath: result.plan.metadata.outputPath,
        messageTypes: result.plan.statistics.messageTypes,
        mediaTypes: result.plan.statistics.mediaTypes,
      },
    };

    console.log(JSON.stringify(output, null, 2));
  }

  /**
   * Output results in human-readable format
   */
  _outputHuman(result, duration) {
    console.log('\n✅ Import plan generated successfully!\n');

    console.log('📊 Summary:');
    console.log(
      `   Total messages: ${result.plan.metadata.totalMessages.toLocaleString()}`
    );
    console.log(
      `   Supported messages: ${result.plan.metadata.supportedMessages.toLocaleString()}`
    );
    console.log(
      `   Skipped messages: ${result.plan.metadata.skippedMessages.toLocaleString()}`
    );
    console.log(
      `   Media files: ${result.plan.metadata.mediaFiles.toLocaleString()}`
    );

    if (result.plan.metadata.skippedMessages > 0) {
      console.log('\n⚠️  Some messages were skipped:');
      const skipReasons = {};
      for (const skipped of result.plan.skippedMessages) {
        skipReasons[skipped.reason] = (skipReasons[skipped.reason] || 0) + 1;
      }

      for (const [reason, count] of Object.entries(skipReasons)) {
        console.log(`   ${reason}: ${count} messages`);
      }
      console.log('\nSee skipped-messages.json for details.');
    }

    console.log('\n📁 Output files:');
    console.log(
      `   Import plan: ${join(result.plan.metadata.outputPath, 'import-plan.json')}`
    );
    if (result.plan.metadata.skippedMessages > 0) {
      console.log(
        `   Skipped messages: ${join(result.plan.metadata.outputPath, 'skipped-messages.json')}`
      );
    }

    console.log(`\n⏱️  Generated in ${(duration / 1000).toFixed(2)} seconds`);
    console.log(
      '\n🚀 Ready for import! Use the execute command to start the WhatsApp import.'
    );
  }

  /**
   * Handle and format errors
   */
  _handleError(error, options) {
    if (error instanceof PlanCommandError) {
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
   * Static factory method
   */
  static create() {
    return new PlanCommand();
  }
}

/**
 * Custom error class for plan command errors
 */
export class PlanCommandError extends Error {
  constructor(message, code, path = null) {
    super(message);
    this.name = 'PlanCommandError';
    this.code = code;
    this.path = path;
  }
}

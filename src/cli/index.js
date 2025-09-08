#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PlanCommand } from './commands/PlanCommand.js';
import { ExecuteCommand } from './commands/ExecuteCommand.js';
import { LoginCommand } from './commands/LoginCommand.js';
import { ListCommand } from './commands/ListCommand.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf8')
);

const program = new Command();

program
  .name('telegram-to-whatsapp')
  .description('CLI tool for importing Telegram chat exports to WhatsApp')
  .version(packageJson.version)
  .option('--format <format>', 'Output format (json|human)', 'human')
  .option('--log-level <level>', 'Log level (error|warn|info|debug)', 'info')
  .option(
    '--debug',
    'Enable debug mode (show browser window with dev tools)',
    false
  );

program
  .command('plan')
  .description('Parse Telegram export and generate WhatsApp import plan')
  .argument(
    '<telegram-export-path>',
    'Path to Telegram export folder containing result.json'
  )
  .option('-o, --output <path>', 'Custom output folder path')
  .option('--validate-media', 'Validate all media files exist', false)
  .option(
    '--skip-large-files',
    'Skip files exceeding size limits instead of failing',
    false
  )
  .action(async (telegramExportPath, options, command) => {
    try {
      const globalOptions = command.parent.opts();
      const allOptions = { ...globalOptions, ...options };

      const planCommand = PlanCommand.create();
      const result = await planCommand.execute(telegramExportPath, allOptions);

      if (result.success) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(99);
    }
  });

program
  .command('execute')
  .description('Execute WhatsApp import from generated plan')
  .argument('<import-plan-path>', 'Path to folder containing import-plan.json')
  .option('--sleep <range>', 'Sleep range between messages in seconds', '3-10')
  .option('--dry-run', 'Validate plan without sending messages', false)
  .option(
    '--resume',
    'Force resume from last progress (automatically detects existing progress)',
    false
  )
  .requiredOption(
    '--target-chat <chat-id>',
    'WhatsApp chat ID to import messages to'
  )
  .action(async (importPlanPath, options, command) => {
    try {
      const globalOptions = command.parent.opts();
      const allOptions = { ...globalOptions, ...options };

      const executeCommand = ExecuteCommand.create();
      const result = await executeCommand.execute(importPlanPath, allOptions);

      if (result.success) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(99);
    }
  });

program
  .command('login')
  .description('Authenticate with WhatsApp Web and store session')
  .action(async (options, command) => {
    try {
      const globalOptions = command.parent.opts();
      const allOptions = { ...globalOptions, ...options };

      const loginCommand = LoginCommand.create();
      const result = await loginCommand.execute(allOptions);

      if (result.success) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(99);
    }
  });

program
  .command('list')
  .description('List recent WhatsApp chats with their names and IDs')
  .option('--limit <number>', 'Maximum number of chats to display', '100')
  .action(async (options, command) => {
    try {
      const globalOptions = command.parent.opts();
      const allOptions = { ...globalOptions, ...options };

      // Convert limit to number
      if (allOptions.limit) {
        allOptions.limit = parseInt(allOptions.limit);
        if (isNaN(allOptions.limit) || allOptions.limit < 1) {
          console.error('Error: --limit must be a positive number');
          process.exit(16);
        }
      }

      const listCommand = ListCommand.create();
      const result = await listCommand.execute(allOptions);

      if (result.success) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(99);
    }
  });

program.parse();

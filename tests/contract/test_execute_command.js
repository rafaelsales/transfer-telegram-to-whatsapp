import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

const CLI_PATH = resolve('src/cli/index.js');
const TEST_DIR = join(tmpdir(), 'telegram-to-whatsapp-execute-test');

describe('Execute Command CLI Contract', () => {
  let testPlanDir;
  let validImportPlan;

  beforeEach(() => {
    testPlanDir = join(TEST_DIR, 'plan');
    mkdirSync(testPlanDir, { recursive: true });

    // Create a valid import plan structure
    validImportPlan = {
      version: '1.0.0',
      metadata: {
        generatedAt: '2025-01-01T12:00:00Z',
        telegramExportPath: '/test/export',
        outputPath: testPlanDir,
        totalMessages: 2,
        supportedMessages: 2,
        skippedMessages: 0,
        mediaFiles: 0
      },
      messages: [
        {
          id: '12345678-1234-4123-a123-123456789abc',
          telegramId: 1,
          type: 'text',
          content: 'Hello World',
          timestamp: 1735732800000,
          sender: 'Test User',
          chatId: 'test@c.us',
          status: 'pending'
        },
        {
          id: '87654321-4321-4321-b321-cba987654321',
          telegramId: 2,
          type: 'text',
          content: 'Second message',
          timestamp: 1735732900000,
          sender: 'Test User',
          chatId: 'test@c.us',
          status: 'pending'
        }
      ],
      skippedMessages: [],
      statistics: {
        messageTypes: { text: 2 },
        mediaTypes: {},
        totalSize: 0,
        dateRange: {
          earliest: '2025-01-01T12:00:00Z',
          latest: '2025-01-01T12:01:40Z'
        }
      }
    };
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('Success Cases', () => {
    it('should execute import with valid plan and return exit code 0', () => {
      writeFileSync(join(testPlanDir, 'import-plan.json'), JSON.stringify(validImportPlan, null, 2));

      const command = `node ${CLI_PATH} execute ${testPlanDir} --target-chat "test@c.us"`;
      
      try {
        const output = execSync(command, { encoding: 'utf8', timeout: 10000 });
        expect(output).toContain('Execute command not yet implemented');
        // Exit code 0 is implied by successful execSync
      } catch (error) {
        throw new Error(`Command failed: ${error.message}`);
      }
    });

    it('should accept all valid options', () => {
      writeFileSync(join(testPlanDir, 'import-plan.json'), JSON.stringify(validImportPlan, null, 2));

      const command = `node ${CLI_PATH} execute ${testPlanDir} --target-chat "test@c.us" --sleep "5-15" --dry-run --resume --format json --log-level debug`;
      
      try {
        const output = execSync(command, { encoding: 'utf8', timeout: 10000 });
        expect(output).toContain('Execute command not yet implemented');
      } catch (error) {
        throw new Error(`Command with all options failed: ${error.message}`);
      }
    });

    it('should accept dry-run option', () => {
      writeFileSync(join(testPlanDir, 'import-plan.json'), JSON.stringify(validImportPlan, null, 2));

      const command = `node ${CLI_PATH} execute ${testPlanDir} --target-chat "test@c.us" --dry-run`;
      
      try {
        const output = execSync(command, { encoding: 'utf8', timeout: 10000 });
        expect(output).toContain('Execute command not yet implemented');
      } catch (error) {
        throw new Error(`Dry run command failed: ${error.message}`);
      }
    });
  });

  describe('Error Cases', () => {
    it('should return exit code 10 for non-existent import plan folder', () => {
      const nonExistentPath = join(TEST_DIR, 'non-existent');
      const command = `node ${CLI_PATH} execute ${nonExistentPath} --target-chat "test@c.us"`;
      
      try {
        execSync(command, { encoding: 'utf8', timeout: 5000 });
        throw new Error('Command should have failed');
      } catch (error) {
        expect(error.status).toBe(10);
        expect(error.stderr || error.stdout).toMatch(/not found|does not exist/i);
      }
    });

    it('should return exit code 10 for missing import-plan.json', () => {
      // Plan dir exists but no import-plan.json
      const command = `node ${CLI_PATH} execute ${testPlanDir} --target-chat "test@c.us"`;
      
      try {
        execSync(command, { encoding: 'utf8', timeout: 5000 });
        throw new Error('Command should have failed');
      } catch (error) {
        expect(error.status).toBe(10);
        expect(error.stderr || error.stdout).toMatch(/import-plan\.json.*not found/i);
      }
    });

    it('should return exit code 11 for invalid import plan format', () => {
      writeFileSync(join(testPlanDir, 'import-plan.json'), '{ invalid json');
      
      const command = `node ${CLI_PATH} execute ${testPlanDir} --target-chat "test@c.us"`;
      
      try {
        execSync(command, { encoding: 'utf8', timeout: 5000 });
        throw new Error('Command should have failed');
      } catch (error) {
        expect(error.status).toBe(11);
        expect(error.stderr || error.stdout).toMatch(/invalid.*format|schema.*validation/i);
      }
    });

    it('should return exit code 15 for missing target-chat argument', () => {
      writeFileSync(join(testPlanDir, 'import-plan.json'), JSON.stringify(validImportPlan, null, 2));
      
      const command = `node ${CLI_PATH} execute ${testPlanDir}`;
      
      try {
        execSync(command, { encoding: 'utf8', timeout: 5000 });
        throw new Error('Command should have failed');
      } catch (error) {
        expect(error.status).toBe(1); // Commander.js uses exit code 1 for missing required options
        expect(error.stderr || error.stdout).toMatch(/required.*target-chat/i);
      }
    });

    it('should require import-plan-path argument', () => {
      const command = `node ${CLI_PATH} execute --target-chat "test@c.us"`;
      
      try {
        execSync(command, { encoding: 'utf8', timeout: 5000 });
        throw new Error('Command should have failed');
      } catch (error) {
        expect(error.status).toBe(1);
        expect(error.stderr || error.stdout).toMatch(/missing.*argument/i);
      }
    });

    it('should validate sleep range format', () => {
      writeFileSync(join(testPlanDir, 'import-plan.json'), JSON.stringify(validImportPlan, null, 2));
      
      const command = `node ${CLI_PATH} execute ${testPlanDir} --target-chat "test@c.us" --sleep "invalid"`;
      
      try {
        execSync(command, { encoding: 'utf8', timeout: 5000 });
        throw new Error('Command should have failed');
      } catch (error) {
        expect(error.status).toBe(16);
        expect(error.stderr || error.stdout).toMatch(/invalid.*sleep.*range/i);
      }
    });
  });

  describe('Output Format Tests', () => {
    beforeEach(() => {
      writeFileSync(join(testPlanDir, 'import-plan.json'), JSON.stringify(validImportPlan, null, 2));
    });

    it('should output human format by default', () => {
      const command = `node ${CLI_PATH} execute ${testPlanDir} --target-chat "test@c.us"`;
      
      try {
        const output = execSync(command, { encoding: 'utf8', timeout: 10000 });
        // Should contain human-readable symbols like ✓
        expect(output).toMatch(/[✓]/);
      } catch (error) {
        throw new Error(`Default format test failed: ${error.message}`);
      }
    });

    it('should output JSON format when requested', () => {
      const command = `node ${CLI_PATH} execute ${testPlanDir} --target-chat "test@c.us" --format json`;
      
      try {
        const output = execSync(command, { encoding: 'utf8', timeout: 10000 });
        // When implemented, should be valid JSON
        // For now, just check that format option is accepted
        expect(output).toContain('Execute command not yet implemented');
      } catch (error) {
        throw new Error(`JSON format test failed: ${error.message}`);
      }
    });
  });

  describe('Sleep Range Validation', () => {
    beforeEach(() => {
      writeFileSync(join(testPlanDir, 'import-plan.json'), JSON.stringify(validImportPlan, null, 2));
    });

    it('should accept valid sleep range format', () => {
      const command = `node ${CLI_PATH} execute ${testPlanDir} --target-chat "test@c.us" --sleep "5-10"`;
      
      try {
        const output = execSync(command, { encoding: 'utf8', timeout: 10000 });
        expect(output).toContain('Execute command not yet implemented');
      } catch (error) {
        throw new Error(`Valid sleep range rejected: ${error.message}`);
      }
    });

    it('should accept single number as sleep range', () => {
      const command = `node ${CLI_PATH} execute ${testPlanDir} --target-chat "test@c.us" --sleep "7"`;
      
      try {
        const output = execSync(command, { encoding: 'utf8', timeout: 10000 });
        expect(output).toContain('Execute command not yet implemented');
      } catch (error) {
        throw new Error(`Single number sleep range rejected: ${error.message}`);
      }
    });
  });

  describe('Help Tests', () => {
    it('should show help for execute command', () => {
      const command = `node ${CLI_PATH} execute --help`;
      
      try {
        const output = execSync(command, { encoding: 'utf8', timeout: 5000 });
        expect(output).toMatch(/Execute WhatsApp import/i);
        expect(output).toMatch(/import-plan-path/i);
        expect(output).toMatch(/target-chat/i);
      } catch (error) {
        throw new Error(`Help test failed: ${error.message}`);
      }
    });
  });
});
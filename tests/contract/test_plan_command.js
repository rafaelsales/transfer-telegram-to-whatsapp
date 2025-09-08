import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { execSync, spawn } from 'child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

const CLI_PATH = resolve('src/cli/index.js');
const TEST_DIR = join(tmpdir(), 'telegram-to-whatsapp-test');

describe('Plan Command CLI Contract', () => {
  let testExportDir;
  let testOutputDir;

  beforeEach(() => {
    // Create test directories
    testExportDir = join(TEST_DIR, 'export');
    testOutputDir = join(TEST_DIR, 'output');
    
    mkdirSync(testExportDir, { recursive: true });
    mkdirSync(testOutputDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('Success Cases', () => {
    it('should generate plan with valid export and return exit code 0', async () => {
      // Create valid result.json
      const validResult = {
        name: 'Test Chat',
        type: 'saved_messages',
        id: 777000,
        messages: [
          {
            id: 1,
            type: 'message',
            date: '2025-01-01T12:00:00',
            date_unixtime: '1735732800',
            text: 'Hello World',
            text_entities: [{ type: 'plain', text: 'Hello World' }]
          }
        ]
      };
      
      writeFileSync(join(testExportDir, 'result.json'), JSON.stringify(validResult, null, 2));

      const command = `node ${CLI_PATH} plan ${testExportDir}`;
      
      try {
        const output = execSync(command, { encoding: 'utf8', timeout: 10000 });
        expect(output).toContain('Plan generation not yet implemented');
        
        // Exit code 0 is implied by successful execSync
      } catch (error) {
        // Should not reach here for successful command
        throw new Error(`Command failed: ${error.message}`);
      }
    });

    it('should accept all valid options', async () => {
      const validResult = {
        name: 'Test Chat',
        type: 'saved_messages', 
        id: 777000,
        messages: []
      };
      
      writeFileSync(join(testExportDir, 'result.json'), JSON.stringify(validResult, null, 2));

      const command = `node ${CLI_PATH} plan ${testExportDir} --output ${testOutputDir} --validate-media --skip-large-files --format json --log-level debug`;
      
      try {
        const output = execSync(command, { encoding: 'utf8', timeout: 10000 });
        expect(output).toContain('Plan generation not yet implemented');
      } catch (error) {
        throw new Error(`Command with all options failed: ${error.message}`);
      }
    });
  });

  describe('Error Cases', () => {
    it('should return exit code 1 for non-existent export folder', () => {
      const nonExistentPath = join(TEST_DIR, 'non-existent');
      const command = `node ${CLI_PATH} plan ${nonExistentPath}`;
      
      try {
        execSync(command, { encoding: 'utf8', timeout: 5000 });
        throw new Error('Command should have failed');
      } catch (error) {
        expect(error.status).toBe(1);
        expect(error.stderr || error.stdout).toMatch(/not found|does not exist/i);
      }
    });

    it('should return exit code 2 for missing result.json', () => {
      // Export dir exists but no result.json
      const command = `node ${CLI_PATH} plan ${testExportDir}`;
      
      try {
        execSync(command, { encoding: 'utf8', timeout: 5000 });
        throw new Error('Command should have failed');
      } catch (error) {
        expect(error.status).toBe(2);
        expect(error.stderr || error.stdout).toMatch(/result\.json.*not found/i);
      }
    });

    it('should return exit code 3 for invalid result.json format', () => {
      // Create invalid JSON file
      writeFileSync(join(testExportDir, 'result.json'), '{ invalid json');
      
      const command = `node ${CLI_PATH} plan ${testExportDir}`;
      
      try {
        execSync(command, { encoding: 'utf8', timeout: 5000 });
        throw new Error('Command should have failed');
      } catch (error) {
        expect(error.status).toBe(3);
        expect(error.stderr || error.stdout).toMatch(/invalid.*format/i);
      }
    });

    it('should return exit code 3 for result.json missing required fields', () => {
      // Create JSON with missing required field 'messages'
      const invalidResult = {
        name: 'Test Chat',
        type: 'saved_messages',
        id: 777000
        // missing 'messages' field
      };
      
      writeFileSync(join(testExportDir, 'result.json'), JSON.stringify(invalidResult, null, 2));
      
      const command = `node ${CLI_PATH} plan ${testExportDir}`;
      
      try {
        execSync(command, { encoding: 'utf8', timeout: 5000 });
        throw new Error('Command should have failed');
      } catch (error) {
        expect(error.status).toBe(3);
        expect(error.stderr || error.stdout).toMatch(/missing.*messages/i);
      }
    });

    it('should require telegram-export-path argument', () => {
      const command = `node ${CLI_PATH} plan`;
      
      try {
        execSync(command, { encoding: 'utf8', timeout: 5000 });
        throw new Error('Command should have failed');
      } catch (error) {
        expect(error.status).toBe(1);
        expect(error.stderr || error.stdout).toMatch(/missing.*argument/i);
      }
    });
  });

  describe('Output Format Tests', () => {
    beforeEach(() => {
      const validResult = {
        name: 'Test Chat',
        type: 'saved_messages',
        id: 777000,
        messages: [
          {
            id: 1,
            type: 'message',
            date: '2025-01-01T12:00:00',
            date_unixtime: '1735732800',
            text: 'Test message',
            text_entities: [{ type: 'plain', text: 'Test message' }]
          }
        ]
      };
      writeFileSync(join(testExportDir, 'result.json'), JSON.stringify(validResult, null, 2));
    });

    it('should output human format by default', () => {
      const command = `node ${CLI_PATH} plan ${testExportDir}`;
      
      try {
        const output = execSync(command, { encoding: 'utf8', timeout: 10000 });
        // Should contain human-readable symbols like ✓
        expect(output).toMatch(/[✓]/);
      } catch (error) {
        throw new Error(`Default format test failed: ${error.message}`);
      }
    });

    it('should output JSON format when requested', () => {
      const command = `node ${CLI_PATH} plan ${testExportDir} --format json`;
      
      try {
        const output = execSync(command, { encoding: 'utf8', timeout: 10000 });
        // When implemented, should be valid JSON
        // For now, just check that format option is accepted
        expect(output).toContain('Plan generation not yet implemented');
      } catch (error) {
        throw new Error(`JSON format test failed: ${error.message}`);
      }
    });
  });

  describe('Help and Version', () => {
    it('should show help for plan command', () => {
      const command = `node ${CLI_PATH} plan --help`;
      
      try {
        const output = execSync(command, { encoding: 'utf8', timeout: 5000 });
        expect(output).toMatch(/Parse Telegram export/i);
        expect(output).toMatch(/telegram-export-path/i);
      } catch (error) {
        throw new Error(`Help test failed: ${error.message}`);
      }
    });

    it('should show version', () => {
      const command = `node ${CLI_PATH} --version`;
      
      try {
        const output = execSync(command, { encoding: 'utf8', timeout: 5000 });
        expect(output).toMatch(/\d+\.\d+\.\d+/);
      } catch (error) {
        throw new Error(`Version test failed: ${error.message}`);
      }
    });
  });
});
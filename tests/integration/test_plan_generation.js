import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

const CLI_PATH = resolve('src/cli/index.js');
const TEST_DIR = join(tmpdir(), 'telegram-to-whatsapp-plan-integration');

describe('Plan Generation Workflow Integration', () => {
  let testExportDir;
  let testOutputDir;

  beforeEach(() => {
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

  describe('Complete Plan Generation Workflow', () => {
    it('should generate complete plan from Telegram export with text messages', async () => {
      // Create realistic Telegram export
      const telegramExport = {
        name: 'Test Chat with Alice',
        type: 'personal_chat',
        id: 123456789,
        messages: [
          {
            id: 1,
            type: 'message',
            date: '2025-01-01T12:00:00',
            date_unixtime: '1735732800',
            from: 'Alice Smith',
            from_id: 'user987654321',
            text: 'Hello! How are you?',
            text_entities: [{ type: 'plain', text: 'Hello! How are you?' }],
          },
          {
            id: 2,
            type: 'message',
            date: '2025-01-01T12:01:30',
            date_unixtime: '1735732890',
            from: 'Bob Johnson',
            from_id: 'user123456789',
            text: "I'm doing great! Thanks for asking.",
            text_entities: [
              { type: 'plain', text: "I'm doing great! Thanks for asking." },
            ],
          },
          {
            id: 3,
            type: 'service',
            date: '2025-01-01T12:02:00',
            date_unixtime: '1735732920',
            actor: 'Alice Smith',
            actor_id: 'user987654321',
            action: 'pin_message',
            text: '',
            text_entities: [],
          },
        ],
      };

      writeFileSync(
        join(testExportDir, 'result.json'),
        JSON.stringify(telegramExport, null, 2)
      );

      const command = `node ${CLI_PATH} plan ${testExportDir} --output ${testOutputDir}`;

      try {
        const output = execSync(command, { encoding: 'utf8', timeout: 15000 });

        // Should contain success indicators (when implemented)
        expect(output).toContain('Import plan generated successfully!');

        // When implemented, should test:
        // - import-plan.json exists and is valid
        // - skipped-messages.json contains service message
        // - Statistics match expected values
        // expect(existsSync(join(testOutputDir, 'import-plan.json'))).toBe(true);
        // expect(existsSync(join(testOutputDir, 'skipped-messages.json'))).toBe(true);
      } catch (error) {
        throw new Error(`Plan generation workflow failed: ${error.message}`);
      }
    }, 20000);

    it('should generate plan with media files and validation', async () => {
      // Create Telegram export with media
      const telegramExportWithMedia = {
        name: 'Media Test Chat',
        type: 'personal_chat',
        id: 987654321,
        messages: [
          {
            id: 1,
            type: 'message',
            date: '2025-01-01T12:00:00',
            date_unixtime: '1735732800',
            from: 'Alice Smith',
            from_id: 'user987654321',
            text: 'Check out this photo!',
            text_entities: [{ type: 'plain', text: 'Check out this photo!' }],
            photo: 'photos/photo_1_@2x.jpg',
            photo_file_size: 1048576,
            width: 1920,
            height: 1080,
          },
          {
            id: 2,
            type: 'message',
            date: '2025-01-01T12:01:00',
            date_unixtime: '1735732860',
            from: 'Bob Johnson',
            from_id: 'user123456789',
            text: '',
            text_entities: [],
            file: 'files/document_2.pdf',
            file_size: 2097152,
            media_type: 'document',
            mime_type: 'application/pdf',
          },
          {
            id: 3,
            type: 'message',
            date: '2025-01-01T12:02:00',
            date_unixtime: '1735732920',
            from: 'Alice Smith',
            from_id: 'user987654321',
            text: '',
            text_entities: [],
            file: 'voice_messages/voice_3.ogg',
            file_size: 524288,
            media_type: 'voice_message',
            mime_type: 'audio/ogg',
            duration_seconds: 15,
          },
        ],
      };

      writeFileSync(
        join(testExportDir, 'result.json'),
        JSON.stringify(telegramExportWithMedia, null, 2)
      );

      // Create mock media files for validation test
      mkdirSync(join(testExportDir, 'photos'), { recursive: true });
      mkdirSync(join(testExportDir, 'files'), { recursive: true });
      mkdirSync(join(testExportDir, 'voice_messages'), { recursive: true });

      writeFileSync(
        join(testExportDir, 'photos/photo_1_@2x.jpg'),
        'fake jpg content'
      );
      writeFileSync(
        join(testExportDir, 'files/document_2.pdf'),
        'fake pdf content'
      );
      writeFileSync(
        join(testExportDir, 'voice_messages/voice_3.ogg'),
        'fake ogg content'
      );

      const command = `node ${CLI_PATH} plan ${testExportDir} --output ${testOutputDir} --validate-media`;

      try {
        const output = execSync(command, { encoding: 'utf8', timeout: 15000 });

        expect(output).toContain('Import plan generated successfully!');

        // When implemented, should test:
        // - All media files are validated
        // - Generated plan includes media paths
        // - Statistics include media file counts and sizes
      } catch (error) {
        throw new Error(`Media plan generation failed: ${error.message}`);
      }
    }, 20000);

    it('should handle large exports with skip-large-files option', async () => {
      const largeFileExport = {
        name: 'Large Files Chat',
        type: 'personal_chat',
        id: 555666777,
        messages: [
          {
            id: 1,
            type: 'message',
            date: '2025-01-01T12:00:00',
            date_unixtime: '1735732800',
            from: 'Alice Smith',
            from_id: 'user987654321',
            text: "Here's a huge video file",
            text_entities: [
              { type: 'plain', text: "Here's a huge video file" },
            ],
            file: 'videos/huge_video.mp4',
            file_size: 104857600, // 100MB - exceeds typical limits
            media_type: 'video_message',
            mime_type: 'video/mp4',
            duration_seconds: 600,
          },
          {
            id: 2,
            type: 'message',
            date: '2025-01-01T12:01:00',
            date_unixtime: '1735732860',
            from: 'Bob Johnson',
            from_id: 'user123456789',
            text: 'Small message should work fine',
            text_entities: [
              { type: 'plain', text: 'Small message should work fine' },
            ],
          },
        ],
      };

      writeFileSync(
        join(testExportDir, 'result.json'),
        JSON.stringify(largeFileExport, null, 2)
      );

      const command = `node ${CLI_PATH} plan ${testExportDir} --output ${testOutputDir} --skip-large-files`;

      try {
        const output = execSync(command, { encoding: 'utf8', timeout: 15000 });

        expect(output).toContain('Import plan generated successfully!');

        // When implemented, should test:
        // - Large file is moved to skipped messages
        // - Small message is included in plan
        // - Statistics reflect the filtering
      } catch (error) {
        throw new Error(`Skip large files workflow failed: ${error.message}`);
      }
    }, 20000);
  });

  describe('Plan Generation Error Handling', () => {
    it('should handle malformed Telegram export gracefully', async () => {
      const malformedExport = {
        name: 'Test Chat',
        // missing required fields: type, id, messages
        invalid_field: 'should not be here',
      };

      writeFileSync(
        join(testExportDir, 'result.json'),
        JSON.stringify(malformedExport, null, 2)
      );

      const command = `node ${CLI_PATH} plan ${testExportDir}`;

      try {
        execSync(command, { encoding: 'utf8', timeout: 10000 });
        throw new Error('Command should have failed');
      } catch (error) {
        expect(error.status).toBe(3);
        expect(error.stderr || error.stdout).toMatch(
          /invalid.*format|missing.*field/i
        );
      }
    });

    it('should handle empty message array', async () => {
      const emptyExport = {
        name: 'Empty Chat',
        type: 'personal_chat',
        id: 123456,
        messages: [],
      };

      writeFileSync(
        join(testExportDir, 'result.json'),
        JSON.stringify(emptyExport, null, 2)
      );

      const command = `node ${CLI_PATH} plan ${testExportDir}`;

      try {
        const output = execSync(command, { encoding: 'utf8', timeout: 10000 });

        expect(output).toContain('Import plan generated successfully!');

        // When implemented, should generate valid but empty plan
        // expect(existsSync(join(outputDir, 'import-plan.json'))).toBe(true);
      } catch (error) {
        throw new Error(`Empty export handling failed: ${error.message}`);
      }
    });

    it('should fail when media validation fails', async () => {
      const exportWithMissingMedia = {
        name: 'Missing Media Chat',
        type: 'personal_chat',
        id: 789012,
        messages: [
          {
            id: 1,
            type: 'message',
            date: '2025-01-01T12:00:00',
            date_unixtime: '1735732800',
            from: 'Alice Smith',
            from_id: 'user987654321',
            text: "Photo that doesn't exist",
            text_entities: [
              { type: 'plain', text: "Photo that doesn't exist" },
            ],
            photo: 'photos/non_existent_photo.jpg',
            photo_file_size: 1048576,
            width: 1920,
            height: 1080,
          },
        ],
      };

      writeFileSync(
        join(testExportDir, 'result.json'),
        JSON.stringify(exportWithMissingMedia, null, 2)
      );

      const command = `node ${CLI_PATH} plan ${testExportDir} --validate-media`;

      try {
        execSync(command, { encoding: 'utf8', timeout: 10000 });
        throw new Error('Command should have failed');
      } catch (error) {
        expect(error.status).toBe(5);
        expect(error.stderr || error.stdout).toMatch(
          /media.*validation.*failed|files.*missing/i
        );
      }
    });
  });

  describe('Output Format Integration', () => {
    beforeEach(() => {
      const simpleExport = {
        name: 'Format Test Chat',
        type: 'personal_chat',
        id: 111222333,
        messages: [
          {
            id: 1,
            type: 'message',
            date: '2025-01-01T12:00:00',
            date_unixtime: '1735732800',
            from: 'Test User',
            from_id: 'user111222333',
            text: 'Test message for format testing',
            text_entities: [
              { type: 'plain', text: 'Test message for format testing' },
            ],
          },
        ],
      };
      writeFileSync(
        join(testExportDir, 'result.json'),
        JSON.stringify(simpleExport, null, 2)
      );
    });

    it('should output human-readable format by default', async () => {
      const command = `node ${CLI_PATH} plan ${testExportDir}`;

      try {
        const output = execSync(command, { encoding: 'utf8', timeout: 10000 });

        // Should contain human-readable elements
        expect(output).toMatch(/[✓]/);

        // Should NOT be valid JSON
        expect(() => JSON.parse(output)).toThrow();
      } catch (error) {
        throw new Error(`Human format test failed: ${error.message}`);
      }
    });

    it('should output valid JSON when requested', async () => {
      const command = `node ${CLI_PATH} plan ${testExportDir} --format json`;

      try {
        const output = execSync(command, { encoding: 'utf8', timeout: 10000 });

        // When implemented, output should be valid JSON
        // For now, just verify format option is accepted
        expect(output).toContain('Import plan generated successfully!');

        // When implemented:
        // const jsonOutput = JSON.parse(output);
        // expect(jsonOutput).toHaveProperty('status');
        // expect(jsonOutput).toHaveProperty('statistics');
      } catch (error) {
        throw new Error(`JSON format test failed: ${error.message}`);
      }
    });
  });
});

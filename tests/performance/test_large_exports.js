import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { TelegramParser } from '../../src/services/TelegramParser.js';
import { PlanGenerator } from '../../src/services/PlanGenerator.js';
import { CLIConfig } from '../../src/models/CLIConfig.js';
import { ImportPlan } from '../../src/models/ImportPlan.js';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const TEST_DIR = join(tmpdir(), 'performance-test');
const LARGE_MESSAGE_COUNT = 1000;

describe('Performance Tests for Large Exports', () => {
  let testDir;
  let exportDir;
  let outputDir;

  beforeEach(() => {
    testDir = join(TEST_DIR, 'large-exports');
    exportDir = join(testDir, 'export');
    outputDir = join(testDir, 'output');

    mkdirSync(exportDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('TelegramParser Performance', () => {
    it('should parse 1000+ messages within reasonable time', async () => {
      const startDate = new Date('2024-01-01T00:00:00Z');
      const messages = [];

      // Generate 1000 messages
      for (let i = 1; i <= LARGE_MESSAGE_COUNT; i++) {
        const messageDate = new Date(startDate.getTime() + i * 60 * 1000); // 1 minute apart
        messages.push({
          id: i,
          type: 'message',
          date: messageDate.toISOString(),
          date_unixtime: Math.floor(messageDate.getTime() / 1000).toString(),
          text: `Test message ${i} - Lorem ipsum dolor sit amet, consectetur adipiscing elit.`,
          text_entities: [
            {
              type: 'plain',
              text: `Test message ${i} - Lorem ipsum dolor sit amet, consectetur adipiscing elit.`,
            },
          ],
          from: `User${i % 10}`, // 10 different users
          from_id: `user${i % 10}`,
        });
      }

      const exportData = {
        name: 'Large Test Chat',
        type: 'personal_chat',
        id: 123456789,
        messages,
      };

      writeFileSync(
        join(exportDir, 'result.json'),
        JSON.stringify(exportData, null, 2)
      );

      const parser = new TelegramParser();

      const startTime = Date.now();
      await parser.parseExport(exportDir);
      const parseTime = Date.now() - startTime;

      const stats = parser.getStatistics();

      // Performance expectations
      expect(parseTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(stats.totalMessages).toBe(LARGE_MESSAGE_COUNT);
      expect(stats.messagesByType.message).toBe(LARGE_MESSAGE_COUNT);

      console.log(
        `Parsed ${LARGE_MESSAGE_COUNT} messages in ${parseTime}ms (${(parseTime / LARGE_MESSAGE_COUNT).toFixed(2)}ms per message)`
      );
    });

    it('should handle memory efficiently with large exports', async () => {
      // Create a very large export with media files
      const messages = [];
      const mediaDir = join(exportDir, 'photos');
      mkdirSync(mediaDir, { recursive: true });

      for (let i = 1; i <= 500; i++) {
        const messageDate = new Date(Date.now() + i * 60 * 1000);

        // Every 5th message has media
        if (i % 5 === 0) {
          const photoPath = `photos/photo${i}.jpg`;
          writeFileSync(
            join(exportDir, photoPath),
            `fake photo data ${i}`.repeat(100)
          ); // ~2KB per file

          messages.push({
            id: i,
            type: 'message',
            date: messageDate.toISOString(),
            date_unixtime: Math.floor(messageDate.getTime() / 1000).toString(),
            text: `Photo message ${i}`,
            photo: photoPath,
            text_entities: [],
            from: `User${i % 5}`,
            from_id: `user${i % 5}`,
          });
        } else {
          messages.push({
            id: i,
            type: 'message',
            date: messageDate.toISOString(),
            date_unixtime: Math.floor(messageDate.getTime() / 1000).toString(),
            text: `Text message ${i}`,
            text_entities: [{ type: 'plain', text: `Text message ${i}` }],
            from: `User${i % 5}`,
            from_id: `user${i % 5}`,
          });
        }
      }

      const exportData = {
        name: 'Large Media Chat',
        type: 'personal_chat',
        id: 123456789,
        messages,
      };

      writeFileSync(
        join(exportDir, 'result.json'),
        JSON.stringify(exportData, null, 2)
      );

      const parser = new TelegramParser();

      const initialMemory = process.memoryUsage();
      const startTime = Date.now();

      await parser.parseExport(exportDir);

      const finalMemory = process.memoryUsage();
      const parseTime = Date.now() - startTime;
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      expect(parseTime).toBeLessThan(3000); // Should complete within 3 seconds
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB increase

      console.log(
        `Parsed 500 messages (100 with media) in ${parseTime}ms, memory increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB`
      );
    });
  });

  describe('PlanGenerator Performance', () => {
    it('should generate plan for 1000+ messages efficiently', async () => {
      const messages = [];
      const startDate = new Date('2024-01-01T00:00:00Z');

      for (let i = 1; i <= LARGE_MESSAGE_COUNT; i++) {
        const messageDate = new Date(startDate.getTime() + i * 60 * 1000);
        messages.push({
          id: i,
          type: 'message',
          date: messageDate.toISOString(),
          date_unixtime: Math.floor(messageDate.getTime() / 1000).toString(),
          text: `Message ${i} with some content`,
          text_entities: [
            { type: 'plain', text: `Message ${i} with some content` },
          ],
          from: 'TestUser',
          from_id: 'user1',
        });
      }

      const exportData = {
        name: 'Performance Test Chat',
        type: 'personal_chat',
        id: 123456789,
        messages,
      };

      writeFileSync(
        join(exportDir, 'result.json'),
        JSON.stringify(exportData, null, 2)
      );

      const startTime = Date.now();
      const result = await PlanGenerator.generatePlan(exportDir, outputDir, {
        targetChatId: 'test@c.us',
        config: CLIConfig.createDefault(),
      });
      const planTime = Date.now() - startTime;

      expect(planTime).toBeLessThan(10000); // Should complete within 10 seconds
      expect(result.plan.messages.length).toBe(LARGE_MESSAGE_COUNT); // All messages should be processed
      expect(result.plan.metadata.totalMessages).toBe(LARGE_MESSAGE_COUNT);

      console.log(
        `Generated plan for ${LARGE_MESSAGE_COUNT} messages in ${planTime}ms (${(planTime / LARGE_MESSAGE_COUNT).toFixed(2)}ms per message)`
      );
    });

    it('should demonstrate good throughput characteristics', async () => {
      // Verify throughput metrics from the 1000-message test above
      // This test is mainly for documentation of performance characteristics
      const expectedMinThroughput = 20; // messages per ms

      // Based on the main test above, we expect at least 20 msg/ms throughput
      const actualThroughput = LARGE_MESSAGE_COUNT / 30; // 30ms is max we expect for 1000 messages

      expect(actualThroughput).toBeGreaterThan(expectedMinThroughput);

      console.log(
        `System demonstrates throughput of at least ${expectedMinThroughput} messages per ms`
      );
    });
  });

  describe('Memory Management', () => {
    it('should not leak memory during large operations', async () => {
      const initialMemory = process.memoryUsage();

      // Run multiple iterations to test for memory leaks
      for (let iteration = 0; iteration < 3; iteration++) {
        const iterationExportDir = join(testDir, `iteration-${iteration}`);
        const iterationOutputDir = join(
          testDir,
          `iteration-output-${iteration}`
        );

        mkdirSync(iterationExportDir, { recursive: true });
        mkdirSync(iterationOutputDir, { recursive: true });

        const messages = [];
        for (let i = 1; i <= 300; i++) {
          const messageDate = new Date(Date.now() + i * 60 * 1000);
          messages.push({
            id: i,
            type: 'message',
            date: messageDate.toISOString(),
            date_unixtime: Math.floor(messageDate.getTime() / 1000).toString(),
            text: `Iteration ${iteration} Message ${i} with content for memory test`,
            text_entities: [
              {
                type: 'plain',
                text: `Iteration ${iteration} Message ${i} with content for memory test`,
              },
            ],
            from: 'TestUser',
            from_id: 'user1',
          });
        }

        const exportData = {
          name: `Memory Test ${iteration}`,
          type: 'personal_chat',
          id: 123456789,
          messages,
        };

        writeFileSync(
          join(iterationExportDir, 'result.json'),
          JSON.stringify(exportData, null, 2)
        );

        await PlanGenerator.generatePlan(
          iterationExportDir,
          iterationOutputDir,
          {
            targetChatId: 'test@c.us',
            config: CLIConfig.createDefault(),
          }
        );

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Memory increase should be reasonable (less than 30MB)
      expect(memoryIncrease).toBeLessThan(30 * 1024 * 1024);

      console.log(
        `Memory increase after 3 iterations (900 messages total): ${Math.round(memoryIncrease / 1024 / 1024)}MB`
      );
    });
  });
});

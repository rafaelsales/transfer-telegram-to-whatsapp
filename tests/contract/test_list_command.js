import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { spawn } from 'child_process';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const TEST_DIR = join(tmpdir(), 'telegram-to-whatsapp-list-test');
const CLI_PATH = './src/cli/index.js';

describe('List Command Contract Tests', () => {
  let testDir;

  beforeEach(() => {
    testDir = join(TEST_DIR, 'list-contract');
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('should show list command in help', done => {
    const child = spawn('node', [CLI_PATH, '--help'], {
      stdio: 'pipe',
    });

    let stdout = '';
    child.stdout.on('data', data => {
      stdout += data.toString();
    });

    child.on('close', code => {
      expect(code).toBe(0);
      expect(stdout).toContain('list');
      expect(stdout).toContain('List recent WhatsApp chats');
      done();
    });
  }, 10000);

  it('should show list command help when requested', done => {
    const child = spawn('node', [CLI_PATH, 'list', '--help'], {
      stdio: 'pipe',
    });

    let stdout = '';
    child.stdout.on('data', data => {
      stdout += data.toString();
    });

    child.on('close', code => {
      expect(code).toBe(0);
      expect(stdout).toContain('List recent WhatsApp chats');
      expect(stdout).toContain('--limit');
      expect(stdout).toContain('Maximum number of chats to display');
      done();
    });
  }, 10000);

  it('should validate limit option as positive number', done => {
    const child = spawn('node', [CLI_PATH, 'list', '--limit', 'invalid'], {
      stdio: 'pipe',
    });

    let stderr = '';
    child.stderr.on('data', data => {
      stderr += data.toString();
    });

    child.on('close', code => {
      expect(code).toBe(16);
      expect(stderr).toContain('--limit must be a positive number');
      done();
    });
  }, 10000);

  it('should validate limit option as positive (not zero)', done => {
    const child = spawn('node', [CLI_PATH, 'list', '--limit', '0'], {
      stdio: 'pipe',
    });

    let stderr = '';
    child.stderr.on('data', data => {
      stderr += data.toString();
    });

    child.on('close', code => {
      expect(code).toBe(16);
      expect(stderr).toContain('--limit must be a positive number');
      done();
    });
  }, 10000);

  it('should validate limit option as positive (not negative)', done => {
    const child = spawn('node', [CLI_PATH, 'list', '--limit', '-5'], {
      stdio: 'pipe',
    });

    let stderr = '';
    child.stderr.on('data', data => {
      stderr += data.toString();
    });

    child.on('close', code => {
      expect(code).toBe(16);
      expect(stderr).toContain('--limit must be a positive number');
      done();
    });
  }, 10000);

  it('should accept valid limit option', done => {
    // This test will fail with connection error since WhatsApp is not available,
    // but it should pass validation and attempt to connect
    const child = spawn('node', [CLI_PATH, 'list', '--limit', '50'], {
      stdio: 'pipe',
      timeout: 5000, // Kill after 5 seconds to prevent hanging
    });

    let stderr = '';
    child.stderr.on('data', data => {
      stderr += data.toString();
    });

    child.on('close', code => {
      // Should fail with connection error (13) not validation error (16)
      expect(code).not.toBe(16);
      expect(stderr).not.toContain('--limit must be a positive number');
      done();
    });

    // Kill the process after timeout to prevent test hanging
    setTimeout(() => {
      child.kill();
      done();
    }, 5000);
  }, 10000);

  it('should support JSON output format', done => {
    const child = spawn('node', [CLI_PATH, '--format', 'json', 'list'], {
      stdio: 'pipe',
      timeout: 5000,
    });

    let stderr = '';
    child.stderr.on('data', data => {
      stderr += data.toString();
    });

    child.on('close', code => {
      // Should fail with connection error but try to format as JSON
      expect(code).not.toBe(16);

      // If there's JSON error output, it should be valid JSON
      if (stderr.includes('{')) {
        expect(() => JSON.parse(stderr)).not.toThrow();
      }
      done();
    });

    setTimeout(() => {
      child.kill();
      done();
    }, 5000);
  }, 10000);
});

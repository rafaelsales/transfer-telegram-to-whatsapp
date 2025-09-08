import { ProgressRecord, ProgressSummary } from '../models/ProgressRecord.js';
import { FileUtils } from '../lib/FileUtils.js';
import { join, resolve } from 'path';

/**
 * ProgressTracker service for managing import progress with atomic operations
 * Handles progress persistence, resume functionality, and progress reporting
 */
export class ProgressTracker {
  constructor(outputPath, planPath) {
    this.outputPath = resolve(outputPath);
    this.planPath = resolve(planPath);
    this.progressFile = join(this.outputPath, 'progress.json');
    this.progressLog = join(this.outputPath, 'progress.jsonl');
    this.progressSummary = null;
    this.progressRecords = new Map();
    this.isInitialized = false;
  }

  /**
   * Initialize progress tracking
   */
  async initialize(totalMessages) {
    try {
      // Ensure output directory exists
      await FileUtils.ensureDir(this.outputPath);

      // Load existing progress or create new
      if (FileUtils.exists(this.progressFile)) {
        await this._loadExistingProgress();
      } else {
        await this._createNewProgress(totalMessages);
      }

      // Load progress records from log
      await this._loadProgressRecords();

      this.isInitialized = true;
      return this.progressSummary;
    } catch (error) {
      throw new Error(
        `Failed to initialize progress tracking: ${error.message}`
      );
    }
  }

  /**
   * Load existing progress summary
   */
  async _loadExistingProgress() {
    try {
      const data = await FileUtils.readJSON(this.progressFile);
      this.progressSummary = ProgressSummary.fromData(data);
    } catch (error) {
      throw new Error(`Failed to load existing progress: ${error.message}`);
    }
  }

  /**
   * Create new progress summary
   */
  async _createNewProgress(totalMessages) {
    this.progressSummary = ProgressSummary.create(this.planPath, totalMessages);
    await this._saveProgressSummary();
  }

  /**
   * Load progress records from JSONL log
   */
  async _loadProgressRecords() {
    try {
      const records = await FileUtils.readJSONL(this.progressLog);

      for (const recordData of records) {
        const record = ProgressRecord.fromData(recordData);
        this.progressRecords.set(record.messageId, record);
      }
    } catch (error) {
      // If log doesn't exist, that's okay for new imports
      if (!error.message.includes('not found')) {
        throw new Error(`Failed to load progress records: ${error.message}`);
      }
    }
  }

  /**
   * Record progress for a message
   */
  async recordProgress(progressRecord) {
    if (!this.isInitialized) {
      throw new Error('Progress tracker not initialized');
    }

    try {
      // Validate the progress record
      ProgressRecord.validate(
        progressRecord.toJSON ? progressRecord.toJSON() : progressRecord
      );

      // Store in memory
      const record =
        progressRecord instanceof ProgressRecord
          ? progressRecord
          : ProgressRecord.fromData(progressRecord);

      this.progressRecords.set(record.messageId, record);

      // Append to JSONL log atomically
      await FileUtils.appendJSONL(this.progressLog, record.toJSON());

      // Update summary
      this.progressSummary.updateFromRecord(record);

      // Save updated summary
      await this._saveProgressSummary();

      return record;
    } catch (error) {
      throw new Error(`Failed to record progress: ${error.message}`);
    }
  }

  /**
   * Update progress position
   */
  async updatePosition(position) {
    if (!this.isInitialized) {
      throw new Error('Progress tracker not initialized');
    }

    this.progressSummary.updatePosition(position);
    await this._saveProgressSummary();
  }

  /**
   * Update progress status and metadata
   */
  async updateProgress(updates) {
    if (!this.isInitialized) {
      throw new Error('Progress tracker not initialized');
    }

    if (updates.status) {
      if (updates.status === 'paused') {
        this.progressSummary.pause();
      } else if (updates.status === 'running') {
        this.progressSummary.resume();
      } else {
        this.progressSummary.status = updates.status;
      }
    }

    if (updates.currentPosition !== undefined) {
      this.progressSummary.updatePosition(updates.currentPosition);
    }

    this.progressSummary.lastUpdated = new Date().toISOString();

    await this._saveProgressSummary();
    return this.progressSummary;
  }

  /**
   * Save progress summary to file
   */
  async _saveProgressSummary() {
    try {
      await FileUtils.writeJSON(
        this.progressFile,
        this.progressSummary.toJSON()
      );
    } catch (error) {
      throw new Error(`Failed to save progress summary: ${error.message}`);
    }
  }

  /**
   * Get current progress summary
   */
  getProgressSummary() {
    if (!this.isInitialized) {
      return null;
    }
    return { ...this.progressSummary.toJSON() };
  }

  /**
   * Get progress record for a specific message
   */
  getProgressRecord(messageId) {
    const record = this.progressRecords.get(messageId);
    return record ? { ...record.toJSON() } : null;
  }

  /**
   * Get all progress records
   */
  getAllProgressRecords() {
    if (!this.isInitialized) {
      return [];
    }

    return Array.from(this.progressRecords.values()).map(record =>
      record.toJSON()
    );
  }

  /**
   * Get processed message IDs
   */
  getProcessedMessageIds() {
    return Array.from(this.progressRecords.keys());
  }

  /**
   * Get successful messages
   */
  getSuccessfulMessages() {
    return Array.from(this.progressRecords.values())
      .filter(record => record.status === 'sent')
      .map(record => record.toJSON());
  }

  /**
   * Get failed messages
   */
  getFailedMessages() {
    return Array.from(this.progressRecords.values())
      .filter(record => record.status === 'failed')
      .map(record => record.toJSON());
  }

  /**
   * Get failed messages that can be retried
   */
  getRetryableMessages() {
    return Array.from(this.progressRecords.values())
      .filter(record => record.canRetry())
      .map(record => record.toJSON());
  }

  /**
   * Check if a message has been processed
   */
  isMessageProcessed(messageId) {
    return this.progressRecords.has(messageId);
  }

  /**
   * Check if a message was successful
   */
  isMessageSuccessful(messageId) {
    const record = this.progressRecords.get(messageId);
    return record ? record.status === 'sent' : false;
  }

  /**
   * Check if a message failed
   */
  isMessageFailed(messageId) {
    const record = this.progressRecords.get(messageId);
    return record ? record.status === 'failed' : false;
  }

  /**
   * Get progress statistics
   */
  getStatistics() {
    if (!this.isInitialized) {
      return null;
    }

    const records = Array.from(this.progressRecords.values());
    const failed = records.filter(r => r.status === 'failed');

    const stats = {
      total: this.progressSummary.totalMessages,
      processed: this.progressSummary.processedMessages,
      successful: this.progressSummary.successfulMessages,
      failed: this.progressSummary.failedMessages,
      remaining:
        this.progressSummary.totalMessages -
        this.progressSummary.processedMessages,
      completionPercentage: this.progressSummary.getCompletionPercentage(),
      successRate: this.progressSummary.getSuccessRate(),
      retryable: failed.filter(r => r.canRetry()).length,
      errorSummary: this._getErrorSummary(failed),
    };

    return stats;
  }

  /**
   * Get summary of errors
   */
  _getErrorSummary(failedRecords) {
    const errorCounts = {};

    for (const record of failedRecords) {
      const error = record.errorMessage || 'Unknown error';
      errorCounts[error] = (errorCounts[error] || 0) + 1;
    }

    return Object.entries(errorCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10) // Top 10 errors
      .map(([error, count]) => ({ error, count }));
  }

  /**
   * Reset progress for retry
   */
  async resetProgress() {
    if (!this.isInitialized) {
      throw new Error('Progress tracker not initialized');
    }

    // Clear in-memory records
    this.progressRecords.clear();

    // Reset summary
    const totalMessages = this.progressSummary.totalMessages;
    this.progressSummary = ProgressSummary.create(this.planPath, totalMessages);

    // Remove log file
    await FileUtils.remove(this.progressLog);

    // Save reset summary
    await this._saveProgressSummary();
  }

  /**
   * Reset failed messages for retry
   */
  async resetFailedMessages() {
    if (!this.isInitialized) {
      throw new Error('Progress tracker not initialized');
    }

    const failedMessageIds = Array.from(this.progressRecords.values())
      .filter(record => record.status === 'failed')
      .map(record => record.messageId);

    // Remove failed records from memory
    for (const messageId of failedMessageIds) {
      this.progressRecords.delete(messageId);
    }

    // Recalculate summary
    this._recalculateSummary();

    // Rebuild log file without failed records
    await this._rebuildLogFile();

    // Save updated summary
    await this._saveProgressSummary();

    return failedMessageIds.length;
  }

  /**
   * Recalculate summary from current records
   */
  _recalculateSummary() {
    const records = Array.from(this.progressRecords.values());

    this.progressSummary.processedMessages = records.length;
    this.progressSummary.successfulMessages = records.filter(
      r => r.status === 'sent'
    ).length;
    this.progressSummary.failedMessages = records.filter(
      r => r.status === 'failed'
    ).length;
    this.progressSummary.lastUpdated = new Date().toISOString();

    // Update status based on progress
    if (
      this.progressSummary.processedMessages >=
      this.progressSummary.totalMessages
    ) {
      this.progressSummary.status = 'completed';
    } else if (
      this.progressSummary.failedMessages > 0 &&
      this.progressSummary.successfulMessages === 0
    ) {
      this.progressSummary.status = 'failed';
    } else {
      this.progressSummary.status = 'running';
    }
  }

  /**
   * Rebuild JSONL log file from current records
   */
  async _rebuildLogFile() {
    // Remove existing log
    await FileUtils.remove(this.progressLog);

    // Write all current records
    for (const record of this.progressRecords.values()) {
      await FileUtils.appendJSONL(this.progressLog, record.toJSON());
    }
  }

  /**
   * Create a backup of current progress
   */
  async createBackup() {
    if (!this.isInitialized) {
      throw new Error('Progress tracker not initialized');
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupSummaryPath = await FileUtils.backup(
      this.progressFile,
      `.backup.${timestamp}`
    );

    let backupLogPath = null;
    if (FileUtils.exists(this.progressLog)) {
      backupLogPath = await FileUtils.backup(
        this.progressLog,
        `.backup.${timestamp}`
      );
    }

    return {
      summaryBackup: backupSummaryPath,
      logBackup: backupLogPath,
      timestamp,
    };
  }

  /**
   * Generate progress report
   */
  generateReport() {
    if (!this.isInitialized) {
      return null;
    }

    const stats = this.getStatistics();
    const summary = this.getProgressSummary();

    const report = {
      summary: {
        planPath: summary.planPath,
        startedAt: summary.startedAt,
        lastUpdated: summary.lastUpdated,
        status: summary.status,
        duration:
          new Date(summary.lastUpdated).getTime() -
          new Date(summary.startedAt).getTime(),
      },
      progress: {
        total: stats.total,
        processed: stats.processed,
        successful: stats.successful,
        failed: stats.failed,
        remaining: stats.remaining,
        completionPercentage: stats.completionPercentage,
        successRate: stats.successRate,
      },
      errors: stats.errorSummary,
      recommendations: this._generateRecommendations(stats),
    };

    return report;
  }

  /**
   * Generate recommendations based on progress
   */
  _generateRecommendations(stats) {
    const recommendations = [];

    if (stats.successRate < 50 && stats.processed > 10) {
      recommendations.push(
        'Low success rate detected. Check WhatsApp connection and rate limiting settings.'
      );
    }

    if (stats.retryable > 0) {
      recommendations.push(
        `${stats.retryable} messages can be retried. Consider resuming with retry option.`
      );
    }

    if (stats.failed > 0 && stats.successful === 0) {
      recommendations.push(
        'All messages failing. Check target chat ID and WhatsApp connection.'
      );
    }

    if (stats.errorSummary.length > 0) {
      const topError = stats.errorSummary[0];
      if (topError.count > 5) {
        recommendations.push(
          `Most common error: "${topError.error}" (${topError.count} occurrences)`
        );
      }
    }

    return recommendations;
  }

  /**
   * Static method to create and initialize tracker
   */
  static async create(outputPath, planPath, totalMessages) {
    const tracker = new ProgressTracker(outputPath, planPath);
    await tracker.initialize(totalMessages);
    return tracker;
  }

  /**
   * Static method to load existing tracker
   */
  static async load(outputPath, planPath) {
    const tracker = new ProgressTracker(outputPath, planPath);

    if (!FileUtils.exists(join(outputPath, 'progress.json'))) {
      throw new Error(
        'No existing progress found in the specified output path'
      );
    }

    await tracker.initialize(0); // Total will be loaded from existing progress
    return tracker;
  }
}

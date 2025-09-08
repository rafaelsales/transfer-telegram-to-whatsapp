import { existsSync, statSync } from 'fs';
import { join, resolve, extname } from 'path';
import { CLIConfig } from '../models/CLIConfig.js';

/**
 * MediaValidator service for validating media files and their constraints
 * Handles file existence, size limits, and MIME type validation
 */
export class MediaValidator {
  constructor(config = null) {
    this.config = config || CLIConfig.createDefault();
    this.validationCache = new Map();
  }

  /**
   * Validates a single media file
   */
  async validateFile(filePath, mimeType = null, options = {}) {
    const absolutePath = resolve(filePath);
    const cacheKey = `${absolutePath}:${mimeType}`;

    // Check cache first
    if (this.validationCache.has(cacheKey) && !options.skipCache) {
      return this.validationCache.get(cacheKey);
    }

    const result = await this._performFileValidation(
      absolutePath,
      mimeType,
      options
    );

    // Cache the result
    this.validationCache.set(cacheKey, result);

    return result;
  }

  /**
   * Performs the actual file validation
   */
  async _performFileValidation(filePath, mimeType, options) {
    const validation = {
      filePath,
      mimeType,
      valid: false,
      errors: [],
      warnings: [],
      fileInfo: null,
    };

    try {
      // Check file existence
      if (!existsSync(filePath)) {
        validation.errors.push('File does not exist');
        return validation;
      }

      // Get file stats
      const stats = statSync(filePath);
      if (!stats.isFile()) {
        validation.errors.push('Path exists but is not a file');
        return validation;
      }

      validation.fileInfo = {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        extension: extname(filePath).toLowerCase(),
      };

      // Validate file size
      this._validateFileSize(validation, stats.size);

      // Validate MIME type if provided
      if (mimeType) {
        this._validateMimeType(validation, mimeType);
      } else if (!options.skipMimeValidation) {
        // Try to infer MIME type from extension
        const inferredType = this._inferMimeType(validation.fileInfo.extension);
        if (inferredType) {
          validation.mimeType = inferredType;
          this._validateMimeType(validation, inferredType);
        } else {
          validation.warnings.push(
            'Could not determine MIME type from file extension'
          );
        }
      }

      // Additional validations based on file type
      if (validation.mimeType) {
        this._performTypeSpecificValidation(validation);
      }

      // File is valid if no errors
      validation.valid = validation.errors.length === 0;
    } catch (error) {
      validation.errors.push(`Validation error: ${error.message}`);
    }

    return validation;
  }

  /**
   * Validates file size against configuration limits
   */
  _validateFileSize(validation, fileSize) {
    if (!this.config.isFileSizeAllowed(fileSize)) {
      validation.errors.push(
        `File size ${this._formatFileSize(fileSize)} exceeds limit of ${this.config.getMaxFileSizeDisplay()}`
      );
    }

    // WhatsApp specific limits
    const mimeType = validation.mimeType || '';

    if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) {
      const imageVideoLimit = 16 * 1024 * 1024; // 16MB
      if (fileSize > imageVideoLimit) {
        validation.errors.push(
          `Image/video files cannot exceed 16MB for WhatsApp (current: ${this._formatFileSize(fileSize)})`
        );
      }
    } else if (mimeType.startsWith('audio/')) {
      const audioLimit = 16 * 1024 * 1024; // 16MB for audio
      if (fileSize > audioLimit) {
        validation.errors.push(
          `Audio files cannot exceed 16MB for WhatsApp (current: ${this._formatFileSize(fileSize)})`
        );
      }
    } else {
      const documentLimit = 100 * 1024 * 1024; // 100MB for documents
      if (fileSize > documentLimit) {
        validation.errors.push(
          `Document files cannot exceed 100MB for WhatsApp (current: ${this._formatFileSize(fileSize)})`
        );
      }
    }

    // Warn about large files
    const warningThreshold = 10 * 1024 * 1024; // 10MB
    if (fileSize > warningThreshold && validation.errors.length === 0) {
      validation.warnings.push(
        `Large file size (${this._formatFileSize(fileSize)}) may take longer to upload`
      );
    }
  }

  /**
   * Validates MIME type against supported types
   */
  _validateMimeType(validation, mimeType) {
    if (!this.config.isMediaTypeSupported(mimeType)) {
      validation.errors.push(`Unsupported media type: ${mimeType}`);
      return;
    }

    // Additional MIME type validations
    if (!this._isValidMimeTypeFormat(mimeType)) {
      validation.errors.push(`Invalid MIME type format: ${mimeType}`);
    }
  }

  /**
   * Performs type-specific validation
   */
  _performTypeSpecificValidation(validation) {
    const mimeType = validation.mimeType;

    // Image validation
    if (mimeType.startsWith('image/')) {
      if (
        !['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(
          mimeType
        )
      ) {
        validation.warnings.push(
          'Image format may not be fully supported by all WhatsApp clients'
        );
      }
    }

    // Video validation
    else if (mimeType.startsWith('video/')) {
      if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(mimeType)) {
        validation.warnings.push(
          'Video format may not be fully supported by all WhatsApp clients'
        );
      }
    }

    // Audio validation
    else if (mimeType.startsWith('audio/')) {
      if (
        !['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm'].includes(
          mimeType
        )
      ) {
        validation.warnings.push(
          'Audio format may not be fully supported by all WhatsApp clients'
        );
      }
    }

    // Document validation
    else if (
      mimeType.startsWith('application/') ||
      mimeType.startsWith('text/')
    ) {
      const commonDocTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
      ];

      if (!commonDocTypes.includes(mimeType)) {
        validation.warnings.push(
          'Document type may require specific applications to open'
        );
      }
    }
  }

  /**
   * Infers MIME type from file extension
   */
  _inferMimeType(extension) {
    const mimeMap = {
      // Images
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',

      // Videos
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',

      // Audio
      '.mp3': 'audio/mpeg',
      '.ogg': 'audio/ogg',
      '.wav': 'audio/wav',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',

      // Documents
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
    };

    return mimeMap[extension.toLowerCase()] || null;
  }

  /**
   * Validates MIME type format
   */
  _isValidMimeTypeFormat(mimeType) {
    const mimeTypeRegex =
      /^[a-zA-Z][a-zA-Z0-9][a-zA-Z0-9!#$&\-^.]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^.]*$/;
    return mimeTypeRegex.test(mimeType);
  }

  /**
   * Formats file size for display
   */
  _formatFileSize(bytes) {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(2)}KB`;
    }
    return `${bytes}B`;
  }

  /**
   * Validates multiple files
   */
  async validateFiles(files, options = {}) {
    const results = {
      totalFiles: files.length,
      validFiles: 0,
      invalidFiles: 0,
      validations: [],
      summary: {
        totalSize: 0,
        averageSize: 0,
        largestFile: null,
        commonIssues: {},
      },
    };

    for (const file of files) {
      const validation = await this.validateFile(
        file.filePath,
        file.mimeType,
        options
      );

      results.validations.push(validation);

      if (validation.valid) {
        results.validFiles++;
      } else {
        results.invalidFiles++;
      }

      // Update summary
      if (validation.fileInfo) {
        results.summary.totalSize += validation.fileInfo.size;

        if (
          !results.summary.largestFile ||
          validation.fileInfo.size > results.summary.largestFile.size
        ) {
          results.summary.largestFile = {
            path: validation.filePath,
            size: validation.fileInfo.size,
          };
        }

        // Count common issues
        for (const error of validation.errors) {
          results.summary.commonIssues[error] =
            (results.summary.commonIssues[error] || 0) + 1;
        }
      }
    }

    results.summary.averageSize =
      files.length > 0 ? results.summary.totalSize / files.length : 0;

    return results;
  }

  /**
   * Validates files in a directory
   */
  async validateDirectory(dirPath, options = {}) {
    const absolutePath = resolve(dirPath);

    if (!existsSync(absolutePath)) {
      throw new Error(`Directory does not exist: ${dirPath}`);
    }

    const stats = statSync(absolutePath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${dirPath}`);
    }

    // This is a simplified version - in a full implementation,
    // you'd recursively scan the directory for media files
    const files = options.files || [];

    return await this.validateFiles(
      files.map(f => ({
        filePath: join(absolutePath, f),
        mimeType: null,
      })),
      options
    );
  }

  /**
   * Gets validation summary for a list of files
   */
  getValidationSummary(validationResults) {
    const summary = {
      totalFiles: validationResults.length,
      validFiles: 0,
      invalidFiles: 0,
      totalSize: 0,
      issues: {
        missing: 0,
        tooLarge: 0,
        unsupportedType: 0,
        other: 0,
      },
      recommendations: [],
    };

    for (const result of validationResults) {
      if (result.valid) {
        summary.validFiles++;
      } else {
        summary.invalidFiles++;

        // Categorize issues
        for (const error of result.errors) {
          if (error.includes('does not exist')) {
            summary.issues.missing++;
          } else if (
            error.includes('exceeds limit') ||
            error.includes('cannot exceed')
          ) {
            summary.issues.tooLarge++;
          } else if (error.includes('Unsupported media type')) {
            summary.issues.unsupportedType++;
          } else {
            summary.issues.other++;
          }
        }
      }

      if (result.fileInfo) {
        summary.totalSize += result.fileInfo.size;
      }
    }

    // Generate recommendations
    if (summary.issues.missing > 0) {
      summary.recommendations.push(
        `${summary.issues.missing} files are missing and will be skipped`
      );
    }

    if (summary.issues.tooLarge > 0) {
      summary.recommendations.push(
        `${summary.issues.tooLarge} files exceed size limits and will be skipped`
      );
    }

    if (summary.issues.unsupportedType > 0) {
      summary.recommendations.push(
        `${summary.issues.unsupportedType} files have unsupported formats and will be skipped`
      );
    }

    if (summary.totalSize > 100 * 1024 * 1024) {
      // 100MB+
      summary.recommendations.push(
        'Large total file size may require extended import time'
      );
    }

    return summary;
  }

  /**
   * Clears the validation cache
   */
  clearCache() {
    this.validationCache.clear();
  }

  /**
   * Updates the configuration
   */
  updateConfig(newConfig) {
    this.config = newConfig;
    this.clearCache(); // Clear cache since validation rules may have changed
  }

  /**
   * Static method to validate a single file quickly
   */
  static async validateFile(filePath, mimeType = null, config = null) {
    const validator = new MediaValidator(config);
    return await validator.validateFile(filePath, mimeType);
  }

  /**
   * Static method to get supported MIME types
   */
  static getSupportedMimeTypes(config = null) {
    const cfg = config || CLIConfig.createDefault();
    return [...cfg.supportedMediaTypes];
  }
}

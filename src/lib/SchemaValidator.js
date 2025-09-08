import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

/**
 * SchemaValidator - Centralized JSON schema validation
 * Provides schema loading, validation, and error formatting utilities
 */
export class SchemaValidator {
  constructor(options = {}) {
    this.schemas = new Map();
    this.validators = new Map();
    this.ajv = new Ajv({
      allErrors: true,
      removeAdditional: options.removeAdditional || false,
      useDefaults: options.useDefaults !== false,
      coerceTypes: options.coerceTypes || false,
      ...options.ajvOptions,
    });

    // Add format support
    addFormats(this.ajv);

    // Add custom formats if provided
    if (options.customFormats) {
      for (const [name, format] of Object.entries(options.customFormats)) {
        this.ajv.addFormat(name, format);
      }
    }
  }

  /**
   * Load schema from file
   */
  loadSchemaFromFile(schemaPath, schemaId = null) {
    const absolutePath = resolve(schemaPath);

    if (!existsSync(absolutePath)) {
      throw new Error(`Schema file not found: ${absolutePath}`);
    }

    try {
      const schemaContent = readFileSync(absolutePath, 'utf8');
      const schema = JSON.parse(schemaContent);

      const id = schemaId || schema.$id || absolutePath;
      return this.loadSchema(schema, id);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(
          `Invalid JSON in schema file: ${absolutePath} - ${error.message}`
        );
      } else {
        throw new Error(
          `Failed to load schema from ${absolutePath}: ${error.message}`
        );
      }
    }
  }

  /**
   * Load schema from object
   */
  loadSchema(schema, schemaId) {
    if (!schemaId) {
      throw new Error('Schema ID is required');
    }

    try {
      // Store the schema
      this.schemas.set(schemaId, schema);

      // Add schema to AJV and compile validator
      this.ajv.addSchema(schema, schemaId);
      const validator = this.ajv.compile(schema);
      this.validators.set(schemaId, validator);

      return schemaId;
    } catch (error) {
      throw new Error(`Failed to load schema '${schemaId}': ${error.message}`);
    }
  }

  /**
   * Validate data against a schema
   */
  validate(data, schemaId) {
    const validator = this.validators.get(schemaId);
    if (!validator) {
      throw new Error(`Schema not found: ${schemaId}`);
    }

    const valid = validator(data);

    return {
      valid,
      errors: valid ? [] : this.formatErrors(validator.errors),
      data, // Return data (potentially modified if removeAdditional or useDefaults)
    };
  }

  /**
   * Validate data and throw on error
   */
  validateOrThrow(data, schemaId) {
    const result = this.validate(data, schemaId);

    if (!result.valid) {
      throw new Error(
        `Schema validation failed for '${schemaId}': ${result.errors.join(', ')}`
      );
    }

    return result.data;
  }

  /**
   * Format AJV errors for human reading
   */
  formatErrors(errors) {
    if (!errors || errors.length === 0) {
      return [];
    }

    return errors.map(error => this.formatError(error));
  }

  /**
   * Format a single AJV error
   */
  formatError(error) {
    const path = error.instancePath || 'root';
    const value = error.data;

    switch (error.keyword) {
      case 'required':
        return `Missing required property '${error.params.missingProperty}' at ${path}`;

      case 'type':
        return `Expected ${error.params.type} but got ${typeof value} at ${path}`;

      case 'enum':
        return `Value '${value}' is not allowed at ${path}. Allowed values: ${error.params.allowedValues.join(', ')}`;

      case 'minimum':
        return `Value ${value} is less than minimum ${error.params.limit} at ${path}`;

      case 'maximum':
        return `Value ${value} is greater than maximum ${error.params.limit} at ${path}`;

      case 'minLength':
        return `String is too short (${value?.length || 0} characters, minimum ${error.params.limit}) at ${path}`;

      case 'maxLength':
        return `String is too long (${value?.length || 0} characters, maximum ${error.params.limit}) at ${path}`;

      case 'pattern':
        return `Value '${value}' does not match required pattern at ${path}`;

      case 'format':
        return `Value '${value}' is not a valid ${error.params.format} at ${path}`;

      case 'additionalProperties':
        return `Additional property '${error.params.additionalProperty}' is not allowed at ${path}`;

      case 'uniqueItems':
        return `Array items must be unique at ${path} (duplicate at index ${error.params.j})`;

      case 'minItems':
        return `Array is too short (${value?.length || 0} items, minimum ${error.params.limit}) at ${path}`;

      case 'maxItems':
        return `Array is too long (${value?.length || 0} items, maximum ${error.params.limit}) at ${path}`;

      default:
        return `${error.message} at ${path}`;
    }
  }

  /**
   * Get loaded schemas
   */
  getLoadedSchemas() {
    return Array.from(this.schemas.keys());
  }

  /**
   * Check if schema is loaded
   */
  hasSchema(schemaId) {
    return this.schemas.has(schemaId);
  }

  /**
   * Get schema by ID
   */
  getSchema(schemaId) {
    return this.schemas.get(schemaId);
  }

  /**
   * Remove schema
   */
  removeSchema(schemaId) {
    if (this.schemas.has(schemaId)) {
      this.schemas.delete(schemaId);
      this.validators.delete(schemaId);
      this.ajv.removeSchema(schemaId);
      return true;
    }
    return false;
  }

  /**
   * Clear all schemas
   */
  clearSchemas() {
    this.schemas.clear();
    this.validators.clear();
    this.ajv = new Ajv({ allErrors: true });
    addFormats(this.ajv);
  }

  /**
   * Validate multiple objects against the same schema
   */
  validateMany(dataArray, schemaId) {
    const results = [];

    for (let i = 0; i < dataArray.length; i++) {
      try {
        const result = this.validate(dataArray[i], schemaId);
        results.push({
          index: i,
          valid: result.valid,
          errors: result.errors,
          data: result.data,
        });
      } catch (error) {
        results.push({
          index: i,
          valid: false,
          errors: [error.message],
          data: dataArray[i],
        });
      }
    }

    return {
      results,
      allValid: results.every(r => r.valid),
      validCount: results.filter(r => r.valid).length,
      invalidCount: results.filter(r => !r.valid).length,
    };
  }

  /**
   * Create a reusable validator function
   */
  createValidator(schemaId) {
    const validator = this.validators.get(schemaId);
    if (!validator) {
      throw new Error(`Schema not found: ${schemaId}`);
    }

    return data => {
      const valid = validator(data);
      return {
        valid,
        errors: valid ? [] : this.formatErrors(validator.errors),
        data,
      };
    };
  }

  /**
   * Validate with custom error handler
   */
  validateWith(data, schemaId, errorHandler) {
    const result = this.validate(data, schemaId);

    if (!result.valid && errorHandler) {
      errorHandler(result.errors, data);
    }

    return result;
  }

  /**
   * Add custom keyword to AJV
   */
  addKeyword(keyword, definition) {
    try {
      this.ajv.addKeyword(keyword, definition);
    } catch (error) {
      throw new Error(
        `Failed to add custom keyword '${keyword}': ${error.message}`
      );
    }
  }

  /**
   * Static method to quickly validate with inline schema
   */
  static validateInline(data, schema, options = {}) {
    const validator = new SchemaValidator(options);
    const schemaId = 'inline';
    validator.loadSchema(schema, schemaId);
    return validator.validate(data, schemaId);
  }

  /**
   * Static method to create validator with common schemas
   */
  static createWithCommonSchemas() {
    const validator = new SchemaValidator();

    // Load common schemas
    const commonSchemas = {
      uuid: {
        type: 'string',
        format: 'uuid',
      },
      email: {
        type: 'string',
        format: 'email',
      },
      uri: {
        type: 'string',
        format: 'uri',
      },
      'date-time': {
        type: 'string',
        format: 'date-time',
      },
      'positive-integer': {
        type: 'integer',
        minimum: 1,
      },
      'non-negative-integer': {
        type: 'integer',
        minimum: 0,
      },
    };

    for (const [id, schema] of Object.entries(commonSchemas)) {
      validator.loadSchema(schema, id);
    }

    return validator;
  }

  /**
   * Generate schema from sample data (basic implementation)
   */
  static generateSchemaFromSample(sampleData, options = {}) {
    const schema = {
      type: SchemaValidator._inferType(sampleData),
      ...options.schemaOptions,
    };

    if (Array.isArray(sampleData)) {
      schema.items = SchemaValidator.generateSchemaFromSample(sampleData[0]);
    } else if (typeof sampleData === 'object' && sampleData !== null) {
      schema.properties = {};
      schema.required = [];

      for (const [key, value] of Object.entries(sampleData)) {
        schema.properties[key] =
          SchemaValidator.generateSchemaFromSample(value);
        if (value !== null && value !== undefined) {
          schema.required.push(key);
        }
      }

      schema.additionalProperties = options.allowAdditionalProperties !== false;
    }

    return schema;
  }

  /**
   * Infer JSON schema type from JavaScript value
   */
  static _inferType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'integer' : 'number';
    }
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'object') return 'object';

    return 'string'; // fallback
  }
}

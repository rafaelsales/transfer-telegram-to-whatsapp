import Ajv from 'ajv';
import addFormats from 'ajv-formats';

/**
 * Base validator class to eliminate code duplication across models
 * Provides common validation patterns and AJV initialization
 */
export class BaseValidator {
  /**
   * Initialize AJV validator with schema
   * @param {Object} schema - JSON schema for validation
   * @returns {Function} - Compiled AJV validator
   */
  static createValidator(schema) {
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    return ajv.compile(schema);
  }

  /**
   * Format AJV validation errors for display
   * @param {Array} errors - AJV validation errors
   * @returns {string} - Formatted error message
   */
  static formatErrors(errors) {
    return errors.map(err => `${err.instancePath} ${err.message}`).join(', ');
  }

  /**
   * Validate data against a validator function
   * @param {Function} validator - Compiled AJV validator
   * @param {Object} data - Data to validate
   * @param {string} modelName - Name of the model for error messages
   * @throws {Error} - If validation fails
   */
  static validate(validator, data, modelName) {
    const valid = validator(data);
    if (!valid) {
      throw new Error(
        `${modelName} validation failed: ${BaseValidator.formatErrors(validator.errors)}`
      );
    }
  }

  /**
   * Create a lazy-initialized validator for a model
   * @param {Function} getSchema - Function that returns the schema
   * @param {string} modelName - Name of the model
   * @returns {Object} - Validator methods
   */
  static createLazyValidator(getSchema, modelName) {
    let _validator = null;

    return {
      getValidator() {
        if (!_validator) {
          _validator = BaseValidator.createValidator(getSchema());
        }
        return _validator;
      },

      validate(data) {
        BaseValidator.validate(this.getValidator(), data, modelName);
      },

      resetValidator() {
        _validator = null;
      },
    };
  }
}

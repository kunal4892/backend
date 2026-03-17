/******************************************************************************************
 * ✅ Input Validation & Sanitization Utility
 *
 * Provides production-ready validation with:
 *  ✅ XSS prevention
 *  ✅ SQL injection prevention
 *  ✅ Input sanitization
 *  ✅ Schema validation
 *  ✅ Phone number validation
 *  ✅ Email validation
 *  ✅ Message content validation
 *  ✅ Persona ID validation
 ******************************************************************************************/

import { Logger } from "./logger.ts";

// Validation result
export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors: ValidationError[];
  sanitized?: Record<string, unknown>;
}

// Validation error
export interface ValidationError {
  field: string;
  message: string;
  code: ValidationErrorCode;
}

// Error codes
export enum ValidationErrorCode {
  REQUIRED = "REQUIRED",
  INVALID_TYPE = "INVALID_TYPE",
  INVALID_FORMAT = "INVALID_FORMAT",
  TOO_SHORT = "TOO_SHORT",
  TOO_LONG = "TOO_LONG",
  CONTAINS_XSS = "CONTAINS_XSS",
  CONTAINS_INJECTION = "CONTAINS_INJECTION",
  INVALID_PHONE = "INVALID_PHONE",
  INVALID_EMAIL = "INVALID_EMAIL",
  INVALID_UUID = "INVALID_UUID",
  CONTAINS_FORBIDDEN = "CONTAINS_FORBIDDEN",
}

// Validation rules
export interface ValidationRules {
  required?: boolean;
  type?: "string" | "number" | "boolean" | "object" | "array";
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  sanitize?: boolean;
  trim?: boolean;
  lowercase?: boolean;
  allowedValues?: unknown[];
  customValidator?: (value: unknown) => string | null;
}

// Schema definition
export type ValidationSchema = Record<string, ValidationRules>;

// ============================================================================
// Sanitization Functions
// ============================================================================

// HTML escape special characters
export function escapeHtml(input: string): string {
  const htmlEscapes: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "/": "&#x2F;",
  };
  
  return input.replace(/[&<>"'\/]/g, (char) => htmlEscapes[char] || char);
}

// Remove HTML tags
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}

// Sanitize string input
export function sanitizeString(input: string, options: {
  escapeHtml?: boolean;
  stripHtml?: boolean;
  trim?: boolean;
  lowercase?: boolean;
  maxLength?: number;
} = {}): string {
  let sanitized = input;
  
  if (options.stripHtml !== false) {
    sanitized = stripHtml(sanitized);
  }
  
  if (options.escapeHtml) {
    sanitized = escapeHtml(sanitized);
  }
  
  if (options.trim !== false) {
    sanitized = sanitized.trim();
  }
  
  if (options.lowercase) {
    sanitized = sanitized.toLowerCase();
  }
  
  if (options.maxLength && sanitized.length > options.maxLength) {
    sanitized = sanitized.substring(0, options.maxLength);
  }
  
  return sanitized;
}

// ============================================================================
// Security Checks
// ============================================================================

// XSS patterns to detect
const XSS_PATTERNS = [
  /<script[^\u003e]*>[\s\S]*?<\/script>/gi,  // Script tags
  /<script[^\u003e]*>/gi,                    // Script start tags
  /javascript:/gi,                              // JavaScript protocol
  /on\w+\s*=/gi,                              // Event handlers (onclick, onload, etc.)
  /<iframe/gi,                                // Iframes
  /<object/gi,                                // Objects
  /<embed/gi,                                 // Embeds
  /data:text\/html/gi,                         // Data URIs
  /expression\s*\(/gi,                         // CSS expressions
  /eval\s*\(/gi,                               // Eval function
  /new\s+Function\s*\(/gi,                     // Function constructor
  /setTimeout\s*\(/gi,                         // setTimeout with string
  /setInterval\s*\(/gi,                        // setInterval with string
];

// SQL injection patterns
const SQL_INJECTION_PATTERNS = [
  /(\%27)|(\')|(\-\-)|(\%23)|(#)/gi,         // Single quote, comment
  /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/gi, // Equals with quote/comment
  /\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|WHERE|AND|OR)\b/gi, // SQL keywords
  /(\%3B)|(;)/gi,                             // Semicolons
  /(\%27)|(\')/gi,                           // Single quotes
  /(\%22)|(\")/gi,                           // Double quotes
];

// Check for XSS attempts
export function containsXss(input: string): boolean {
  return XSS_PATTERNS.some(pattern => pattern.test(input));
}

// Check for SQL injection attempts
export function containsSqlInjection(input: string): boolean {
  return SQL_INJECTION_PATTERNS.some(pattern => pattern.test(input));
}

// Forbidden characters/patterns
const FORBIDDEN_PATTERNS = [
  /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, // Control characters
  /\u200b|\u200c|\u200d|\ufeff/g,      // Zero-width characters
];

// Check for forbidden characters
export function containsForbiddenChars(input: string): boolean {
  return FORBIDDEN_PATTERNS.some(pattern => pattern.test(input));
}

// ============================================================================
// Specific Validators
// ============================================================================

// Validate phone number (Indian format + international)
export function validatePhone(phone: string): { valid: boolean; normalized?: string } {
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, "");
  
  // Indian phone numbers: 10 digits, optionally with +91 prefix
  if (cleaned.length === 10) {
    // Add +91 prefix
    return { valid: true, normalized: `+91${cleaned}` };
  }
  
  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    // Already has 91 prefix
    return { valid: true, normalized: `+${cleaned}` };
  }
  
  if (cleaned.length === 11 && cleaned.startsWith("0")) {
    // Starts with 0, convert to +91
    return { valid: true, normalized: `+91${cleaned.substring(1)}` };
  }
  
  // International format (must start with country code)
  if (cleaned.length >= 10 && cleaned.length <= 15) {
    return { valid: true, normalized: `+${cleaned}` };
  }
  
  return { valid: false };
}

// Validate email
export function validateEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(email) && email.length <= 254;
}

// Validate UUID
export function validateUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// Validate persona ID (alphanumeric with hyphens, 3-50 chars)
export function validatePersonaId(personaId: string): boolean {
  const personaIdRegex = /^[a-zA-Z0-9-_]{3,50}$/;
  return personaIdRegex.test(personaId);
}

// Validate chat message
export interface MessageValidationOptions {
  maxLength?: number;
  minLength?: number;
  allowEmpty?: boolean;
}

export function validateMessage(
  message: string,
  options: MessageValidationOptions = {}
): ValidationResult<string> {
  const errors: ValidationError[] = [];
  const { maxLength = 2000, minLength = 1, allowEmpty = false } = options;
  
  // Check if empty
  if (!message || message.trim().length === 0) {
    if (!allowEmpty) {
      errors.push({
        field: "message",
        message: "Message is required",
        code: ValidationErrorCode.REQUIRED,
      });
    }
    return { valid: errors.length === 0, errors };
  }
  
  // Check minimum length
  if (message.trim().length < minLength) {
    errors.push({
      field: "message",
      message: `Message must be at least ${minLength} characters`,
      code: ValidationErrorCode.TOO_SHORT,
    });
  }
  
  // Check maximum length
  if (message.length > maxLength) {
    errors.push({
      field: "message",
      message: `Message must not exceed ${maxLength} characters`,
      code: ValidationErrorCode.TOO_LONG,
    });
  }
  
  // Check for XSS
  if (containsXss(message)) {
    errors.push({
      field: "message",
      message: "Message contains potentially dangerous content",
      code: ValidationErrorCode.CONTAINS_XSS,
    });
  }
  
  // Check for SQL injection
  if (containsSqlInjection(message)) {
    errors.push({
      field: "message",
      message: "Message contains invalid characters",
      code: ValidationErrorCode.CONTAINS_INJECTION,
    });
  }
  
  // Check for forbidden characters
  if (containsForbiddenChars(message)) {
    errors.push({
      field: "message",
      message: "Message contains invalid characters",
      code: ValidationErrorCode.CONTAINS_FORBIDDEN,
    });
  }
  
  // Sanitize the message
  const sanitized = sanitizeString(message, {
    stripHtml: true,
    trim: true,
    maxLength,
  });
  
  return {
    valid: errors.length === 0,
    data: sanitized,
    errors,
    sanitized: { message: sanitized },
  };
}

// ============================================================================
// Schema Validation
// ============================================================================

// Validate a single field
function validateField(
  fieldName: string,
  value: unknown,
  rules: ValidationRules
): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // Check required
  if (rules.required && (value === undefined || value === null || value === "")) {
    errors.push({
      field: fieldName,
      message: `${fieldName} is required`,
      code: ValidationErrorCode.REQUIRED,
    });
    return errors;
  }
  
  // Skip further validation if value is empty and not required
  if (value === undefined || value === null || value === "") {
    return errors;
  }
  
  // Check type
  if (rules.type) {
    const actualType = Array.isArray(value) ? "array" : typeof value;
    if (actualType !== rules.type) {
      errors.push({
        field: fieldName,
        message: `${fieldName} must be a ${rules.type}`,
        code: ValidationErrorCode.INVALID_TYPE,
      });
      return errors;
    }
  }
  
  // String-specific validations
  if (typeof value === "string") {
    // Check min length
    if (rules.minLength !== undefined && value.length < rules.minLength) {
      errors.push({
        field: fieldName,
        message: `${fieldName} must be at least ${rules.minLength} characters`,
        code: ValidationErrorCode.TOO_SHORT,
      });
    }
    
    // Check max length
    if (rules.maxLength !== undefined && value.length > rules.maxLength) {
      errors.push({
        field: fieldName,
        message: `${fieldName} must not exceed ${rules.maxLength} characters`,
        code: ValidationErrorCode.TOO_LONG,
      });
    }
    
    // Check pattern
    if (rules.pattern && !rules.pattern.test(value)) {
      errors.push({
        field: fieldName,
        message: `${fieldName} has invalid format`,
        code: ValidationErrorCode.INVALID_FORMAT,
      });
    }
    
    // Check allowed values
    if (rules.allowedValues && !rules.allowedValues.includes(value)) {
      errors.push({
        field: fieldName,
        message: `${fieldName} has invalid value`,
        code: ValidationErrorCode.INVALID_FORMAT,
      });
    }
    
    // Security checks
    if (containsXss(value)) {
      errors.push({
        field: fieldName,
        message: `${fieldName} contains potentially dangerous content`,
        code: ValidationErrorCode.CONTAINS_XSS,
      });
    }
    
    if (containsSqlInjection(value)) {
      errors.push({
        field: fieldName,
        message: `${fieldName} contains invalid characters`,
        code: ValidationErrorCode.CONTAINS_INJECTION,
      });
    }
  }
  
  // Custom validator
  if (rules.customValidator) {
    const customError = rules.customValidator(value);
    if (customError) {
      errors.push({
        field: fieldName,
        message: customError,
        code: ValidationErrorCode.INVALID_FORMAT,
      });
    }
  }
  
  return errors;
}

// Validate data against schema
export function validateSchema<T extends Record<string, unknown>>(
  data: unknown,
  schema: ValidationSchema
): ValidationResult<T> {
  const errors: ValidationError[] = [];
  const sanitized: Record<string, unknown> = {};
  
  // Ensure data is an object
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {
      valid: false,
      errors: [{
        field: "_root",
        message: "Data must be an object",
        code: ValidationErrorCode.INVALID_TYPE,
      }],
    };
  }
  
  const objData = data as Record<string, unknown>;
  
  // Validate each field in schema
  for (const [fieldName, rules] of Object.entries(schema)) {
    const value = objData[fieldName];
    const fieldErrors = validateField(fieldName, value, rules);
    errors.push(...fieldErrors);
    
    // Sanitize if valid and is string
    if (fieldErrors.length === 0 && typeof value === "string") {
      sanitized[fieldName] = sanitizeString(value, {
        trim: rules.trim !== false,
        lowercase: rules.lowercase,
        maxLength: rules.maxLength,
      });
    } else if (value !== undefined) {
      sanitized[fieldName] = value;
    }
  }
  
  // Check for extra fields (potential injection)
  const schemaFields = Object.keys(schema);
  const extraFields = Object.keys(objData).filter(key => !schemaFields.includes(key));
  
  if (extraFields.length > 0) {
    errors.push({
      field: "_extra",
      message: `Unexpected fields: ${extraFields.join(", ")}`,
      code: ValidationErrorCode.INVALID_FORMAT,
    });
  }
  
  return {
    valid: errors.length === 0,
    data: errors.length === 0 ? (sanitized as T) : undefined,
    errors,
    sanitized,
  };
}

// ============================================================================
// Predefined Schemas
// ============================================================================

// Chat request schema
export const chatRequestSchema: ValidationSchema = {
  personaId: {
    required: true,
    type: "string",
    minLength: 3,
    maxLength: 50,
    customValidator: (value) => {
      if (!validatePersonaId(value as string)) {
        return "Invalid persona ID format";
      }
      return null;
    },
  },
  text: {
    required: true,
    type: "string",
    minLength: 1,
    maxLength: 2000,
  },
};

// Registration request schema
export const registrationRequestSchema: ValidationSchema = {
  phone: {
    required: true,
    type: "string",
    customValidator: (value) => {
      const result = validatePhone(value as string);
      if (!result.valid) {
        return "Invalid phone number format";
      }
      return null;
    },
  },
  fcm_token: {
    required: false,
    type: "string",
    maxLength: 500,
  },
  gender: {
    required: false,
    type: "string",
    allowedValues: ["male", "female", "other", "prefer_not_to_say"],
  },
  age: {
    required: false,
    type: "number",
  },
  city: {
    required: false,
    type: "string",
    maxLength: 100,
  },
};

// Persona manager request schema
export const personaManagerSchema: ValidationSchema = {
  action: {
    required: true,
    type: "string",
    allowedValues: ["buildContext", "buildPromptTemplate", "buildPromptChain"],
  },
  personaId: {
    required: true,
    type: "string",
    minLength: 3,
    maxLength: 50,
  },
  phone: {
    required: true,
    type: "string",
  },
  isFirst: {
    required: false,
    type: "boolean",
  },
  // Optional fields for buildPromptChain
  history: {
    required: false,
    type: "array",
  },
  currentMessage: {
    required: false,
    type: "string",
    maxLength: 2000,
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

// Create a validator function for a specific schema
export function createValidator<T extends Record<string, unknown>>(
  schema: ValidationSchema,
  options: { logger?: Logger; logValidationErrors?: boolean } = {}
) {
  return function validate(data: unknown): ValidationResult<T> {
    const result = validateSchema<T>(data, schema);
    
    if (!result.valid && options.logValidationErrors && options.logger) {
      options.logger.warn("Validation failed", {
        errors: result.errors.map(e => ({ field: e.field, code: e.code })),
      });
    }
    
    return result;
  };
}

// Quick validation helpers
export const validators = {
  chatRequest: createValidator<{ personaId: string; text: string }>(chatRequestSchema),
  registrationRequest: createValidator<{
    phone: string;
    fcm_token?: string;
    gender?: string;
    age?: number;
    city?: string;
  }>(registrationRequestSchema),
  personaManager: createValidator<{
    action: string;
    personaId: string;
    phone: string;
    isFirst?: boolean;
  }>(personaManagerSchema),
};

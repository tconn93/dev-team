/**
 * Safety checks for file operations and command execution.
 * Prevents destructive operations on critical files and dangerous commands.
 */

// Files and directories that are completely protected (no writes/deletes)
const CRITICAL_PROTECTED = [
    /^\.git(\/|$)/,           // Git directory
    /^node_modules(\/|$)/,    // Node dependencies
    /^venv(\/|$)/,            // Python virtual environment
    /^\.venv(\/|$)/,          // Python virtual environment (alternate)
];

// Files that should generate warnings but are allowed
const SENSITIVE_FILES = [
    /^\.env$/,                // Environment variables
    /^package\.json$/,        // Package manifest
    /^package-lock\.json$/,   // Package lock file
];

// Dangerous command patterns that should be blocked
const DANGEROUS_COMMANDS = [
    /rm\s+-rf\s+\/($|\s)/,           // Delete root directory
    /:\(\)\s*\{\s*:\s*\|\s*:/,       // Fork bomb
    /mkfs\./,                         // Format filesystem
    /dd\s+if=/,                       // Disk operations
    />\s*\/dev\/sd[a-z]/,            // Write to disk devices
    /wget.*\|\s*sh/,                  // Remote code execution
    /curl.*\|\s*(bash|sh)/,           // Remote code execution
    /chmod\s+-R\s+777\s+\//,          // Dangerous permissions on root
];

/**
 * Checks if a file path is critically protected (complete block).
 *
 * @param {string} filePath - The file path to check (relative)
 * @returns {boolean} True if the file is critically protected
 */
export function isProtectedFile(filePath) {
    return CRITICAL_PROTECTED.some(pattern => pattern.test(filePath));
}

/**
 * Checks if a file path is sensitive (warning required).
 *
 * @param {string} filePath - The file path to check (relative)
 * @returns {boolean} True if the file is sensitive
 */
export function isSensitiveFile(filePath) {
    return SENSITIVE_FILES.some(pattern => pattern.test(filePath));
}

/**
 * Checks if a command contains dangerous patterns.
 *
 * @param {string} command - The command to check
 * @returns {boolean} True if the command is dangerous
 */
export function containsDangerousCommand(command) {
    return DANGEROUS_COMMANDS.some(pattern => pattern.test(command));
}

/**
 * Validates file size is within limits.
 *
 * @param {number} size - File size in bytes
 * @param {number} maxSize - Maximum allowed size (default 10MB)
 * @returns {boolean} True if size is acceptable
 */
export function isFileSizeAcceptable(size, maxSize = 10 * 1024 * 1024) {
    return size <= maxSize;
}

/**
 * Gets a user-friendly error message for protected files.
 *
 * @param {string} filePath - The protected file path
 * @returns {string} Error message
 */
export function getProtectedFileError(filePath) {
    if (/^\.git(\/|$)/.test(filePath)) {
        return `Cannot modify .git directory: ${filePath}`;
    }
    if (/^node_modules(\/|$)/.test(filePath)) {
        return `Cannot modify node_modules: ${filePath}. Use npm commands instead.`;
    }
    if (/^venv(\/|$)/.test(filePath) || /^\.venv(\/|$)/.test(filePath)) {
        return `Cannot modify Python virtual environment: ${filePath}. Use pip commands instead.`;
    }
    return `Cannot modify protected file or directory: ${filePath}`;
}

/**
 * Gets a warning message for sensitive files.
 *
 * @param {string} filePath - The sensitive file path
 * @returns {string} Warning message
 */
export function getSensitiveFileWarning(filePath) {
    if (/^\.env$/.test(filePath)) {
        return `Warning: Modifying .env file. Ensure no secrets are exposed.`;
    }
    if (/^package\.json$/.test(filePath) || /^package-lock\.json$/.test(filePath)) {
        return `Warning: Modifying ${filePath}. Run 'npm install' after changes.`;
    }
    return `Warning: Modifying sensitive file: ${filePath}`;
}

import path from 'path';

/**
 * Resolves a relative path to an absolute path and validates it's within the base directory.
 * This prevents path traversal attacks.
 *
 * @param {string} relativePath - The relative path to resolve
 * @param {string} baseDir - The base directory (project root)
 * @returns {string} The resolved absolute path
 * @throws {Error} If the path escapes the base directory
 */
export function resolvePath(relativePath, baseDir) {
    // Normalize the base directory
    const normalizedBase = path.resolve(baseDir);

    // Resolve the relative path against the base directory
    const resolved = path.resolve(normalizedBase, relativePath);

    // Security check: ensure the resolved path is within the base directory
    // This prevents path traversal attacks like ../../../etc/passwd
    if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
        throw new Error(
            `Security violation: Path '${relativePath}' escapes project directory. ` +
            `Resolved to: ${resolved}, Base: ${normalizedBase}`
        );
    }

    return resolved;
}

/**
 * Validates that a path is safe and within the project directory.
 *
 * @param {string} relativePath - The path to validate
 * @param {string} baseDir - The base directory
 * @returns {boolean} True if the path is safe
 */
export function isPathSafe(relativePath, baseDir) {
    try {
        resolvePath(relativePath, baseDir);
        return true;
    } catch (error) {
        return false;
    }
}

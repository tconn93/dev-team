import fs from 'fs/promises';
import path from 'path';
import { resolvePath } from '../utils/pathResolver.js';
import {
    isProtectedFile,
    isSensitiveFile,
    getProtectedFileError,
    getSensitiveFileWarning,
    isFileSizeAcceptable
} from '../utils/safetyChecks.js';

/**
 * Reads a file and returns its contents along with metadata.
 *
 * @param {object} args - { path: string }
 * @param {object} context - { cwd, baseDir }
 * @returns {Promise<object>} Result with content and metadata
 */
export async function readFile(args, context) {
    const { path: filePath } = args;

    if (!filePath) {
        throw new Error('Missing required argument: path');
    }

    // Resolve and validate path
    const resolved = resolvePath(filePath, context.baseDir);

    // Read file
    const content = await fs.readFile(resolved, 'utf-8');
    const stats = await fs.stat(resolved);

    return {
        summary: `Read ${filePath} (${stats.size} bytes)`,
        content,
        size: stats.size,
        path: filePath,
        lines: content.split('\n').length
    };
}

/**
 * Writes content to a file, creating it if it doesn't exist.
 *
 * @param {object} args - { path: string, content: string }
 * @param {object} context - { cwd, baseDir }
 * @returns {Promise<object>} Result with operation summary
 */
export async function writeFile(args, context) {
    const { path: filePath, content } = args;

    if (!filePath) {
        throw new Error('Missing required argument: path');
    }
    if (content === undefined) {
        throw new Error('Missing required argument: content');
    }

    // Safety checks
    if (isProtectedFile(filePath)) {
        throw new Error(getProtectedFileError(filePath));
    }

    // Check file size
    if (!isFileSizeAcceptable(content.length)) {
        throw new Error(`Content too large (${content.length} bytes). Maximum is 10MB.`);
    }

    // Resolve and validate path
    const resolved = resolvePath(filePath, context.baseDir);

    // Check if file exists
    const existed = await fs.access(resolved).then(() => true).catch(() => false);

    // Ensure parent directory exists
    const dir = path.dirname(resolved);
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(resolved, content, 'utf-8');

    // Generate warning for sensitive files
    let warning = null;
    if (isSensitiveFile(filePath)) {
        warning = getSensitiveFileWarning(filePath);
    }

    const lines = content.split('\n').length;
    const summary = existed
        ? `Updated ${filePath} (${lines} lines, ${content.length} chars)`
        : `Created ${filePath} (${lines} lines, ${content.length} chars)`;

    return {
        summary,
        path: filePath,
        lines,
        size: content.length,
        created: !existed,
        warning
    };
}

/**
 * Edits a file by finding and replacing text.
 *
 * @param {object} args - { path: string, find: string, replace: string }
 * @param {object} context - { cwd, baseDir }
 * @returns {Promise<object>} Result with replacement count
 */
export async function editFile(args, context) {
    const { path: filePath, find, replace } = args;

    if (!filePath) {
        throw new Error('Missing required argument: path');
    }
    if (find === undefined) {
        throw new Error('Missing required argument: find');
    }
    if (replace === undefined) {
        throw new Error('Missing required argument: replace');
    }

    // Safety checks
    if (isProtectedFile(filePath)) {
        throw new Error(getProtectedFileError(filePath));
    }

    // Resolve and validate path
    const resolved = resolvePath(filePath, context.baseDir);

    // Read current content
    let content = await fs.readFile(resolved, 'utf-8');

    // Count matches before replacement
    const regex = new RegExp(escapeRegex(find), 'g');
    const matches = (content.match(regex) || []).length;

    if (matches === 0) {
        throw new Error(`Pattern not found in ${filePath}: "${find}"`);
    }

    // Perform replacement
    content = content.replace(regex, replace);

    // Check file size
    if (!isFileSizeAcceptable(content.length)) {
        throw new Error(`Resulting content too large (${content.length} bytes). Maximum is 10MB.`);
    }

    // Write back
    await fs.writeFile(resolved, content, 'utf-8');

    // Generate warning for sensitive files
    let warning = null;
    if (isSensitiveFile(filePath)) {
        warning = getSensitiveFileWarning(filePath);
    }

    return {
        summary: `Edited ${filePath} (${matches} replacement${matches > 1 ? 's' : ''})`,
        path: filePath,
        replacements: matches,
        find,
        replace,
        warning
    };
}

/**
 * Escapes special regex characters in a string for literal matching.
 *
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

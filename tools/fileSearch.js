import { glob } from 'glob';
import fs from 'fs/promises';
import path from 'path';

/**
 * Searches for files matching a glob pattern.
 *
 * @param {object} args - { pattern: string }
 * @param {object} context - { cwd, baseDir }
 * @returns {Promise<object>} Result with matching file paths
 */
export async function globSearch(args, context) {
    const { pattern } = args;

    if (!pattern) {
        throw new Error('Missing required argument: pattern');
    }

    // Search for files matching the pattern
    const files = await glob(pattern, {
        cwd: context.baseDir,
        ignore: ['node_modules/**', '.git/**', 'venv/**', '.venv/**', '__pycache__/**'],
        nodir: true,
        dot: false // Don't match hidden files by default
    });

    return {
        summary: `Found ${files.length} file${files.length !== 1 ? 's' : ''} matching "${pattern}"`,
        pattern,
        files,
        count: files.length,
        details: files.length > 0 ? files.slice(0, 20).join('\n') : 'No files found'
    };
}

/**
 * Searches file contents for a pattern (grep).
 *
 * @param {object} args - { pattern: string, filePattern?: string, caseSensitive?: boolean, maxResults?: number }
 * @param {object} context - { cwd, baseDir }
 * @returns {Promise<object>} Result with matching lines
 */
export async function grepSearch(args, context) {
    const {
        pattern,
        filePattern = '**/*',
        caseSensitive = true,
        maxResults = 100
    } = args;

    if (!pattern) {
        throw new Error('Missing required argument: pattern');
    }

    // Create regex for pattern matching
    const flags = caseSensitive ? 'g' : 'gi';
    let regex;
    try {
        regex = new RegExp(pattern, flags);
    } catch (error) {
        throw new Error(`Invalid regex pattern: ${pattern}. Error: ${error.message}`);
    }

    // Find files to search
    const files = await glob(filePattern, {
        cwd: context.baseDir,
        ignore: ['node_modules/**', '.git/**', 'venv/**', '.venv/**', '__pycache__/**', '*.min.js', '*.bundle.js'],
        nodir: true,
        dot: false
    });

    const matches = [];

    // Search through files
    for (const file of files) {
        const filePath = path.join(context.baseDir, file);

        // Skip binary files and very large files
        const stats = await fs.stat(filePath).catch(() => null);
        if (!stats || stats.size > 1024 * 1024) { // Skip files > 1MB
            continue;
        }

        // Read file content
        const content = await fs.readFile(filePath, 'utf-8').catch(() => null);
        if (!content) continue;

        // Search line by line
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
                matches.push({
                    file,
                    line: i + 1,
                    content: lines[i].trim()
                });

                // Stop if we've hit max results
                if (matches.length >= maxResults) {
                    break;
                }
            }

            // Reset regex lastIndex for global flag
            regex.lastIndex = 0;
        }

        if (matches.length >= maxResults) {
            break;
        }
    }

    // Format details for display
    const details = matches.slice(0, 20).map(m =>
        `${m.file}:${m.line}: ${m.content.substring(0, 100)}`
    ).join('\n');

    return {
        summary: `Found ${matches.length} match${matches.length !== 1 ? 'es' : ''} for "${pattern}"${matches.length >= maxResults ? ' (limit reached)' : ''}`,
        pattern,
        filePattern,
        matches,
        totalMatches: matches.length,
        limitReached: matches.length >= maxResults,
        details: details || 'No matches found'
    };
}

import vm from 'vm';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execPromise = promisify(exec);

const DEFAULT_TIMEOUT = 10000; // 10 seconds

/**
 * Executes code in a specified language.
 *
 * @param {object} args - { language: string, code: string, timeout?: number }
 * @param {object} context - { cwd, baseDir }
 * @returns {Promise<object>} Result with output and/or errors
 */
export async function execute(args, context) {
    const { language, code, timeout = DEFAULT_TIMEOUT } = args;

    if (!language) {
        throw new Error('Missing required argument: language');
    }
    if (!code) {
        throw new Error('Missing required argument: code');
    }

    // Normalize language name
    const lang = language.toLowerCase();

    switch (lang) {
        case 'javascript':
        case 'js':
            return await executeJavaScript(code, timeout);

        case 'python':
        case 'py':
        case 'python3':
            return await executePython(code, timeout, context.baseDir);

        default:
            throw new Error(
                `Unsupported language: ${language}. ` +
                `Supported languages: javascript, js, python, py`
            );
    }
}

/**
 * Executes JavaScript code in a sandboxed environment.
 *
 * @param {string} code - JavaScript code to execute
 * @param {number} timeout - Execution timeout in milliseconds
 * @returns {Promise<object>} Execution result
 */
async function executeJavaScript(code, timeout) {
    const output = [];
    const errors = [];

    // Create a sandboxed context
    const sandbox = {
        console: {
            log: (...args) => output.push(args.map(String).join(' ')),
            error: (...args) => errors.push(args.map(String).join(' ')),
            warn: (...args) => errors.push('WARN: ' + args.map(String).join(' ')),
            info: (...args) => output.push('INFO: ' + args.map(String).join(' '))
        },
        setTimeout: undefined,
        setInterval: undefined,
        setImmediate: undefined,
        // Allow common globals
        Math,
        Date,
        JSON,
        Array,
        Object,
        String,
        Number,
        Boolean
    };

    try {
        // Create context and script
        const context = vm.createContext(sandbox);
        const script = new vm.Script(code);

        // Run with timeout
        const result = script.runInContext(context, {
            timeout,
            displayErrors: true
        });

        const outputText = output.join('\n');
        const errorText = errors.join('\n');

        return {
            summary: 'JavaScript execution completed',
            language: 'javascript',
            output: outputText,
            stderr: errorText,
            result: result !== undefined ? String(result) : undefined,
            details: outputText || errorText || (result !== undefined ? String(result) : 'No output')
        };

    } catch (error) {
        const outputText = output.join('\n');
        const errorText = errors.join('\n');

        return {
            summary: 'JavaScript execution failed',
            language: 'javascript',
            output: outputText,
            stderr: errorText,
            error: error.message,
            details: `Error: ${error.message}\n${errorText}`
        };
    }
}

/**
 * Executes Python code using subprocess.
 *
 * @param {string} code - Python code to execute
 * @param {number} timeout - Execution timeout in milliseconds
 * @param {string} baseDir - Base directory for execution
 * @returns {Promise<object>} Execution result
 */
async function executePython(code, timeout, baseDir) {
    // Create temporary file for Python code
    const tempFile = path.join(baseDir, `.temp_code_${Date.now()}_${Math.random().toString(36).substring(7)}.py`);

    try {
        // Write code to temp file
        await fs.writeFile(tempFile, code, 'utf-8');

        // Execute Python
        const { stdout, stderr } = await execPromise(`python3 ${path.basename(tempFile)}`, {
            cwd: baseDir,
            timeout,
            maxBuffer: 500000 // 500KB
        });

        const stdoutText = stdout ? stdout.trim() : '';
        const stderrText = stderr ? stderr.trim() : '';

        return {
            summary: 'Python execution completed',
            language: 'python',
            output: stdoutText,
            stderr: stderrText,
            details: stdoutText || (stderrText ? `stderr: ${stderrText}` : 'No output')
        };

    } catch (error) {
        // Check if it was a timeout
        if (error.killed && error.signal === 'SIGTERM') {
            throw new Error(
                `Python execution timed out after ${timeout / 1000} seconds.\n` +
                `Output so far:\n${error.stdout || error.stderr || '(none)'}`
            );
        }

        const stdoutText = error.stdout ? error.stdout.trim() : '';
        const stderrText = error.stderr ? error.stderr.trim() : '';

        return {
            summary: 'Python execution failed',
            language: 'python',
            output: stdoutText,
            stderr: stderrText,
            error: stderrText || error.message,
            details: `Error: ${stderrText || error.message}`
        };

    } finally {
        // Clean up temp file
        await fs.unlink(tempFile).catch(() => {
            // Ignore errors during cleanup
        });
    }
}

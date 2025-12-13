import { exec } from 'child_process';
import { promisify } from 'util';
import { containsDangerousCommand } from '../utils/safetyChecks.js';

const execPromise = promisify(exec);

// Configuration
const TIMEOUT = 30000; // 30 seconds
const MAX_OUTPUT = 500000; // 500KB

/**
 * Executes a bash command and returns the result.
 *
 * @param {object} args - { command: string }
 * @param {object} context - { cwd, baseDir }
 * @returns {Promise<object>} Result with stdout, stderr, and exit code
 */
export async function execute(args, context) {
    const { command } = args;

    if (!command) {
        throw new Error('Missing required argument: command');
    }

    // Safety check for dangerous commands
    if (containsDangerousCommand(command)) {
        throw new Error(
            `Dangerous command blocked for security: ${command}\n` +
            `This command pattern is not allowed.`
        );
    }

    try {
        const { stdout, stderr } = await execPromise(command, {
            cwd: context.baseDir,
            timeout: TIMEOUT,
            maxBuffer: MAX_OUTPUT,
            env: { ...process.env }
        });

        const stdoutText = stdout ? stdout.trim() : '';
        const stderrText = stderr ? stderr.trim() : '';

        return {
            summary: `Executed: ${command}`,
            command,
            stdout: stdoutText,
            stderr: stderrText,
            exitCode: 0,
            details: stdoutText || (stderrText ? `stderr: ${stderrText}` : 'Command completed successfully')
        };

    } catch (error) {
        // Command failed or timed out
        const stdoutText = error.stdout ? error.stdout.trim() : '';
        const stderrText = error.stderr ? error.stderr.trim() : '';
        const exitCode = error.code || 1;

        // If it was a timeout
        if (error.killed && error.signal === 'SIGTERM') {
            throw new Error(
                `Command timed out after ${TIMEOUT / 1000} seconds: ${command}\n` +
                `Output so far:\n${stdoutText || stderrText}`
            );
        }

        // Command failed with non-zero exit code
        const errorMessage = stderrText || error.message || 'Command failed';

        return {
            summary: `Command failed: ${command}`,
            command,
            stdout: stdoutText,
            stderr: stderrText,
            exitCode,
            error: errorMessage,
            details: `Exit code ${exitCode}: ${errorMessage}`
        };
    }
}

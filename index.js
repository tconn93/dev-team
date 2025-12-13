import { Agent } from './Agent.js';

// Helper function for command line input
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const rl = readline.createInterface({ input, output });

/**
 * Displays a formatted review of tool executions.
 * @param {Array} toolExecutions - Array of tool execution results
 */
function displayToolReview(toolExecutions) {
    if (!toolExecutions || toolExecutions.length === 0) {
        return;
    }

    console.log('\n' + '═'.repeat(70));
    console.log('                    AGENT ACTION REVIEW');
    console.log('═'.repeat(70));

    for (const result of toolExecutions) {
        const status = result.success ? '✓' : '✗';
        const statusColor = result.success ? '\x1b[32m' : '\x1b[31m'; // Green or Red
        const resetColor = '\x1b[0m';

        console.log(`\n${statusColor}[${status}]${resetColor} ${result.toolName}`);
        console.log(`    ${result.summary}`);

        if (result.warning) {
            console.log(`    \x1b[33m⚠ ${result.warning}\x1b[0m`);
        }

        if (result.error) {
            console.log(`    \x1b[31mError: ${result.error}\x1b[0m`);
        }

        // Show additional details if available
        if (result.details && result.details !== result.summary) {
            const detailLines = result.details.split('\n').slice(0, 10); // Limit to 10 lines
            for (const line of detailLines) {
                if (line.trim()) {
                    console.log(`    ${line}`);
                }
            }
            if (result.details.split('\n').length > 10) {
                console.log(`    ... (${result.details.split('\n').length - 10} more lines)`);
            }
        }
    }

    console.log('\n' + '═'.repeat(70) + '\n');
}

async function main() {
    console.log("Initializing Coding Agent...");
    try {
        const agent = new Agent();
        console.log("Agent Ready. Type your coding tasks or 'quit' to exit.");
        console.log("Available tools: file operations, bash execution, file search, code execution");
        console.log("-----------------------------------------------------");

        while (true) {
            const userInput = await rl.question('\nYou: ');

            if (userInput.toLowerCase() === 'quit') {
                console.log('Goodbye!');
                rl.close();
                break;
            }

            if (!userInput.trim()) {
                continue;
            }

            try {
                const result = await agent.generateResponse(userInput);

                // Display tool review if tools were used
                if (result.toolExecutions && result.toolExecutions.length > 0) {
                    displayToolReview(result.toolExecutions);
                }

                // Display agent's final message
                if (result.content) {
                    console.log(`\nAgent: ${result.content}\n`);
                } else {
                    console.log(`\nAgent: (Task completed)\n`);
                }

            } catch (error) {
                console.error(`\n\x1b[31mError: ${error.message}\x1b[0m\n`);
            }
        }

    } catch (error) {
        console.error("Agent initialization failed:", error.message);
        rl.close();
    }
}

main();

/**
 * Tool Registry and Dispatcher
 *
 * Maps tool names to their implementation modules and provides
 * a central dispatch function for executing tool calls.
 */

// Tool definitions mapping tool names to modules and handler functions
export const TOOL_DEFINITIONS = {
    file_read: { module: 'fileOperations', handler: 'readFile' },
    file_write: { module: 'fileOperations', handler: 'writeFile' },
    file_edit: { module: 'fileOperations', handler: 'editFile' },
    bash_execute: { module: 'bashExecution', handler: 'execute' },
    glob_search: { module: 'fileSearch', handler: 'globSearch' },
    grep_search: { module: 'fileSearch', handler: 'grepSearch' },
    code_execute: { module: 'codeExecution', handler: 'execute' }
};

// List of all available tool names for LLM
export const AVAILABLE_TOOLS = Object.keys(TOOL_DEFINITIONS);

/**
 * Executes a tool call by dispatching to the appropriate module.
 *
 * @param {string} toolName - The name of the tool to execute
 * @param {object} args - Arguments for the tool
 * @param {object} context - Execution context { cwd, baseDir }
 * @returns {Promise<object>} Tool execution result
 * @throws {Error} If tool doesn't exist or execution fails
 */
export async function executeToolCall(toolName, args, context) {
    // Validate tool exists
    const toolDef = TOOL_DEFINITIONS[toolName];
    if (!toolDef) {
        throw new Error(`Unknown tool: ${toolName}. Available tools: ${AVAILABLE_TOOLS.join(', ')}`);
    }

    try {
        // Dynamically import the tool module
        const module = await import(`./${toolDef.module}.js`);

        // Get the handler function
        const handler = module[toolDef.handler];
        if (!handler || typeof handler !== 'function') {
            throw new Error(`Tool handler '${toolDef.handler}' not found in module '${toolDef.module}'`);
        }

        // Execute the tool
        const result = await handler(args, context);

        return {
            success: true,
            ...result
        };

    } catch (error) {
        // Return structured error for LLM to understand
        return {
            success: false,
            error: error.name || 'Error',
            message: error.message,
            toolName
        };
    }
}

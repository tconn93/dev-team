import 'dotenv/config'; // Load .env file variables
import { executeToolCall } from './tools/index.js';
import { TOOL_DEFINITIONS } from './tools/definitions.js';
import fs from 'fs/promises';
/**
 * A coding AI Agent that interacts with an LLM API and can execute tools.
 * It relies on environment variables for configuration and supports tool calling.
 */
export class Agent {
    constructor() {
        // Load configurations from environment variables
        this.apiKey = process.env.LLM_PROVIDER_KEY;
        this.apiUrl = process.env.LLM_API_URL;
        this.model = process.env.LLM_MODEL;
        this.history = [];
        this.baseDir = process.cwd(); // Base directory for file operations

        if (!this.apiKey || !this.apiUrl || !this.model) {
            throw new Error("Missing LLM configuration in .env file. Check LLM_PROVIDER_KEY, LLM_API_URL, and LLM_MODEL.");
        }
    }

    /**
     * Main method to generate a response from the LLM with tool calling support.
     * @param {string} prompt - The user's input prompt.
     * @returns {Promise<object>} - Object with content and toolExecutions array
     */
    async generateResponse(prompt) {
        // Add the user message to the conversation history
        this.history.push({ role: "user", content: prompt });

        const MAX_ITERATIONS = 10;
        let iteration = 0;
        let toolExecutions = [];

        try {
            while (iteration < MAX_ITERATIONS) {
                iteration++;

                // Call LLM with tool support
                const response = await this.callLLM();
                const message = response.choices[0].message;

                // Add assistant message to history
                this.history.push({
                    role: "assistant",
                    content: message.content || ""
                });

                // Check for tool calls
                if (!message.tool_calls || message.tool_calls.length === 0) {
                    // No more tools - task complete
                    return {
                        content: message.content,
                        toolExecutions
                    };
                }

                // Execute all requested tools
                console.log(`\n--- Agent is executing ${message.tool_calls.length} tool(s)... ---`);
                const toolResults = await this.executeTools(message.tool_calls);
                toolExecutions.push(...toolResults);

                // Send tool results back to Xai API using response_id format
                const toolMessages = toolResults.map(result => ({
                    role: "tool",
                    tool_call_id: result.toolCallId,
                    content: JSON.stringify({
                        success: result.success,
                        summary: result.summary,
                        details: result.details,
                        error: result.error,
                        ...result.data
                    })
                }));

                // Call API again with tool results
                const toolResponseBody = {
                    response_id: response.id,
                    messages: toolMessages
                };

                const toolResponse = await fetch(this.apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`
                    },
                    body: JSON.stringify(toolResponseBody)
                });

                if (!toolResponse.ok) {
                    const errorText = await toolResponse.text();
                    throw new Error(`Xai tool feedback error: Status ${toolResponse.status}. Message: ${errorText}`);
                }

                const toolResponseData = await toolResponse.json();
                const toolMessage = toolResponseData.choices[0].message;

                // Add assistant's response after tool execution to history
                this.history.push({
                    role: "assistant",
                    content: toolMessage.content || ""
                });

                // Check if there are more tool calls
                if (!toolMessage.tool_calls || toolMessage.tool_calls.length === 0) {
                    // No more tools - task complete
                    return {
                        content: toolMessage.content,
                        toolExecutions
                    };
                }

                // Continue with new tool calls
                message = toolMessage;
            }

            // Max iterations reached
            throw new Error("Maximum iterations reached. The task may be too complex or the agent is stuck in a loop.");

        } catch (error) {
            // Remove the last user message if we completely failed
            if (this.history[this.history.length - 1]?.role === "user") {
                this.history.pop();
            }
            throw error;
        }
    }

    /**
     * Calls the Xai /v1/responses API with the current conversation and tool definitions.
     * @returns {Promise<object>} The LLM response
     */
    async callLLM() {
        const body = {
            model: this.model,
            messages: [
                {
                    role: "system",
                    content: "You are a helpful coding assistant. You can read files, write code, execute commands, search files, and run code. Use tools to help the user with their coding tasks. Always explain what you're doing and show your work."
                },
                ...this.history
            ],
            tools: TOOL_DEFINITIONS,
            store_messages: true,
            temperature: 0.7
        };

        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Xai API Error: Status ${response.status}. Message: ${errorText}`);
        }

        return await response.json();
    }

    /**
     * Executes multiple tool calls and returns their results.
     * @param {Array} toolCalls - Array of tool call objects from LLM
     * @returns {Promise<Array>} Array of tool execution results
     */
    async executeTools(toolCalls) {
        const results = [];
        const context = {
            cwd: this.baseDir,
            baseDir: this.baseDir
        };

        for (const toolCall of toolCalls) {
            const { id, function: { name, arguments: argsString } } = toolCall;

            try {
                // Parse arguments
                const args = JSON.parse(argsString);

                // Execute via dispatcher
                const result = await executeToolCall(name, args, context);

                results.push({
                    toolCallId: id,
                    toolName: name,
                    success: result.success,
                    summary: result.summary,
                    details: result.details,
                    data: result,
                    warning: result.warning,
                    error: result.error
                });

            } catch (error) {
                results.push({
                    toolCallId: id,
                    toolName: name,
                    success: false,
                    error: error.message,
                    summary: `Failed to execute ${name}`,
                    details: error.message
                });
            }
        }

        return results;
    }
}

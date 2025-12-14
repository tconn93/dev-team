import { Agent } from '../Agent.js';
import EventEmitter from 'events';

/**
 * StreamingAgent wraps the base Agent class to emit real-time events
 * during task execution, enabling WebSocket streaming to web clients.
 *
 * Events emitted:
 * - 'start': Task execution begins
 * - 'iteration': New LLM iteration starts
 * - 'toolStart': Individual tool execution begins
 * - 'toolComplete': Individual tool execution completes
 * - 'complete': Task fully complete with final response
 * - 'error': Task execution failed
 */
export class StreamingAgent extends EventEmitter {
    constructor(agentId, baseDir, systemPrompt = null) {
        super();
        this.agentId = agentId;
        this.agent = new Agent();
        this.agent.baseDir = baseDir; // Override baseDir for project isolation
        this.systemPrompt = systemPrompt; // Custom system prompt for this agent
        this.isRunning = false;
        this.isPaused = false;
        this.fileLockManager = null; // Will be injected by MultiAgentSessionManager
    }

    /**
     * Set file lock manager instance
     * @param {FileLockManager} fileLockManager
     */
    setFileLockManager(fileLockManager) {
        this.fileLockManager = fileLockManager;
    }

    /**
     * Pause task execution (sets flag, actual pause depends on implementation)
     */
    pause() {
        this.isPaused = true;
    }

    /**
     * Resume task execution
     */
    resume() {
        this.isPaused = false;
    }

    /**
     * Check if agent is paused
     * @returns {boolean}
     */
    get paused() {
        return this.isPaused;
    }

    /**
     * Execute task with streaming events
     * @param {string} prompt - User's task prompt
     * @returns {Promise<object>} - {content, toolExecutions}
     */
    async executeTask(prompt) {
        if (this.isRunning) {
            throw new Error('Task already running for this project');
        }

        this.isRunning = true;
        this.emit('start', { prompt, agentId: this.agentId });

        try {
            // Apply system prompt if provided
            if (this.systemPrompt && this.agent.history.length === 0) {
                this.agent.history.push({
                    role: 'system',
                    content: this.systemPrompt
                });
            }

            // Intercept executeTools to emit per-tool events
            const originalExecuteTools = this.agent.executeTools.bind(this.agent);

            this.agent.executeTools = async (toolCalls) => {
                // Emit iteration event with tool count
                this.emit('iteration', {
                    agentId: this.agentId,
                    toolCount: toolCalls.length,
                    tools: toolCalls.map(tc => tc.function.name)
                });

                // Execute each tool with individual events
                const results = [];
                const context = {
                    cwd: this.agent.baseDir,
                    baseDir: this.agent.baseDir
                };

                for (const toolCall of toolCalls) {
                    const { id, function: { name, arguments: argsString } } = toolCall;

                    // Emit tool start event
                    try {
                        const args = JSON.parse(argsString);
                        this.emit('toolStart', {
                            agentId: this.agentId,
                            toolName: name,
                            toolCallId: id,
                            args: args
                        });
                    } catch (e) {
                        this.emit('toolStart', {
                            agentId: this.agentId,
                            toolName: name,
                            toolCallId: id,
                            args: argsString
                        });
                    }

                    // Execute tool (reuse original logic)
                    try {
                        const args = JSON.parse(argsString);
                        const { executeToolCall } = await import('../tools/index.js');
                        const result = await executeToolCall(name, args, context);

                        const toolResult = {
                            agentId: this.agentId,
                            toolCallId: id,
                            toolName: name,
                            success: result.success,
                            summary: result.summary,
                            details: result.details,
                            data: result,
                            warning: result.warning,
                            error: result.error
                        };

                        results.push(toolResult);

                        // Emit tool complete event
                        this.emit('toolComplete', toolResult);

                    } catch (error) {
                        const errorResult = {
                            agentId: this.agentId,
                            toolCallId: id,
                            toolName: name,
                            success: false,
                            error: error.message,
                            summary: `Failed to execute ${name}`,
                            details: error.message
                        };

                        results.push(errorResult);

                        // Emit tool complete event (with error)
                        this.emit('toolComplete', errorResult);
                    }
                }

                return results;
            };

            // Execute the task
            const result = await this.agent.generateResponse(prompt);

            // Emit completion event
            this.emit('complete', {
                agentId: this.agentId,
                ...result
            });

            return result;

        } catch (error) {
            // Emit error event
            this.emit('error', {
                agentId: this.agentId,
                message: error.message,
                stack: error.stack
            });
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Get conversation history
     * @returns {Array} - Array of message objects
     */
    getHistory() {
        return this.agent.history;
    }

    /**
     * Set conversation history (for loading from database)
     * @param {Array} history - Array of message objects
     */
    set history(history) {
        this.agent.history = history;
    }

    /**
     * Get conversation history (for saving to database)
     */
    get history() {
        return this.agent.history;
    }

    /**
     * Clear conversation history
     */
    clearHistory() {
        this.agent.history = [];
    }

    /**
     * Check if task is currently running
     * @returns {boolean}
     */
    get running() {
        return this.isRunning;
    }
}

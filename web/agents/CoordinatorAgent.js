import { StreamingAgent } from '../StreamingAgent.js';

/**
 * CoordinatorAgent is a special agent with extended tools for task management
 * and agent coordination. It can analyze requests, create tasks, assign them
 * to specialist agents, and monitor progress.
 */
export class CoordinatorAgent extends StreamingAgent {
    constructor(agentId, baseDir, systemPrompt, sessionManager) {
        super(agentId, baseDir, systemPrompt);
        this.sessionManager = sessionManager;
    }

    /**
     * Override executeTask to inject coordinator tools
     */
    async executeTask(prompt) {
        // Inject coordinator-specific tool definitions before execution
        const originalExecuteTools = this.agent.executeTools.bind(this.agent);

        this.agent.executeTools = async (toolCalls) => {
            // Check if any tool calls are coordinator tools
            const standardTools = [];
            const coordinatorTools = [];

            for (const toolCall of toolCalls) {
                const toolName = toolCall.function.name;

                if (this.isCoordinatorTool(toolName)) {
                    coordinatorTools.push(toolCall);
                } else {
                    standardTools.push(toolCall);
                }
            }

            // Execute standard tools using parent method
            const results = [];

            // Process coordinator tools
            for (const toolCall of coordinatorTools) {
                const { id, function: { name, arguments: argsString } } = toolCall;

                try {
                    const args = JSON.parse(argsString);
                    const result = await this.executeCoordinatorTool(name, args);

                    results.push({
                        toolCallId: id,
                        toolName: name,
                        success: result.success,
                        summary: result.summary,
                        details: result.details,
                        data: result
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

            // Execute standard tools if any
            if (standardTools.length > 0) {
                // Call parent's tool execution logic
                const context = {
                    cwd: this.agent.baseDir,
                    baseDir: this.agent.baseDir
                };

                for (const toolCall of standardTools) {
                    const { id, function: { name, arguments: argsString } } = toolCall;

                    // Emit tool start event
                    this.emit('toolStart', {
                        agentId: this.agentId,
                        toolName: name,
                        toolCallId: id,
                        args: JSON.parse(argsString)
                    });

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
                            data: result
                        };

                        results.push(toolResult);
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
                        this.emit('toolComplete', errorResult);
                    }
                }
            }

            return results;
        };

        // Execute using parent's executeTask
        return await super.executeTask(prompt);
    }

    /**
     * Check if a tool is a coordinator-specific tool
     * @param {string} toolName - Tool name
     * @returns {boolean}
     */
    isCoordinatorTool(toolName) {
        const coordinatorTools = [
            'assign_task',
            'send_agent_message',
            'get_agent_status',
            'wait_for_task'
        ];

        return coordinatorTools.includes(toolName);
    }

    /**
     * Execute coordinator-specific tool
     * @param {string} toolName - Tool name
     * @param {object} args - Tool arguments
     * @returns {Promise<object>} - Tool result
     */
    async executeCoordinatorTool(toolName, args) {
        switch (toolName) {
            case 'assign_task':
                return await this.assignTask(args);

            case 'send_agent_message':
                return await this.sendAgentMessage(args);

            case 'get_agent_status':
                return await this.getAgentStatus(args);

            case 'wait_for_task':
                return await this.waitForTask(args);

            default:
                throw new Error(`Unknown coordinator tool: ${toolName}`);
        }
    }

    /**
     * Coordinator Tool: Assign task to an agent
     * @param {object} args - { agentRole, taskTitle, taskDescription, priority }
     */
    async assignTask(args) {
        const { agentRole, taskTitle, taskDescription, priority = 0 } = args;

        if (!agentRole || !taskTitle || !taskDescription) {
            return {
                success: false,
                summary: 'Missing required arguments: agentRole, taskTitle, taskDescription',
                details: 'All three arguments are required to assign a task'
            };
        }

        try {
            // Get agent data to find project ID
            const agentData = await this.sessionManager.agentManager.getAgent(this.agentId);

            // Create task
            const task = await this.sessionManager.taskManager.createTask(
                agentData.project_id,
                taskTitle,
                taskDescription,
                this.agentId, // assigned_by_agent_id
                priority
            );

            // Find agent with the specified role
            const targetAgent = await this.sessionManager.agentManager.getAgentByRole(
                agentData.project_id,
                agentRole
            );

            if (!targetAgent) {
                return {
                    success: false,
                    summary: `No agent found with role '${agentRole}'`,
                    details: `Task created (ID: ${task.id}) but not assigned. Available roles should be checked.`,
                    data: { taskId: task.id, status: 'pending' }
                };
            }

            // Assign task to agent
            await this.sessionManager.taskManager.assignTaskToAgent(task.id, targetAgent.id);

            return {
                success: true,
                summary: `Task assigned to ${targetAgent.name} (${agentRole})`,
                details: `Task ID: ${task.id}, Title: "${taskTitle}", Priority: ${priority}`,
                data: {
                    taskId: task.id,
                    agentId: targetAgent.id,
                    agentName: targetAgent.name,
                    status: 'assigned'
                }
            };

        } catch (error) {
            return {
                success: false,
                summary: `Failed to assign task: ${error.message}`,
                details: error.stack
            };
        }
    }

    /**
     * Coordinator Tool: Send message to another agent
     * @param {object} args - { targetAgentId, message, messageType }
     */
    async sendAgentMessage(args) {
        const { targetAgentId, message, messageType = 'message' } = args;

        if (!targetAgentId || !message) {
            return {
                success: false,
                summary: 'Missing required arguments: targetAgentId, message',
                details: 'Both arguments are required to send a message'
            };
        }

        try {
            const result = await this.sessionManager.communicationManager.sendAgentMessage(
                this.agentId,
                targetAgentId,
                message,
                messageType
            );

            return {
                success: true,
                summary: `Message sent to agent ${targetAgentId}`,
                details: `Message type: ${messageType}, ID: ${result.id}`,
                data: result
            };

        } catch (error) {
            return {
                success: false,
                summary: `Failed to send message: ${error.message}`,
                details: error.stack
            };
        }
    }

    /**
     * Coordinator Tool: Get status of agent(s)
     * @param {object} args - { agentId } or {} for all agents
     */
    async getAgentStatus(args) {
        const { agentId } = args;

        try {
            // Get coordinator's project ID
            const agentData = await this.sessionManager.agentManager.getAgent(this.agentId);

            if (agentId) {
                // Get specific agent status
                const agent = await this.sessionManager.agentManager.getAgent(agentId);

                if (!agent) {
                    return {
                        success: false,
                        summary: `Agent ${agentId} not found`,
                        details: ''
                    };
                }

                const stats = await this.sessionManager.agentManager.getAgentStats(agentId);

                return {
                    success: true,
                    summary: `${agent.name} (${agent.role}): ${agent.status}`,
                    details: `Current task: ${agent.current_task_id || 'None'}, Tasks completed: ${stats.tasks.completed || 0}`,
                    data: { agent, stats }
                };

            } else {
                // Get all agents in project
                const agents = await this.sessionManager.agentManager.listProjectAgents(agentData.project_id);

                const statuses = await Promise.all(agents.map(async (agent) => {
                    const stats = await this.sessionManager.agentManager.getAgentStats(agent.id);
                    return {
                        id: agent.id,
                        name: agent.name,
                        role: agent.role,
                        status: agent.status,
                        currentTask: agent.current_task_id,
                        tasksCompleted: stats.tasks.completed || 0
                    };
                }));

                return {
                    success: true,
                    summary: `${agents.length} agent(s) in project`,
                    details: statuses.map(s => `${s.name} (${s.role}): ${s.status}`).join(', '),
                    data: { agents: statuses }
                };
            }

        } catch (error) {
            return {
                success: false,
                summary: `Failed to get agent status: ${error.message}`,
                details: error.stack
            };
        }
    }

    /**
     * Coordinator Tool: Wait for task to complete
     * @param {object} args - { taskId, timeoutMs }
     */
    async waitForTask(args) {
        const { taskId, timeoutMs = 60000 } = args;

        if (!taskId) {
            return {
                success: false,
                summary: 'Missing required argument: taskId',
                details: 'Task ID is required to wait for completion'
            };
        }

        try {
            const startTime = Date.now();

            // Poll task status until complete or timeout
            while (Date.now() - startTime < timeoutMs) {
                const task = await this.sessionManager.taskManager.getTask(taskId);

                if (!task) {
                    return {
                        success: false,
                        summary: `Task ${taskId} not found`,
                        details: ''
                    };
                }

                if (task.status === 'completed') {
                    return {
                        success: true,
                        summary: `Task ${taskId} completed successfully`,
                        details: task.result || 'No result provided',
                        data: task
                    };
                }

                if (task.status === 'failed') {
                    return {
                        success: false,
                        summary: `Task ${taskId} failed`,
                        details: task.error || 'No error message provided',
                        data: task
                    };
                }

                // Wait 1 second before polling again
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Timeout reached
            return {
                success: false,
                summary: `Timeout waiting for task ${taskId}`,
                details: `Task did not complete within ${timeoutMs}ms`,
                data: { taskId, timeout: true }
            };

        } catch (error) {
            return {
                success: false,
                summary: `Failed to wait for task: ${error.message}`,
                details: error.stack
            };
        }
    }
}

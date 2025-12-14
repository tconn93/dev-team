import { getDb } from '../database/db.js';
import { AgentManager } from './AgentManager.js';
import { TaskManager } from './TaskManager.js';
import { FileLockManager } from './FileLockManager.js';
import { CommunicationManager } from './CommunicationManager.js';
import { StreamingAgent } from '../StreamingAgent.js';
import { CoordinatorAgent } from '../agents/CoordinatorAgent.js';

/**
 * MultiAgentSessionManager manages multiple agent instances per project
 * Replaces the single-agent SessionManager for multi-agent projects
 */
export class MultiAgentSessionManager {
    constructor() {
        // Map: agentId -> StreamingAgent instance
        this.agents = new Map();

        // Map: projectId -> Set<agentId>
        this.projectAgents = new Map();

        // Map: agentId -> boolean (is running)
        this.runningAgents = new Map();

        // Managers
        this.agentManager = new AgentManager();
        this.taskManager = new TaskManager();
        this.fileLockManager = new FileLockManager();
        this.communicationManager = new CommunicationManager();
    }

    /**
     * Get or create an agent instance
     * @param {number} agentId - Agent ID
     * @returns {Promise<StreamingAgent>} - Agent instance
     */
    async getAgentInstance(agentId) {
        // Return existing instance if already loaded
        if (this.agents.has(agentId)) {
            return this.agents.get(agentId);
        }

        // Load agent from database
        const agentData = await this.agentManager.getAgent(agentId);

        if (!agentData) {
            throw new Error(`Agent ${agentId} not found`);
        }

        // Get project details for baseDir
        const db = getDb();
        const project = await db.get('SELECT * FROM projects WHERE id = ?', [agentData.project_id]);

        if (!project) {
            throw new Error(`Project ${agentData.project_id} not found`);
        }

        // Get system prompt for this agent
        const systemPrompt = await this.agentManager.getAgentSystemPrompt(agentId);

        // Create appropriate agent instance based on role
        let agentInstance;

        if (agentData.role === 'coordinator') {
            agentInstance = new CoordinatorAgent(agentId, project.baseDir, systemPrompt, this);
        } else {
            agentInstance = new StreamingAgent(agentId, project.baseDir, systemPrompt);
        }

        // Load conversation history
        await this.loadAgentHistory(agentInstance, agentId);

        // Store instance
        this.agents.set(agentId, agentInstance);

        // Track project -> agent relationship
        if (!this.projectAgents.has(agentData.project_id)) {
            this.projectAgents.set(agentData.project_id, new Set());
        }
        this.projectAgents.get(agentData.project_id).add(agentId);

        return agentInstance;
    }

    /**
     * Load conversation history for an agent
     * @param {StreamingAgent} agentInstance - Agent instance
     * @param {number} agentId - Agent ID
     * @private
     */
    async loadAgentHistory(agentInstance, agentId) {
        const db = getDb();
        const messages = await db.all(
            'SELECT role, content FROM agent_messages WHERE agent_id = ? ORDER BY created',
            [agentId]
        );

        agentInstance.history = messages;
    }

    /**
     * Save agent conversation history to database
     * @param {number} agentId - Agent ID
     * @param {number} taskId - Optional task ID to associate messages with
     */
    async saveAgentHistory(agentId, taskId = null) {
        const agentInstance = this.agents.get(agentId);

        if (!agentInstance) {
            return; // Agent not loaded, nothing to save
        }

        const db = getDb();

        // Delete existing messages for this agent (full replacement strategy)
        await db.run('DELETE FROM agent_messages WHERE agent_id = ?', [agentId]);

        // Insert all messages from history
        for (const message of agentInstance.history) {
            await db.run(
                'INSERT INTO agent_messages (agent_id, role, content, task_id, created) VALUES (?, ?, ?, ?, ?)',
                [agentId, message.role, message.content, taskId, new Date().toISOString()]
            );
        }
    }

    /**
     * Execute a task with a specific agent
     * @param {number} agentId - Agent ID
     * @param {number} taskId - Task ID
     * @param {string} prompt - User prompt
     * @returns {Promise<object>} - Result object with content and tool executions
     */
    async executeAgentTask(agentId, taskId, prompt) {
        const agentInstance = await this.getAgentInstance(agentId);
        const agentData = await this.agentManager.getAgent(agentId);

        if (this.runningAgents.get(agentId)) {
            throw new Error(`Agent ${agentId} is already running a task`);
        }

        try {
            // Mark agent as running
            this.runningAgents.set(agentId, true);
            await this.agentManager.updateAgentStatus(agentId, 'working');

            if (taskId) {
                await this.agentManager.assignTask(agentId, taskId);
                await this.taskManager.updateTaskStatus(taskId, 'in_progress');
            }

            // Execute task
            const result = await agentInstance.executeTask(prompt);

            // Update task status
            if (taskId) {
                await this.taskManager.updateTaskStatus(
                    taskId,
                    'completed',
                    result.content
                );
            }

            // Save history
            await this.saveAgentHistory(agentId, taskId);

            // Update agent status back to idle
            await this.agentManager.clearCurrentTask(agentId);

            // Release any file locks held by this agent
            await this.fileLockManager.releaseAllAgentLocks(agentId);

            return result;

        } catch (error) {
            // Mark task as failed
            if (taskId) {
                await this.taskManager.updateTaskStatus(
                    taskId,
                    'failed',
                    null,
                    error.message
                );
            }

            // Update agent status
            await this.agentManager.updateAgentStatus(agentId, 'idle');

            // Release file locks
            await this.fileLockManager.releaseAllAgentLocks(agentId);

            throw error;

        } finally {
            this.runningAgents.set(agentId, false);
        }
    }

    /**
     * Get all agent instances for a project
     * @param {number} projectId - Project ID
     * @returns {Array<StreamingAgent>} - Array of agent instances
     */
    getProjectAgents(projectId) {
        const agentIds = this.projectAgents.get(projectId);

        if (!agentIds) {
            return [];
        }

        return Array.from(agentIds)
            .map(id => this.agents.get(id))
            .filter(Boolean);
    }

    /**
     * Check if an agent is currently running
     * @param {number} agentId - Agent ID
     * @returns {boolean} - True if running
     */
    isRunning(agentId) {
        return this.runningAgents.get(agentId) || false;
    }

    /**
     * Pause an agent (if supported by implementation)
     * @param {number} agentId - Agent ID
     */
    async pauseAgent(agentId) {
        const agentInstance = this.agents.get(agentId);

        if (!agentInstance) {
            throw new Error(`Agent ${agentId} not loaded`);
        }

        if (agentInstance.pause) {
            agentInstance.pause();
        }

        await this.agentManager.updateAgentStatus(agentId, 'paused');
    }

    /**
     * Resume a paused agent
     * @param {number} agentId - Agent ID
     */
    async resumeAgent(agentId) {
        const agentInstance = this.agents.get(agentId);

        if (!agentInstance) {
            throw new Error(`Agent ${agentId} not loaded`);
        }

        if (agentInstance.resume) {
            agentInstance.resume();
        }

        await this.agentManager.updateAgentStatus(agentId, 'idle');
    }

    /**
     * Clear conversation history for an agent
     * @param {number} agentId - Agent ID
     */
    async clearHistory(agentId) {
        const agentInstance = this.agents.get(agentId);

        if (agentInstance) {
            agentInstance.history = [];
        }

        const db = getDb();
        await db.run('DELETE FROM agent_messages WHERE agent_id = ?', [agentId]);
    }

    /**
     * Release agent from memory (save history first)
     * @param {number} agentId - Agent ID
     */
    async releaseAgent(agentId) {
        if (this.isRunning(agentId)) {
            throw new Error('Cannot release agent while it is running');
        }

        // Save history before releasing
        await this.saveAgentHistory(agentId);

        // Release file locks
        await this.fileLockManager.releaseAllAgentLocks(agentId);

        // Remove from maps
        const agentInstance = this.agents.get(agentId);
        if (agentInstance) {
            const agentData = await this.agentManager.getAgent(agentId);
            if (agentData) {
                const projectAgentSet = this.projectAgents.get(agentData.project_id);
                if (projectAgentSet) {
                    projectAgentSet.delete(agentId);
                }
            }
        }

        this.agents.delete(agentId);
        this.runningAgents.delete(agentId);
    }

    /**
     * Release all agents for a project
     * @param {number} projectId - Project ID
     */
    async releaseProjectAgents(projectId) {
        const agentIds = this.projectAgents.get(projectId);

        if (!agentIds) {
            return;
        }

        for (const agentId of Array.from(agentIds)) {
            await this.releaseAgent(agentId);
        }

        this.projectAgents.delete(projectId);
    }

    /**
     * Release all agents (for shutdown)
     */
    async releaseAll() {
        const allAgentIds = Array.from(this.agents.keys());

        for (const agentId of allAgentIds) {
            try {
                await this.releaseAgent(agentId);
            } catch (error) {
                console.error(`Error releasing agent ${agentId}:`, error);
            }
        }

        // Destroy file lock manager
        this.fileLockManager.destroy();
    }

    /**
     * Get active sessions summary
     * @returns {Array<object>} - Array of active agent info
     */
    getActiveSessions() {
        return Array.from(this.agents.keys()).map(agentId => ({
            agentId,
            isRunning: this.isRunning(agentId)
        }));
    }
}

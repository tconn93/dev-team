import { getDb } from '../database/db.js';
import { RoleManager } from './RoleManager.js';
import * as broadcast from '../utils/websocketBroadcast.js';

/**
 * AgentManager handles agent lifecycle and management within projects
 * Creates, updates, deletes agents and tracks their status
 */
export class AgentManager {
    constructor() {
        this.roleManager = new RoleManager();
    }

    /**
     * Create a new agent in a project
     * @param {number} projectId - Project ID
     * @param {string} name - Agent name (e.g., "Frontend Bot", "Backend Helper")
     * @param {string} role - Role name (must exist in roles table)
     * @param {string} customPrompt - Optional custom system prompt override
     * @returns {Promise<object>} - Created agent object
     */
    async createAgent(projectId, name, role, customPrompt = null) {
        if (!projectId || !name || !role) {
            throw new Error('projectId, name, and role are required');
        }

        // Verify role exists
        const roleExists = await this.roleManager.roleExists(role);
        if (!roleExists) {
            throw new Error(`Role '${role}' does not exist`);
        }

        // Generate a color for the agent (for UI)
        const color = this.generateAgentColor(name);

        const db = getDb();
        const result = await db.run(
            `INSERT INTO agents (project_id, name, role, system_prompt, status, color, created)
             VALUES (?, ?, ?, ?, 'idle', ?, ?)`,
            [projectId, name, role, customPrompt, color, new Date().toISOString()]
        );

        const agent = {
            id: result.lastID,
            project_id: projectId,
            name,
            role,
            system_prompt: customPrompt,
            status: 'idle',
            current_task_id: null,
            color,
            created: new Date().toISOString()
        };

        // Broadcast agent created event
        broadcast.broadcastAgentCreated(projectId, agent);

        return agent;
    }

    /**
     * Get agent by ID
     * @param {number} agentId - Agent ID
     * @returns {Promise<object|null>} - Agent object or null
     */
    async getAgent(agentId) {
        const db = getDb();
        return await db.get('SELECT * FROM agents WHERE id = ?', [agentId]);
    }

    /**
     * List all agents in a project
     * @param {number} projectId - Project ID
     * @param {string} status - Optional filter by status
     * @returns {Promise<Array>} - Array of agent objects
     */
    async listProjectAgents(projectId, status = null) {
        const db = getDb();

        if (status) {
            return await db.all(
                'SELECT * FROM agents WHERE project_id = ? AND status = ? ORDER BY created',
                [projectId, status]
            );
        }

        return await db.all(
            'SELECT * FROM agents WHERE project_id = ? ORDER BY created',
            [projectId]
        );
    }

    /**
     * Update agent status
     * @param {number} agentId - Agent ID
     * @param {string} status - New status ('idle', 'working', 'waiting', 'paused')
     * @returns {Promise<object>} - Updated agent object
     */
    async updateAgentStatus(agentId, status) {
        const validStatuses = ['idle', 'working', 'waiting', 'paused'];
        if (!validStatuses.includes(status)) {
            throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
        }

        const db = getDb();
        await db.run(
            'UPDATE agents SET status = ? WHERE id = ?',
            [status, agentId]
        );

        const agent = await this.getAgent(agentId);

        // Broadcast status update
        broadcast.broadcastAgentStatus(
            agent.project_id,
            agent.id,
            agent.name,
            status,
            agent.current_task_id
        );

        return agent;
    }

    /**
     * Assign a task to an agent
     * @param {number} agentId - Agent ID
     * @param {number} taskId - Task ID
     * @returns {Promise<object>} - Updated agent object
     */
    async assignTask(agentId, taskId) {
        const db = getDb();
        await db.run(
            'UPDATE agents SET current_task_id = ?, status = ? WHERE id = ?',
            [taskId, 'working', agentId]
        );

        return await this.getAgent(agentId);
    }

    /**
     * Clear current task from agent (when task completes)
     * @param {number} agentId - Agent ID
     * @returns {Promise<object>} - Updated agent object
     */
    async clearCurrentTask(agentId) {
        const db = getDb();
        await db.run(
            'UPDATE agents SET current_task_id = NULL, status = ? WHERE id = ?',
            ['idle', agentId]
        );

        return await this.getAgent(agentId);
    }

    /**
     * Update agent name
     * @param {number} agentId - Agent ID
     * @param {string} name - New name
     * @returns {Promise<object>} - Updated agent object
     */
    async updateAgentName(agentId, name) {
        if (!name || name.trim().length === 0) {
            throw new Error('Agent name cannot be empty');
        }

        const db = getDb();
        await db.run(
            'UPDATE agents SET name = ? WHERE id = ?',
            [name.trim(), agentId]
        );

        return await this.getAgent(agentId);
    }

    /**
     * Delete an agent
     * @param {number} agentId - Agent ID
     * @returns {Promise<void>}
     */
    async deleteAgent(agentId) {
        const agent = await this.getAgent(agentId);

        if (!agent) {
            throw new Error(`Agent ${agentId} not found`);
        }

        // Check if agent has a current task
        if (agent.current_task_id) {
            throw new Error('Cannot delete agent while it has an assigned task. Complete or reassign the task first.');
        }

        const db = getDb();
        await db.run('DELETE FROM agents WHERE id = ?', [agentId]);

        // Broadcast agent deleted event
        broadcast.broadcastAgentDeleted(agent.project_id, agentId);
    }

    /**
     * Get agent by role within a project
     * @param {number} projectId - Project ID
     * @param {string} role - Role name
     * @returns {Promise<object|null>} - First agent with that role, or null
     */
    async getAgentByRole(projectId, role) {
        const db = getDb();
        return await db.get(
            'SELECT * FROM agents WHERE project_id = ? AND role = ? ORDER BY created LIMIT 1',
            [projectId, role]
        );
    }

    /**
     * Get agent's effective system prompt (custom or from role)
     * @param {number} agentId - Agent ID
     * @returns {Promise<string>} - System prompt text
     */
    async getAgentSystemPrompt(agentId) {
        const agent = await this.getAgent(agentId);

        if (!agent) {
            throw new Error(`Agent ${agentId} not found`);
        }

        // If agent has custom prompt, use it
        if (agent.system_prompt) {
            return agent.system_prompt;
        }

        // Otherwise, get prompt from role
        return await this.roleManager.getSystemPrompt(agent.role);
    }

    /**
     * Generate a color for an agent based on its name
     * @param {string} name - Agent name
     * @returns {string} - Hex color code
     * @private
     */
    generateAgentColor(name) {
        // Predefined colors for common roles
        const roleColors = {
            coordinator: '#9b59b6', // Purple
            frontend: '#3498db',    // Blue
            backend: '#2ecc71',     // Green
            devops: '#e67e22',      // Orange
            tester: '#e74c3c'       // Red
        };

        // Check if name contains a role keyword
        const lowerName = name.toLowerCase();
        for (const [role, color] of Object.entries(roleColors)) {
            if (lowerName.includes(role)) {
                return color;
            }
        }

        // Generate a color based on name hash
        const colors = [
            '#3498db', // Blue
            '#2ecc71', // Green
            '#9b59b6', // Purple
            '#f39c12', // Yellow
            '#e74c3c', // Red
            '#1abc9c', // Turquoise
            '#34495e', // Dark gray
            '#e67e22'  // Orange
        ];

        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }

        return colors[Math.abs(hash) % colors.length];
    }

    /**
     * Get agent statistics
     * @param {number} agentId - Agent ID
     * @returns {Promise<object>} - Stats object
     */
    async getAgentStats(agentId) {
        const db = getDb();

        // Get task counts by status
        const taskStats = await db.all(
            `SELECT status, COUNT(*) as count
             FROM agent_tasks
             WHERE agent_id = ?
             GROUP BY status`,
            [agentId]
        );

        // Get tool execution count
        const toolStats = await db.get(
            'SELECT COUNT(*) as total_executions FROM tool_executions WHERE agent_id = ?',
            [agentId]
        );

        // Get message count
        const messageStats = await db.get(
            'SELECT COUNT(*) as total_messages FROM agent_messages WHERE agent_id = ?',
            [agentId]
        );

        const stats = {
            tasks: {},
            total_tool_executions: toolStats.total_executions || 0,
            total_messages: messageStats.total_messages || 0
        };

        taskStats.forEach(stat => {
            stats.tasks[stat.status] = stat.count;
        });

        return stats;
    }
}

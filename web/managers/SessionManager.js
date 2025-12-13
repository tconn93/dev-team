import { StreamingAgent } from '../StreamingAgent.js';
import { getDb } from '../database/db.js';

/**
 * SessionManager manages StreamingAgent instances per project,
 * handles conversation persistence, and enforces one-task-per-project rule.
 */
export class SessionManager {
    constructor() {
        this.agents = new Map(); // projectId -> StreamingAgent
    }

    /**
     * Get or create agent for project
     * @param {number} projectId - Project ID
     * @returns {Promise<StreamingAgent>} - Agent instance
     */
    async getAgent(projectId) {
        // Return existing agent if already in pool
        if (this.agents.has(projectId)) {
            return this.agents.get(projectId);
        }

        // Load project from database
        const db = getDb();
        const project = await db.get('SELECT * FROM projects WHERE id = ?', [projectId]);

        if (!project) {
            throw new Error('Project not found');
        }

        // Create new agent with project's baseDir
        const agent = new StreamingAgent(projectId, project.baseDir);

        // Load conversation history from database
        await this.loadHistory(agent, projectId);

        // Store in pool
        this.agents.set(projectId, agent);

        return agent;
    }

    /**
     * Load conversation history from database into agent
     * @param {StreamingAgent} agent - Agent instance
     * @param {number} projectId - Project ID
     */
    async loadHistory(agent, projectId) {
        const db = getDb();
        const messages = await db.all(
            'SELECT role, content FROM messages WHERE project_id = ? ORDER BY id ASC',
            [projectId]
        );

        // Restore history to agent
        agent.agent.history = messages.map(msg => ({
            role: msg.role,
            content: msg.content
        }));
    }

    /**
     * Save conversation history to database
     * @param {number} projectId - Project ID
     */
    async saveHistory(projectId) {
        const agent = this.agents.get(projectId);
        if (!agent) {
            return; // No agent loaded, nothing to save
        }

        const db = getDb();

        // Clear old messages for this project
        await db.run('DELETE FROM messages WHERE project_id = ?', [projectId]);

        // Insert current history
        const history = agent.getHistory();
        if (history.length === 0) {
            return; // No messages to save
        }

        // Use transaction for efficiency
        await db.run('BEGIN TRANSACTION');

        try {
            for (const msg of history) {
                await db.run(
                    'INSERT INTO messages (project_id, role, content, created) VALUES (?, ?, ?, ?)',
                    [projectId, msg.role, msg.content, new Date().toISOString()]
                );
            }
            await db.run('COMMIT');
        } catch (error) {
            await db.run('ROLLBACK');
            throw error;
        }
    }

    /**
     * Check if project has running task
     * @param {number} projectId - Project ID
     * @returns {boolean}
     */
    isRunning(projectId) {
        const agent = this.agents.get(projectId);
        return agent ? agent.running : false;
    }

    /**
     * Clear agent from pool (memory management)
     * @param {number} projectId - Project ID
     */
    async releaseAgent(projectId) {
        // Save history before releasing
        await this.saveHistory(projectId);

        // Remove from pool
        this.agents.delete(projectId);
    }

    /**
     * Clear conversation history for a project
     * @param {number} projectId - Project ID
     */
    async clearHistory(projectId) {
        // Clear in-memory history
        const agent = this.agents.get(projectId);
        if (agent) {
            agent.clearHistory();
        }

        // Clear database history
        const db = getDb();
        await db.run('DELETE FROM messages WHERE project_id = ?', [projectId]);
    }

    /**
     * Get list of all active agent sessions
     * @returns {Array<number>} - Array of project IDs with active agents
     */
    getActiveSessions() {
        return Array.from(this.agents.keys());
    }

    /**
     * Release all agents (cleanup on shutdown)
     */
    async releaseAll() {
        const projectIds = Array.from(this.agents.keys());
        for (const projectId of projectIds) {
            await this.releaseAgent(projectId);
        }
    }
}

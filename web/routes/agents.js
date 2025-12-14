import express from 'express';
import { AgentManager } from '../managers/AgentManager.js';
import { MultiAgentSessionManager } from '../managers/MultiAgentSessionManager.js';

/**
 * Create router for agent management endpoints
 * @param {MultiAgentSessionManager} sessionManager - Shared session manager
 * @returns {express.Router}
 */
export function createAgentsRouter(sessionManager) {
    const router = express.Router({ mergeParams: true }); // Allow access to :projectId
    const agentManager = new AgentManager();

    // POST /api/projects/:projectId/agents - Create new agent
    router.post('/', async (req, res) => {
        try {
            const projectId = parseInt(req.params.projectId);
            const { name, role, customPrompt } = req.body;

            if (!name || !role) {
                return res.status(400).json({ error: 'name and role are required' });
            }

            const agent = await agentManager.createAgent(projectId, name, role, customPrompt);
            res.status(201).json(agent);

        } catch (error) {
            console.error('Error creating agent:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/projects/:projectId/agents - List all agents
    router.get('/', async (req, res) => {
        try {
            const projectId = parseInt(req.params.projectId);
            const { status } = req.query;

            const agents = await agentManager.listProjectAgents(projectId, status);
            res.json(agents);

        } catch (error) {
            console.error('Error listing agents:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/projects/:projectId/agents/:agentId - Get agent details
    router.get('/:agentId', async (req, res) => {
        try {
            const agentId = parseInt(req.params.agentId);
            const agent = await agentManager.getAgent(agentId);

            if (!agent) {
                return res.status(404).json({ error: 'Agent not found' });
            }

            const stats = await agentManager.getAgentStats(agentId);

            res.json({ ...agent, stats });

        } catch (error) {
            console.error('Error getting agent:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // PUT /api/projects/:projectId/agents/:agentId - Update agent
    router.put('/:agentId', async (req, res) => {
        try {
            const agentId = parseInt(req.params.agentId);
            const { name, status } = req.body;

            let agent;

            if (name) {
                agent = await agentManager.updateAgentName(agentId, name);
            }

            if (status) {
                agent = await agentManager.updateAgentStatus(agentId, status);
            }

            res.json(agent);

        } catch (error) {
            console.error('Error updating agent:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // DELETE /api/projects/:projectId/agents/:agentId - Delete agent
    router.delete('/:agentId', async (req, res) => {
        try {
            const agentId = parseInt(req.params.agentId);

            await sessionManager.releaseAgent(agentId);
            await agentManager.deleteAgent(agentId);

            res.json({ success: true });

        } catch (error) {
            console.error('Error deleting agent:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // POST /api/projects/:projectId/agents/:agentId/execute - Execute task
    router.post('/:agentId/execute', async (req, res) => {
        try {
            const agentId = parseInt(req.params.agentId);
            const { prompt, taskId } = req.body;

            if (!prompt) {
                return res.status(400).json({ error: 'prompt is required' });
            }

            // This will be handled via WebSocket for streaming
            // But we can support HTTP POST as well
            const result = await sessionManager.executeAgentTask(
                agentId,
                taskId || null,
                prompt
            );

            res.json(result);

        } catch (error) {
            console.error('Error executing task:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/projects/:projectId/agents/:agentId/history - Get conversation history
    router.get('/:agentId/history', async (req, res) => {
        try {
            const agentId = parseInt(req.params.agentId);
            const agentInstance = await sessionManager.getAgentInstance(agentId);

            res.json({ history: agentInstance.getHistory() });

        } catch (error) {
            console.error('Error getting history:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // DELETE /api/projects/:projectId/agents/:agentId/history - Clear history
    router.delete('/:agentId/history', async (req, res) => {
        try {
            const agentId = parseInt(req.params.agentId);
            await sessionManager.clearHistory(agentId);

            res.json({ success: true });

        } catch (error) {
            console.error('Error clearing history:', error);
            res.status(500).json({ error: error.message });
        }
    });

    return router;
}

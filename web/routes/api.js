import express from 'express';
import { ProjectManager } from '../managers/ProjectManager.js';
import { SessionManager } from '../managers/SessionManager.js';

/**
 * Create Express router with all API endpoints
 * @param {SessionManager} sessionManager - Shared session manager instance
 * @returns {express.Router} - Express router
 */
export function createApiRouter(sessionManager) {
    const router = express.Router();
    const projectManager = new ProjectManager();

    // GET /api/projects - List all projects
    router.get('/projects', async (req, res) => {
        try {
            const projects = await projectManager.listProjects();
            res.json(projects);
        } catch (error) {
            console.error('Error listing projects:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // POST /api/projects - Create new project
    router.post('/projects', async (req, res) => {
        try {
            const { name } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Project name required' });
            }

            const project = await projectManager.createProject(name);
            res.status(201).json(project);
        } catch (error) {
            console.error('Error creating project:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/projects/:id - Get project details
    router.get('/projects/:id', async (req, res) => {
        try {
            const project = await projectManager.getProject(parseInt(req.params.id));

            if (!project) {
                return res.status(404).json({ error: 'Project not found' });
            }

            res.json(project);
        } catch (error) {
            console.error('Error getting project:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // PUT /api/projects/:id - Update project
    router.put('/projects/:id', async (req, res) => {
        try {
            const { name } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Project name required' });
            }

            const project = await projectManager.updateProject(parseInt(req.params.id), name);
            res.json(project);
        } catch (error) {
            console.error('Error updating project:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // DELETE /api/projects/:id - Delete project
    router.delete('/projects/:id', async (req, res) => {
        try {
            const projectId = parseInt(req.params.id);
            const deleteFiles = req.query.deleteFiles === 'true';

            await projectManager.deleteProject(projectId, deleteFiles);
            await sessionManager.releaseAgent(projectId);

            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting project:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/projects/:id/history - Get conversation history
    router.get('/projects/:id/history', async (req, res) => {
        try {
            const projectId = parseInt(req.params.id);
            const agent = await sessionManager.getAgent(projectId);

            res.json({ history: agent.getHistory() });
        } catch (error) {
            console.error('Error getting history:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // DELETE /api/projects/:id/history - Clear conversation history
    router.delete('/projects/:id/history', async (req, res) => {
        try {
            const projectId = parseInt(req.params.id);
            await sessionManager.clearHistory(projectId);

            res.json({ success: true });
        } catch (error) {
            console.error('Error clearing history:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/projects/:id/status - Get project status
    router.get('/projects/:id/status', async (req, res) => {
        try {
            const projectId = parseInt(req.params.id);
            const isRunning = sessionManager.isRunning(projectId);

            res.json({
                projectId,
                isRunning,
                hasActiveSession: sessionManager.getActiveSessions().includes(projectId)
            });
        } catch (error) {
            console.error('Error getting status:', error);
            res.status(500).json({ error: error.message });
        }
    });

    return router;
}

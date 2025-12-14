import express from 'express';
import { ProjectManager } from '../managers/ProjectManager.js';
import { SessionManager } from '../managers/SessionManager.js';
import { AgentManager } from '../managers/AgentManager.js';
import { TaskManager } from '../managers/TaskManager.js';
import { CommunicationManager } from '../managers/CommunicationManager.js';
import { createAgentsRouter } from './agents.js';
import { createTasksRouter } from './tasks.js';
import { createCommunicationsRouter } from './communications.js';
import { createRolesRouter } from './roles.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Create Express router with all API endpoints
 * @param {SessionManager} sessionManager - Shared session manager instance
 * @returns {express.Router} - Express router
 */
export function createApiRouter(sessionManager) {
    const router = express.Router();
    const projectManager = new ProjectManager();
    const agentManager = new AgentManager();
    const taskManager = new TaskManager();
    const commManager = new CommunicationManager();

    // Mount multi-agent routers
    router.use('/projects/:projectId/agents', createAgentsRouter(sessionManager));
    router.use('/projects/:projectId/tasks', createTasksRouter());
    router.use('/projects/:projectId/messages', createCommunicationsRouter());
    router.use('/roles', createRolesRouter());

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

    // GET /api/projects/:id/files - Get file tree from a project directory
    router.get('/projects/:id/files', async (req, res) => {
        try {
            const projectId = parseInt(req.params.id);
            const subPath = req.query.path || '';

            const project = await projectManager.getProject(projectId);
            if (!project) {
                return res.status(404).json({ error: 'Project not found' });
            }

            const projectBase = path.resolve(project.baseDir);
            const targetPath = subPath ? path.resolve(projectBase, subPath) : projectBase;

            // Security: Ensure path is within project workspace
            if (!targetPath.startsWith(projectBase)) {
                return res.status(403).json({ error: 'Access denied: path outside project workspace' });
            }

            const files = await getDirectoryContents(targetPath);
            const relativePath = path.relative(projectBase, targetPath);

            res.json({
                path: targetPath,
                relativePath: relativePath || '.',
                baseDir: projectBase,
                files
            });
        } catch (error) {
            console.error('Error reading directory:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/projects/:id/files/read - Read file contents from project
    router.get('/projects/:id/files/read', async (req, res) => {
        try {
            const projectId = parseInt(req.params.id);
            const filePath = req.query.path;

            if (!filePath) {
                return res.status(400).json({ error: 'File path required' });
            }

            const project = await projectManager.getProject(projectId);
            if (!project) {
                return res.status(404).json({ error: 'Project not found' });
            }

            const projectBase = path.resolve(project.baseDir);
            const resolvedPath = path.resolve(filePath);

            // Security: Ensure path is within project workspace
            if (!resolvedPath.startsWith(projectBase)) {
                return res.status(403).json({ error: 'Access denied: path outside project workspace' });
            }

            const content = await fs.readFile(resolvedPath, 'utf-8');
            const relativePath = path.relative(projectBase, resolvedPath);

            res.json({
                path: resolvedPath,
                relativePath,
                content
            });
        } catch (error) {
            console.error('Error reading file:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/projects/:id/dashboard - Get project dashboard data
    router.get('/projects/:id/dashboard', async (req, res) => {
        try {
            const projectId = parseInt(req.params.id);

            // Get all agents
            const agents = await agentManager.listProjectAgents(projectId);

            // Get agent stats
            const agentsWithStats = await Promise.all(agents.map(async (agent) => {
                const stats = await agentManager.getAgentStats(agent.id);
                return { ...agent, stats };
            }));

            // Get tasks
            const taskStats = await taskManager.getProjectTaskStats(projectId);
            const recentTasks = await taskManager.listProjectTasks(projectId, { limit: 10 });

            // Get recent group messages
            const recentMessages = await commManager.getGroupMessages(projectId, 20);

            // Get communication stats
            const commStats = await commManager.getProjectCommunicationStats(projectId);

            res.json({
                agents: agentsWithStats,
                taskStats,
                recentTasks,
                recentMessages,
                commStats
            });

        } catch (error) {
            console.error('Error getting dashboard:', error);
            res.status(500).json({ error: error.message });
        }
    });

    return router;
}

/**
 * Get directory contents with file/folder info
 * @param {string} dirPath - Directory path
 * @returns {Promise<Array>} - Array of file/folder objects
 */
async function getDirectoryContents(dirPath) {
    let entries;
    try {
        entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch (error) {
        // Return empty array if directory doesn't exist or can't be read
        return [];
    }

    const files = [];

    for (const entry of entries) {
        // Skip hidden files except .git
        if (entry.name.startsWith('.') && entry.name !== '.git') {
            continue;
        }

        const fullPath = path.join(dirPath, entry.name);
        let size = 0;

        try {
            const stats = await fs.stat(fullPath);
            size = stats.size;
        } catch (err) {
            // Ignore permission errors
        }

        files.push({
            name: entry.name,
            path: fullPath,
            isDirectory: entry.isDirectory(),
            size
        });
    }

    // Sort: directories first, then files, alphabetically
    return files.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
    });
}

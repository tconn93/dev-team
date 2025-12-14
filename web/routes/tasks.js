import express from 'express';
import { TaskManager } from '../managers/TaskManager.js';

/**
 * Create router for task management endpoints
 * @returns {express.Router}
 */
export function createTasksRouter() {
    const router = express.Router({ mergeParams: true });
    const taskManager = new TaskManager();

    // POST /api/projects/:projectId/tasks - Create task
    router.post('/', async (req, res) => {
        try {
            const projectId = parseInt(req.params.projectId);
            const { title, description, agentId, assignedByAgentId, priority } = req.body;

            if (!title || !description) {
                return res.status(400).json({ error: 'title and description are required' });
            }

            const task = await taskManager.createTask(
                projectId,
                title,
                description,
                assignedByAgentId || null,
                priority || 0
            );

            // Assign if agentId provided
            if (agentId) {
                await taskManager.assignTaskToAgent(task.id, agentId);
            }

            res.status(201).json(await taskManager.getTask(task.id));

        } catch (error) {
            console.error('Error creating task:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/projects/:projectId/tasks - List tasks
    router.get('/', async (req, res) => {
        try {
            const projectId = parseInt(req.params.projectId);
            const { status, agentId, limit, offset } = req.query;

            const filters = {
                status,
                agentId: agentId ? parseInt(agentId) : undefined,
                limit: limit ? parseInt(limit) : undefined,
                offset: offset ? parseInt(offset) : undefined
            };

            const tasks = await taskManager.listProjectTasks(projectId, filters);
            res.json(tasks);

        } catch (error) {
            console.error('Error listing tasks:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/projects/:projectId/tasks/:taskId - Get task
    router.get('/:taskId', async (req, res) => {
        try {
            const taskId = parseInt(req.params.taskId);
            const task = await taskManager.getTask(taskId);

            if (!task) {
                return res.status(404).json({ error: 'Task not found' });
            }

            res.json(task);

        } catch (error) {
            console.error('Error getting task:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // PUT /api/projects/:projectId/tasks/:taskId - Update task
    router.put('/:taskId', async (req, res) => {
        try {
            const taskId = parseInt(req.params.taskId);
            const { status, agentId, priority, result, error } = req.body;

            let task;

            if (status) {
                task = await taskManager.updateTaskStatus(taskId, status, result, error);
            }

            if (agentId !== undefined) {
                task = await taskManager.reassignTask(taskId, agentId);
            }

            if (priority !== undefined) {
                task = await taskManager.updateTaskPriority(taskId, priority);
            }

            res.json(task || await taskManager.getTask(taskId));

        } catch (error) {
            console.error('Error updating task:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // DELETE /api/projects/:projectId/tasks/:taskId - Delete task
    router.delete('/:taskId', async (req, res) => {
        try {
            const taskId = parseInt(req.params.taskId);
            await taskManager.deleteTask(taskId);

            res.json({ success: true });

        } catch (error) {
            console.error('Error deleting task:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // POST /api/projects/:projectId/tasks/:taskId/assign - Assign task to agent
    router.post('/:taskId/assign', async (req, res) => {
        try {
            const taskId = parseInt(req.params.taskId);
            const { agentId } = req.body;

            if (!agentId) {
                return res.status(400).json({ error: 'agentId is required' });
            }

            const task = await taskManager.assignTaskToAgent(taskId, agentId);
            res.json(task);

        } catch (error) {
            console.error('Error assigning task:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/projects/:projectId/tasks/stats - Get task statistics
    router.get('/stats', async (req, res) => {
        try {
            const projectId = parseInt(req.params.projectId);
            const stats = await taskManager.getProjectTaskStats(projectId);

            res.json(stats);

        } catch (error) {
            console.error('Error getting task stats:', error);
            res.status(500).json({ error: error.message });
        }
    });

    return router;
}

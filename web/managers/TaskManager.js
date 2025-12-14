import { getDb } from '../database/db.js';
import * as broadcast from '../utils/websocketBroadcast.js';

/**
 * TaskManager handles task creation, assignment, and lifecycle
 * Tasks are units of work assigned to agents by the coordinator or other agents
 */
export class TaskManager {
    /**
     * Create a new task
     * @param {number} projectId - Project ID
     * @param {string} title - Task title
     * @param {string} description - Task description
     * @param {number} assignedByAgentId - ID of agent creating this task (null if user-created)
     * @param {number} priority - Priority level (higher = more urgent)
     * @returns {Promise<object>} - Created task object
     */
    async createTask(projectId, title, description, assignedByAgentId = null, priority = 0) {
        if (!projectId || !title || !description) {
            throw new Error('projectId, title, and description are required');
        }

        const db = getDb();
        const result = await db.run(
            `INSERT INTO agent_tasks (
                project_id, title, description, assigned_by_agent_id, priority, status, created
             ) VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
            [projectId, title, description, assignedByAgentId, priority, new Date().toISOString()]
        );

        const task = {
            id: result.lastID,
            project_id: projectId,
            agent_id: null,
            assigned_by_agent_id: assignedByAgentId,
            title,
            description,
            status: 'pending',
            priority,
            result: null,
            error: null,
            created: new Date().toISOString(),
            started: null,
            completed: null
        };

        // Broadcast task created event
        broadcast.broadcastTaskCreated(projectId, task);

        return task;
    }

    /**
     * Get task by ID
     * @param {number} taskId - Task ID
     * @returns {Promise<object|null>} - Task object or null
     */
    async getTask(taskId) {
        const db = getDb();
        return await db.get('SELECT * FROM agent_tasks WHERE id = ?', [taskId]);
    }

    /**
     * Assign task to an agent
     * @param {number} taskId - Task ID
     * @param {number} agentId - Agent ID
     * @returns {Promise<object>} - Updated task object
     */
    async assignTaskToAgent(taskId, agentId) {
        const task = await this.getTask(taskId);

        if (!task) {
            throw new Error(`Task ${taskId} not found`);
        }

        if (task.status !== 'pending' && task.status !== 'assigned') {
            throw new Error(`Cannot assign task with status '${task.status}'`);
        }

        const db = getDb();
        await db.run(
            'UPDATE agent_tasks SET agent_id = ?, status = ? WHERE id = ?',
            [agentId, 'assigned', taskId]
        );

        return await this.getTask(taskId);
    }

    /**
     * Update task status
     * @param {number} taskId - Task ID
     * @param {string} status - New status
     * @param {string} result - Optional result text (for completed tasks)
     * @param {string} error - Optional error message (for failed tasks)
     * @returns {Promise<object>} - Updated task object
     */
    async updateTaskStatus(taskId, status, result = null, error = null) {
        const validStatuses = ['pending', 'assigned', 'in_progress', 'completed', 'failed', 'blocked'];

        if (!validStatuses.includes(status)) {
            throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
        }

        const task = await this.getTask(taskId);

        if (!task) {
            throw new Error(`Task ${taskId} not found`);
        }

        const db = getDb();
        const now = new Date().toISOString();

        // Determine timestamps based on status
        let started = task.started;
        let completed = task.completed;

        if (status === 'in_progress' && !started) {
            started = now;
        }

        if ((status === 'completed' || status === 'failed') && !completed) {
            completed = now;
        }

        await db.run(
            `UPDATE agent_tasks
             SET status = ?, result = ?, error = ?, started = ?, completed = ?
             WHERE id = ?`,
            [status, result, error, started, completed, taskId]
        );

        const updatedTask = await this.getTask(taskId);

        // Broadcast task updated event
        broadcast.broadcastTaskUpdated(
            updatedTask.project_id,
            taskId,
            status,
            updatedTask.agent_id,
            result,
            error
        );

        return updatedTask;
    }

    /**
     * List tasks for a project
     * @param {number} projectId - Project ID
     * @param {object} filters - Optional filters
     * @param {string} filters.status - Filter by status
     * @param {number} filters.agentId - Filter by assigned agent
     * @param {number} filters.limit - Limit number of results
     * @param {number} filters.offset - Offset for pagination
     * @returns {Promise<Array>} - Array of task objects
     */
    async listProjectTasks(projectId, filters = {}) {
        const db = getDb();
        const { status, agentId, limit, offset } = filters;

        let query = 'SELECT * FROM agent_tasks WHERE project_id = ?';
        const params = [projectId];

        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }

        if (agentId !== undefined) {
            query += ' AND agent_id = ?';
            params.push(agentId);
        }

        query += ' ORDER BY priority DESC, created DESC';

        if (limit) {
            query += ' LIMIT ?';
            params.push(limit);

            if (offset) {
                query += ' OFFSET ?';
                params.push(offset);
            }
        }

        return await db.all(query, params);
    }

    /**
     * List tasks assigned to a specific agent
     * @param {number} agentId - Agent ID
     * @param {string} status - Optional filter by status
     * @returns {Promise<Array>} - Array of task objects
     */
    async listAgentTasks(agentId, status = null) {
        const db = getDb();

        if (status) {
            return await db.all(
                'SELECT * FROM agent_tasks WHERE agent_id = ? AND status = ? ORDER BY priority DESC, created',
                [agentId, status]
            );
        }

        return await db.all(
            'SELECT * FROM agent_tasks WHERE agent_id = ? ORDER BY priority DESC, created',
            [agentId]
        );
    }

    /**
     * Delete a task
     * @param {number} taskId - Task ID
     * @returns {Promise<void>}
     */
    async deleteTask(taskId) {
        const task = await this.getTask(taskId);

        if (!task) {
            throw new Error(`Task ${taskId} not found`);
        }

        if (task.status === 'in_progress') {
            throw new Error('Cannot delete task that is in progress. Fail or complete it first.');
        }

        const db = getDb();
        await db.run('DELETE FROM agent_tasks WHERE id = ?', [taskId]);
    }

    /**
     * Get task statistics for a project
     * @param {number} projectId - Project ID
     * @returns {Promise<object>} - Statistics object
     */
    async getProjectTaskStats(projectId) {
        const db = getDb();

        const stats = await db.all(
            `SELECT status, COUNT(*) as count
             FROM agent_tasks
             WHERE project_id = ?
             GROUP BY status`,
            [projectId]
        );

        const result = {
            total: 0,
            pending: 0,
            assigned: 0,
            in_progress: 0,
            completed: 0,
            failed: 0,
            blocked: 0
        };

        stats.forEach(stat => {
            result[stat.status] = stat.count;
            result.total += stat.count;
        });

        return result;
    }

    /**
     * Get next pending task for assignment
     * @param {number} projectId - Project ID
     * @param {string} preferredRole - Optional preferred role for task
     * @returns {Promise<object|null>} - Next task or null
     */
    async getNextPendingTask(projectId, preferredRole = null) {
        const db = getDb();

        // For now, just get highest priority pending task
        // In future, could match tasks to roles based on description
        return await db.get(
            `SELECT * FROM agent_tasks
             WHERE project_id = ? AND status = 'pending'
             ORDER BY priority DESC, created ASC
             LIMIT 1`,
            [projectId]
        );
    }

    /**
     * Reassign task to a different agent
     * @param {number} taskId - Task ID
     * @param {number} newAgentId - New agent ID
     * @returns {Promise<object>} - Updated task object
     */
    async reassignTask(taskId, newAgentId) {
        const task = await this.getTask(taskId);

        if (!task) {
            throw new Error(`Task ${taskId} not found`);
        }

        const db = getDb();
        await db.run(
            'UPDATE agent_tasks SET agent_id = ?, status = ? WHERE id = ?',
            [newAgentId, 'assigned', taskId]
        );

        return await this.getTask(taskId);
    }

    /**
     * Update task priority
     * @param {number} taskId - Task ID
     * @param {number} priority - New priority level
     * @returns {Promise<object>} - Updated task object
     */
    async updateTaskPriority(taskId, priority) {
        const db = getDb();
        await db.run(
            'UPDATE agent_tasks SET priority = ? WHERE id = ?',
            [priority, taskId]
        );

        return await this.getTask(taskId);
    }

    /**
     * Get tasks created by a specific agent
     * @param {number} agentId - Agent ID
     * @returns {Promise<Array>} - Array of task objects
     */
    async getTasksCreatedByAgent(agentId) {
        const db = getDb();
        return await db.all(
            'SELECT * FROM agent_tasks WHERE assigned_by_agent_id = ? ORDER BY created DESC',
            [agentId]
        );
    }

    /**
     * Check if task is complete (completed or failed)
     * @param {number} taskId - Task ID
     * @returns {Promise<boolean>} - True if complete
     */
    async isTaskComplete(taskId) {
        const task = await this.getTask(taskId);

        if (!task) {
            return false;
        }

        return task.status === 'completed' || task.status === 'failed';
    }
}

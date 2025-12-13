import fs from 'fs/promises';
import path from 'path';
import { getDb } from '../database/db.js';

/**
 * ProjectManager handles CRUD operations for projects and manages
 * isolated workspace directories for each project.
 */
export class ProjectManager {
    constructor(workspaceRoot = './workspaces') {
        this.workspaceRoot = workspaceRoot;
    }

    /**
     * Create a new project with isolated workspace directory
     * @param {string} name - Project name
     * @returns {Promise<object>} - Created project
     */
    async createProject(name) {
        if (!name || name.trim().length === 0) {
            throw new Error('Project name is required');
        }

        // Sanitize name for filesystem (remove special characters)
        const safeName = name.replace(/[^a-zA-Z0-9-_\s]/g, '_').trim();
        const timestamp = Date.now();
        const projectDirName = `${safeName}_${timestamp}`;
        const projectDir = path.resolve(this.workspaceRoot, projectDirName);

        // Create directory
        await fs.mkdir(projectDir, { recursive: true });

        // Insert into database
        const db = getDb();
        const result = await db.run(
            'INSERT INTO projects (name, baseDir, created) VALUES (?, ?, ?)',
            [name, projectDir, new Date().toISOString()]
        );

        return {
            id: result.lastID,
            name,
            baseDir: projectDir,
            created: new Date().toISOString()
        };
    }

    /**
     * Get a project by ID
     * @param {number} id - Project ID
     * @returns {Promise<object|null>} - Project or null if not found
     */
    async getProject(id) {
        const db = getDb();
        return await db.get('SELECT * FROM projects WHERE id = ?', [id]);
    }

    /**
     * List all projects
     * @returns {Promise<Array>} - Array of projects
     */
    async listProjects() {
        const db = getDb();
        return await db.all('SELECT * FROM projects ORDER BY created DESC');
    }

    /**
     * Delete a project
     * @param {number} id - Project ID
     * @param {boolean} deleteFiles - Whether to delete workspace directory
     * @returns {Promise<void>}
     */
    async deleteProject(id, deleteFiles = false) {
        const project = await this.getProject(id);
        if (!project) {
            throw new Error('Project not found');
        }

        const db = getDb();

        // Delete from database (cascade will handle messages/tasks)
        await db.run('DELETE FROM projects WHERE id = ?', [id]);

        // Optionally delete directory
        if (deleteFiles && project.baseDir) {
            try {
                await fs.rm(project.baseDir, { recursive: true, force: true });
            } catch (error) {
                console.warn(`Failed to delete project directory ${project.baseDir}:`, error.message);
            }
        }
    }

    /**
     * Update project name
     * @param {number} id - Project ID
     * @param {string} name - New name
     * @returns {Promise<object>} - Updated project
     */
    async updateProject(id, name) {
        const project = await this.getProject(id);
        if (!project) {
            throw new Error('Project not found');
        }

        const db = getDb();
        await db.run('UPDATE projects SET name = ? WHERE id = ?', [name, id]);

        return await this.getProject(id);
    }
}

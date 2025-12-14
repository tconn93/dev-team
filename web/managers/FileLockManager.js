import { getDb } from '../database/db.js';

/**
 * FileLockManager prevents concurrent file modifications by multiple agents
 * Implements file locking with automatic expiration to prevent deadlocks
 */
export class FileLockManager {
    constructor() {
        // Default lock expiration: 5 minutes
        this.defaultExpirationMs = 5 * 60 * 1000;

        // Auto-cleanup expired locks every minute
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredLocks().catch(err => {
                console.error('Error cleaning up expired locks:', err);
            });
        }, 60 * 1000);
    }

    /**
     * Acquire a lock on a file
     * @param {number} projectId - Project ID
     * @param {string} filePath - Relative file path from project root
     * @param {number} agentId - Agent requesting the lock
     * @param {string} lockType - 'read' or 'write'
     * @param {number} expiresIn - Optional expiration time in milliseconds
     * @returns {Promise<object>} - Lock object
     * @throws {Error} If lock cannot be acquired
     */
    async acquireLock(projectId, filePath, agentId, lockType = 'write', expiresIn = null) {
        if (!projectId || !filePath || !agentId) {
            throw new Error('projectId, filePath, and agentId are required');
        }

        if (lockType !== 'read' && lockType !== 'write') {
            throw new Error("lockType must be 'read' or 'write'");
        }

        const db = getDb();

        // Check if file is already locked
        const existingLock = await this.checkLock(projectId, filePath);

        if (existingLock) {
            // Same agent can reacquire their own lock
            if (existingLock.locked_by_agent_id === agentId && existingLock.lock_type === lockType) {
                return existingLock;
            }

            // Write lock conflicts with any other lock
            if (lockType === 'write' || existingLock.lock_type === 'write') {
                throw new Error(
                    `File '${filePath}' is locked by agent ${existingLock.locked_by_agent_id} ` +
                    `(${existingLock.lock_type} lock). Wait for lock to be released.`
                );
            }

            // Multiple read locks are allowed
            // Fall through to create read lock
        }

        // Calculate expiration time
        const expirationMs = expiresIn || this.defaultExpirationMs;
        const acquired = new Date();
        const expires = new Date(acquired.getTime() + expirationMs);

        try {
            const result = await db.run(
                `INSERT INTO file_locks (project_id, file_path, locked_by_agent_id, lock_type, acquired, expires)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [projectId, filePath, agentId, lockType, acquired.toISOString(), expires.toISOString()]
            );

            return {
                id: result.lastID,
                project_id: projectId,
                file_path: filePath,
                locked_by_agent_id: agentId,
                lock_type: lockType,
                acquired: acquired.toISOString(),
                expires: expires.toISOString()
            };
        } catch (error) {
            // Handle UNIQUE constraint violation (another agent acquired lock in the meantime)
            if (error.message.includes('UNIQUE')) {
                throw new Error(`File '${filePath}' was locked by another agent concurrently`);
            }
            throw error;
        }
    }

    /**
     * Release a lock on a file
     * @param {number} projectId - Project ID
     * @param {string} filePath - Relative file path
     * @param {number} agentId - Agent releasing the lock
     * @returns {Promise<boolean>} - True if lock was released
     */
    async releaseLock(projectId, filePath, agentId) {
        const db = getDb();

        const result = await db.run(
            'DELETE FROM file_locks WHERE project_id = ? AND file_path = ? AND locked_by_agent_id = ?',
            [projectId, filePath, agentId]
        );

        return result.changes > 0;
    }

    /**
     * Release all locks held by an agent
     * @param {number} agentId - Agent ID
     * @returns {Promise<number>} - Number of locks released
     */
    async releaseAllAgentLocks(agentId) {
        const db = getDb();

        const result = await db.run(
            'DELETE FROM file_locks WHERE locked_by_agent_id = ?',
            [agentId]
        );

        return result.changes || 0;
    }

    /**
     * Release all locks for a project
     * @param {number} projectId - Project ID
     * @returns {Promise<number>} - Number of locks released
     */
    async releaseAllProjectLocks(projectId) {
        const db = getDb();

        const result = await db.run(
            'DELETE FROM file_locks WHERE project_id = ?',
            [projectId]
        );

        return result.changes || 0;
    }

    /**
     * Check if a file is locked
     * @param {number} projectId - Project ID
     * @param {string} filePath - Relative file path
     * @returns {Promise<object|null>} - Lock object or null if not locked
     */
    async checkLock(projectId, filePath) {
        const db = getDb();

        // Get the most restrictive lock (write locks take precedence)
        const lock = await db.get(
            `SELECT * FROM file_locks
             WHERE project_id = ? AND file_path = ?
             ORDER BY CASE WHEN lock_type = 'write' THEN 0 ELSE 1 END, acquired
             LIMIT 1`,
            [projectId, filePath]
        );

        if (!lock) {
            return null;
        }

        // Check if lock has expired
        const now = new Date();
        const expires = new Date(lock.expires);

        if (now > expires) {
            // Lock expired, auto-release it
            await this.releaseLock(projectId, filePath, lock.locked_by_agent_id);
            return null;
        }

        return lock;
    }

    /**
     * Get all active locks for a project
     * @param {number} projectId - Project ID
     * @returns {Promise<Array>} - Array of lock objects
     */
    async getProjectLocks(projectId) {
        const db = getDb();

        return await db.all(
            `SELECT fl.*, a.name as agent_name, a.role as agent_role
             FROM file_locks fl
             JOIN agents a ON fl.locked_by_agent_id = a.id
             WHERE fl.project_id = ?
             ORDER BY fl.acquired`,
            [projectId]
        );
    }

    /**
     * Get all locks held by an agent
     * @param {number} agentId - Agent ID
     * @returns {Promise<Array>} - Array of lock objects
     */
    async getAgentLocks(agentId) {
        const db = getDb();

        return await db.all(
            'SELECT * FROM file_locks WHERE locked_by_agent_id = ? ORDER BY acquired',
            [agentId]
        );
    }

    /**
     * Clean up expired locks
     * @returns {Promise<number>} - Number of locks cleaned up
     */
    async cleanupExpiredLocks() {
        const db = getDb();

        const now = new Date().toISOString();

        const result = await db.run(
            'DELETE FROM file_locks WHERE expires <= ?',
            [now]
        );

        if (result.changes && result.changes > 0) {
            console.log(`Cleaned up ${result.changes} expired file lock(s)`);
        }

        return result.changes || 0;
    }

    /**
     * Extend lock expiration
     * @param {number} projectId - Project ID
     * @param {string} filePath - Relative file path
     * @param {number} agentId - Agent extending the lock
     * @param {number} additionalMs - Additional milliseconds to add
     * @returns {Promise<object>} - Updated lock object
     */
    async extendLock(projectId, filePath, agentId, additionalMs) {
        const lock = await this.checkLock(projectId, filePath);

        if (!lock) {
            throw new Error(`No active lock found for file '${filePath}'`);
        }

        if (lock.locked_by_agent_id !== agentId) {
            throw new Error(`Lock is held by another agent (${lock.locked_by_agent_id})`);
        }

        const currentExpires = new Date(lock.expires);
        const newExpires = new Date(currentExpires.getTime() + additionalMs);

        const db = getDb();
        await db.run(
            'UPDATE file_locks SET expires = ? WHERE id = ?',
            [newExpires.toISOString(), lock.id]
        );

        return await db.get('SELECT * FROM file_locks WHERE id = ?', [lock.id]);
    }

    /**
     * Detect potential deadlocks
     * Warning: This is a simple implementation - real deadlock detection is complex
     * @param {number} projectId - Project ID
     * @returns {Promise<Array>} - Array of potential deadlock situations
     */
    async detectDeadlocks(projectId) {
        const db = getDb();

        // Simple heuristic: locks held for more than 10 minutes might be problematic
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

        return await db.all(
            `SELECT fl.*, a.name as agent_name, a.status as agent_status
             FROM file_locks fl
             JOIN agents a ON fl.locked_by_agent_id = a.id
             WHERE fl.project_id = ? AND fl.acquired < ?
             ORDER BY fl.acquired`,
            [projectId, tenMinutesAgo]
        );
    }

    /**
     * Force release a lock (admin/emergency use)
     * @param {number} lockId - Lock ID to force release
     * @returns {Promise<boolean>} - True if released
     */
    async forceReleaseLock(lockId) {
        const db = getDb();

        const result = await db.run(
            'DELETE FROM file_locks WHERE id = ?',
            [lockId]
        );

        return result.changes > 0;
    }

    /**
     * Stop the cleanup interval (call when shutting down)
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
}

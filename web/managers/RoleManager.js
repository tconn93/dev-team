import { getDb } from '../database/db.js';

/**
 * RoleManager handles role definitions for agents
 * Manages both predefined roles (coordinator, frontend, backend, devops, tester)
 * and custom user-defined roles
 */
export class RoleManager {
    /**
     * Get a role by name
     * @param {string} roleName - Role name (e.g., 'frontend', 'backend')
     * @returns {Promise<object|null>} - Role object or null if not found
     */
    async getRole(roleName) {
        const db = getDb();
        return await db.get(
            'SELECT * FROM roles WHERE name = ?',
            [roleName]
        );
    }

    /**
     * List all roles
     * @param {boolean} predefinedOnly - If true, only return predefined roles
     * @returns {Promise<Array>} - Array of role objects
     */
    async listRoles(predefinedOnly = false) {
        const db = getDb();

        if (predefinedOnly) {
            return await db.all(
                'SELECT * FROM roles WHERE is_predefined = 1 ORDER BY name'
            );
        }

        return await db.all('SELECT * FROM roles ORDER BY is_predefined DESC, name');
    }

    /**
     * Create a custom role
     * @param {string} name - Role name (must be unique, lowercase, no spaces)
     * @param {string} displayName - Display name for UI
     * @param {string} systemPrompt - System prompt for this role
     * @returns {Promise<object>} - Created role object
     */
    async createCustomRole(name, displayName, systemPrompt) {
        if (!name || !displayName || !systemPrompt) {
            throw new Error('name, displayName, and systemPrompt are required');
        }

        // Validate name format (lowercase, no spaces, alphanumeric + underscore/hyphen)
        if (!/^[a-z0-9_-]+$/.test(name)) {
            throw new Error('Role name must be lowercase alphanumeric with underscores or hyphens only');
        }

        // Check if role already exists
        const existing = await this.getRole(name);
        if (existing) {
            throw new Error(`Role '${name}' already exists`);
        }

        const db = getDb();
        const result = await db.run(
            `INSERT INTO roles (name, display_name, system_prompt, is_predefined, created)
             VALUES (?, ?, ?, 0, ?)`,
            [name, displayName, systemPrompt, new Date().toISOString()]
        );

        return {
            id: result.lastID,
            name,
            display_name: displayName,
            system_prompt: systemPrompt,
            is_predefined: 0,
            created: new Date().toISOString()
        };
    }

    /**
     * Update a custom role
     * @param {string} roleName - Role name to update
     * @param {object} updates - Fields to update (displayName and/or systemPrompt)
     * @returns {Promise<object>} - Updated role object
     */
    async updateRole(roleName, updates) {
        const role = await this.getRole(roleName);

        if (!role) {
            throw new Error(`Role '${roleName}' not found`);
        }

        if (role.is_predefined) {
            throw new Error('Cannot update predefined roles. Create a custom role instead.');
        }

        const db = getDb();
        const { displayName, systemPrompt } = updates;

        if (displayName !== undefined) {
            await db.run(
                'UPDATE roles SET display_name = ? WHERE name = ?',
                [displayName, roleName]
            );
        }

        if (systemPrompt !== undefined) {
            await db.run(
                'UPDATE roles SET system_prompt = ? WHERE name = ?',
                [systemPrompt, roleName]
            );
        }

        return await this.getRole(roleName);
    }

    /**
     * Delete a custom role
     * @param {string} roleName - Role name to delete
     * @returns {Promise<void>}
     */
    async deleteRole(roleName) {
        const role = await this.getRole(roleName);

        if (!role) {
            throw new Error(`Role '${roleName}' not found`);
        }

        if (role.is_predefined) {
            throw new Error('Cannot delete predefined roles');
        }

        // Check if any agents are using this role
        const db = getDb();
        const agentsUsingRole = await db.get(
            'SELECT COUNT(*) as count FROM agents WHERE role = ?',
            [roleName]
        );

        if (agentsUsingRole.count > 0) {
            throw new Error(`Cannot delete role '${roleName}': ${agentsUsingRole.count} agent(s) are using this role`);
        }

        await db.run('DELETE FROM roles WHERE name = ?', [roleName]);
    }

    /**
     * Get system prompt for a role
     * @param {string} roleName - Role name
     * @returns {Promise<string>} - System prompt text
     */
    async getSystemPrompt(roleName) {
        const role = await this.getRole(roleName);

        if (!role) {
            throw new Error(`Role '${roleName}' not found`);
        }

        return role.system_prompt;
    }

    /**
     * Check if a role exists
     * @param {string} roleName - Role name to check
     * @returns {Promise<boolean>} - True if role exists
     */
    async roleExists(roleName) {
        const role = await this.getRole(roleName);
        return !!role;
    }

    /**
     * Get list of predefined role names
     * @returns {Array<string>} - Array of predefined role names
     */
    getPredefinedRoleNames() {
        return ['coordinator', 'frontend', 'backend', 'devops', 'tester'];
    }
}

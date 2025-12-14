import express from 'express';
import { RoleManager } from '../managers/RoleManager.js';

/**
 * Create router for role management endpoints
 * @returns {express.Router}
 */
export function createRolesRouter() {
    const router = express.Router();
    const roleManager = new RoleManager();

    // GET /api/roles - List all roles
    router.get('/', async (req, res) => {
        try {
            const { predefinedOnly } = req.query;
            const roles = await roleManager.listRoles(predefinedOnly === 'true');

            res.json(roles);

        } catch (error) {
            console.error('Error listing roles:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // POST /api/roles - Create custom role
    router.post('/', async (req, res) => {
        try {
            const { name, displayName, systemPrompt } = req.body;

            if (!name || !displayName || !systemPrompt) {
                return res.status(400).json({
                    error: 'name, displayName, and systemPrompt are required'
                });
            }

            const role = await roleManager.createCustomRole(name, displayName, systemPrompt);
            res.status(201).json(role);

        } catch (error) {
            console.error('Error creating role:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/roles/:roleName - Get role details
    router.get('/:roleName', async (req, res) => {
        try {
            const roleName = req.params.roleName;
            const role = await roleManager.getRole(roleName);

            if (!role) {
                return res.status(404).json({ error: 'Role not found' });
            }

            res.json(role);

        } catch (error) {
            console.error('Error getting role:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // PUT /api/roles/:roleName - Update custom role
    router.put('/:roleName', async (req, res) => {
        try {
            const roleName = req.params.roleName;
            const { displayName, systemPrompt } = req.body;

            const role = await roleManager.updateRole(roleName, {
                displayName,
                systemPrompt
            });

            res.json(role);

        } catch (error) {
            console.error('Error updating role:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // DELETE /api/roles/:roleName - Delete custom role
    router.delete('/:roleName', async (req, res) => {
        try {
            const roleName = req.params.roleName;
            await roleManager.deleteRole(roleName);

            res.json({ success: true });

        } catch (error) {
            console.error('Error deleting role:', error);
            res.status(500).json({ error: error.message });
        }
    });

    return router;
}

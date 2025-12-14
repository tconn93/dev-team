import { getDb } from '../database/db.js';

/**
 * CommunicationManager handles all communication between agents and users
 * Manages both agent-to-agent private messages and group chat (team-wide)
 */
export class CommunicationManager {
    /**
     * Send private message from one agent to another
     * @param {number} fromAgentId - Sending agent ID
     * @param {number} toAgentId - Receiving agent ID
     * @param {string} message - Message content
     * @param {string} messageType - Message type ('message', 'question', 'response', 'task_handoff')
     * @param {number} relatedTaskId - Optional related task ID
     * @returns {Promise<object>} - Created message object
     */
    async sendAgentMessage(fromAgentId, toAgentId, message, messageType = 'message', relatedTaskId = null) {
        if (!fromAgentId || !toAgentId || !message) {
            throw new Error('fromAgentId, toAgentId, and message are required');
        }

        if (fromAgentId === toAgentId) {
            throw new Error('Agent cannot send message to itself');
        }

        const validTypes = ['message', 'question', 'response', 'task_handoff'];
        if (!validTypes.includes(messageType)) {
            throw new Error(`Invalid message type. Must be one of: ${validTypes.join(', ')}`);
        }

        // Get project_id from the fromAgent
        const db = getDb();
        const fromAgent = await db.get('SELECT project_id FROM agents WHERE id = ?', [fromAgentId]);

        if (!fromAgent) {
            throw new Error(`Agent ${fromAgentId} not found`);
        }

        const result = await db.run(
            `INSERT INTO agent_communications (
                project_id, from_agent_id, to_agent_id, message, message_type, related_task_id, read, created
             ) VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
            [fromAgent.project_id, fromAgentId, toAgentId, message, messageType, relatedTaskId, new Date().toISOString()]
        );

        return {
            id: result.lastID,
            project_id: fromAgent.project_id,
            from_agent_id: fromAgentId,
            to_agent_id: toAgentId,
            message,
            message_type: messageType,
            related_task_id: relatedTaskId,
            read: 0,
            created: new Date().toISOString()
        };
    }

    /**
     * Get agent's inbox (messages sent to them)
     * @param {number} agentId - Agent ID
     * @param {boolean} unreadOnly - If true, only return unread messages
     * @param {number} limit - Optional limit
     * @returns {Promise<Array>} - Array of message objects
     */
    async getAgentInbox(agentId, unreadOnly = false, limit = 50) {
        const db = getDb();

        let query = `
            SELECT ac.*,
                   fa.name as from_agent_name, fa.role as from_agent_role, fa.color as from_agent_color,
                   ta.name as to_agent_name, ta.role as to_agent_role, ta.color as to_agent_color
            FROM agent_communications ac
            JOIN agents fa ON ac.from_agent_id = fa.id
            JOIN agents ta ON ac.to_agent_id = ta.id
            WHERE ac.to_agent_id = ?
        `;

        const params = [agentId];

        if (unreadOnly) {
            query += ' AND ac.read = 0';
        }

        query += ' ORDER BY ac.created DESC LIMIT ?';
        params.push(limit);

        return await db.all(query, params);
    }

    /**
     * Get agent's sent messages
     * @param {number} agentId - Agent ID
     * @param {number} limit - Optional limit
     * @returns {Promise<Array>} - Array of message objects
     */
    async getAgentSentMessages(agentId, limit = 50) {
        const db = getDb();

        return await db.all(
            `SELECT ac.*,
                    ta.name as to_agent_name, ta.role as to_agent_role, ta.color as to_agent_color
             FROM agent_communications ac
             JOIN agents ta ON ac.to_agent_id = ta.id
             WHERE ac.from_agent_id = ?
             ORDER BY ac.created DESC
             LIMIT ?`,
            [agentId, limit]
        );
    }

    /**
     * Mark message as read
     * @param {number} messageId - Message ID
     * @returns {Promise<void>}
     */
    async markAsRead(messageId) {
        const db = getDb();
        await db.run(
            'UPDATE agent_communications SET read = 1 WHERE id = ?',
            [messageId]
        );
    }

    /**
     * Mark all messages to an agent as read
     * @param {number} agentId - Agent ID
     * @returns {Promise<void>}
     */
    async markAllAsRead(agentId) {
        const db = getDb();
        await db.run(
            'UPDATE agent_communications SET read = 1 WHERE to_agent_id = ? AND read = 0',
            [agentId]
        );
    }

    /**
     * Get unread message count for an agent
     * @param {number} agentId - Agent ID
     * @returns {Promise<number>} - Count of unread messages
     */
    async getUnreadCount(agentId) {
        const db = getDb();
        const result = await db.get(
            'SELECT COUNT(*) as count FROM agent_communications WHERE to_agent_id = ? AND read = 0',
            [agentId]
        );

        return result.count || 0;
    }

    /**
     * Send message to group chat (visible to all agents and user)
     * @param {number} projectId - Project ID
     * @param {string} senderType - 'user' or 'agent'
     * @param {number} senderAgentId - Agent ID if senderType is 'agent', null otherwise
     * @param {string} message - Message content
     * @returns {Promise<object>} - Created message object
     */
    async sendGroupMessage(projectId, senderType, senderAgentId, message) {
        if (!projectId || !senderType || !message) {
            throw new Error('projectId, senderType, and message are required');
        }

        if (senderType !== 'user' && senderType !== 'agent') {
            throw new Error("senderType must be 'user' or 'agent'");
        }

        if (senderType === 'agent' && !senderAgentId) {
            throw new Error('senderAgentId required when senderType is agent');
        }

        const db = getDb();
        const result = await db.run(
            `INSERT INTO group_messages (project_id, sender_type, sender_agent_id, message, created)
             VALUES (?, ?, ?, ?, ?)`,
            [projectId, senderType, senderAgentId, message, new Date().toISOString()]
        );

        return {
            id: result.lastID,
            project_id: projectId,
            sender_type: senderType,
            sender_agent_id: senderAgentId,
            message,
            created: new Date().toISOString()
        };
    }

    /**
     * Get group chat messages for a project
     * @param {number} projectId - Project ID
     * @param {number} limit - Optional limit
     * @param {number} offset - Optional offset for pagination
     * @returns {Promise<Array>} - Array of message objects with sender details
     */
    async getGroupMessages(projectId, limit = 100, offset = 0) {
        const db = getDb();

        return await db.all(
            `SELECT gm.*,
                    a.name as agent_name, a.role as agent_role, a.color as agent_color
             FROM group_messages gm
             LEFT JOIN agents a ON gm.sender_agent_id = a.id
             WHERE gm.project_id = ?
             ORDER BY gm.created ASC
             LIMIT ? OFFSET ?`,
            [projectId, limit, offset]
        );
    }

    /**
     * Get conversation between two agents
     * @param {number} agent1Id - First agent ID
     * @param {number} agent2Id - Second agent ID
     * @param {number} limit - Optional limit
     * @returns {Promise<Array>} - Array of messages (bidirectional)
     */
    async getAgentConversation(agent1Id, agent2Id, limit = 50) {
        const db = getDb();

        return await db.all(
            `SELECT ac.*,
                    fa.name as from_agent_name, fa.role as from_agent_role, fa.color as from_agent_color,
                    ta.name as to_agent_name, ta.role as to_agent_role, ta.color as to_agent_color
             FROM agent_communications ac
             JOIN agents fa ON ac.from_agent_id = fa.id
             JOIN agents ta ON ac.to_agent_id = ta.id
             WHERE (ac.from_agent_id = ? AND ac.to_agent_id = ?)
                OR (ac.from_agent_id = ? AND ac.to_agent_id = ?)
             ORDER BY ac.created ASC
             LIMIT ?`,
            [agent1Id, agent2Id, agent2Id, agent1Id, limit]
        );
    }

    /**
     * Delete a private message
     * @param {number} messageId - Message ID
     * @returns {Promise<void>}
     */
    async deletePrivateMessage(messageId) {
        const db = getDb();
        await db.run('DELETE FROM agent_communications WHERE id = ?', [messageId]);
    }

    /**
     * Delete a group message
     * @param {number} messageId - Message ID
     * @returns {Promise<void>}
     */
    async deleteGroupMessage(messageId) {
        const db = getDb();
        await db.run('DELETE FROM group_messages WHERE id = ?', [messageId]);
    }

    /**
     * Get communication statistics for a project
     * @param {number} projectId - Project ID
     * @returns {Promise<object>} - Stats object
     */
    async getProjectCommunicationStats(projectId) {
        const db = getDb();

        const groupCount = await db.get(
            'SELECT COUNT(*) as count FROM group_messages WHERE project_id = ?',
            [projectId]
        );

        const privateCount = await db.get(
            'SELECT COUNT(*) as count FROM agent_communications WHERE project_id = ?',
            [projectId]
        );

        return {
            total_group_messages: groupCount.count || 0,
            total_private_messages: privateCount.count || 0,
            total_messages: (groupCount.count || 0) + (privateCount.count || 0)
        };
    }
}

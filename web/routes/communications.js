import express from 'express';
import { CommunicationManager } from '../managers/CommunicationManager.js';

/**
 * Create router for communication endpoints
 * @returns {express.Router}
 */
export function createCommunicationsRouter() {
    const router = express.Router({ mergeParams: true });
    const commManager = new CommunicationManager();

    // POST /api/projects/:projectId/messages/group - Send group message
    router.post('/group', async (req, res) => {
        try {
            const projectId = parseInt(req.params.projectId);
            const { message, senderAgentId } = req.body;

            if (!message) {
                return res.status(400).json({ error: 'message is required' });
            }

            const senderType = senderAgentId ? 'agent' : 'user';

            const result = await commManager.sendGroupMessage(
                projectId,
                senderType,
                senderAgentId || null,
                message
            );

            res.status(201).json(result);

        } catch (error) {
            console.error('Error sending group message:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/projects/:projectId/messages/group - Get group messages
    router.get('/group', async (req, res) => {
        try {
            const projectId = parseInt(req.params.projectId);
            const { limit, offset } = req.query;

            const messages = await commManager.getGroupMessages(
                projectId,
                limit ? parseInt(limit) : 100,
                offset ? parseInt(offset) : 0
            );

            res.json(messages);

        } catch (error) {
            console.error('Error getting group messages:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // POST /api/projects/:projectId/messages/agent - Send agent-to-agent message
    router.post('/agent', async (req, res) => {
        try {
            const { fromAgentId, toAgentId, message, messageType, relatedTaskId } = req.body;

            if (!fromAgentId || !toAgentId || !message) {
                return res.status(400).json({
                    error: 'fromAgentId, toAgentId, and message are required'
                });
            }

            const result = await commManager.sendAgentMessage(
                fromAgentId,
                toAgentId,
                message,
                messageType || 'message',
                relatedTaskId || null
            );

            res.status(201).json(result);

        } catch (error) {
            console.error('Error sending agent message:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/projects/:projectId/agents/:agentId/inbox - Get agent inbox
    router.get('/:agentId/inbox', async (req, res) => {
        try {
            const agentId = parseInt(req.params.agentId);
            const { unreadOnly, limit } = req.query;

            const messages = await commManager.getAgentInbox(
                agentId,
                unreadOnly === 'true',
                limit ? parseInt(limit) : 50
            );

            res.json(messages);

        } catch (error) {
            console.error('Error getting inbox:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // PUT /api/projects/:projectId/messages/:messageId/read - Mark as read
    router.put('/:messageId/read', async (req, res) => {
        try {
            const messageId = parseInt(req.params.messageId);
            await commManager.markAsRead(messageId);

            res.json({ success: true });

        } catch (error) {
            console.error('Error marking message as read:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/projects/:projectId/messages/stats - Get communication stats
    router.get('/stats', async (req, res) => {
        try {
            const projectId = parseInt(req.params.projectId);
            const stats = await commManager.getProjectCommunicationStats(projectId);

            res.json(stats);

        } catch (error) {
            console.error('Error getting communication stats:', error);
            res.status(500).json({ error: error.message });
        }
    });

    return router;
}

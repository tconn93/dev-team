/**
 * WebSocket broadcast utility for emitting events to project rooms
 *
 * This module provides a centralized way for managers to broadcast events
 * to all WebSocket clients subscribed to a project.
 */

let broadcastFunction = null;

/**
 * Initialize the broadcast utility with the broadcast function from WebSocket server
 * @param {Function} broadcastToProjectFn - Function to broadcast to project room
 */
export function initializeBroadcast(broadcastToProjectFn) {
    broadcastFunction = broadcastToProjectFn;
}

/**
 * Broadcast agent status update to project room
 * @param {number} projectId - Project ID
 * @param {number} agentId - Agent ID
 * @param {string} agentName - Agent name
 * @param {string} status - New status (idle, working, waiting, paused)
 * @param {number} currentTaskId - Current task ID or null
 */
export function broadcastAgentStatus(projectId, agentId, agentName, status, currentTaskId = null) {
    if (!broadcastFunction) return;

    broadcastFunction(projectId, {
        type: 'agentStatusUpdate',
        projectId,
        agentId,
        agentName,
        status,
        currentTask: currentTaskId
    });
}

/**
 * Broadcast task created event to project room
 * @param {number} projectId - Project ID
 * @param {object} task - Task object
 */
export function broadcastTaskCreated(projectId, task) {
    if (!broadcastFunction) return;

    broadcastFunction(projectId, {
        type: 'taskCreated',
        projectId,
        task
    });
}

/**
 * Broadcast task updated event to project room
 * @param {number} projectId - Project ID
 * @param {number} taskId - Task ID
 * @param {string} status - New status
 * @param {number} agentId - Agent ID
 * @param {string} result - Task result
 * @param {string} error - Error message if failed
 */
export function broadcastTaskUpdated(projectId, taskId, status, agentId = null, result = null, error = null) {
    if (!broadcastFunction) return;

    broadcastFunction(projectId, {
        type: 'taskUpdated',
        projectId,
        taskId,
        status,
        agentId,
        result,
        error
    });
}

/**
 * Broadcast agent-to-agent private message to project room
 * @param {number} projectId - Project ID
 * @param {number} fromAgentId - Sender agent ID
 * @param {string} fromAgentName - Sender agent name
 * @param {number} toAgentId - Recipient agent ID
 * @param {string} toAgentName - Recipient agent name
 * @param {string} message - Message content
 * @param {string} messageType - Message type (message, question, response, task_handoff)
 */
export function broadcastAgentMessage(projectId, fromAgentId, fromAgentName, toAgentId, toAgentName, message, messageType = 'message') {
    if (!broadcastFunction) return;

    broadcastFunction(projectId, {
        type: 'agentMessage',
        projectId,
        fromAgentId,
        fromAgentName,
        toAgentId,
        toAgentName,
        message,
        messageType
    });
}

/**
 * Broadcast group message to project room
 * @param {number} projectId - Project ID
 * @param {string} senderType - Sender type (user, agent)
 * @param {number} senderAgentId - Sender agent ID (if agent)
 * @param {string} senderName - Sender name
 * @param {string} message - Message content
 */
export function broadcastGroupMessage(projectId, senderType, senderAgentId, senderName, message) {
    if (!broadcastFunction) return;

    broadcastFunction(projectId, {
        type: 'groupMessage',
        projectId,
        senderType,
        senderAgentId,
        senderName,
        message,
        created: new Date().toISOString()
    });
}

/**
 * Broadcast file lock update to project room
 * @param {number} projectId - Project ID
 * @param {string} filePath - File path
 * @param {boolean} locked - True if locked, false if unlocked
 * @param {number} agentId - Agent ID that locked/unlocked
 * @param {string} agentName - Agent name
 * @param {string} lockType - Lock type (read, write)
 */
export function broadcastFileLock(projectId, filePath, locked, agentId, agentName, lockType = 'write') {
    if (!broadcastFunction) return;

    broadcastFunction(projectId, {
        type: 'fileLockUpdate',
        projectId,
        filePath,
        locked,
        agentId,
        agentName,
        lockType
    });
}

/**
 * Broadcast tool execution event to project room
 * @param {number} projectId - Project ID
 * @param {number} agentId - Agent ID
 * @param {string} agentName - Agent name
 * @param {string} toolName - Tool name
 * @param {object} args - Tool arguments
 * @param {boolean} success - Whether execution succeeded
 * @param {string} summary - Execution summary (truncated result)
 */
export function broadcastToolExecution(projectId, agentId, agentName, toolName, args, success, summary) {
    if (!broadcastFunction) return;

    broadcastFunction(projectId, {
        type: 'toolExecution',
        projectId,
        agentId,
        agentName,
        toolName,
        args,
        success,
        summary
    });
}

/**
 * Broadcast agent created event to project room
 * @param {number} projectId - Project ID
 * @param {object} agent - Agent object
 */
export function broadcastAgentCreated(projectId, agent) {
    if (!broadcastFunction) return;

    broadcastFunction(projectId, {
        type: 'agentCreated',
        projectId,
        agent
    });
}

/**
 * Broadcast agent deleted event to project room
 * @param {number} projectId - Project ID
 * @param {number} agentId - Agent ID
 */
export function broadcastAgentDeleted(projectId, agentId) {
    if (!broadcastFunction) return;

    broadcastFunction(projectId, {
        type: 'agentDeleted',
        projectId,
        agentId
    });
}

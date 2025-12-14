import { WebSocketServer } from 'ws';
import { verifyToken } from '../auth/tokenAuth.js';

// Store project rooms: Map<projectId, Set<WebSocket>>
const projectRooms = new Map();

// Store client subscriptions: Map<WebSocket, Set<projectId>>
const clientSubscriptions = new Map();

/**
 * Setup WebSocket server for real-time task execution streaming
 * @param {http.Server} server - HTTP server instance
 * @param {SessionManager|MultiAgentSessionManager} sessionManager - Session manager
 * @returns {WebSocketServer} - WebSocket server instance
 */
export function setupWebSocket(server, sessionManager) {
    const wss = new WebSocketServer({
        server,
        path: '/ws'
    });

    wss.on('connection', async (ws, req) => {
        // Extract token from query params
        const url = new URL(req.url, 'http://localhost');
        const token = url.searchParams.get('token');

        // Verify authentication
        if (!verifyToken(token)) {
            ws.close(1008, 'Unauthorized');
            return;
        }

        console.log('WebSocket client connected');

        // Initialize client subscriptions
        clientSubscriptions.set(ws, new Set());

        // Handle incoming messages from client
        ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                const { type } = message;

                switch (type) {
                    case 'executeTask':
                        // Legacy single-agent mode
                        await handleExecuteTask(ws, sessionManager, message.projectId, message.prompt);
                        break;

                    case 'executeAgentTask':
                        // Multi-agent mode
                        await handleExecuteAgentTask(ws, sessionManager, message.agentId, message.taskId, message.prompt);
                        break;

                    case 'subscribeProject':
                        handleSubscribeProject(ws, message.projectId);
                        break;

                    case 'subscribeAgent':
                        handleSubscribeAgent(ws, message.agentId);
                        break;

                    case 'sendGroupMessage':
                        await handleSendGroupMessage(ws, sessionManager, message.projectId, message.message, message.senderAgentId);
                        break;

                    case 'pauseAgent':
                        await handlePauseAgent(ws, sessionManager, message.agentId);
                        break;

                    case 'resumeAgent':
                        await handleResumeAgent(ws, sessionManager, message.agentId);
                        break;

                    default:
                        ws.send(JSON.stringify({
                            type: 'error',
                            error: `Unknown message type: ${type}`
                        }));
                }
            } catch (error) {
                console.error('WebSocket message error:', error);
                ws.send(JSON.stringify({
                    type: 'error',
                    error: error.message
                }));
            }
        });

        ws.on('close', () => {
            console.log('WebSocket client disconnected');
            // Cleanup subscriptions
            const subscriptions = clientSubscriptions.get(ws);
            if (subscriptions) {
                subscriptions.forEach(projectId => {
                    const room = projectRooms.get(projectId);
                    if (room) {
                        room.delete(ws);
                        if (room.size === 0) {
                            projectRooms.delete(projectId);
                        }
                    }
                });
                clientSubscriptions.delete(ws);
            }
        });

        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
    });

    return wss;
}

/**
 * Subscribe to project updates (all agents in the project)
 * @param {WebSocket} ws - WebSocket connection
 * @param {number} projectId - Project ID
 */
function handleSubscribeProject(ws, projectId) {
    if (!projectId) {
        ws.send(JSON.stringify({
            type: 'error',
            error: 'Missing projectId'
        }));
        return;
    }

    // Add to project room
    if (!projectRooms.has(projectId)) {
        projectRooms.set(projectId, new Set());
    }
    projectRooms.get(projectId).add(ws);

    // Track subscription
    clientSubscriptions.get(ws).add(projectId);

    ws.send(JSON.stringify({
        type: 'subscribed',
        projectId
    }));

    console.log(`Client subscribed to project ${projectId}`);
}

/**
 * Subscribe to specific agent updates
 * @param {WebSocket} ws - WebSocket connection
 * @param {number} agentId - Agent ID
 */
function handleSubscribeAgent(ws, agentId) {
    // For now, agent-specific subscriptions are handled via project rooms
    // Future enhancement: could add agent-specific rooms
    ws.send(JSON.stringify({
        type: 'subscribed',
        agentId
    }));
}

/**
 * Broadcast event to all clients in a project room
 * @param {number} projectId - Project ID
 * @param {object} event - Event object to broadcast
 */
export function broadcastToProject(projectId, event) {
    const room = projectRooms.get(projectId);
    if (room) {
        const message = JSON.stringify(event);
        room.forEach(client => {
            if (client.readyState === 1) { // WebSocket.OPEN
                client.send(message);
            }
        });
    }
}

/**
 * Handle task execution request from client (legacy single-agent mode)
 * @param {WebSocket} ws - WebSocket connection
 * @param {SessionManager} sessionManager - Session manager
 * @param {number} projectId - Project ID
 * @param {string} prompt - Task prompt
 */
async function handleExecuteTask(ws, sessionManager, projectId, prompt) {
    // Validate inputs
    if (!projectId || !prompt) {
        ws.send(JSON.stringify({
            type: 'error',
            error: 'Missing projectId or prompt'
        }));
        return;
    }

    // Check if task already running for this project
    if (sessionManager.isRunning(projectId)) {
        ws.send(JSON.stringify({
            type: 'error',
            error: 'Task already running for this project. Please wait for it to complete.'
        }));
        return;
    }

    try {
        // Get agent for project
        const agent = await sessionManager.getAgent(projectId);

        // Setup event listeners for streaming
        const listeners = {
            start: (data) => {
                ws.send(JSON.stringify({
                    type: 'taskStart',
                    data
                }));
            },
            iteration: (data) => {
                ws.send(JSON.stringify({
                    type: 'iteration',
                    data
                }));
            },
            toolStart: (data) => {
                ws.send(JSON.stringify({
                    type: 'toolStart',
                    data
                }));
            },
            toolComplete: (data) => {
                ws.send(JSON.stringify({
                    type: 'toolComplete',
                    data
                }));
            },
            complete: async (data) => {
                ws.send(JSON.stringify({
                    type: 'taskComplete',
                    data
                }));
                // Save history after task completes
                await sessionManager.saveHistory(projectId);
            },
            error: (data) => {
                ws.send(JSON.stringify({
                    type: 'taskError',
                    data
                }));
            }
        };

        // Attach event listeners
        Object.entries(listeners).forEach(([event, handler]) => {
            agent.on(event, handler);
        });

        // Execute task
        try {
            await agent.executeTask(prompt);
        } catch (error) {
            // Error already emitted via 'error' event
            console.error('Task execution error:', error);
        } finally {
            // Cleanup listeners
            Object.entries(listeners).forEach(([event, handler]) => {
                agent.off(event, handler);
            });
        }

    } catch (error) {
        console.error('Execute task error:', error);
        ws.send(JSON.stringify({
            type: 'error',
            error: error.message
        }));
    }
}

/**
 * Handle agent task execution request (multi-agent mode)
 * @param {WebSocket} ws - WebSocket connection
 * @param {MultiAgentSessionManager} sessionManager - Multi-agent session manager
 * @param {number} agentId - Agent ID
 * @param {number} taskId - Optional task ID
 * @param {string} prompt - Task prompt
 */
async function handleExecuteAgentTask(ws, sessionManager, agentId, taskId, prompt) {
    // Validate inputs
    if (!agentId || !prompt) {
        ws.send(JSON.stringify({
            type: 'error',
            error: 'Missing agentId or prompt'
        }));
        return;
    }

    // Check if sessionManager supports multi-agent mode
    if (typeof sessionManager.executeAgentTask !== 'function') {
        ws.send(JSON.stringify({
            type: 'error',
            error: 'Multi-agent mode not supported'
        }));
        return;
    }

    try {
        // Get agent instance
        const agentInstance = await sessionManager.getAgentInstance(agentId);
        const agentData = await sessionManager.agentManager.getAgent(agentId);

        // Setup event listeners for streaming to project room
        const listeners = {
            start: (data) => {
                broadcastToProject(agentData.project_id, {
                    type: 'agentTaskStart',
                    agentId,
                    agentName: agentData.name,
                    taskId,
                    data
                });
            },
            iteration: (data) => {
                broadcastToProject(agentData.project_id, {
                    type: 'agentIteration',
                    agentId,
                    agentName: agentData.name,
                    data
                });
            },
            toolStart: (data) => {
                broadcastToProject(agentData.project_id, {
                    type: 'toolExecution',
                    agentId,
                    agentName: agentData.name,
                    toolName: data.tool,
                    args: data.args,
                    status: 'started'
                });
            },
            toolComplete: (data) => {
                broadcastToProject(agentData.project_id, {
                    type: 'toolExecution',
                    agentId,
                    agentName: agentData.name,
                    toolName: data.tool,
                    success: data.success,
                    summary: data.result?.substring(0, 200),
                    status: 'completed'
                });
            },
            complete: async (data) => {
                broadcastToProject(agentData.project_id, {
                    type: 'agentTaskComplete',
                    agentId,
                    agentName: agentData.name,
                    taskId,
                    data
                });

                // Update task status if taskId provided
                if (taskId && sessionManager.taskManager) {
                    await sessionManager.taskManager.updateTaskStatus(
                        taskId,
                        'completed',
                        data.response
                    );

                    broadcastToProject(agentData.project_id, {
                        type: 'taskUpdated',
                        taskId,
                        status: 'completed',
                        agentId
                    });
                }
            },
            error: async (data) => {
                broadcastToProject(agentData.project_id, {
                    type: 'agentTaskError',
                    agentId,
                    agentName: agentData.name,
                    taskId,
                    data
                });

                // Update task status if taskId provided
                if (taskId && sessionManager.taskManager) {
                    await sessionManager.taskManager.updateTaskStatus(
                        taskId,
                        'failed',
                        null,
                        data.error
                    );

                    broadcastToProject(agentData.project_id, {
                        type: 'taskUpdated',
                        taskId,
                        status: 'failed',
                        error: data.error,
                        agentId
                    });
                }
            }
        };

        // Attach event listeners
        Object.entries(listeners).forEach(([event, handler]) => {
            agentInstance.on(event, handler);
        });

        // Update agent status to working
        await sessionManager.agentManager.updateAgentStatus(agentId, 'working');
        broadcastToProject(agentData.project_id, {
            type: 'agentStatusUpdate',
            agentId,
            agentName: agentData.name,
            status: 'working',
            currentTask: taskId
        });

        // Execute task
        try {
            await sessionManager.executeAgentTask(agentId, taskId, prompt);
        } catch (error) {
            console.error('Agent task execution error:', error);
        } finally {
            // Cleanup listeners
            Object.entries(listeners).forEach(([event, handler]) => {
                agentInstance.off(event, handler);
            });

            // Update agent status back to idle
            await sessionManager.agentManager.updateAgentStatus(agentId, 'idle');
            await sessionManager.agentManager.clearCurrentTask(agentId);

            broadcastToProject(agentData.project_id, {
                type: 'agentStatusUpdate',
                agentId,
                agentName: agentData.name,
                status: 'idle',
                currentTask: null
            });
        }

    } catch (error) {
        console.error('Execute agent task error:', error);
        ws.send(JSON.stringify({
            type: 'error',
            error: error.message
        }));
    }
}

/**
 * Handle group message from client
 * @param {WebSocket} ws - WebSocket connection
 * @param {MultiAgentSessionManager} sessionManager - Multi-agent session manager
 * @param {number} projectId - Project ID
 * @param {string} message - Message content
 * @param {number} senderAgentId - Optional sender agent ID
 */
async function handleSendGroupMessage(ws, sessionManager, projectId, message, senderAgentId) {
    if (!projectId || !message) {
        ws.send(JSON.stringify({
            type: 'error',
            error: 'Missing projectId or message'
        }));
        return;
    }

    try {
        // Check if sessionManager supports multi-agent mode
        if (!sessionManager.commManager) {
            ws.send(JSON.stringify({
                type: 'error',
                error: 'Multi-agent mode not supported'
            }));
            return;
        }

        const senderType = senderAgentId ? 'agent' : 'user';
        const result = await sessionManager.commManager.sendGroupMessage(
            projectId,
            senderType,
            senderAgentId || null,
            message
        );

        // Get sender name
        let senderName = 'User';
        if (senderAgentId) {
            const agent = await sessionManager.agentManager.getAgent(senderAgentId);
            senderName = agent.name;
        }

        // Broadcast to all clients in project room
        broadcastToProject(projectId, {
            type: 'groupMessage',
            projectId,
            senderType,
            senderAgentId,
            senderName,
            message,
            created: result.created
        });

    } catch (error) {
        console.error('Send group message error:', error);
        ws.send(JSON.stringify({
            type: 'error',
            error: error.message
        }));
    }
}

/**
 * Handle pause agent request
 * @param {WebSocket} ws - WebSocket connection
 * @param {MultiAgentSessionManager} sessionManager - Multi-agent session manager
 * @param {number} agentId - Agent ID
 */
async function handlePauseAgent(ws, sessionManager, agentId) {
    if (!agentId) {
        ws.send(JSON.stringify({
            type: 'error',
            error: 'Missing agentId'
        }));
        return;
    }

    try {
        if (typeof sessionManager.pauseAgent !== 'function') {
            ws.send(JSON.stringify({
                type: 'error',
                error: 'Multi-agent mode not supported'
            }));
            return;
        }

        await sessionManager.pauseAgent(agentId);
        const agentData = await sessionManager.agentManager.getAgent(agentId);

        broadcastToProject(agentData.project_id, {
            type: 'agentStatusUpdate',
            agentId,
            agentName: agentData.name,
            status: 'paused'
        });

        ws.send(JSON.stringify({
            type: 'success',
            message: 'Agent paused'
        }));

    } catch (error) {
        console.error('Pause agent error:', error);
        ws.send(JSON.stringify({
            type: 'error',
            error: error.message
        }));
    }
}

/**
 * Handle resume agent request
 * @param {WebSocket} ws - WebSocket connection
 * @param {MultiAgentSessionManager} sessionManager - Multi-agent session manager
 * @param {number} agentId - Agent ID
 */
async function handleResumeAgent(ws, sessionManager, agentId) {
    if (!agentId) {
        ws.send(JSON.stringify({
            type: 'error',
            error: 'Missing agentId'
        }));
        return;
    }

    try {
        if (typeof sessionManager.resumeAgent !== 'function') {
            ws.send(JSON.stringify({
                type: 'error',
                error: 'Multi-agent mode not supported'
            }));
            return;
        }

        await sessionManager.resumeAgent(agentId);
        const agentData = await sessionManager.agentManager.getAgent(agentId);

        broadcastToProject(agentData.project_id, {
            type: 'agentStatusUpdate',
            agentId,
            agentName: agentData.name,
            status: 'working'
        });

        ws.send(JSON.stringify({
            type: 'success',
            message: 'Agent resumed'
        }));

    } catch (error) {
        console.error('Resume agent error:', error);
        ws.send(JSON.stringify({
            type: 'error',
            error: error.message
        }));
    }
}

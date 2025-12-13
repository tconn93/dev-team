import { WebSocketServer } from 'ws';
import { verifyToken } from '../auth/tokenAuth.js';

/**
 * Setup WebSocket server for real-time task execution streaming
 * @param {http.Server} server - HTTP server instance
 * @param {SessionManager} sessionManager - Shared session manager
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

        // Handle incoming messages from client
        ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                const { type, projectId, prompt } = message;

                if (type === 'executeTask') {
                    await handleExecuteTask(ws, sessionManager, projectId, prompt);
                } else {
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
        });

        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
    });

    return wss;
}

/**
 * Handle task execution request from client
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

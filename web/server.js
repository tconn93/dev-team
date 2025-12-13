import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from './database/db.js';
import { setupWebSocket } from './routes/websocket.js';
import { createApiRouter } from './routes/api.js';
import { authMiddleware } from './auth/tokenAuth.js';
import { SessionManager } from './managers/SessionManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Start the web server
 * @param {number} port - Port to listen on
 * @returns {Promise<http.Server>} - HTTP server instance
 */
async function startServer(port = 3000) {
    console.log('🚀 Starting Coding Agent Web Server...\n');

    // Initialize database
    const dbPath = process.env.DATABASE_PATH || './data/agent.db';
    await initDatabase(dbPath);

    // Create shared session manager
    const sessionManager = new SessionManager();

    // Create Express app
    const app = express();
    app.use(express.json());

    // Static files (public directory)
    app.use(express.static(path.join(__dirname, 'public')));

    // Health check endpoint (no auth required)
    app.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            activeSessions: sessionManager.getActiveSessions().length
        });
    });

    // API routes (with auth)
    app.use('/api', authMiddleware, createApiRouter(sessionManager));

    // Catch-all route for SPA (serve index.html for all non-API routes)
    app.get('*', (req, res, next) => {
        // Skip if API or WebSocket route
        if (req.path.startsWith('/api') || req.path.startsWith('/ws') || req.path.startsWith('/health')) {
            return next();
        }
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // Create HTTP server
    const server = createServer(app);

    // Setup WebSocket
    setupWebSocket(server, sessionManager);

    // Graceful shutdown
    process.on('SIGTERM', async () => {
        console.log('\n📋 Shutting down gracefully...');
        await sessionManager.releaseAll();
        server.close(() => {
            console.log('✅ Server closed');
            process.exit(0);
        });
    });

    process.on('SIGINT', async () => {
        console.log('\n📋 Shutting down gracefully...');
        await sessionManager.releaseAll();
        server.close(() => {
            console.log('✅ Server closed');
            process.exit(0);
        });
    });

    // Start listening
    server.listen(port, () => {
        console.log('\n==============================================');
        console.log(`✅ Web Agent Server running!`);
        console.log(`📍 URL: http://localhost:${port}`);
        console.log(`🔌 WebSocket: ws://localhost:${port}/ws`);
        console.log(`💾 Database: ${dbPath}`);
        console.log('==============================================\n');
    });

    return server;
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const port = parseInt(process.env.WEB_PORT || '3000');
    startServer(port).catch(error => {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    });
}

export { startServer };

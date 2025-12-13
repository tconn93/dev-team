# Web Interface Implementation Plan

## Overview
Transform the CLI coding agent into a web-accessible service with real-time streaming, multi-project support, and token authentication.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Web Browser (HTML/JS + WebSocket Client)       │
└───────────────────┬─────────────────────────────┘
                    │
┌───────────────────┴─────────────────────────────┐
│  Express.js Server                               │
│  - REST API (projects, history)                  │
│  - WebSocket Server (real-time streaming)        │
│  - Token Authentication Middleware               │
└───────────────────┬─────────────────────────────┘
                    │
┌───────────────────┴─────────────────────────────┐
│  StreamingAgent (EventEmitter wrapper)           │
│  - Wraps existing Agent.js (no modifications)    │
│  - Emits events: toolStart, toolComplete, etc.   │
│  - Per-project baseDir isolation                 │
└───────────────────┬─────────────────────────────┘
                    │
┌───────────────────┴─────────────────────────────┐
│  Existing Agent.js + Tools (unchanged)           │
└──────────────────────────────────────────────────┘
                    │
┌───────────────────┴─────────────────────────────┐
│  SQLite Database (persistence)                   │
│  - projects: id, name, baseDir                   │
│  - messages: conversation history                │
│  - tasks: execution audit trail                  │
└──────────────────────────────────────────────────┘
```

## Key Features
- **Multi-project workspaces**: Each project has isolated directory and conversation history
- **Real-time streaming**: WebSocket events show tool execution as it happens
- **One task per project**: Queue system ensures sequential execution per project
- **Token authentication**: Simple bearer token for single-user access
- **Conversation persistence**: SQLite database stores history across sessions
- **Backward compatible**: CLI (`index.js`) continues to work unchanged

## Directory Structure

```
dev-team/
├── index.js                          # UNCHANGED: CLI entry point
├── Agent.js                          # UNCHANGED: Core agent
├── tools/                            # UNCHANGED: All tools
├── utils/                            # UNCHANGED: Security utils
├── web/                              # NEW: Web interface
│   ├── server.js                     # Express app entry
│   ├── StreamingAgent.js             # Agent wrapper with events
│   ├── auth/
│   │   └── tokenAuth.js              # Simple token validation
│   ├── managers/
│   │   ├── ProjectManager.js         # Project CRUD
│   │   └── SessionManager.js         # Agent pooling
│   ├── routes/
│   │   ├── api.js                    # REST endpoints
│   │   └── websocket.js              # WebSocket handler
│   ├── database/
│   │   ├── db.js                     # SQLite connection
│   │   └── migrations/
│   │       └── 001_initial.sql       # Schema
│   └── public/
│       ├── index.html                # Web UI
│       ├── app.js                    # Frontend logic
│       └── styles.css                # Styling
├── workspaces/                       # NEW: Per-project directories
├── data/                             # NEW: Database storage
└── package.json                      # UPDATED: Add dependencies
```

## Core Components

### 1. StreamingAgent.js
**Purpose**: Wrap existing Agent.js to emit real-time events without modifying core logic.

**Key Methods**:
- `executeTask(prompt)`: Runs task with event emission
- `getHistory()`: Returns conversation history
- `clearHistory()`: Resets conversation

**Events Emitted**:
- `start`: Task begins
- `iteration`: LLM iteration starts
- `toolStart`: Tool execution begins (with name, args)
- `toolComplete`: Tool finishes (with result)
- `complete`: Task finishes (with final response)
- `error`: Task fails

**Implementation Strategy**:
- Extend EventEmitter
- Intercept `agent.executeTools()` to emit per-tool events
- Override `baseDir` for project isolation
- Track `isRunning` state to enforce one task at a time

### 2. SessionManager.js
**Purpose**: Manage Agent instances per project with conversation persistence.

**Key Methods**:
- `getAgent(projectId)`: Get or create agent, load history from DB
- `saveHistory(projectId)`: Persist conversation to DB
- `isRunning(projectId)`: Check if task is executing
- `releaseAgent(projectId)`: Remove from pool (memory management)

**Data Flow**:
1. Client requests agent for project
2. Load project from DB (get baseDir)
3. Create StreamingAgent with project's baseDir
4. Load conversation history from DB
5. Return agent instance
6. On task complete: save history to DB

### 3. ProjectManager.js
**Purpose**: CRUD operations for projects and workspace management.

**Key Methods**:
- `createProject(name)`: Create DB record + filesystem directory
- `getProject(id)`: Retrieve project details
- `listProjects()`: Get all projects
- `deleteProject(id)`: Remove from DB (optionally delete directory)

**Workspace Structure**:
```
workspaces/
├── my_web_app/          # Project 1 baseDir
│   ├── src/
│   └── package.json
└── data_analysis/       # Project 2 baseDir
    └── analysis.py
```

### 4. WebSocket Handler (routes/websocket.js)
**Purpose**: Real-time bi-directional communication for task execution.

**Connection Flow**:
1. Client connects with token in query params
2. Verify token, close connection if invalid
3. Client sends: `{type: 'executeTask', projectId, prompt}`
4. Server gets agent via SessionManager
5. Attach event listeners to agent
6. Execute task
7. Stream events to client: `{type: 'toolStart', data: {...}}`
8. On completion: save history, cleanup listeners

**Message Types**:
- Client → Server: `executeTask`
- Server → Client: `taskStart`, `iteration`, `toolStart`, `toolComplete`, `taskComplete`, `taskError`, `error`

### 5. REST API (routes/api.js)
**Purpose**: HTTP endpoints for project management and history.

**Endpoints**:
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create project (body: `{name}`)
- `GET /api/projects/:id` - Get project details
- `GET /api/projects/:id/history` - Get conversation history
- `DELETE /api/projects/:id/history` - Clear conversation
- `DELETE /api/projects/:id` - Delete project

**Authentication**: All routes require `Authorization: Bearer <token>` header

### 6. Token Authentication (auth/tokenAuth.js)
**Purpose**: Simple token validation for single-user access.

**Implementation**:
- Load token from `WEB_AUTH_TOKEN` env variable
- Auto-generate and print to console if not set
- `verifyToken(token)`: String comparison
- `authMiddleware`: Express middleware for REST API
- WebSocket auth: Query parameter `?token=<token>`

### 7. Database Schema (SQLite)

```sql
-- Projects
CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    baseDir TEXT NOT NULL UNIQUE,
    created TEXT NOT NULL
);

-- Conversation history
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    role TEXT NOT NULL,  -- 'user', 'assistant', 'tool'
    content TEXT NOT NULL,
    created TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Task audit (optional)
CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    prompt TEXT NOT NULL,
    status TEXT NOT NULL,  -- 'running', 'completed', 'failed'
    started TEXT NOT NULL,
    completed TEXT,
    error TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

### 8. Frontend (web/public/)

**index.html**:
- Sidebar: Project list + "New Project" button
- Main area: Conversation history + tool feed + input textarea
- Responsive layout

**app.js (AgentClient class)**:
- Token management (localStorage + prompt)
- WebSocket connection with auto-reconnect
- Project CRUD via fetch API
- Real-time event handling
- Message rendering (user/assistant bubbles)
- Tool feed updates (live activity stream)

**User Flow**:
1. Load page → prompt for token
2. Fetch project list
3. Click project → load history + connect WebSocket
4. Type task → submit via WebSocket
5. Watch tool feed update in real-time
6. Final response added to conversation

## Implementation Sequence

### Phase 1: Database & Core Infrastructure
1. Install dependencies: `npm install express ws sqlite3 sqlite`
2. Create `web/database/db.js` - SQLite connection
3. Create `web/database/migrations/001_initial.sql` - Schema
4. Test database initialization

### Phase 2: Agent Wrapper
5. Create `web/StreamingAgent.js` - EventEmitter wrapper
6. Test event emission with CLI agent
7. Verify baseDir isolation works

### Phase 3: Managers
8. Create `web/managers/ProjectManager.js` - Project CRUD
9. Create `web/managers/SessionManager.js` - Agent pooling
10. Test project creation and agent instantiation

### Phase 4: Authentication
11. Create `web/auth/tokenAuth.js` - Token validation
12. Test token generation and verification

### Phase 5: Web Server & Routes
13. Create `web/routes/api.js` - REST endpoints
14. Create `web/routes/websocket.js` - WebSocket handler
15. Create `web/server.js` - Express app assembly
16. Test server startup and API endpoints

### Phase 6: Frontend
17. Create `web/public/index.html` - UI structure
18. Create `web/public/styles.css` - Basic styling
19. Create `web/public/app.js` - WebSocket client + UI logic
20. Test end-to-end flow

### Phase 7: Integration Testing
21. Test multi-project isolation
22. Verify conversation persistence across server restarts
23. Test real-time streaming during tool execution
24. Validate authentication on all endpoints
25. Test error handling and edge cases

## Configuration

**Update .env**:
```env
# Existing LLM config
LLM_PROVIDER_KEY=your_xai_key
LLM_API_URL=https://api.x.ai/v1/responses
LLM_MODEL=grok-code-fast-1

# New web config
WEB_PORT=3000
WEB_AUTH_TOKEN=<generated-on-first-run>
DATABASE_PATH=./data/agent.db
WORKSPACE_ROOT=./workspaces
```

**Update package.json scripts**:
```json
{
  "scripts": {
    "start": "node index.js",
    "start:web": "node web/server.js",
    "dev": "node --watch web/server.js"
  }
}
```

## Security Considerations

1. **Token Authentication**: Simple bearer token sufficient for single-user home server
2. **Path Isolation**: Existing `pathResolver.js` prevents directory traversal
3. **Per-Project baseDir**: Each project sandboxed to its workspace directory
4. **Protected Files**: Existing `safetyChecks.js` enforced at tool level
5. **HTTPS**: Recommended for production (use reverse proxy like Nginx)

## Deployment

**Development**:
```bash
npm install
npm run start:web
# Visit http://localhost:3000
```

**Production (with PM2)**:
```bash
pm2 start web/server.js --name agent-web
pm2 save
pm2 startup  # Enable auto-start on reboot
```

**Reverse Proxy (Nginx)**:
```nginx
server {
    listen 80;
    server_name agent.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

## Critical Files (Implementation Priority)

1. **`web/database/db.js`** + **`web/database/migrations/001_initial.sql`**
   - Foundation for all persistence

2. **`web/StreamingAgent.js`**
   - Core wrapper enabling real-time events

3. **`web/managers/SessionManager.js`**
   - Agent lifecycle and conversation persistence

4. **`web/routes/websocket.js`**
   - Real-time communication bridge

5. **`web/server.js`**
   - Orchestrates all components

## Testing Strategy

**Manual Testing Checklist**:
- [ ] Create project via UI
- [ ] Submit task and watch real-time updates
- [ ] Verify file operations are scoped to project workspace
- [ ] Test conversation persistence (restart server, reload page)
- [ ] Create second project, verify isolation
- [ ] Test authentication (invalid token rejected)
- [ ] Test error handling (tool failure, LLM error)
- [ ] Test concurrent task queue (submit while running)

## Backward Compatibility

- **CLI remains functional**: `node index.js` works unchanged
- **Agent.js untouched**: Core logic preserved
- **Tools unchanged**: All 7 tools work identically
- **Can run both**: CLI and web can run simultaneously (different ports if needed)

## Future Enhancements (Post-MVP)

- Task cancellation/pause
- File browser in UI
- Syntax highlighting for code
- Export conversation as markdown
- Multi-user support (JWT + user table)
- Project sharing
- Scheduled tasks
- Mobile-responsive UI improvements

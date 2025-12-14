# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Node.js coding AI agent that provides a command-line interface with tool calling capabilities. The agent can read/write files, execute bash commands, search code, and run code snippets. It uses Grok (xAI) as the LLM backend via the `/v1/responses` endpoint with native tool calling support.

## Core Architecture

### Main Components

- **Agent.js**: Core agent with tool calling loop
  - Manages LLM communication and conversation history
  - Implements iterative tool calling loop (max 10 iterations)
  - Executes tools and feeds results back to LLM
  - Uses Grok's native tool calling format

- **index.js**: CLI with tool execution review
  - Sets up readline interface for user input
  - Displays formatted tool execution review after each task
  - Shows success/failure status with color coding

- **tools/**: Tool implementations
  - `index.js`: Tool registry and dispatcher
  - `fileOperations.js`: read, write, edit files
  - `bashExecution.js`: Execute shell commands
  - `fileSearch.js`: glob pattern and grep search
  - `codeExecution.js`: Run JavaScript and Python code

- **utils/**: Utility modules
  - `pathResolver.js`: Path resolution and security validation
  - `safetyChecks.js`: Protected files and dangerous command detection

### Tool Calling Flow

1. User provides task → Agent sends to LLM with tool definitions via `/v1/responses`
2. LLM responds with tool_calls → Agent executes tools locally
3. Agent sends tool results back using `response_id` and `messages` format → LLM continues or responds
4. Loop repeats until task complete (max 10 iterations)
5. Display tool review and final agent message to user

### Available Tools

1. **file_read**: Read file contents
2. **file_write**: Create or overwrite files
3. **file_edit**: Find and replace in files
4. **bash_execute**: Run shell commands (30s timeout)
5. **glob_search**: Find files by pattern
6. **grep_search**: Search file contents
7. **code_execute**: Run JavaScript or Python code

### Safety Features

**Protected Files/Directories** (complete block):
- `.git/` - Git repository
- `node_modules/` - Dependencies
- `venv/`, `.venv/` - Python virtual environments

**Sensitive Files** (warning, but allowed):
- `.env` - Environment variables
- `package.json`, `package-lock.json` - Package manifests

**Dangerous Commands** (blocked):
- `rm -rf /` - Delete root
- Fork bombs - `:(){ }`
- `mkfs.*` - Format filesystem
- Remote code execution patterns

**Resource Limits**:
- Bash timeout: 30 seconds
- Code execution timeout: 10 seconds
- Max file size: 10MB
- Max iterations: 10 per user message

### Configuration

The project uses `dotenv` to load environment variables from `.env`:

- `LLM_PROVIDER_KEY`: xAI API key
- `LLM_API_URL`: `https://api.x.ai/v1/responses`
- `LLM_MODEL`: `grok-code-fast-1` (or other Grok model)

## Running the Application

```bash
# Install dependencies
npm install

# Start the agent
npm start
# or
node index.js
```

## Key Design Decisions

1. **Modular Tool Architecture**: Each tool type in separate module for maintainability and testing.

2. **Grok Native Format**: Uses Grok's tool calling API with tool names as string array, not OpenAI function calling format.

3. **Automatic with Review**: Tools execute automatically but review is shown after completion for transparency.

4. **Relative Paths**: All file operations use relative paths from project root (`process.cwd()`).

5. **Security First**: Multi-layer validation prevents path traversal, dangerous commands, and operations on critical files.

6. **Error Recovery**: Tool errors are sent back to LLM to allow recovery and alternate approaches.

## Dependencies

- **dotenv**: Environment variable management
- **glob**: File pattern matching for searches
- Node.js built-in modules: `fs/promises`, `child_process`, `vm`, `path`, `readline/promises`

## Common Workflows

**File Operations**:
```javascript
// Tools automatically resolve relative paths
file_read({ path: "src/index.js" })
file_write({ path: "new.js", content: "..." })
file_edit({ path: "app.js", find: "old", replace: "new" })
```

**Code Execution**:
```javascript
bash_execute({ command: "npm install express" })
code_execute({ language: "javascript", code: "console.log('test')" })
code_execute({ language: "python", code: "print('hello')" })
```

**Search**:
```javascript
glob_search({ pattern: "**/*.js" })
grep_search({ pattern: "TODO", filePattern: "**/*.js" })
```

## Multi-Agent System Architecture

The system now supports multiple AI agents working collaboratively on projects through a web interface.

### Overview

- **Hybrid Workflow**: Coordinator agent analyzes requests and delegates tasks to specialist agents
- **Role-Based Agents**: Predefined roles (Coordinator, Frontend, Backend, DevOps, Tester) + custom roles
- **Communication**: Group chat for team-wide conversation + agent-to-agent private messaging
- **Real-Time Dashboard**: WebSocket-powered UI showing agent status, tasks, and activity

### Database Schema

**New Tables** (via `002_multi_agent_system.sql`):
- `agents`: Agent instances per project with role, status, current task
- `roles`: Role definitions (predefined + custom) with system prompts
- `agent_tasks`: Tasks assigned to agents with priority, status tracking
- `agent_messages`: Per-agent conversation history
- `agent_communications`: Private agent-to-agent messages
- `group_messages`: Team-wide chat messages
- `file_locks`: File locking to prevent concurrent write conflicts
- `tool_executions`: Audit log of all tool executions

### Backend Components

**Managers** (`web/managers/`):
- **AgentManager**: Agent CRUD, status management, statistics
- **TaskManager**: Task creation, assignment, status transitions
- **CommunicationManager**: Group chat + private messaging
- **FileLockManager**: Acquire/release file locks with auto-expiration
- **RoleManager**: Manage predefined and custom role definitions
- **MultiAgentSessionManager**: Orchestrates multiple StreamingAgent instances per project

**Agent Classes**:
- **StreamingAgent**: Extended to support `agentId`, `systemPrompt`, pause/resume
- **CoordinatorAgent**: Special agent with additional tools:
  - `assign_task`: Create and assign tasks to specialist agents
  - `send_agent_message`: Send private messages to other agents
  - `get_agent_status`: Check agent status
  - `wait_for_task`: Wait for task completion (non-blocking)

### API Endpoints

**Agents**: `POST/GET/PUT/DELETE /api/projects/:projectId/agents`
**Tasks**: `POST/GET/PUT/DELETE /api/projects/:projectId/tasks`
**Communication**:
- `POST /api/projects/:projectId/messages/group` - Group chat
- `POST /api/projects/:projectId/messages/agent` - Agent-to-agent
- `GET /api/projects/:projectId/agents/:agentId/inbox` - Agent inbox
**Roles**: `GET/POST/PUT/DELETE /api/roles`
**Dashboard**: `GET /api/projects/:projectId/dashboard` - Aggregated data

### WebSocket Protocol

**Client → Server**:
- `executeAgentTask`: Execute task with specific agent
- `subscribeProject`: Subscribe to project-wide updates
- `sendGroupMessage`: Send message to group chat
- `pauseAgent` / `resumeAgent`: Control agent execution

**Server → Client**:
- `agentStatusUpdate`: Agent status changed (idle/working/waiting/paused)
- `taskCreated` / `taskUpdated`: Task lifecycle events
- `groupMessage`: Team chat message
- `agentMessage`: Private agent-to-agent message
- `toolExecution`: Tool execution by any agent (with agentId, agentName)
- `fileLockUpdate`: File lock acquired/released

### Frontend Architecture

**UI Managers** (`web/public/app.js`):
- **AgentUIManager**: Agent list, cards, status updates, detail modal
- **TaskUIManager**: Kanban task board (Pending/In Progress/Completed)
- **ChatUIManager**: Group chat interface
- **DashboardUIManager**: Agent status grid, task stats, activity feed

**Views**:
- **Dashboard**: Real-time agent status, task overview, activity feed
- **Chat**: Team-wide group conversation
- **Tasks**: Kanban board for task management

**Sidebar**:
- **Team Tab**: Agent list with create/manage capabilities
- **Files Tab**: Project file tree navigation

### Key Features

**File Locking**:
- Database-backed locks prevent concurrent write conflicts
- Auto-expiration (5 min default) with cleanup interval
- Read locks (multiple allowed) vs Write locks (exclusive)

**Task Management**:
- Priority-based task ordering
- Status tracking: pending → assigned → in_progress → completed/failed
- Auto-timestamps for started/completed events
- Task reassignment and delegation

**Agent Intervention**:
- Pause/resume agent execution
- View agent conversation history
- Assign tasks manually
- Real-time status monitoring

**Backward Compatibility**:
- Legacy SessionManager preserved for single-agent mode
- Old WebSocket events still supported
- Existing projects continue working unchanged

### Predefined Roles

1. **Coordinator**: Analyzes requests, creates tasks, assigns to specialists, monitors progress
2. **Frontend**: HTML, CSS, JavaScript, React, Vue, UI/UX
3. **Backend**: Server logic, databases, APIs, authentication
4. **DevOps**: Deployment, CI/CD, Docker, infrastructure
5. **Tester**: Unit tests, integration tests, QA, bug detection

### Running Multi-Agent Mode

```bash
# Start the web server
cd web
npm start

# Access at http://localhost:3000
# Create a project
# Add agents with different roles
# Agents collaborate via group chat and task assignment
```

### Development Notes

- Each agent maintains separate conversation history
- Coordinator uses LLM intelligence for dynamic task assignment
- WebSocket rooms enable efficient project-wide event broadcasting
- File locks use database for cross-process safety
- All manager classes use SQLite with proper transaction handling

## Testing

**CLI Mode**:
- File operations (create, read, edit)
- Bash commands (npm, git)
- Code execution (JS, Python)
- Complex multi-step tasks

**Web Multi-Agent Mode**:
- Create/delete agents
- Assign tasks manually and via coordinator
- Monitor real-time agent status
- Test group chat and agent-to-agent messaging
- Verify file locking with concurrent operations
- Test pause/resume controls

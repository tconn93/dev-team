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

## Testing

No automated test suite yet. Manual testing recommended with:
- File operations (create, read, edit)
- Bash commands (npm, git)
- Code execution (JS, Python)
- Complex multi-step tasks

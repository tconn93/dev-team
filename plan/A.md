# Implementation Plan: Coding AI Agent with Tool Calling

## Overview
Transform the existing conversational AI agent into a coding agent with tool calling capabilities using Grok's native API format. Implement all tools in one full implementation.

## User Requirements
- **LLM**: Grok (already configured: `grok-4-1-fast-reasoning`)
- **Tools**: File operations, bash execution, file search (glob/grep), code execution
- **Path handling**: Relative paths (relative to CWD)
- **Execution mode**: Automatic with review (show what was done after each step)
- **Scope**: Full implementation (all tools at once)

## Architecture

### Directory Structure (New Files)
```
dev-team/
├── Agent.js (MODIFY)
├── index.js (MODIFY)
├── tools/
│   ├── index.js (CREATE)
│   ├── fileOperations.js (CREATE)
│   ├── bashExecution.js (CREATE)
│   ├── fileSearch.js (CREATE)
│   └── codeExecution.js (CREATE)
└── utils/
    ├── pathResolver.js (CREATE)
    └── safetyChecks.js (CREATE)
```

### Dependencies to Add
- `glob@^10.3.10` for file pattern matching

## Implementation Steps

### 1. Project Setup
**Files**: `package.json`
- Add `glob` dependency
- Run `npm install`

### 2. Utility Modules

#### `/home/tcon/active/dev-team/utils/pathResolver.js` (CREATE)
- `resolvePath(relativePath, baseDir)` - resolve and validate paths
- Security: prevent path traversal attacks
- Ensure paths stay within project directory

#### `/home/tcon/active/dev-team/utils/safetyChecks.js` (CREATE)
- `isProtectedFile(path)` - check if file is protected (.git, .env, node_modules)
- `containsDangerousCommand(cmd)` - detect dangerous bash commands
- Protected patterns configuration

### 3. Tool Registry

#### `/home/tcon/active/dev-team/tools/index.js` (CREATE)
- Define `TOOL_DEFINITIONS` mapping tool names to modules
- Implement `executeToolCall(toolName, args, context)` dispatcher
- Handle dynamic module loading
- Tool names: `file_read`, `file_write`, `file_edit`, `bash_execute`, `glob_search`, `grep_search`, `code_execute`

### 4. Tool Implementations

#### `/home/tcon/active/dev-team/tools/fileOperations.js` (CREATE)
Implement three functions:
- `readFile(args, context)` - read file contents, return content + metadata
- `writeFile(args, context)` - create/overwrite files with safety checks
- `editFile(args, context)` - find/replace in existing files

#### `/home/tcon/active/dev-team/tools/bashExecution.js` (CREATE)
- `execute(args, context)` - run shell commands
- Use `child_process.exec` with 30s timeout
- Capture stdout/stderr
- Block dangerous commands (rm -rf /, fork bombs, etc.)

#### `/home/tcon/active/dev-team/tools/fileSearch.js` (CREATE)
- `globSearch(args, context)` - find files by pattern using `glob` package
- `grepSearch(args, context)` - search file contents with regex
- Ignore node_modules, .git, venv

#### `/home/tcon/active/dev-team/tools/codeExecution.js` (CREATE)
- `execute(args, context)` - run code snippets
- JavaScript: use `vm` module for sandboxed execution
- Python: use subprocess with temp file
- 10s timeout, capture output

### 5. Agent Enhancement

#### `/home/tcon/active/dev-team/Agent.js` (MODIFY)
**Key changes:**

1. **Constructor**: Add `this.baseDir = process.cwd()`

2. **Update API request** in `generateResponse()`:
```javascript
const body = {
  model: this.model,
  messages: [
    { role: "system", content: "You are a helpful coding assistant..." },
    ...this.history
  ],
  tools: [
    "file_read", "file_write", "file_edit",
    "bash_execute",
    "glob_search", "grep_search",
    "code_execute"
  ],
  temperature: 0.7
};
```

3. **Add tool calling loop**:
- After LLM response, check for `response.choices[0].message.tool_calls`
- If tool_calls exist, execute them via dispatcher
- Format results as tool messages: `{ role: "tool", tool_call_id, content }`
- Continue loop until no more tool_calls (max 10 iterations)
- Track all tool executions for review display

4. **Add `executeTools()` method**:
- Parse tool call arguments from JSON
- Call `executeToolCall()` from tools registry
- Handle errors gracefully, return to LLM
- Return array of tool results with metadata

5. **Return format**:
```javascript
return {
  content: finalMessage,
  toolExecutions: [/* array of tool execution results */]
};
```

### 6. User Interface Enhancement

#### `/home/tcon/active/dev-team/index.js` (MODIFY)

1. **Add `displayToolReview()` function**:
- Show formatted box with all tool executions
- Status indicators: ✓ success, ✗ error, ! warning
- Display summary, paths, output snippets
- Clear visual separation from agent response

2. **Update main loop**:
```javascript
const result = await agent.generateResponse(userInput);

// Display tool review if tools were used
if (result.toolExecutions && result.toolExecutions.length > 0) {
  displayToolReview(result.toolExecutions);
}

// Display agent's final message
console.log(`\nAgent: ${result.content}\n`);
```

### 7. Safety Features

**Protected Files/Directories**:
- `.git/` - block completely
- `node_modules/` - block completely
- `venv/` - block completely
- `.env` - warn but allow (user might want to update)
- `package.json` - warn but allow

**Dangerous Commands**:
- `rm -rf /` - block
- Fork bombs `:(){ }` - block
- `mkfs.*` - block

**Resource Limits**:
- Bash timeout: 30 seconds
- Code execution timeout: 10 seconds
- Max file size: 10MB
- Max iterations: 10 per user message

## Grok API Format

**Request with tools**:
```json
{
  "model": "grok-4-1-fast-reasoning",
  "messages": [...],
  "tools": ["file_read", "file_write", "bash_execute", ...],
  "temperature": 0.7
}
```

**Response with tool_calls**:
```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "I'll help with that...",
      "tool_calls": [
        {
          "id": "call-001",
          "type": "function",
          "function": {
            "name": "file_read",
            "arguments": "{\"path\": \"package.json\"}"
          }
        }
      ]
    }
  }]
}
```

**Tool result feedback**:
```json
{
  "role": "tool",
  "tool_call_id": "call-001",
  "content": "{\"success\": true, \"content\": \"...\"}"
}
```

## Testing Plan

After implementation, test with these scenarios:
1. **File operations**: "Create a hello.js file that prints 'Hello World'"
2. **Bash execution**: "Install the express package"
3. **File search**: "Find all JavaScript files" / "Search for TODO comments"
4. **Code execution**: "Run this JavaScript: console.log(2 + 2)"
5. **Complex task**: "Create a simple Express server in server.js"

## Critical Files

1. `/home/tcon/active/dev-team/Agent.js` - Core agent with tool calling loop
2. `/home/tcon/active/dev-team/index.js` - CLI with review display
3. `/home/tcon/active/dev-team/tools/index.js` - Tool registry
4. `/home/tcon/active/dev-team/tools/fileOperations.js` - File manipulation
5. `/home/tcon/active/dev-team/utils/pathResolver.js` - Path security
6. `/home/tcon/active/dev-team/package.json` - Add dependencies

## Success Criteria

✓ Agent can execute tool calls from Grok responses
✓ All 7 tools implemented and working
✓ Tool execution review displays after each task
✓ Safety checks prevent dangerous operations
✓ Relative paths work correctly
✓ Error handling reports issues back to LLM
✓ Multi-turn tool calling loop functions properly
✓ Can complete complex coding tasks end-to-end

/**
 * Tool Definitions for Xai API
 *
 * Defines the schema for all available tools that can be called by the LLM.
 * This follows Xai's tool calling format for the /v1/responses endpoint.
 */

export const TOOL_DEFINITIONS = [
    {
        type: "function",
        name: "file_read",
        description: "Read a file from the filesystem and return its contents",
        parameters: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "Path to the file to read (relative to project root)"
                }
            },
            required: ["path"]
        }
    },
    {
        type: "function",
        name: "file_write",
        description: "Create or overwrite a file with the specified content",
        parameters: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "Path where to write the file (relative to project root)"
                },
                content: {
                    type: "string",
                    description: "Content to write to the file"
                }
            },
            required: ["path", "content"]
        }
    },
    {
        type: "function",
        name: "file_edit",
        description: "Find and replace text in an existing file",
        parameters: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "Path to the file to edit (relative to project root)"
                },
                find: {
                    type: "string",
                    description: "Text to find and replace in the file"
                },
                replace: {
                    type: "string",
                    description: "Text to replace the found text with"
                }
            },
            required: ["path", "find", "replace"]
        }
    },
    {
        type: "function",
        name: "bash_execute",
        description: "Execute a bash/shell command and return the output",
        parameters: {
            type: "object",
            properties: {
                command: {
                    type: "string",
                    description: "The bash command to execute"
                }
            },
            required: ["command"]
        }
    },
    {
        type: "function",
        name: "glob_search",
        description: "Find files matching a glob pattern",
        parameters: {
            type: "object",
            properties: {
                pattern: {
                    type: "string",
                    description: "Glob pattern to match files (e.g., '**/*.js', 'src/**/*.ts')"
                }
            },
            required: ["pattern"]
        }
    },
    {
        type: "function",
        name: "grep_search",
        description: "Search for text patterns in files using regex",
        parameters: {
            type: "object",
            properties: {
                pattern: {
                    type: "string",
                    description: "Regex pattern to search for in file contents"
                },
                filePattern: {
                    type: "string",
                    description: "Glob pattern to limit which files to search (default: '**/*')",
                    default: "**/*"
                },
                caseSensitive: {
                    type: "boolean",
                    description: "Whether the search should be case sensitive (default: true)",
                    default: true
                },
                maxResults: {
                    type: "number",
                    description: "Maximum number of results to return (default: 100)",
                    default: 100
                }
            },
            required: ["pattern"]
        }
    },
    {
        type: "function",
        name: "code_execute",
        description: "Execute code in JavaScript or Python and return the output",
        parameters: {
            type: "object",
            properties: {
                language: {
                    type: "string",
                    description: "Programming language to execute ('javascript', 'js', 'python', 'py')"
                },
                code: {
                    type: "string",
                    description: "The code to execute"
                },
                timeout: {
                    type: "number",
                    description: "Execution timeout in milliseconds (default: 10000)",
                    default: 10000
                }
            },
            required: ["language", "code"]
        }
    }
];

// Coordinator-specific tools (only available to coordinator agents)
export const COORDINATOR_TOOLS = [
    {
        type: "function",
        name: "assign_task",
        description: "Create a task and assign it to an agent with a specific role. Use this to delegate work to specialist agents.",
        parameters: {
            type: "object",
            properties: {
                agentRole: {
                    type: "string",
                    description: "Role of the agent to assign the task to ('frontend', 'backend', 'devops', 'tester', or custom role name)"
                },
                taskTitle: {
                    type: "string",
                    description: "Short, descriptive title for the task"
                },
                taskDescription: {
                    type: "string",
                    description: "Detailed description of what the agent should do. Be specific and include all necessary context."
                },
                priority: {
                    type: "number",
                    description: "Priority level (0=normal, higher numbers=more urgent). Default is 0.",
                    default: 0
                }
            },
            required: ["agentRole", "taskTitle", "taskDescription"]
        }
    },
    {
        type: "function",
        name: "send_agent_message",
        description: "Send a private message to another agent. Use for coordination, asking questions, or providing context.",
        parameters: {
            type: "object",
            properties: {
                targetAgentId: {
                    type: "number",
                    description: "ID of the agent to send the message to"
                },
                message: {
                    type: "string",
                    description: "The message content"
                },
                messageType: {
                    type: "string",
                    description: "Type of message ('message', 'question', 'response', 'task_handoff'). Default is 'message'.",
                    default: "message"
                }
            },
            required: ["targetAgentId", "message"]
        }
    },
    {
        type: "function",
        name: "get_agent_status",
        description: "Check the status of an agent or all agents in the project. Use to monitor progress.",
        parameters: {
            type: "object",
            properties: {
                agentId: {
                    type: "number",
                    description: "ID of specific agent to check. Omit to get status of all agents."
                }
            },
            required: []
        }
    },
    {
        type: "function",
        name: "wait_for_task",
        description: "Wait for a task to complete before proceeding. Use when task dependencies exist.",
        parameters: {
            type: "object",
            properties: {
                taskId: {
                    type: "number",
                    description: "ID of the task to wait for"
                },
                timeoutMs: {
                    type: "number",
                    description: "Maximum time to wait in milliseconds. Default is 60000 (1 minute).",
                    default: 60000
                }
            },
            required: ["taskId"]
        }
    }
];

// Combined tool definitions for coordinator agents (standard + coordinator tools)
export const COORDINATOR_TOOL_DEFINITIONS = [...TOOL_DEFINITIONS, ...COORDINATOR_TOOLS];

// List of tool names for backward compatibility
export const AVAILABLE_TOOLS = TOOL_DEFINITIONS.map(tool => tool.name);

// List of coordinator tool names
export const COORDINATOR_TOOL_NAMES = COORDINATOR_TOOL_DEFINITIONS.map(tool => tool.name);
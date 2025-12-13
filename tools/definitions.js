/**
 * Tool Definitions for Xai API
 *
 * Defines the schema for all available tools that can be called by the LLM.
 * This follows Xai's tool calling format for the /v1/responses endpoint.
 */

export const TOOL_DEFINITIONS = [
    {
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

// List of tool names for backward compatibility
export const AVAILABLE_TOOLS = TOOL_DEFINITIONS.map(tool => tool.name);
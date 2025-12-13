# AGENTS.md

## Build/Lint/Test Commands
- **Start**: `npm start` or `node index.js`
- **Test**: No test framework configured (run `npm test` to see current status)
- **Lint**: No linting configured
- **Build**: No build process configured

## Code Style Guidelines

### Modules & Imports
- Use ES modules (`import`/`export`)
- Import Node.js built-ins with `node:` prefix (e.g., `import fs from 'node:fs/promises'`)
- Group imports: built-ins, third-party, local modules
- Use named imports when possible

### Naming Conventions
- **Classes**: PascalCase (e.g., `Agent`, `ToolRegistry`)
- **Functions/Methods**: camelCase (e.g., `generateResponse`, `executeToolCall`)
- **Variables**: camelCase (e.g., `toolExecutions`, `apiKey`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_ITERATIONS`)
- **Files**: camelCase.js (e.g., `fileOperations.js`, `Agent.js`)

### Code Structure
- Use ES6 classes with constructor for initialization
- Async/await for asynchronous operations
- Try/catch blocks for error handling
- JSDoc comments for all public functions/methods with `@param` and `@returns`

### Language Features
- Prefer `const` over `let` when possible
- Use destructuring for objects and arrays
- Template literals for string interpolation
- Spread operator for object/array manipulation
- Arrow functions for concise callbacks

### Error Handling
- Use try/catch blocks around async operations
- Throw descriptive Error objects with messages
- Return structured error objects from functions when appropriate

### Formatting
- 4-space indentation
- Single quotes for strings
- Semicolons required
- Max line length: ~100 characters</content>
<parameter name="filePath">/home/tcon/active/dev-team/AGENTS.md
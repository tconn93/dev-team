-- Migration: 002_multi_agent_system.sql
-- Description: Adds multi-agent support with role-based agents, tasks, and communication

-- ============================================================================
-- AGENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL, -- 'coordinator', 'frontend', 'backend', 'devops', 'tester', 'custom'
    system_prompt TEXT, -- Custom system prompt override
    status TEXT NOT NULL DEFAULT 'idle', -- 'idle', 'working', 'waiting', 'paused'
    current_task_id INTEGER,
    color TEXT, -- UI color identifier (hex code like #3498db)
    created TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (current_task_id) REFERENCES agent_tasks(id) ON DELETE SET NULL
);

-- ============================================================================
-- ROLES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE, -- 'coordinator', 'frontend', 'backend', etc.
    display_name TEXT NOT NULL, -- 'Coordinator', 'Frontend Developer', etc.
    system_prompt TEXT NOT NULL, -- System prompt for this role
    is_predefined BOOLEAN DEFAULT 1, -- 1 for built-in roles, 0 for custom
    created TEXT NOT NULL
);

-- ============================================================================
-- AGENT TASKS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    agent_id INTEGER, -- NULL if not yet assigned
    assigned_by_agent_id INTEGER, -- Which agent created/assigned this task
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'assigned', 'in_progress', 'completed', 'failed', 'blocked'
    priority INTEGER DEFAULT 0, -- Higher number = higher priority
    result TEXT, -- Final result/output from agent
    error TEXT, -- Error message if failed
    created TEXT NOT NULL,
    started TEXT, -- When agent started working on it
    completed TEXT, -- When task was completed/failed
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_by_agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

-- ============================================================================
-- AGENT MESSAGES TABLE (per-agent conversation history)
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL,
    role TEXT NOT NULL, -- 'user', 'assistant', 'system'
    content TEXT NOT NULL,
    task_id INTEGER, -- Which task this message relates to (optional)
    created TEXT NOT NULL,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES agent_tasks(id) ON DELETE SET NULL
);

-- ============================================================================
-- AGENT COMMUNICATIONS TABLE (agent-to-agent private messages)
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_communications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    from_agent_id INTEGER NOT NULL,
    to_agent_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    message_type TEXT DEFAULT 'message', -- 'message', 'question', 'response', 'task_handoff'
    related_task_id INTEGER, -- Optional link to a task
    read BOOLEAN DEFAULT 0, -- 0 = unread, 1 = read
    created TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (from_agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    FOREIGN KEY (to_agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    FOREIGN KEY (related_task_id) REFERENCES agent_tasks(id) ON DELETE SET NULL
);

-- ============================================================================
-- GROUP MESSAGES TABLE (all agents + user can see)
-- ============================================================================
CREATE TABLE IF NOT EXISTS group_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    sender_type TEXT NOT NULL, -- 'user', 'agent'
    sender_agent_id INTEGER, -- NULL if sender is user
    message TEXT NOT NULL,
    created TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

-- ============================================================================
-- FILE LOCKS TABLE (prevent concurrent file modifications)
-- ============================================================================
CREATE TABLE IF NOT EXISTS file_locks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    file_path TEXT NOT NULL, -- Relative path from project baseDir
    locked_by_agent_id INTEGER NOT NULL,
    lock_type TEXT NOT NULL DEFAULT 'write', -- 'read', 'write'
    acquired TEXT NOT NULL, -- Timestamp when lock was acquired
    expires TEXT, -- Optional expiration timestamp (5 minutes default)
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (locked_by_agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    UNIQUE(project_id, file_path, lock_type) -- One write lock per file, or multiple read locks
);

-- ============================================================================
-- TOOL EXECUTIONS TABLE (audit log for all tool calls)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tool_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL,
    task_id INTEGER, -- Optional link to task
    tool_name TEXT NOT NULL,
    arguments TEXT, -- JSON string of tool arguments
    success BOOLEAN NOT NULL,
    result TEXT, -- JSON string of result
    error TEXT, -- Error message if failed
    created TEXT NOT NULL,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES agent_tasks(id) ON DELETE SET NULL
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_agents_project ON agents(project_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_role ON agents(role);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_project ON agent_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent ON agent_tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_assigned_by ON agent_tasks(assigned_by_agent_id);

CREATE INDEX IF NOT EXISTS idx_agent_messages_agent ON agent_messages(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_task ON agent_messages(task_id);

CREATE INDEX IF NOT EXISTS idx_agent_communications_project ON agent_communications(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_communications_to ON agent_communications(to_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_communications_from ON agent_communications(from_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_communications_unread ON agent_communications(to_agent_id, read);

CREATE INDEX IF NOT EXISTS idx_group_messages_project ON group_messages(project_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_created ON group_messages(created);

CREATE INDEX IF NOT EXISTS idx_tool_executions_agent ON tool_executions(agent_id);
CREATE INDEX IF NOT EXISTS idx_tool_executions_task ON tool_executions(task_id);

CREATE INDEX IF NOT EXISTS idx_file_locks_project_file ON file_locks(project_id, file_path);
CREATE INDEX IF NOT EXISTS idx_file_locks_agent ON file_locks(locked_by_agent_id);
CREATE INDEX IF NOT EXISTS idx_file_locks_expires ON file_locks(expires);

-- ============================================================================
-- DATA MIGRATION: Copy existing messages to group_messages
-- ============================================================================
-- Only migrate if messages table exists and group_messages is empty
INSERT INTO group_messages (project_id, sender_type, sender_agent_id, message, created)
SELECT
    project_id,
    role AS sender_type, -- 'user' or 'assistant'
    NULL AS sender_agent_id, -- Old messages have no agent attribution
    content AS message,
    created
FROM messages
WHERE EXISTS (SELECT 1 FROM messages)
  AND NOT EXISTS (SELECT 1 FROM group_messages);

-- ============================================================================
-- SEED PREDEFINED ROLES
-- ============================================================================
INSERT OR IGNORE INTO roles (name, display_name, system_prompt, is_predefined, created) VALUES
(
    'coordinator',
    'Coordinator',
    'You are a coordinator agent responsible for analyzing user requests, decomposing them into manageable tasks, and assigning those tasks to specialist agents based on their roles and expertise.

Your capabilities:
- Analyze complex user requests and break them down into clear, actionable tasks
- Assign tasks to specialist agents: frontend, backend, devops, tester, or custom roles
- Monitor task progress and check agent status
- Handle task dependencies and sequencing
- Send messages to other agents for coordination
- Wait for task completion before proceeding with dependent tasks
- Synthesize results from multiple agents into cohesive responses

Available specialist agent roles:
- Frontend: UI/UX, HTML, CSS, JavaScript, React, Vue, client-side functionality
- Backend: Server logic, databases, APIs, authentication, business logic
- DevOps: Deployment, CI/CD, Docker, infrastructure, system administration
- Tester: Unit tests, integration tests, e2e tests, QA, bug detection

When delegating tasks:
1. Consider which agent role is best suited for the task
2. Provide clear, specific task descriptions
3. Set appropriate priority levels (0=normal, higher=more urgent)
4. Monitor progress and adjust as needed
5. Coordinate between agents when tasks depend on each other

Use your special tools: assign_task, send_agent_message, get_agent_status, wait_for_task to orchestrate the team effectively.',
    1,
    datetime('now')
),
(
    'frontend',
    'Frontend Developer',
    'You are a frontend developer agent specializing in user interface and user experience implementation.

Your expertise:
- HTML, CSS, JavaScript (ES6+)
- Frontend frameworks: React, Vue, Angular, Svelte
- Responsive design and mobile-first development
- CSS frameworks: Tailwind, Bootstrap, Material-UI
- State management: Redux, Vuex, Context API
- UI component libraries and design systems
- Client-side routing and navigation
- Form validation and user input handling
- Accessibility (a11y) and WCAG compliance
- Performance optimization (lazy loading, code splitting)
- Browser compatibility and cross-platform testing

Focus on:
- Creating intuitive, user-friendly interfaces
- Following design specifications and mockups
- Writing clean, maintainable, and reusable components
- Ensuring responsive behavior across devices
- Optimizing for performance and accessibility

When working on tasks, communicate with backend agents for API integration and coordinate with testers for UI testing.',
    1,
    datetime('now')
),
(
    'backend',
    'Backend Developer',
    'You are a backend developer agent specializing in server-side logic, data management, and API development.

Your expertise:
- Server-side languages: Node.js, Python, Java, Go, PHP, Ruby
- Web frameworks: Express, FastAPI, Spring Boot, Django, Rails
- Database design and management: SQL (PostgreSQL, MySQL), NoSQL (MongoDB, Redis)
- RESTful API design and implementation
- GraphQL APIs and schema design
- Authentication and authorization: JWT, OAuth, session management
- Data validation and sanitization
- Business logic implementation
- Error handling and logging
- Security best practices (OWASP Top 10)
- Performance optimization and caching
- Background jobs and queues
- Microservices architecture

Focus on:
- Designing robust, scalable APIs
- Implementing secure authentication and authorization
- Maintaining data integrity and consistency
- Writing efficient database queries
- Following best practices for error handling
- Documenting API endpoints and data schemas

When working on tasks, coordinate with frontend agents for API contracts and with devops agents for deployment requirements.',
    1,
    datetime('now')
),
(
    'devops',
    'DevOps Engineer',
    'You are a DevOps engineer agent specializing in deployment, infrastructure, automation, and system operations.

Your expertise:
- Containerization: Docker, Docker Compose
- Container orchestration: Kubernetes, Docker Swarm
- CI/CD pipelines: GitHub Actions, GitLab CI, Jenkins, CircleCI
- Cloud platforms: AWS, Google Cloud, Azure, DigitalOcean
- Infrastructure as Code: Terraform, CloudFormation, Ansible
- Configuration management: Ansible, Chef, Puppet
- Monitoring and logging: Prometheus, Grafana, ELK Stack, Datadog
- Web servers and reverse proxies: Nginx, Apache, Traefik
- Database administration and backups
- Security and compliance
- Performance tuning and optimization
- Disaster recovery and high availability
- Scripting and automation: Bash, Python

Focus on:
- Automating deployment processes
- Ensuring system reliability and uptime
- Implementing monitoring and alerting
- Maintaining security best practices
- Optimizing infrastructure costs
- Documenting deployment procedures

When working on tasks, coordinate with backend agents for deployment requirements and with testers for environment setup.',
    1,
    datetime('now')
),
(
    'tester',
    'QA Tester',
    'You are a QA testing agent specializing in software quality assurance, test automation, and bug detection.

Your expertise:
- Test types: Unit tests, integration tests, e2e tests, regression tests
- Testing frameworks:
  - JavaScript/Node.js: Jest, Mocha, Jasmine, Cypress, Playwright, Puppeteer
  - Python: pytest, unittest, Selenium
  - Java: JUnit, TestNG, Selenium
- Test-driven development (TDD) and behavior-driven development (BDD)
- Code coverage analysis
- Performance testing and load testing
- Security testing and vulnerability scanning
- API testing: Postman, REST Client
- Mock data and test fixtures
- Continuous testing in CI/CD pipelines
- Bug tracking and reporting
- Test documentation and test plans

Focus on:
- Writing comprehensive test suites
- Ensuring high code coverage (aim for >80%)
- Identifying edge cases and boundary conditions
- Detecting bugs early in development
- Validating functional and non-functional requirements
- Automating repetitive testing tasks
- Providing clear bug reports with reproduction steps

When working on tasks, coordinate with frontend and backend agents to understand requirements and with devops agents for test environment setup.',
    1,
    datetime('now')
);

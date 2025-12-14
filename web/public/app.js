/**
 * FileTreeManager - Manages file tree display and navigation
 */
class FileTreeManager {
    constructor(client) {
        this.client = client;
        this.currentPath = null;
        this.baseDir = null;
        this.selectedFile = null;
        this.projectId = null;
    }

    async loadProjectDirectory(projectId, subPath = '') {
        try {
            this.projectId = projectId;
            const url = `/api/projects/${projectId}/files${subPath ? '?path=' + encodeURIComponent(subPath) : ''}`;
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${this.client.token}` }
            });

            if (!response.ok) {
                throw new Error('Failed to load directory');
            }

            const data = await response.json();
            this.currentPath = data.path;
            this.baseDir = data.baseDir;
            this.renderFileTree(data.files, data.relativePath);
        } catch (error) {
            console.error('Error loading directory:', error);
            this.client.showError('Failed to load directory: ' + error.message);
        }
    }

    renderFileTree(files, relativePath = '.') {
        const fileTree = document.getElementById('fileTree');
        const currentPathDiv = document.getElementById('currentPath');

        currentPathDiv.textContent = relativePath || '.';
        fileTree.innerHTML = '';

        // Add parent directory link if not at project root
        if (this.currentPath && this.currentPath !== this.baseDir) {
            const parentPath = this.currentPath.split('/').slice(0, -1).join('/');
            const parentItem = this.createFileItem({
                name: '..',
                path: parentPath,
                isDirectory: true
            }, true);
            fileTree.appendChild(parentItem);
        }

        if (files.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'file-tree-empty';
            emptyMsg.textContent = 'Empty directory';
            fileTree.appendChild(emptyMsg);
        } else {
            files.forEach(file => {
                const item = this.createFileItem(file);
                fileTree.appendChild(item);
            });
        }
    }

    createFileItem(file, isParent = false) {
        const div = document.createElement('div');
        div.className = `file-item ${file.isDirectory ? 'directory' : 'file'}`;
        div.dataset.path = file.path;

        const icon = document.createElement('span');
        icon.className = 'file-item-icon';

        const name = document.createElement('span');
        name.className = 'file-item-name';
        name.textContent = file.name;
        name.title = file.name;

        div.appendChild(icon);
        div.appendChild(name);

        if (!file.isDirectory && !isParent && file.size) {
            const size = document.createElement('span');
            size.className = 'file-item-size';
            size.textContent = this.formatSize(file.size);
            div.appendChild(size);
        }

        div.onclick = () => {
            if (file.isDirectory) {
                this.loadProjectDirectory(this.projectId, file.path);
            } else {
                this.selectFile(file, div);
            }
        };

        return div;
    }

    async selectFile(file, element) {
        // Remove previous selection
        document.querySelectorAll('.file-item.selected').forEach(el => {
            el.classList.remove('selected');
        });

        element.classList.add('selected');
        this.selectedFile = file;

        // Load file contents
        try {
            const response = await fetch(`/api/projects/${this.projectId}/files/read?path=${encodeURIComponent(file.path)}`, {
                headers: { 'Authorization': `Bearer ${this.client.token}` }
            });

            if (!response.ok) {
                throw new Error('Failed to read file');
            }

            const data = await response.json();
            this.client.showFileViewer(file.name, data.content, data.relativePath);
        } catch (error) {
            console.error('Error reading file:', error);
            this.client.showError('Failed to read file: ' + error.message);
        }
    }

    formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    }
}

/**
 * AgentUIManager - Manages agent list and agent cards
 */
class AgentUIManager {
    constructor(client) {
        this.client = client;
        this.agents = new Map(); // agentId => agent data
    }

    renderAgentList(agents) {
        const agentList = document.getElementById('agentList');
        agentList.innerHTML = '';

        if (agents.length === 0) {
            agentList.innerHTML = '<div style="padding: 12px; color: #8b949e; text-align: center;">No agents yet. Create one to get started!</div>';
            return;
        }

        agents.forEach(agent => {
            this.agents.set(agent.id, agent);
            const card = this.createAgentCard(agent);
            agentList.appendChild(card);
        });
    }

    createAgentCard(agent) {
        const card = document.createElement('div');
        card.className = 'agent-card';
        card.dataset.agentId = agent.id;

        const initials = agent.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

        card.innerHTML = `
            <div class="agent-card-header">
                <div class="agent-avatar" style="background-color: ${agent.color}">
                    ${initials}
                </div>
                <div class="agent-card-info">
                    <div class="agent-card-name">${agent.name}</div>
                    <div class="agent-card-role">${agent.role}</div>
                </div>
            </div>
            <div class="agent-card-footer">
                <span class="status-badge status-${agent.status}">${agent.status}</span>
                ${agent.current_task_id ? '<span class="agent-current-task">Working on task...</span>' : '<span style="color: #6e7681;">Idle</span>'}
            </div>
        `;

        card.addEventListener('click', () => this.showAgentDetail(agent.id));
        return card;
    }

    updateAgentStatus(agentId, status, currentTaskId = null) {
        const agent = this.agents.get(agentId);
        if (!agent) return;

        agent.status = status;
        agent.current_task_id = currentTaskId;

        // Update card
        const card = document.querySelector(`[data-agent-id="${agentId}"]`);
        if (card) {
            const statusBadge = card.querySelector('.status-badge');
            if (statusBadge) {
                statusBadge.className = `status-badge status-${status}`;
                statusBadge.textContent = status;
            }

            const taskInfo = card.querySelector('.agent-current-task, .agent-card-footer > span:last-child');
            if (taskInfo) {
                if (currentTaskId) {
                    taskInfo.className = 'agent-current-task';
                    taskInfo.textContent = 'Working on task...';
                } else {
                    taskInfo.className = '';
                    taskInfo.style.color = '#6e7681';
                    taskInfo.textContent = 'Idle';
                }
            }
        }
    }

    addAgent(agent) {
        this.agents.set(agent.id, agent);
        const agentList = document.getElementById('agentList');

        // Remove "no agents" message if exists
        if (agentList.children.length === 1 && agentList.firstChild.tagName !== 'DIV' ||
            agentList.querySelector('[style*="padding: 12px"]')) {
            agentList.innerHTML = '';
        }

        const card = this.createAgentCard(agent);
        agentList.appendChild(card);
    }

    removeAgent(agentId) {
        this.agents.delete(agentId);
        const card = document.querySelector(`[data-agent-id="${agentId}"]`);
        if (card) card.remove();

        const agentList = document.getElementById('agentList');
        if (agentList.children.length === 0) {
            agentList.innerHTML = '<div style="padding: 12px; color: #8b949e; text-align: center;">No agents yet. Create one to get started!</div>';
        }
    }

    showAgentDetail(agentId) {
        const agent = this.agents.get(agentId);
        if (!agent) return;

        const modal = document.getElementById('agentDetailModal');
        document.getElementById('agentDetailName').textContent = agent.name;
        document.getElementById('agentRole').textContent = agent.role;
        document.getElementById('agentStatus').className = `status-badge status-${agent.status}`;
        document.getElementById('agentStatus').textContent = agent.status;
        document.getElementById('agentCurrentTask').textContent = agent.current_task_id || 'None';

        // Show/hide pause/resume buttons
        const pauseBtn = document.getElementById('pauseAgentBtn');
        const resumeBtn = document.getElementById('resumeAgentBtn');
        if (agent.status === 'paused') {
            pauseBtn.style.display = 'none';
            resumeBtn.style.display = 'inline-block';
        } else {
            pauseBtn.style.display = 'inline-block';
            resumeBtn.style.display = 'none';
        }

        // Store current agent ID for controls
        modal.dataset.agentId = agentId;
        modal.style.display = 'flex';

        // Load agent conversation history
        this.loadAgentHistory(agentId);
    }

    async loadAgentHistory(agentId) {
        try {
            const response = await fetch(`/api/projects/${this.client.currentProject.id}/agents/${agentId}/history`, {
                headers: { 'Authorization': `Bearer ${this.client.token}` }
            });

            if (response.ok) {
                const data = await response.json();
                const conversation = document.getElementById('agentConversation');
                conversation.innerHTML = data.history && data.history.length > 0
                    ? data.history.map(msg => `
                        <div class="message message-${msg.role}">
                            <strong>${msg.role}:</strong> ${msg.content}
                        </div>
                    `).join('')
                    : '<div style="color: #6e7681; text-align: center; padding: 20px;">No conversation history yet</div>';
            }
        } catch (error) {
            console.error('Error loading agent history:', error);
        }
    }
}

/**
 * TaskUIManager - Manages task board and task cards
 */
class TaskUIManager {
    constructor(client) {
        this.client = client;
        this.tasks = new Map(); // taskId => task data
    }

    renderTaskBoard(tasks) {
        // Clear all task lists
        document.getElementById('pendingTasks').innerHTML = '';
        document.getElementById('inProgressTasks').innerHTML = '';
        document.getElementById('completedTasks').innerHTML = '';

        tasks.forEach(task => {
            this.tasks.set(task.id, task);
            this.addTaskToBoard(task);
        });
    }

    addTaskToBoard(task) {
        const card = this.createTaskCard(task);

        if (task.status === 'pending' || task.status === 'assigned') {
            document.getElementById('pendingTasks').appendChild(card);
        } else if (task.status === 'in_progress') {
            document.getElementById('inProgressTasks').appendChild(card);
        } else if (task.status === 'completed' || task.status === 'failed') {
            document.getElementById('completedTasks').appendChild(card);
        }
    }

    createTaskCard(task) {
        const card = document.createElement('div');
        card.className = 'task-card';
        card.dataset.taskId = task.id;

        const priorityClass = task.priority > 5 ? 'high' : '';
        const agent = task.agent_id ? this.client.agentUIManager.agents.get(task.agent_id) : null;

        card.innerHTML = `
            <div class="task-card-header">
                <div class="task-card-title">${task.title}</div>
                ${task.priority > 0 ? `<div class="task-card-priority ${priorityClass}">P${task.priority}</div>` : ''}
            </div>
            <div class="task-card-description">${task.description}</div>
            <div class="task-card-footer">
                <span style="font-size: 10px; color: #6e7681;">${this.formatDate(task.created)}</span>
                ${agent ? `
                    <div class="task-card-agent">
                        <div class="task-card-agent-avatar" style="background-color: ${agent.color}">
                            ${agent.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                        </div>
                        <span>${agent.name}</span>
                    </div>
                ` : '<span style="color: #8b949e;">Unassigned</span>'}
            </div>
        `;

        return card;
    }

    updateTaskStatus(taskId, status, agentId = null) {
        const task = this.tasks.get(taskId);
        if (!task) return;

        task.status = status;
        if (agentId !== null) task.agent_id = agentId;

        // Remove old card
        const oldCard = document.querySelector(`[data-task-id="${taskId}"]`);
        if (oldCard) oldCard.remove();

        // Add to new column
        this.addTaskToBoard(task);
    }

    addTask(task) {
        this.tasks.set(task.id, task);
        this.addTaskToBoard(task);
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'Just now';
    }
}

/**
 * ChatUIManager - Manages group chat interface
 */
class ChatUIManager {
    constructor(client) {
        this.client = client;
    }

    renderGroupChat(messages) {
        const conversation = document.getElementById('groupConversation');
        conversation.innerHTML = '';

        if (messages.length === 0) {
            conversation.innerHTML = '<div style="color: #8b949e; text-align: center; padding: 40px;">No messages yet. Start the conversation!</div>';
            return;
        }

        messages.forEach(msg => this.addGroupMessage(msg, false));
        this.scrollToBottom();
    }

    addGroupMessage(msg, scroll = true) {
        const conversation = document.getElementById('groupConversation');

        // Remove "no messages" placeholder if exists
        const placeholder = conversation.querySelector('[style*="padding: 40px"]');
        if (placeholder) placeholder.remove();

        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${msg.sender_type === 'user' ? 'user' : 'agent'}`;

        const initials = msg.sender_type === 'user' ? 'U' :
            (msg.senderName || 'Agent').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

        const avatarColor = msg.sender_type === 'user' ? '#1f6feb' :
            (this.client.agentUIManager.agents.get(msg.senderAgentId)?.color || '#8b949e');

        messageDiv.innerHTML = `
            <div class="chat-message-avatar" style="background-color: ${avatarColor}">
                ${initials}
            </div>
            <div class="chat-message-content">
                <div class="chat-message-header">
                    <span class="chat-message-sender">${msg.senderName || 'User'}</span>
                    <span class="chat-message-time">${this.formatTime(msg.created)}</span>
                </div>
                <div class="chat-message-body">${msg.message}</div>
            </div>
        `;

        conversation.appendChild(messageDiv);
        if (scroll) this.scrollToBottom();
    }

    scrollToBottom() {
        const conversation = document.getElementById('groupConversation');
        conversation.scrollTop = conversation.scrollHeight;
    }

    formatTime(dateString) {
        const date = new Date(dateString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
}

/**
 * DashboardUIManager - Manages dashboard view with agent status and activity
 */
class DashboardUIManager {
    constructor(client) {
        this.client = client;
    }

    renderDashboard(data) {
        this.renderAgentStatusGrid(data.agents || []);
        this.renderTaskStats(data.taskStats || {});
        this.renderRecentTasks(data.recentTasks || []);
        this.renderActivityFeed(data.recentMessages || []);
    }

    renderAgentStatusGrid(agents) {
        const grid = document.getElementById('agentStatusGrid');
        grid.innerHTML = '';

        if (agents.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #8b949e; padding: 20px;">No agents in this project yet</div>';
            return;
        }

        agents.forEach(agent => {
            const card = document.createElement('div');
            card.className = 'agent-status-card';
            card.dataset.agentId = agent.id;

            card.innerHTML = `
                <div class="agent-status-card-header">
                    <div class="agent-status-card-name">${agent.name}</div>
                    <span class="status-badge status-${agent.status}">${agent.status}</span>
                </div>
                <div class="agent-status-card-body">
                    <div style="font-size: 11px; color: #8b949e; text-transform: capitalize;">
                        ${agent.role}
                    </div>
                    ${agent.stats ? `
                        <div style="margin-top: 8px; font-size: 11px;">
                            <div>Tasks: ${agent.stats.tasks?.completed || 0} completed</div>
                            <div>Tools: ${agent.stats.total_tool_executions || 0} executions</div>
                        </div>
                    ` : ''}
                </div>
                ${agent.current_task_id ? `
                    <div class="agent-status-card-task">
                        🔧 Working on task #${agent.current_task_id}
                    </div>
                ` : ''}
            `;

            card.addEventListener('click', () => this.client.agentUIManager.showAgentDetail(agent.id));
            grid.appendChild(card);
        });
    }

    renderTaskStats(stats) {
        const widget = document.getElementById('taskStatsWidget');
        widget.innerHTML = `
            <div class="stat-item">
                <div class="stat-value">${stats.total || 0}</div>
                <div class="stat-label">Total</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${stats.pending || 0}</div>
                <div class="stat-label">Pending</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${stats.in_progress || 0}</div>
                <div class="stat-label">In Progress</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${stats.completed || 0}</div>
                <div class="stat-label">Completed</div>
            </div>
        `;
    }

    renderRecentTasks(tasks) {
        const list = document.getElementById('recentTasksList');
        list.innerHTML = '';

        if (tasks.length === 0) {
            list.innerHTML = '<div style="text-align: center; color: #8b949e; padding: 12px;">No tasks yet</div>';
            return;
        }

        tasks.slice(0, 5).forEach(task => {
            const item = document.createElement('div');
            item.className = 'recent-task-item';
            item.innerHTML = `
                <div class="recent-task-title">${task.title}</div>
                <div class="recent-task-meta">
                    <span class="status-badge status-${task.status}">${task.status}</span>
                    <span>${this.formatDate(task.created)}</span>
                </div>
            `;
            list.appendChild(item);
        });
    }

    renderActivityFeed(messages) {
        const feed = document.getElementById('activityFeed');
        feed.innerHTML = '';

        if (messages.length === 0) {
            feed.innerHTML = '<div style="text-align: center; color: #8b949e; padding: 20px;">No recent activity</div>';
            return;
        }

        messages.slice(0, 10).forEach(msg => {
            const item = document.createElement('div');
            item.className = 'activity-item';

            const icon = msg.sender_type === 'user' ? '👤' : '🤖';
            const color = msg.sender_type === 'user' ? '#1f6feb' : '#8b949e';

            item.innerHTML = `
                <div class="activity-icon" style="background-color: ${color}20; color: ${color}">
                    ${icon}
                </div>
                <div class="activity-content">
                    <div class="activity-message">
                        <strong>${msg.senderName || 'User'}</strong>: ${msg.message.substring(0, 100)}${msg.message.length > 100 ? '...' : ''}
                    </div>
                    <div class="activity-time">${this.formatDate(msg.created)}</div>
                </div>
            `;
            feed.appendChild(item);
        });
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'Just now';
    }
}

/**
 * AgentClient - Frontend application for Coding Agent Web Interface
 * Handles WebSocket communication, project management, and UI updates
 */
class AgentClient {
    constructor() {
        this.token = localStorage.getItem('authToken') || this.promptForToken();
        this.ws = null;
        this.currentProject = null;
        this.isConnected = false;
        this.mode = 'files'; // 'files' or 'projects'
        this.currentView = 'dashboard'; // 'dashboard', 'chat', 'tasks'

        // UI Managers
        this.fileTreeManager = new FileTreeManager(this);
        this.agentUIManager = new AgentUIManager(this);
        this.taskUIManager = new TaskUIManager(this);
        this.chatUIManager = new ChatUIManager(this);
        this.dashboardUIManager = new DashboardUIManager(this);

        // Initialize UI
        this.init();
    }

    /**
     * Prompt user for authentication token
     */
    promptForToken() {
        const token = prompt('Enter authentication token:');
        if (token) {
            localStorage.setItem('authToken', token);
            return token;
        }
        return null;
    }

    /**
     * Initialize application
     */
    async init() {
        this.setupEventListeners();
        this.configureMarkdown();
        // Start by loading projects
        await this.showProjects();
    }

    /**
     * Configure markdown rendering
     */
    configureMarkdown() {
        marked.setOptions({
            highlight: function(code, lang) {
                if (lang && hljs.getLanguage(lang)) {
                    try {
                        return hljs.highlight(code, { language: lang }).value;
                    } catch (err) {}
                }
                return hljs.highlightAuto(code).value;
            },
            breaks: true,
            gfm: true
        });
    }

    /**
     * Show projects mode
     */
    async showProjects() {
        this.mode = 'projects';
        this.currentProject = null;
        document.querySelector('.sidebar-header h2').textContent = 'Projects';
        document.querySelector('.file-tree-container').style.display = 'none';
        document.getElementById('projectList').style.display = 'block';
        document.getElementById('homeBtn').style.display = 'none';
        document.querySelector('.sidebar-footer').style.display = 'none';

        // Hide chat container
        document.getElementById('noProjectSelected').style.display = 'flex';
        document.getElementById('chatContainer').style.display = 'none';

        await this.loadProjects();
    }

    /**
     * Show file viewer in main area
     */
    showFileViewer(fileName, content, relativePath) {
        const conversation = document.getElementById('conversation');
        conversation.innerHTML = '';

        const viewer = document.createElement('div');
        viewer.className = 'file-viewer';

        const header = document.createElement('div');
        header.className = 'file-viewer-header';
        header.textContent = relativePath || fileName;

        const codeBlock = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = content;
        codeBlock.appendChild(code);

        viewer.appendChild(header);
        viewer.appendChild(codeBlock);
        conversation.appendChild(viewer);

        // Highlight syntax
        hljs.highlightElement(code);
    }

    /**
     * Load projects from server
     */
    async loadProjects() {
        try {
            const response = await fetch('/api/projects', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.status === 401) {
                alert('Authentication failed. Please refresh and enter valid token.');
                localStorage.removeItem('authToken');
                location.reload();
                return;
            }

            if (!response.ok) {
                throw new Error(`Failed to load projects: ${response.statusText}`);
            }

            const projects = await response.json();
            this.renderProjects(projects);
        } catch (error) {
            console.error('Error loading projects:', error);
            this.showError('Failed to load projects: ' + error.message);
        }
    }

    /**
     * Render project list in sidebar
     */
    renderProjects(projects) {
        const list = document.getElementById('projectList');
        list.innerHTML = '';

        if (projects.length === 0) {
            const li = document.createElement('li');
            li.style.padding = '12px 20px';
            li.style.color = '#6e7681';
            li.textContent = 'No projects yet';
            list.appendChild(li);
            return;
        }

        projects.forEach(project => {
            const li = document.createElement('li');
            li.textContent = project.name;
            li.dataset.id = project.id;

            if (this.currentProject && this.currentProject.id === project.id) {
                li.classList.add('active');
            }

            li.onclick = () => this.selectProject(project);
            list.appendChild(li);
        });
    }

    /**
     * Select a project
     */
    async selectProject(project) {
        this.currentProject = project;
        this.mode = 'project';

        // Update UI - Show agent panel in sidebar
        document.getElementById('sidebarTitle').textContent = project.name;
        document.getElementById('projectList').style.display = 'none';
        document.getElementById('agentPanel').style.display = 'flex';
        document.querySelector('.sidebar-footer').style.display = 'flex';
        document.getElementById('projectsBtn').style.display = 'inline-block';

        // Load file tree for this project
        await this.fileTreeManager.loadProjectDirectory(project.id);

        // Update main area - Show multi-agent project container
        document.getElementById('noProjectSelected').style.display = 'none';
        document.getElementById('projectContainer').style.display = 'flex';
        document.getElementById('projectName').textContent = project.name;

        // Load multi-agent data
        await this.loadAgents();
        await this.loadDashboard();

        // Connect WebSocket and subscribe to project
        this.connectWebSocket();
    }

    /**
     * Load conversation history for project
     */
    async loadHistory(projectId) {
        try {
            const response = await fetch(`/api/projects/${projectId}/history`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (!response.ok) {
                throw new Error('Failed to load history');
            }

            const { history } = await response.json();
            this.renderHistory(history);
        } catch (error) {
            console.error('Error loading history:', error);
            this.showError('Failed to load conversation history');
        }
    }

    /**
     * Render conversation history
     */
    renderHistory(history) {
        const conversation = document.getElementById('conversation');
        conversation.innerHTML = '';

        history.forEach(msg => {
            if (msg.role === 'user' || msg.role === 'assistant') {
                this.addMessage(msg.role, msg.content);
            }
        });

        conversation.scrollTop = conversation.scrollHeight;
    }

    /**
     * Connect to WebSocket server
     */
    connectWebSocket() {
        if (this.ws) {
            this.ws.close();
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws?token=${this.token}`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.isConnected = true;
            console.log('WebSocket connected');

            // Subscribe to project updates
            if (this.currentProject) {
                this.ws.send(JSON.stringify({
                    type: 'subscribeProject',
                    projectId: this.currentProject.id
                }));
            }
        };

        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleWebSocketMessage(message);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.showError('WebSocket connection error');
        };

        this.ws.onclose = () => {
            this.isConnected = false;
            console.log('WebSocket disconnected');
        };
    }

    /**
     * Handle incoming WebSocket messages
     */
    handleWebSocketMessage(msg) {
        const toolFeed = document.getElementById('toolFeed');

        switch (msg.type) {
            // Multi-agent events
            case 'agentStatusUpdate':
                this.agentUIManager.updateAgentStatus(msg.agentId, msg.status, msg.currentTask);
                if (this.currentView === 'dashboard') {
                    this.loadDashboard(); // Refresh dashboard
                }
                break;

            case 'agentCreated':
                this.agentUIManager.addAgent(msg.agent);
                break;

            case 'agentDeleted':
                this.agentUIManager.removeAgent(msg.agentId);
                break;

            case 'taskCreated':
                this.taskUIManager.addTask(msg.task);
                if (this.currentView === 'dashboard') {
                    this.loadDashboard();
                }
                break;

            case 'taskUpdated':
                this.taskUIManager.updateTaskStatus(msg.taskId, msg.status, msg.agentId);
                if (this.currentView === 'dashboard') {
                    this.loadDashboard();
                }
                break;

            case 'groupMessage':
                this.chatUIManager.addGroupMessage(msg);
                break;

            case 'toolExecution':
                toolFeed.style.display = 'block';
                this.addMultiAgentToolEvent(msg);
                break;

            case 'agentTaskStart':
                toolFeed.style.display = 'block';
                this.addMultiAgentToolEvent({
                    agentName: msg.agentName,
                    toolName: 'Task Started',
                    success: true,
                    status: 'started'
                });
                break;

            case 'agentTaskComplete':
                this.addMultiAgentToolEvent({
                    agentName: msg.agentName,
                    toolName: 'Task Completed',
                    success: true,
                    status: 'completed'
                });
                setTimeout(() => {
                    if (document.getElementById('toolEvents').children.length > 20) {
                        toolFeed.style.display = 'none';
                    }
                }, 3000);
                break;

            case 'agentTaskError':
                this.addMultiAgentToolEvent({
                    agentName: msg.agentName,
                    toolName: 'Task Failed',
                    success: false,
                    summary: msg.data?.error || 'Unknown error'
                });
                break;

            case 'success':
                console.log('Success:', msg.message);
                break;

            case 'subscribed':
                console.log('Subscribed to updates');
                break;

            // Legacy single-agent events (backward compatibility)
            case 'taskStart':
            case 'iteration':
            case 'toolStart':
            case 'toolComplete':
            case 'taskComplete':
            case 'taskError':
            case 'error':
                // Keep old handling for backward compatibility
                this.handleLegacyWebSocketMessage(msg);
                break;

            default:
                console.log('Unknown WebSocket message type:', msg.type, msg);
        }
    }

    /**
     * Handle legacy WebSocket messages for backward compatibility
     */
    handleLegacyWebSocketMessage(msg) {
        const toolFeed = document.getElementById('toolFeed');

        switch (msg.type) {
            case 'taskStart':
                toolFeed.style.display = 'block';
                document.getElementById('toolEvents').innerHTML = '<p class="info">Task started...</p>';
                break;

            case 'iteration':
                this.addToolEvent(`Iteration: ${msg.data.toolCount} tool(s) to execute`, 'info');
                break;

            case 'toolStart':
                this.addToolEvent(`▶ Executing: ${msg.data.toolName}`, 'info');
                break;

            case 'toolComplete':
                const status = msg.data.success ? '✓' : '✗';
                const className = msg.data.success ? 'success' : 'error';
                this.addToolEvent(`${status} ${msg.data.summary}`, className);
                break;

            case 'taskComplete':
                setTimeout(() => {
                    toolFeed.style.display = 'none';
                }, 2000);
                break;

            case 'taskError':
            case 'error':
                this.addToolEvent(`Error: ${msg.error || msg.data?.message || 'Unknown error'}`, 'error');
                setTimeout(() => {
                    toolFeed.style.display = 'none';
                }, 5000);
                break;
        }
    }

    /**
     * Add tool event to feed
     */
    addToolEvent(text, className = '') {
        const events = document.getElementById('toolEvents');
        const p = document.createElement('p');
        p.textContent = text;
        if (className) p.classList.add(className);
        events.appendChild(p);
        events.scrollTop = events.scrollHeight;
    }

    /**
     * Add multi-agent tool event to feed
     */
    addMultiAgentToolEvent(msg) {
        const events = document.getElementById('toolEvents');
        const event = document.createElement('div');
        event.className = `tool-event ${msg.success === false ? 'error' : 'success'}`;

        const now = new Date();
        event.innerHTML = `
            <div class="tool-event-header">
                <span class="tool-event-agent">${msg.agentName}</span>
                <span class="tool-event-time">${now.toLocaleTimeString()}</span>
            </div>
            <div class="tool-event-tool">
                ${msg.toolName}${msg.summary ? ': ' + msg.summary : ''}
            </div>
        `;

        events.appendChild(event);
        events.scrollTop = events.scrollHeight;

        // Keep only last 50 events
        while (events.children.length > 50) {
            events.removeChild(events.firstChild);
        }
    }

    /**
     * Add message to conversation
     */
    addMessage(role, content) {
        const conversation = document.getElementById('conversation');
        const div = document.createElement('div');
        div.className = `message ${role}`;

        if (role === 'assistant') {
            // Render markdown for assistant messages
            div.innerHTML = marked.parse(content);
            // Apply syntax highlighting to code blocks
            div.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
        } else {
            // Plain text for user messages
            div.textContent = content;
        }

        conversation.appendChild(div);
        conversation.scrollTop = conversation.scrollHeight;
    }

    /**
     * Setup event listeners for UI elements
     */
    setupEventListeners() {
        // Projects button
        document.getElementById('projectsBtn').onclick = () => this.showProjects();

        // Home button - go back to project root
        document.getElementById('homeBtn').onclick = () => {
            if (this.currentProject) {
                this.fileTreeManager.loadProjectDirectory(this.currentProject.id);
            }
        };

        // Create project button
        const createProjectBtn = document.getElementById('createProjectBtn');
        if (createProjectBtn) {
            createProjectBtn.onclick = () => this.createProject();
        }

        // View tab switching
        document.querySelectorAll('.view-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const view = tab.dataset.view;
                this.switchView(view);
            });
        });

        // Sidebar tab switching (Team / Files)
        document.getElementById('agentsTabBtn')?.addEventListener('click', () => {
            document.getElementById('agentsTabBtn').classList.add('active');
            document.getElementById('filesTabBtn').classList.remove('active');
            document.getElementById('agentsTab').style.display = 'block';
            document.getElementById('filesTab').style.display = 'none';
        });

        document.getElementById('filesTabBtn')?.addEventListener('click', () => {
            document.getElementById('filesTabBtn').classList.add('active');
            document.getElementById('agentsTabBtn').classList.remove('active');
            document.getElementById('filesTab').style.display = 'block';
            document.getElementById('agentsTab').style.display = 'none';
        });

        // Add agent button
        document.getElementById('addAgentBtn')?.addEventListener('click', () => {
            this.showCreateAgentModal();
        });

        // Create agent form
        document.getElementById('createAgentForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.createAgent();
        });

        document.getElementById('cancelCreateAgentBtn')?.addEventListener('click', () => {
            document.getElementById('createAgentModal').style.display = 'none';
        });

        document.getElementById('closeCreateAgentBtn')?.addEventListener('click', () => {
            document.getElementById('createAgentModal').style.display = 'none';
        });

        // Agent detail modal
        document.getElementById('closeAgentDetailBtn')?.addEventListener('click', () => {
            document.getElementById('agentDetailModal').style.display = 'none';
        });

        document.getElementById('pauseAgentBtn')?.addEventListener('click', () => {
            const agentId = document.getElementById('agentDetailModal').dataset.agentId;
            if (agentId) this.pauseAgent(parseInt(agentId));
        });

        document.getElementById('resumeAgentBtn')?.addEventListener('click', () => {
            const agentId = document.getElementById('agentDetailModal').dataset.agentId;
            if (agentId) this.resumeAgent(parseInt(agentId));
        });

        // Group chat
        document.getElementById('sendGroupMessageBtn')?.addEventListener('click', () => {
            this.sendGroupMessage();
        });

        document.getElementById('groupMessageInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                this.sendGroupMessage();
            }
        });

        // Create task button
        document.getElementById('createTaskBtn')?.addEventListener('click', () => {
            this.showCreateTaskModal();
        });

        // Close tool feed
        document.getElementById('closeFeedBtn')?.addEventListener('click', () => {
            document.getElementById('toolFeed').style.display = 'none';
        });
    }

    /**
     * Submit a task to the agent
     */
    async submitTask() {
        const input = document.getElementById('taskInput');
        const prompt = input.value.trim();

        if (!prompt || !this.currentProject) {
            return;
        }

        if (!this.isConnected) {
            this.showError('WebSocket not connected. Please refresh the page.');
            return;
        }

        // Add user message to conversation
        this.addMessage('user', prompt);

        // Disable submit button
        document.getElementById('submitBtn').disabled = true;

        // Send to WebSocket
        this.ws.send(JSON.stringify({
            type: 'executeTask',
            projectId: this.currentProject.id,
            prompt
        }));
    }

    /**
     * Create a new project
     */
    async createProject() {
        const name = prompt('Enter project name:');
        if (!name) return;

        try {
            const response = await fetch('/api/projects', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name })
            });

            if (!response.ok) {
                throw new Error('Failed to create project');
            }

            const project = await response.json();
            await this.loadProjects();
            this.selectProject(project);
        } catch (error) {
            console.error('Error creating project:', error);
            this.showError('Failed to create project: ' + error.message);
        }
    }

    /**
     * Clear conversation history
     */
    async clearHistory() {
        if (!this.currentProject) return;

        if (!confirm('Clear conversation history for this project?')) return;

        try {
            const response = await fetch(`/api/projects/${this.currentProject.id}/history`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (!response.ok) {
                throw new Error('Failed to clear history');
            }

            document.getElementById('conversation').innerHTML = '';
        } catch (error) {
            console.error('Error clearing history:', error);
            this.showError('Failed to clear history: ' + error.message);
        }
    }

    /**
     * Switch between views (Dashboard, Chat, Tasks)
     */
    switchView(view) {
        this.currentView = view;

        // Update tab buttons
        document.querySelectorAll('.view-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.view === view);
        });

        // Update view content
        document.querySelectorAll('.view-content').forEach(content => {
            content.classList.remove('active');
            content.style.display = 'none';
        });

        const viewContent = document.getElementById(`${view}View`);
        if (viewContent) {
            viewContent.classList.add('active');
            viewContent.style.display = 'block';
        }

        // Load data for the view
        if (view === 'dashboard') {
            this.loadDashboard();
        } else if (view === 'chat') {
            this.loadGroupChat();
        } else if (view === 'tasks') {
            this.loadTasks();
        }
    }

    /**
     * Load dashboard data
     */
    async loadDashboard() {
        if (!this.currentProject) return;

        try {
            const response = await fetch(`/api/projects/${this.currentProject.id}/dashboard`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                const data = await response.json();
                this.dashboardUIManager.renderDashboard(data);
            }
        } catch (error) {
            console.error('Error loading dashboard:', error);
        }
    }

    /**
     * Load group chat
     */
    async loadGroupChat() {
        if (!this.currentProject) return;

        try {
            const response = await fetch(`/api/projects/${this.currentProject.id}/messages/group`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                const messages = await response.json();
                this.chatUIManager.renderGroupChat(messages);
            }
        } catch (error) {
            console.error('Error loading group chat:', error);
        }
    }

    /**
     * Load tasks
     */
    async loadTasks() {
        if (!this.currentProject) return;

        try {
            const response = await fetch(`/api/projects/${this.currentProject.id}/tasks`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                const tasks = await response.json();
                this.taskUIManager.renderTaskBoard(tasks);
            }
        } catch (error) {
            console.error('Error loading tasks:', error);
        }
    }

    /**
     * Show create agent modal
     */
    showCreateAgentModal() {
        document.getElementById('createAgentModal').style.display = 'flex';
        document.getElementById('agentName').value = '';
        document.getElementById('agentRole').value = '';
        document.getElementById('customPrompt').value = '';
    }

    /**
     * Create a new agent
     */
    async createAgent() {
        if (!this.currentProject) return;

        const name = document.getElementById('agentName').value.trim();
        const role = document.getElementById('agentRole').value;
        const customPrompt = document.getElementById('customPrompt').value.trim();

        if (!name || !role) {
            alert('Please provide agent name and role');
            return;
        }

        try {
            const response = await fetch(`/api/projects/${this.currentProject.id}/agents`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name,
                    role,
                    customPrompt: customPrompt || null
                })
            });

            if (response.ok) {
                const agent = await response.json();
                this.agentUIManager.addAgent(agent);
                document.getElementById('createAgentModal').style.display = 'none';
            } else {
                throw new Error('Failed to create agent');
            }
        } catch (error) {
            console.error('Error creating agent:', error);
            alert('Failed to create agent: ' + error.message);
        }
    }

    /**
     * Pause an agent
     */
    async pauseAgent(agentId) {
        if (!this.ws || !this.isConnected) {
            alert('WebSocket not connected');
            return;
        }

        this.ws.send(JSON.stringify({
            type: 'pauseAgent',
            agentId
        }));
    }

    /**
     * Resume an agent
     */
    async resumeAgent(agentId) {
        if (!this.ws || !this.isConnected) {
            alert('WebSocket not connected');
            return;
        }

        this.ws.send(JSON.stringify({
            type: 'resumeAgent',
            agentId
        }));
    }

    /**
     * Send group message
     */
    async sendGroupMessage() {
        if (!this.currentProject || !this.ws || !this.isConnected) return;

        const input = document.getElementById('groupMessageInput');
        const message = input.value.trim();

        if (!message) return;

        this.ws.send(JSON.stringify({
            type: 'sendGroupMessage',
            projectId: this.currentProject.id,
            message
        }));

        input.value = '';
    }

    /**
     * Show create task modal
     */
    showCreateTaskModal() {
        const title = prompt('Task title:');
        if (!title) return;

        const description = prompt('Task description:');
        if (!description) return;

        this.createTask(title, description);
    }

    /**
     * Create a new task
     */
    async createTask(title, description, agentId = null, priority = 0) {
        if (!this.currentProject) return;

        try {
            const response = await fetch(`/api/projects/${this.currentProject.id}/tasks`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ title, description, agentId, priority })
            });

            if (response.ok) {
                const task = await response.json();
                this.taskUIManager.addTask(task);
            } else {
                throw new Error('Failed to create task');
            }
        } catch (error) {
            console.error('Error creating task:', error);
            alert('Failed to create task: ' + error.message);
        }
    }

    /**
     * Load agents for current project
     */
    async loadAgents() {
        if (!this.currentProject) return;

        try {
            const response = await fetch(`/api/projects/${this.currentProject.id}/agents`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                const agents = await response.json();
                this.agentUIManager.renderAgentList(agents);
            }
        } catch (error) {
            console.error('Error loading agents:', error);
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        alert(message); // Simple for now, can be enhanced with toast notifications
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new AgentClient();
});

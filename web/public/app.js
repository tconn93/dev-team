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
        await this.loadProjects();
        this.setupEventListeners();
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

        // Update UI
        document.getElementById('noProjectSelected').style.display = 'none';
        document.getElementById('chatContainer').style.display = 'flex';
        document.getElementById('projectName').textContent = project.name;

        // Update active state in sidebar
        document.querySelectorAll('.project-list li').forEach(li => {
            li.classList.toggle('active', li.dataset.id == project.id);
        });

        // Load conversation history
        await this.loadHistory(project.id);

        // Connect WebSocket
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
        const statusIndicator = document.getElementById('statusIndicator');

        switch (msg.type) {
            case 'taskStart':
                toolFeed.style.display = 'block';
                document.getElementById('toolEvents').innerHTML = '<p class="info">Task started...</p>';
                statusIndicator.textContent = 'Running';
                statusIndicator.className = 'status-running';
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
                this.addMessage('assistant', msg.data.content);
                document.getElementById('submitBtn').disabled = false;
                document.getElementById('taskInput').value = '';
                statusIndicator.textContent = 'Idle';
                statusIndicator.className = 'status-idle';
                break;

            case 'taskError':
            case 'error':
                this.addToolEvent(`Error: ${msg.error || msg.data?.message || 'Unknown error'}`, 'error');
                document.getElementById('submitBtn').disabled = false;
                statusIndicator.textContent = 'Idle';
                statusIndicator.className = 'status-idle';
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
     * Add message to conversation
     */
    addMessage(role, content) {
        const conversation = document.getElementById('conversation');
        const div = document.createElement('div');
        div.className = `message ${role}`;
        div.textContent = content;
        conversation.appendChild(div);
        conversation.scrollTop = conversation.scrollHeight;
    }

    /**
     * Setup event listeners for UI elements
     */
    setupEventListeners() {
        // Submit task button
        document.getElementById('submitBtn').onclick = () => this.submitTask();

        // New project button
        document.getElementById('newProjectBtn').onclick = () => this.createProject();

        // Clear history button
        document.getElementById('clearHistoryBtn').onclick = () => this.clearHistory();

        // Textarea keyboard shortcuts
        document.getElementById('taskInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                this.submitTask();
            }
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

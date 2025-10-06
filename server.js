// server.js
const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3001;

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Store connected clients
const clients = new Set();

// Basic HTTP endpoint for health checks
app.get('/', (req, res) => {
    res.json({
        status: 'WebSocket server running',
        connections: clients.size
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log('New client connected');
    clients.add(ws);

    // Send welcome message
    ws.send(JSON.stringify({
        type: 'welcome',
        message: 'Connected to WebSocket server',
        timestamp: new Date().toISOString()
    }));

    // Handle incoming messages
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            console.log('Received:', message);

            // Echo back to sender
            ws.send(JSON.stringify({
                type: 'echo',
                original: message,
                timestamp: new Date().toISOString()
            }));

            // Broadcast to all other clients
            clients.forEach((client) => {
                if (client !== ws && client.readyState === 1) { // 1 = OPEN
                    client.send(JSON.stringify({
                        type: 'broadcast',
                        data: message,
                        timestamp: new Date().toISOString()
                    }));
                }
            });
        } catch (err) {
            console.error('Error parsing message:', err);
        }
    });

    // Handle client disconnect
    ws.on('close', () => {
        console.log('Client disconnected');
        clients.delete(ws);
    });

    // Handle errors
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
});
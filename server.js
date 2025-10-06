// server.js - For Render.com deployment (Socket.IO version)

const express = require('express');
const http = require('http');
const { Server } = require('socket.io'); // Correct import for Socket.IO

const app = express();
const server = http.createServer(app);

// IMPORTANT: Configure Socket.IO with CORS
const io = new Server(server, {
    cors: {
        origin: [
            "http://localhost:3000", // For your local Next.js development
            "https://your-netlify-app-url.netlify.app", // **Replace with your actual Netlify URL after deployment! DO NOT HAVE THIS SET UP YET**
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
});

let clickCount = 0; // Initialize a shared click counter

io.on('connection', (socket) => {
    console.log('A user connected');

    // Send the current count to the newly connected client
    socket.emit('countUpdate', clickCount);

    socket.on('incrementClick', () => {
        clickCount++;
        // Broadcast the updated count to all connected clients
        io.emit('countUpdate', clickCount);
        console.log(`Click count updated to: ${clickCount}`);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

// Basic HTTP endpoint for health checks
app.get('/', (req, res) => {
    res.send('Socket.IO server is running!');
});

// Render.com will set process.env.PORT, otherwise use 3001 as a fallback for local dev
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
    console.log(`Socket.IO Server running on port ${PORT}`);
    console.log(`Socket.IO endpoint: https://websocket-ps.onrender.com/ (for clients)`);
});
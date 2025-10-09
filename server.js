// server.js - For Render.com deployment (Socket.IO version)

const express = require('express');
const http = require('http');
const { Server } = require('socket.io'); // Correct import for Socket.IO
const { v4: uuidv4 } = require('uuid');

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

const activeRooms = {};

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // --- Event: createRoom ---
    // When a user wants to create a new room
    socket.on('createRoom', ({ userName }) => {
        const roomId = uuidv4(); // Generate a unique ID for the room
        activeRooms[roomId] = {
            users: [{ id: socket.id, name: userName }]
        };

        socket.join(roomId); // Make the socket join the new room

        // Emit event back to the creator with room details and their info
        socket.emit('roomCreated', {
            roomId,
            userName,
            usersInRoom: activeRooms[roomId].users
        });
        console.log(`Room created: ${roomId} by ${userName} (${socket.id})`);
    });

    // --- Event: joinRoom ---
    // When a user tries to join an existing room
    socket.on('joinRoom', ({ roomId, userName }) => {
        if (activeRooms[roomId]) {
            // Add user to the room's user list
            activeRooms[roomId].users.push({ id: socket.id, name: userName });
            socket.join(roomId); // Make the socket join the room

            // Emit event back to the joining user with room details
            socket.emit('roomJoined', {
                roomId,
                userName,
                usersInRoom: activeRooms[roomId].users
            });

            // Broadcast to all other users in that room that a new user joined
            socket.to(roomId).emit('userJoined', {
                userName,
                usersInRoom: activeRooms[roomId].users
            });
            console.log(`User ${userName} (${socket.id}) joined room ${roomId}`);
        } else {
            socket.emit('roomError', { message: 'Room not found.' });
            console.log(`Attempt to join non-existent room: ${roomId} by ${userName}`);
        }
    });

    // --- Event: message (example for future) ---
    // socket.on('sendMessage', ({ roomId, userName, message }) => {
    //   // Broadcast the message to all users in the room
    //   io.to(roomId).emit('newMessage', { userName, message, timestamp: new Date() });
    // });

    // --- Event: disconnect ---
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        // Find which room the disconnected user was in and remove them
        for (const roomId in activeRooms) {
            const room = activeRooms[roomId];
            const initialUserCount = room.users.length;
            room.users = room.users.filter(user => user.id !== socket.id);

            if (room.users.length < initialUserCount) { // User was found and removed
                console.log(`User ${socket.id} removed from room ${roomId}`);
                if (room.users.length === 0) {
                    delete activeRooms[roomId]; // Delete room if no users left
                    console.log(`Room ${roomId} is now empty and deleted.`);
                } else {
                    // Notify remaining users in the room
                    socket.to(roomId).emit('userLeft', {
                        userId: socket.id,
                        usersInRoom: room.users
                    });
                }
                break; // User found, no need to check other rooms
            }
        }
    });
});

// Basic HTTP endpoint for health checks
app.get('/', (req, res) => {
    res.json({
        status: 'Socket.IO server running',
        activeRooms: Object.keys(activeRooms).length
    });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
    console.log(`Socket.IO Server running on port ${PORT}`);
});
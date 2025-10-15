const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid'); // To generate unique room IDs

const app = express();
const server = http.createServer(app);

// IMPORTANT: Configure Socket.IO with CORS
const io = new Server(server, {
    cors: {
        origin: [
            "http://localhost:3000", // For your local Next.js development
            "https://your-netlify-app-url.netlify.app", // **Replace with your actual Netlify URL!**
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
});

// --- In-memory storage for active rooms and their users ---
const activeRooms = {}; // { "roomId": { users: [{ id: "socketId", name: "UserA" }] } }

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // --- Event: createRoom ---
    socket.on('createRoom', ({ userName }) => {
        const roomId = uuidv4();
        activeRooms[roomId] = {
            users: [{ id: socket.id, name: userName }]
        };

        socket.join(roomId);

        // Emit event back to the creator with room details and their info
        socket.emit('roomCreated', {
            roomId,
            userName,
            usersInRoom: activeRooms[roomId].users // Send current users
        });
        console.log(`Room created: ${roomId} by ${userName} (${socket.id})`);
    });

    // --- Event: joinRoom ---
    socket.on('joinRoom', ({ roomId, userName }) => {
        if (activeRooms[roomId]) {
            // Add user to the room's user list
            activeRooms[roomId].users.push({ id: socket.id, name: userName });
            socket.join(roomId); // Make the socket join the room

            const usersInRoom = activeRooms[roomId].users;

            // Emit event back to the joining user with room details
            socket.emit('roomJoined', { // This event is for the joining user ONLY
                roomId,
                userName, // The name of the user who just joined
                usersInRoom // All users currently in the room
            });

            // Broadcast to all *other* users in that room that a new user joined
            // This sends to all sockets in roomId EXCEPT the sender (socket.id)
            socket.to(roomId).emit('userJoined', { // This event is for existing users in the room
                userName, // The name of the user who just joined
                usersInRoom // All users currently in the room
            });
            console.log(`User ${userName} (${socket.id}) joined room ${roomId}`);
        } else {
            socket.emit('roomError', { message: 'Room not found.' });
            console.log(`Attempt to join non-existent room: ${roomId} by ${userName}`);
        }
    });

    // --- Event: disconnect ---
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        // Find which room the disconnected user was in and remove them
        for (const roomId in activeRooms) {
            const room = activeRooms[roomId];
            const initialUserCount = room.users.length;
            const disconnectedUser = room.users.find(user => user.id === socket.id);

            room.users = room.users.filter(user => user.id !== socket.id);

            if (room.users.length < initialUserCount) { // User was found and removed
                console.log(`User ${disconnectedUser ? disconnectedUser.name : 'Unknown'} (${socket.id}) removed from room ${roomId}`);
                if (room.users.length === 0) {
                    delete activeRooms[roomId]; // Delete room if no users left
                    console.log(`Room ${roomId} is now empty and deleted.`);
                } else {
                    // Notify remaining users in the room
                    // Use 'io.to(roomId)' to send to all sockets in the room (including sender, if sender wasn't disconnected)
                    // or 'socket.to(roomId)' if you want to exclude a specific sender (but here sender is disconnected)
                    io.to(roomId).emit('userLeft', {
                        // userId: socket.id, // For tracking who left
                        userName: disconnectedUser ? disconnectedUser.name : 'A user', // Send name for better frontend message
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
        activeRooms: Object.keys(activeRooms).length,
        // debug: activeRooms // Uncomment for debugging active rooms state
    });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
    console.log(`Socket.IO Server running on port ${PORT}`);
});
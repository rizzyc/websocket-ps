const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: [
            "http://localhost:3000",
            "https://your-netlify-app-url.netlify.app", // **Replace with your actual Netlify URL!**
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
});

// --- In-memory storage for active rooms and their users ---
// Added a 'timeout' property to rooms
const activeRooms = {}; // { "roomId": { users: [{ id: "socketId", name: "UserA" }], timeout: null } }
const ROOM_EMPTY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes (adjust as needed)

// Helper to clear room timeout
function clearTimeoutForRoom(roomId) {
    if (activeRooms[roomId] && activeRooms[roomId].timeout) {
        clearTimeout(activeRooms[roomId].timeout);
        activeRooms[roomId].timeout = null;
    }
}

// Helper to start room deletion timeout
function startTimeoutForRoom(roomId) {
    clearTimeoutForRoom(roomId); // Ensure no old timeout is running
    activeRooms[roomId].timeout = setTimeout(() => {
        if (activeRooms[roomId] && activeRooms[roomId].users.length === 0) {
            delete activeRooms[roomId];
            console.log(`Room ${roomId} is now empty and has been deleted after timeout.`);
        }
    }, ROOM_EMPTY_TIMEOUT_MS);
    console.log(`Room ${roomId} is empty. Deletion scheduled in ${ROOM_EMPTY_TIMEOUT_MS / 1000} seconds.`);
}

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // --- Event: createRoom ---
    socket.on('createRoom', ({ userName }) => {
        const roomId = uuidv4();
        activeRooms[roomId] = {
            users: [{ id: socket.id, name: userName }],
            timeout: null // New rooms start without a timeout
        };

        socket.join(roomId);
        clearTimeoutForRoom(roomId); // If by some chance it had a timeout

        socket.emit('roomCreated', {
            roomId,
            userName,
            usersInRoom: activeRooms[roomId].users
        });
        console.log(`Room created: ${roomId} by ${userName} (${socket.id})`);
    });

    // --- Event: joinRoom ---
    socket.on('joinRoom', ({ roomId, userName }) => {
        if (activeRooms[roomId]) {
            // Found room, ensure it doesn't get deleted while active
            clearTimeoutForRoom(roomId);

            // Check if user (by socket.id) is already in this room's user list
            const existingUser = activeRooms[roomId].users.find(user => user.id === socket.id);
            if (existingUser) {
                // User's socket is already registered, perhaps a redundant join or reconnect logic
                console.log(`User ${userName} (${socket.id}) already registered in room ${roomId}. Re-confirming.`);
            } else {
                activeRooms[roomId].users.push({ id: socket.id, name: userName });
            }

            socket.join(roomId);

            const usersInRoom = activeRooms[roomId].users;

            socket.emit('roomJoined', {
                roomId,
                userName,
                usersInRoom
            });

            // Only broadcast 'userJoined' if it's a new user joining or a rejoining user whose presence should be announced
            // For now, let's keep it simple and announce any socket.id that joins (even if it's the same person refreshing)
            // You might refine this to only announce truly *new* users to avoid chat spam if user refreshes.
            socket.to(roomId).emit('userJoined', {
                userName,
                usersInRoom
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
        for (const roomId in activeRooms) {
            const room = activeRooms[roomId];
            const initialUserCount = room.users.length;
            const disconnectedUser = room.users.find(user => user.id === socket.id);

            room.users = room.users.filter(user => user.id !== socket.id);

            if (room.users.length < initialUserCount) { // User was found and removed
                console.log(`User ${disconnectedUser ? disconnectedUser.name : 'Unknown'} (${socket.id}) removed from room ${roomId}`);
                if (room.users.length === 0) {
                    // Room is now empty, start a timeout for deletion
                    startTimeoutForRoom(roomId);
                } else {
                    io.to(roomId).emit('userLeft', {
                        userName: disconnectedUser ? disconnectedUser.name : 'A user',
                        usersInRoom: room.users
                    });
                }
                break;
            }
        }
    });
});

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
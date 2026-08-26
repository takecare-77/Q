const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Fixed 2 Users
const USERS = {
    "user1": "pass123",
    "user2": "pass456"
};

// 4-Digit History PIN
const HISTORY_PIN = "9999";

// Chat memory array
let chatHistory = [];

// Login Route
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (USERS[username] && USERS[username] === password) {
        return res.json({ success: true, username });
    }
    return res.status(401).json({ success: false, message: "Access Denied" });
});

// Verify 4-Digit PIN & Send History
app.post('/api/history', (req, res) => {
    const { pin } = req.body;
    if (pin === HISTORY_PIN) {
        return res.json({ success: true, history: chatHistory });
    }
    return res.status(403).json({ success: false, message: "Wrong 4-Digit PIN" });
});

// Socket Communication
io.on('connection', (socket) => {
    socket.on('joinRoom', (username) => {
        socket.username = username;
        io.emit('systemMessage', `${username} active.`);
    });

    socket.on('chatMessage', (data) => {
        const msgObj = {
            id: Date.now(),
            user: data.user,
            text: data.text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        chatHistory.push(msgObj);
        io.emit('message', msgObj);
    });

    // Clear all chats command
    socket.on('clearHistory', () => {
        chatHistory = [];
        io.emit('chatCleared');
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            io.emit('systemMessage', `${socket.username} disconnected.`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
                                                     

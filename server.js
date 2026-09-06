const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

let liveMessages = [];

const VALID_USERS = {
    "user1": "pass123",
    "user2": "pass456"
};

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (VALID_USERS[username] && VALID_USERS[username] === password) {
        return res.json({ success: true });
    }
    return res.status(400).json({ success: false, message: 'Invalid Credentials' });
});

io.on('connection', (socket) => {
    socket.on('joinRoom', (username) => {
        socket.emit('initialLiveMessages', liveMessages);
    });

    socket.on('requestVaultHistory', () => {
        socket.emit('vaultHistoryData', liveMessages);
    });

    socket.on('chatMessage', (data) => {
        const msg = {
            id: 'msg_' + Date.now(),
            user: data.user,
            text: data.text || null,
            fileType: data.fileType || null,
            fileData: data.fileData || null,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        liveMessages.push(msg);
        io.emit('message', msg);
    });

    // WebRTC Signaling for Calls
    socket.on('offer', (data) => socket.broadcast.emit('offer', data));
    socket.on('answer', (data) => socket.broadcast.emit('answer', data));
    socket.on('candidate', (data) => socket.broadcast.emit('candidate', data));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 50 * 1024 * 1024 // 50MB for video/image uploads
});

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let chatHistory = [];
const VALID_USERS = {
    'user1': 'pass123',
    'user2': 'pass456'
};
const PIN_CODE = '9999';

// Login API
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (VALID_USERS[username] && VALID_USERS[username] === password) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Invalid Credentials' });
    }
});

// Vault PIN Unlock API
app.post('/api/history', (req, res) => {
    const { pin } = req.body;
    if (pin === PIN_CODE) {
        res.json({ success: true, history: chatHistory });
    } else {
        res.status(403).json({ success: false, message: 'Invalid PIN' });
    }
});

// Real-Time Socket Events
io.on('connection', (socket) => {
    socket.on('joinRoom', (username) => {
        socket.username = username;
    });

    socket.on('typing', (data) => {
        socket.broadcast.emit('typing', data);
    });

    socket.on('chatMessage', (data) => {
        const msg = {
            id: Date.now() + Math.random().toString(36).substr(2, 4),
            user: data.user,
            text: data.text || '',
            fileType: data.fileType || null,
            fileData: data.fileData || null,
            replyTo: data.replyTo || null,
            status: 'delivered',
            edited: false,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        chatHistory.push(msg);
        io.emit('message', msg);
    });

    socket.on('markSeen', (readerUser) => {
        let changed = false;
        chatHistory.forEach(m => {
            if (m.user !== readerUser && m.status !== 'seen') {
                m.status = 'seen';
                changed = true;
            }
        });
        if (changed) {
            io.emit('seenUpdate', { seenBy: readerUser });
        }
    });

    socket.on('editMessage', (data) => {
        const target = chatHistory.find(m => m.id === data.msgId && m.user === data.user);
        if (target) {
            target.text = data.newText;
            target.edited = true;
            io.emit('messageEdited', { id: target.id, text: target.text });
        }
    });

    socket.on('deleteMessage', (data) => {
        const index = chatHistory.findIndex(m => m.id === data.msgId && m.user === data.user);
        if (index !== -1) {
            chatHistory.splice(index, 1);
            io.emit('messageDeleted', { id: data.msgId });
        }
    });

    socket.on('clearHistory', () => {
        chatHistory = [];
        io.emit('chatCleared');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

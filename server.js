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
let vaultHistory = [];

io.on('connection', (socket) => {
    let currentSocketUser = '';

    socket.on('joinRoom', (username) => {
        currentSocketUser = username;
        socket.join('room_main');
        socket.emit('initialLiveMessages', liveMessages);
    });

    socket.on('requestVaultHistory', () => {
        socket.emit('vaultHistoryData', vaultHistory);
    });

    socket.on('chatMessage', (data) => {
        const msg = {
            id: 'msg_' + Date.now(),
            user: data.user,
            text: data.text || null,
            fileType: data.fileType || null,
            fileData: data.fileData || null,
            replyTo: data.replyTo || null,
            reaction: null,
            status: 'sent', // 'sent' (1 tick) or 'seen' (2 blue ticks)
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        liveMessages.push(msg);
        io.to('room_main').emit('message', msg);
    });

    // Handle typing status
    socket.on('typing', (data) => {
        socket.broadcast.to('room_main').emit('displayTyping', data);
    });

    // Handle message seen status
    socket.on('markSeen', (username) => {
        liveMessages.forEach(m => {
            if (m.user !== username && m.status === 'sent') {
                m.status = 'seen';
            }
        });
        io.to('room_main').emit('messagesSeen', username);
    });

    socket.on('deleteMessage', (data) => {
        const index = liveMessages.findIndex(m => m.id === data.id);
        if (index !== -1) {
            const deleted = liveMessages.splice(index, 1)[0];
            vaultHistory.push(deleted);
            io.to('room_main').emit('messageDeleted', data.id);
        }
    });

    socket.on('editMessage', (data) => {
        const msg = liveMessages.find(m => m.id === data.id);
        if (msg) {
            msg.text = data.newText;
            io.to('room_main').emit('messageEdited', data);
        }
    });

    socket.on('addReaction', (data) => {
        const msg = liveMessages.find(m => m.id === data.id);
        if (msg) {
            msg.reaction = data.reaction;
            io.to('room_main').emit('messageReaction', data);
        }
    });

    socket.on('offer', (data) => socket.broadcast.emit('offer', data));
    socket.on('answer', (data) => socket.broadcast.emit('answer', data));
    socket.on('candidate', (data) => socket.broadcast.emit('candidate', data));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

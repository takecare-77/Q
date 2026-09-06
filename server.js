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

const CHAT_SECRET_PASSWORD = "1717";
const VAULT_PIN = "1717";

let liveMessages = [];
let deletedMessages = [];

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username && password === CHAT_SECRET_PASSWORD) {
        return res.json({ success: true });
    }
    return res.status(400).json({ success: false, message: 'Invalid Password!' });
});

io.on('connection', (socket) => {
    let activeUser = '';

    socket.on('joinRoom', (username) => {
        activeUser = username;
        io.emit('userStatus', { user: activeUser, status: 'Online' });
        socket.emit('initialLiveMessages', liveMessages);
    });

    socket.on('chatMessage', (data) => {
        const msg = {
            id: 'msg_' + Date.now(),
            user: data.user,
            text: data.text || '',
            fileType: data.fileType || null,
            fileData: data.fileData || null,
            replyTo: data.replyTo || null,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            status: 'sent'
        };
        liveMessages.push(msg);
        io.emit('message', msg);
    });

    socket.on('editMessage', (data) => {
        const m = liveMessages.find(item => item.id === data.id);
        if (m && m.user === data.user) {
            m.text = data.newText;
            io.emit('updateMessages', liveMessages);
        }
    });

    socket.on('deleteMessage', (msgId) => {
        liveMessages = liveMessages.filter(item => item.id !== msgId);
        io.emit('updateMessages', liveMessages);
    });

    socket.on('markSeen', (username) => {
        liveMessages.forEach(m => {
            if (m.user !== username) m.status = 'seen';
        });
        io.emit('seenUpdate');
    });

    socket.on('typing', (data) => {
        socket.broadcast.emit('typing', data);
    });

    socket.on('callUser', (data) => {
        socket.broadcast.emit('incomingCall', { from: data.from, signalData: data.signalData, callType: data.callType });
    });

    socket.on('acceptCall', (data) => {
        socket.broadcast.emit('callAccepted', data.signal);
    });

    socket.on('endCallSignal', () => {
        socket.broadcast.emit('callEnded');
    });

    socket.on('moveToDeletedBox', () => {
        if (liveMessages.length > 0) {
            deletedMessages.push(...liveMessages);
            liveMessages = [];
            io.emit('liveChatCleared');
        }
    });

    socket.on('openDeletedBox', (pin) => {
        if (pin === VAULT_PIN) {
            socket.emit('deletedBoxData', deletedMessages);
        } else {
            socket.emit('vaultError', 'Incorrect PIN code!');
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

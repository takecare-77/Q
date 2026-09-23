const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const admin = require('firebase-admin');

// 1. Firebase initialize karein (Render environment variable se)
if (process.env.FIREBASE_CONFIG) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("Firebase Firestore connected successfully!");
    } catch (err) {
        console.error("Firebase init error:", err.message);
    }
}

const db = admin.apps.length ? admin.firestore() : null;

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

// 2. Server restart hone par Firebase se purane messages memory me load karein
async function loadDataFromFirebase() {
    if (!db) return;
    try {
        // Load live messages
        const liveSnapshot = await db.collection('liveMessages').orderBy('createdAt', 'asc').get();
        liveMessages = [];
        liveSnapshot.forEach(doc => {
            liveMessages.push(doc.data());
        });

        // Load vault history
        const vaultSnapshot = await db.collection('vaultHistory').orderBy('createdAt', 'asc').get();
        vaultHistory = [];
        vaultSnapshot.forEach(doc => {
            vaultHistory.push(doc.data());
        });

        console.log(`Loaded ${liveMessages.length} live messages & ${vaultHistory.length} vault records.`);
    } catch (e) {
        console.error("Error loading data from Firebase:", e.message);
    }
}

loadDataFromFirebase();

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

    socket.on('chatMessage', async (data) => {
        const msg = {
            id: 'msg_' + Date.now(),
            user: data.user,
            text: data.text || null,
            fileType: data.fileType || null,
            fileData: data.fileData || null,
            replyTo: data.replyTo || null,
            reaction: null,
            status: 'sent',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            createdAt: Date.now()
        };

        liveMessages.push(msg);
        io.to('room_main').emit('message', msg);

        // Firestore me save karein
        if (db) {
            try {
                await db.collection('liveMessages').doc(msg.id).set(msg);
            } catch (err) {
                console.error("Error saving message to Firestore:", err.message);
            }
        }
    });

    // Handle typing status
    socket.on('typing', (data) => {
        socket.broadcast.to('room_main').emit('displayTyping', data);
    });

    // Handle message seen status
    socket.on('markSeen', async (username) => {
        const updatedIds = [];
        liveMessages.forEach(m => {
            if (m.user !== username && m.status === 'sent') {
                m.status = 'seen';
                updatedIds.push(m.id);
            }
        });
        io.to('room_main').emit('messagesSeen', username);

        // Firestore status update karein
        if (db && updatedIds.length > 0) {
            const batch = db.batch();
            updatedIds.forEach(id => {
                const ref = db.collection('liveMessages').doc(id);
                batch.update(ref, { status: 'seen' });
            });
            batch.commit().catch(err => console.error("Error updating seen status:", err.message));
        }
    });

    socket.on('deleteMessage', async (data) => {
        const index = liveMessages.findIndex(m => m.id === data.id);
        if (index !== -1) {
            const deleted = liveMessages.splice(index, 1)[0];
            vaultHistory.push(deleted);
            io.to('room_main').emit('messageDeleted', data.id);

            // Firestore: liveMessages se hata kar vaultHistory me bhejein
            if (db) {
                try {
                    await db.collection('liveMessages').doc(data.id).delete();
                    await db.collection('vaultHistory').doc(data.id).set(deleted);
                } catch (err) {
                    console.error("Error handling delete in Firestore:", err.message);
                }
            }
        }
    });

    socket.on('editMessage', async (data) => {
        const msg = liveMessages.find(m => m.id === data.id);
        if (msg) {
            msg.text = data.newText;
            io.to('room_main').emit('messageEdited', data);

            if (db) {
                db.collection('liveMessages').doc(data.id).update({ text: data.newText })
                  .catch(err => console.error("Error editing message in Firestore:", err.message));
            }
        }
    });

    socket.on('addReaction', async (data) => {
        const msg = liveMessages.find(m => m.id === data.id);
        if (msg) {
            msg.reaction = data.reaction;
            io.to('room_main').emit('messageReaction', data);

            if (db) {
                db.collection('liveMessages').doc(data.id).update({ reaction: data.reaction })
                  .catch(err => console.error("Error reacting in Firestore:", err.message));
            }
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

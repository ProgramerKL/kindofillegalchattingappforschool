import { supabase } from './Auth.js';

// ===== SECRET CODE & VIEW SWITCHING =====

// Key validation via Supabase access_keys table
const newsView = document.getElementById('news-view');
const chatView = document.getElementById('chat-view');
const regionInput = document.getElementById('region-dropdown');
const dropdownMenu = document.getElementById('dropdown-menu');
const backToNewsBtn = document.getElementById('back-to-news');

// Snackbar popup for early access code
const snackbar = document.getElementById('gc-snackbar');
const sidebarBerman = document.getElementById('sidebar-berman');
const snackbarClose = document.getElementById('gc-snackbar-close');

// Click sidebar item to show snackbar
sidebarBerman.addEventListener('click', (e) => {
    e.preventDefault();
    snackbar.classList.toggle('hidden');
    if (!snackbar.classList.contains('hidden')) {
        regionInput.focus();
    }
});

// Close snackbar
snackbarClose.addEventListener('click', () => {
    snackbar.classList.add('hidden');
    regionInput.value = '';
});

// Check key against Supabase access_keys table
regionInput.addEventListener('input', async () => {
    const val = regionInput.value.trim();
    if (val.length < 3) return;

    const { data, error } = await supabase
        .from('access_keys')
        .select('username')
        .eq('key', val)
        .single();

    if (data && !error) {
        const userKey = val;
        regionInput.value = '';
        snackbar.classList.add('hidden');

        if (data.username) {
            // Already has a nickname
            myNickname = data.username;
            localStorage.setItem('chat_nickname', myNickname);
            enterChat();
        } else {
            // No nickname yet — prompt user to pick one
            promptNickname(async (name) => {
                myNickname = name;
                localStorage.setItem('chat_nickname', name);
                // Save nickname to Supabase
                await supabase
                    .from('access_keys')
                    .update({ username: name })
                    .eq('key', userKey);
                enterChat();
            });
        }
    }
});

// Back to classroom
backToNewsBtn.addEventListener('click', switchToNews);

// Up arrow key navigates to Google Classroom (capture phase so it fires before anything else)
const CLASSROOM_URL = 'https://classroom.google.com';

window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        window.location.href = CLASSROOM_URL;
    }
}, true);

function switchToNews() {
    chatView.classList.add('hidden');
    newsView.classList.remove('hidden');
}

// Auto-hide chat when user switches away from the tab
document.addEventListener('visibilitychange', () => {
    if (document.hidden && !chatView.classList.contains('hidden')) {
        switchToNews();
    }
});

function showChatView() {
    newsView.classList.add('hidden');
    chatView.classList.remove('hidden');
    document.getElementById('chat-input').focus();
}

// ===== NICKNAME =====

let myNickname = localStorage.getItem('chat_nickname') || '';

async function enterChat() {
    showChatView();

    // Load all rooms from Supabase
    const { data: rooms } = await supabase
        .from('rooms')
        .select('*')
        .order('created_at', { ascending: true });

    if (rooms) {
        for (const room of rooms) {
            if (!chatRooms[room.id]) {
                chatRooms[room.id] = { name: room.name, emoji: room.emoji, messages: [] };
            }
        }
    }

    renderChatList();
    joinRoom(activeChat);
}

function promptNickname(callback) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-box">
            <h3>Choose a nickname</h3>
            <input type="text" id="nickname-input" placeholder="Your name..." maxlength="20" autofocus>
            <div class="modal-actions">
                <button class="confirm-btn">Join Chat</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('#nickname-input');
    input.focus();

    const confirm = () => {
        const name = input.value.trim();
        if (!name) return;
        overlay.remove();
        callback(name);
    };

    overlay.querySelector('.confirm-btn').addEventListener('click', confirm);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirm();
    });
}

// ===== FAKE TIMESTAMPS (4:00 PM – 9:00 PM) =====

let lastFakeSeconds = 0; // seconds since 4:00 PM (0 = 4:00 PM, 18000 = 9:00 PM)

function resetFakeTime() {
    lastFakeSeconds = 0;
}

function nextFakeTime() {
    // Add 20–25 seconds per message
    lastFakeSeconds += 20 + Math.floor(Math.random() * 6);

    // If past 9:00 PM (18000 seconds), restart from 4:00 PM
    if (lastFakeSeconds >= 18000) {
        lastFakeSeconds = 0;
    }

    const totalSeconds = lastFakeSeconds;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const hours = 4 + Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}:${minutes.toString().padStart(2, '0')} PM`;
}

// ===== SUPABASE REALTIME =====

let currentChannel = null;

const chatRooms = {
    general: { name: 'General', emoji: '💬', messages: [] }
};
let activeChat = 'general';

function channelName(roomId) {
    return `secret-chat-${roomId}`;
}

async function joinRoom(roomId) {
    // Leave previous channel
    if (currentChannel) {
        currentChannel.unsubscribe();
        currentChannel = null;
    }

    activeChat = roomId;
    if (!chatRooms[roomId]) {
        chatRooms[roomId] = { name: roomId, emoji: '💬', messages: [] };
    }

    // Load saved messages from Supabase
    const { data: savedMsgs } = await supabase
        .from('messages')
        .select('*')
        .eq('room', roomId)
        .order('created_at', { ascending: true });

    if (savedMsgs && savedMsgs.length > 0) {
        resetFakeTime();
        chatRooms[roomId].messages = savedMsgs.map(msg => ({
            text: msg.text,
            sender: msg.sender,
            type: msg.sender === myNickname ? 'sent' : 'received',
            time: nextFakeTime()
        }));
    }

    renderMessages();
    renderChatList();

    // Subscribe to Supabase Realtime channel
    const channel = supabase.channel(channelName(roomId), {
        config: { broadcast: { self: false }, presence: { key: myNickname } }
    });

    // Listen for chat messages
    channel.on('broadcast', { event: 'chat-message' }, (payload) => {
        const msg = payload.payload;
        chatRooms[roomId].messages.push({
            text: msg.text,
            sender: msg.nickname,
            type: 'received',
            time: nextFakeTime()
        });
        renderMessages();
        renderChatList();
    });

    // Listen for presence (who's online)
    channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const count = Object.keys(state).length;
        document.getElementById('presence-count').textContent = `${count} online`;
    });

    channel.on('presence', { event: 'join' }, ({ key }) => {
        if (key !== myNickname) {
            addSystemMessage(roomId, `${key} joined the chat`);
        }
    });

    channel.on('presence', { event: 'leave' }, ({ key }) => {
        addSystemMessage(roomId, `${key} left the chat`);
    });

    channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            await channel.track({ nickname: myNickname });
        }
    });

    currentChannel = channel;
}

function addSystemMessage(roomId, text) {
    if (!chatRooms[roomId]) return;
    chatRooms[roomId].messages.push({
        text: text,
        type: 'system',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    if (roomId === activeChat) renderMessages();
}

// ===== CHAT UI =====

function renderChatList() {
    const chatList = document.getElementById('chat-list');
    chatList.innerHTML = '';

    for (const [id, chat] of Object.entries(chatRooms)) {
        const lastMsg = chat.messages.length > 0
            ? chat.messages[chat.messages.length - 1]
            : null;
        const preview = lastMsg
            ? (lastMsg.type === 'system' ? lastMsg.text : `${lastMsg.sender || 'You'}: ${lastMsg.text}`)
            : 'No messages yet';

        const item = document.createElement('div');
        item.className = `chat-list-item${id === activeChat ? ' active' : ''}`;
        item.dataset.chat = id;
        item.innerHTML = `
            <div class="chat-avatar">${chat.emoji}</div>
            <div class="chat-preview">
                <div class="chat-name">${escapeHtml(chat.name)}</div>
                <div class="chat-last-msg">${escapeHtml(preview)}</div>
            </div>
        `;
        item.addEventListener('click', () => {
            joinRoom(id);
            document.getElementById('chat-main-name').textContent = chat.name;
            document.querySelector('.chat-main-avatar').textContent = chat.emoji;
        });
        chatList.appendChild(item);
    }
}

function renderMessages() {
    const container = document.getElementById('chat-messages');
    const chat = chatRooms[activeChat];

    if (!chat || chat.messages.length === 0) {
        container.innerHTML = `
            <div class="chat-welcome">
                <span class="welcome-icon">🔒</span>
                <h3>Welcome to the secret chat</h3>
                <p>Messages are live. Anyone with the code can join.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '';
    chat.messages.forEach(msg => {
        const div = document.createElement('div');
        if (msg.type === 'system') {
            div.className = 'message system';
            div.innerHTML = `<span class="system-text">${escapeHtml(msg.text)}</span>`;
        } else {
            div.className = `message ${msg.type}`;
            const senderHtml = msg.type === 'received' && msg.sender
                ? `<div class="msg-sender">${escapeHtml(msg.sender)}</div>`
                : '';
            div.innerHTML = `
                ${senderHtml}
                ${escapeHtml(msg.text)}
                <div class="msg-time">${msg.time}</div>
            `;
        }
        container.appendChild(div);
    });

    container.scrollTop = container.scrollHeight;
}

// Send message
function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text || !currentChannel) return;

    const chat = chatRooms[activeChat];
    if (!chat) return;

    const time = nextFakeTime();

    // Add to local messages
    chat.messages.push({
        text: text,
        sender: myNickname,
        type: 'sent',
        time: time
    });

    // Save to Supabase
    supabase.from('messages').insert({
        room: activeChat,
        sender: myNickname,
        text: text
    }).then();

    // Broadcast to others
    currentChannel.send({
        type: 'broadcast',
        event: 'chat-message',
        payload: { nickname: myNickname, text: text, time: time }
    });

    renderMessages();
    renderChatList();
    input.value = '';
    input.focus();
}

document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// New chat room
document.getElementById('new-chat-btn').addEventListener('click', () => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-box">
            <h3>New Chat Room</h3>
            <input type="text" id="new-chat-name" placeholder="Room name..." autofocus>
            <div class="modal-actions">
                <button class="cancel-btn">Cancel</button>
                <button class="confirm-btn">Create</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const nameInput = overlay.querySelector('#new-chat-name');
    nameInput.focus();

    const close = () => overlay.remove();

    overlay.querySelector('.cancel-btn').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });

    const create = async () => {
        const name = nameInput.value.trim();
        if (!name) return;
        const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const emojis = ['💬', '🗨️', '💭', '📩', '✉️', '🔑', '🌙', '⚡'];
        const emoji = emojis[Math.floor(Math.random() * emojis.length)];

        // Save room to Supabase
        await supabase.from('rooms').upsert({ id, name, emoji });

        chatRooms[id] = { name, emoji, messages: [] };
        joinRoom(id);
        document.getElementById('chat-main-name').textContent = name;
        document.querySelector('.chat-main-avatar').textContent = emoji;
        close();
    };

    overlay.querySelector('.confirm-btn').addEventListener('click', create);
    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') create();
    });
});

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initial render
renderChatList();
renderMessages();

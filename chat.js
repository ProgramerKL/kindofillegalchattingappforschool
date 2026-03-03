import { supabase } from './Auth.js';

// ===== SECRET CODE & VIEW SWITCHING =====

const SECRET_CODE = '123abc';
const newsView = document.getElementById('news-view');
const chatView = document.getElementById('chat-view');
const regionInput = document.getElementById('region-dropdown');
const dropdownMenu = document.getElementById('dropdown-menu');
const backToNewsBtn = document.getElementById('back-to-news');

// Show dropdown on focus, hide on blur (with delay for click)
regionInput.addEventListener('focus', () => {
    dropdownMenu.classList.add('open');
});

regionInput.addEventListener('blur', () => {
    setTimeout(() => dropdownMenu.classList.remove('open'), 150);
});

// Check for secret code as user types
regionInput.addEventListener('input', () => {
    const val = regionInput.value.trim();
    if (val === SECRET_CODE) {
        regionInput.value = '';
        dropdownMenu.classList.remove('open');
        enterChat();
    }
});

// Dropdown item click (normal region behavior)
document.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
        regionInput.value = item.textContent;
        dropdownMenu.classList.remove('open');
    });
});

// Back to news
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

function showChatView() {
    newsView.classList.add('hidden');
    chatView.classList.remove('hidden');
    document.getElementById('chat-input').focus();
}

// ===== NICKNAME =====

let myNickname = localStorage.getItem('chat_nickname') || '';

function enterChat() {
    if (myNickname) {
        showChatView();
        joinRoom(activeChat);
    } else {
        promptNickname(() => {
            showChatView();
            joinRoom(activeChat);
        });
    }
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
        myNickname = name;
        localStorage.setItem('chat_nickname', name);
        overlay.remove();
        callback();
    };

    overlay.querySelector('.confirm-btn').addEventListener('click', confirm);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirm();
    });
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

function joinRoom(roomId) {
    // Leave previous channel
    if (currentChannel) {
        currentChannel.unsubscribe();
        currentChannel = null;
    }

    activeChat = roomId;
    if (!chatRooms[roomId]) {
        chatRooms[roomId] = { name: roomId, emoji: '💬', messages: [] };
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
            time: msg.time
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

    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Add to local messages
    chat.messages.push({
        text: text,
        sender: myNickname,
        type: 'sent',
        time: time
    });

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

    const create = () => {
        const name = nameInput.value.trim();
        if (!name) return;
        const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const emojis = ['💬', '🗨️', '💭', '📩', '✉️', '🔑', '🌙', '⚡'];
        const emoji = emojis[Math.floor(Math.random() * emojis.length)];

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

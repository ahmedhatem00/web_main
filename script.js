let SERVER_BASE = '';

async function initServerUrl() {
  // 1. من config.js
  if (window.SERVER_URL && window.SERVER_URL !== 'https://example.loca.lt' && !window.SERVER_URL.includes('example') && window.SERVER_URL.startsWith('http')) {
    SERVER_BASE = window.SERVER_URL.replace(/\/$/, '');
    localStorage.setItem('server_url', SERVER_BASE);
    console.log('✅ رابط من config.js:', SERVER_BASE);
    return SERVER_BASE;
  }
  // 2. من localStorage
  const cached = localStorage.getItem('server_url');
  if (cached && cached.startsWith('http')) {
    SERVER_BASE = cached;
    console.log('✅ رابط من cache:', SERVER_BASE);
    return SERVER_BASE;
  }
  // 3. طلب يدوي من المستخدم
  const manual = prompt('⚠️ لم يتم العثور على رابط السيرفر تلقائياً.\nأدخل الرابط العام الذي يرسله البوت (مثال: https://xxxx.trycloudflare.com):');
  if (manual && manual.startsWith('http')) {
    SERVER_BASE = manual.replace(/\/$/, '');
    localStorage.setItem('server_url', SERVER_BASE);
    location.reload();
    return SERVER_BASE;
  }
  productsDiv.innerHTML = '<div class="loading">❌ لا يمكن الاتصال بالسيرفر. تأكد من تشغيل السيرفر وأعد تحميل الصفحة.</div>';
  return null;
}

const productsDiv = document.getElementById('products');
const chatModal = document.getElementById('chatModal');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendMsgBtn');
const closeChatBtn = document.getElementById('closeChatBtn');
const fileInput = document.getElementById('fileInput');
const clearCookiesBtn = document.getElementById('clearCookiesBtn');

let ws = null;
let currentSessionId = null;
let reconnectAttempts = 0;

function setCookie(name, value, days) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift());
  return null;
}
function deleteCookie(name) { document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`; }
function getOrCreateSessionId() {
  let id = getCookie('support_session');
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substring(2);
    setCookie('support_session', id, 365);
  }
  return id;
}

function connectWebSocket(sessionId) {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;
  const protocol = SERVER_BASE.startsWith('https') ? 'wss:' : 'ws:';
  const host = SERVER_BASE.replace(/^https?:\/\//, '');
  const wsUrl = `${protocol}//${host}/?sessionId=${sessionId}`;
  ws = new WebSocket(wsUrl);
  ws.onopen = () => { reconnectAttempts = 0; addSystemMessage('✅ متصل بالدعم'); };
  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'text') addMessage('support', data.text);
      else if (data.type === 'image') addImageMessage('support', data.url);
    } catch(err) { console.error(err); }
  };
  ws.onclose = () => {
    if (reconnectAttempts < 5) {
      reconnectAttempts++;
      setTimeout(() => connectWebSocket(sessionId), 2000 * reconnectAttempts);
      addSystemMessage(`⚠️ انقطع الاتصال، إعادة المحاولة ${reconnectAttempts}/5`);
    } else addSystemMessage('❌ تعذّر إعادة الاتصال، أعد تحميل الصفحة');
  };
  ws.onerror = () => {};
}

function addMessage(sender, text) {
  const msg = document.createElement('div');
  msg.className = `message ${sender}`;
  msg.innerHTML = `<span class="msg-text">${escapeHtml(text)}</span><span class="msg-time">${new Date().toLocaleTimeString('ar-EG', {hour:'2-digit',minute:'2-digit'})}</span>`;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
function addImageMessage(sender, url) {
  const msg = document.createElement('div');
  msg.className = `message ${sender}`;
  const img = document.createElement('img');
  img.src = url; img.style.maxWidth = '200px'; img.style.cursor = 'pointer';
  img.onclick = () => window.open(url, '_blank');
  msg.appendChild(img);
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
function addSystemMessage(text) {
  const msg = document.createElement('div');
  msg.className = 'message system';
  msg.textContent = text;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
function escapeHtml(str) { return String(str).replace(/[&<>]/g, function(m){if(m==='&')return '&amp;'; if(m==='<')return '&lt;'; if(m==='>')return '&gt;'; return m;}); }

function sendTextMessage(text) {
  if (!ws || ws.readyState !== WebSocket.OPEN) { addSystemMessage('❌ لا يوجد اتصال'); return false; }
  ws.send(JSON.stringify({ type: 'text', text: text.trim().substring(0,2000) }));
  addMessage('user', text.trim());
  return true;
}
async function sendImage(file) {
  if (!ws || ws.readyState !== WebSocket.OPEN) { addSystemMessage('❌ لا يوجد اتصال'); return; }
  if (!file.type.startsWith('image/')) return addSystemMessage('⚠️ يُسمح بالصور فقط');
  if (file.size > 10*1024*1024) return addSystemMessage('⚠️ الصورة كبيرة جداً');
  addSystemMessage('📤 جاري رفع الصورة...');
  const fd = new FormData(); fd.append('image', file);
  try {
    const res = await fetch(`${SERVER_BASE}/api/upload`, { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.url) { ws.send(JSON.stringify({ type: 'image', url: data.url })); addImageMessage('user', data.url); }
    else addSystemMessage('فشل رفع الصورة');
  } catch(err) { addSystemMessage(`❌ خطأ: ${err.message}`); }
}

async function openChat() {
  if (!currentSessionId) {
    if (!confirm('📝 هل توافق على استخدام الكوكيز لتمكين الدردشة؟')) return false;
    currentSessionId = getOrCreateSessionId();
  }
  chatModal.classList.remove('hidden');
  if (!ws || ws.readyState === WebSocket.CLOSED) connectWebSocket(currentSessionId);
  return true;
}

async function loadProducts() {
  if (!SERVER_BASE) { productsDiv.innerHTML = '<div class="loading">⚠️ لم يتم تحديد رابط السيرفر</div>'; return; }
  productsDiv.innerHTML = '<div class="loading">⏳ جاري تحميل المنتجات...</div>';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const [catRes, prodRes] = await Promise.all([
      fetch(`${SERVER_BASE}/api/categories`, { signal: controller.signal }),
      fetch(`${SERVER_BASE}/api/products`, { signal: controller.signal })
    ]);
    clearTimeout(timeout);
    if (!catRes.ok || !prodRes.ok) {
      if (catRes.status === 511 || prodRes.status === 511) throw new Error('HTTP 511: يتطلب المصادقة - تأكد من الرابط العام');
      throw new Error(`HTTP ${catRes.status}`);
    }
    const cats = await catRes.json(), prods = await prodRes.json();
    if (!cats.length) throw new Error('لا توجد فئات');
    let html = '';
    for (const cat of cats) {
      const catProds = prods.filter(p => p.categoryId === cat.id);
      if (!catProds.length) continue;
      html += `<div class="category-section"><h2>${cat.icon||'📦'} ${escapeHtml(cat.name)}</h2><div class="products-grid">`;
      catProds.forEach(p => {
        html += `<div class="product-card"><img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" onerror="this.src='https://via.placeholder.com/150'"><h3>${escapeHtml(p.name)}</h3><div class="price">${p.price}$</div><button class="buy-btn" data-id="${p.id}">شراء</button></div>`;
      });
      html += `</div></div>`;
    }
    productsDiv.innerHTML = html || '<div class="loading">لا توجد منتجات</div>';
    document.querySelectorAll('.buy-btn').forEach(btn => btn.addEventListener('click', () => openChat()));
  } catch(err) {
    let msg = err.message;
    if (msg.includes('511')) msg = '⚠️ فشل التحميل: الرابط العام غير صالح أو يتطلب دخولاً. تأكد من الرابط الذي يرسله البوت.';
    productsDiv.innerHTML = `<div class="loading">⚠️ ${msg}<br><button onclick="location.reload()" style="margin-top:1rem;padding:0.5rem 1rem;background:#fff;border:none;border-radius:2rem">إعادة المحاولة</button></div>`;
  }
}

function handleClearCookies() {
  if (confirm('مسح الكوكيز؟')) { deleteCookie('support_session'); if(ws) ws.close(); currentSessionId=null; location.reload(); }
}

sendBtn.addEventListener('click', () => { const t = chatInput.value.trim(); if(sendTextMessage(t)) chatInput.value=''; });
chatInput.addEventListener('keypress', e => { if(e.key==='Enter') sendBtn.click(); });
closeChatBtn.addEventListener('click', () => chatModal.classList.add('hidden'));
fileInput.addEventListener('change', e => { if(e.target.files[0]) openChat().then(()=>sendImage(e.target.files[0])); fileInput.value=''; });
clearCookiesBtn.addEventListener('click', handleClearCookies);

currentSessionId = getCookie('support_session');
initServerUrl().then(() => loadProducts());
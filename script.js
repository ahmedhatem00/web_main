// قراءة الرابط من config.js (يتم تحديثه تلقائياً)
let SERVER_BASE = 'http://localhost:3000';

if (typeof window.SERVER_URL !== 'undefined' && window.SERVER_URL) {
  SERVER_BASE = window.SERVER_URL;
  console.log('✅ تم تحميل الرابط من config.js:', SERVER_BASE);
} else {
  console.log('⚠️ استخدام الرابط الافتراضي');
  fetch('/api/current-url')
    .then(res => res.json())
    .then(data => {
      if (data.url) {
        SERVER_BASE = data.url;
        console.log('✅ تم تحديث الرابط:', SERVER_BASE);
      }
    })
    .catch(err => console.error('فشل جلب الرابط:', err));
}

// عناصر DOM
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
let categories = [];
let products = [];

// دوال الكوكيز
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

function deleteCookie(name) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}

function getOrCreateSessionId() {
  let id = getCookie('support_session');
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
    setCookie('support_session', id, 365);
  }
  return id;
}

async function askCookieConsent() {
  return confirm('📝 هل توافق على استخدام الكوكيز لتمكين الدردشة مع الدعم؟');
}

// WebSocket
function connectWebSocket(sessionId) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  let serverHost = SERVER_BASE.replace(/^https?:\/\//, '');
  let wsUrl = `${protocol}//${serverHost}/?sessionId=${sessionId}`;
  
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    addSystemMessage('✅ تم الاتصال بالدعم');
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'text') {
        addMessage('support', data.text);
      } else if (data.type === 'image' && data.url) {
        addImageMessage('support', data.url);
      }
    } catch (err) {
      console.error(err);
    }
  };

  ws.onerror = () => {
    addSystemMessage('⚠️ خطأ في الاتصال');
  };

  ws.onclose = () => {
    addSystemMessage('❌ انقطع الاتصال');
  };
}

// دوال الرسائل
function addMessage(sender, text) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${sender}`;
  msgDiv.textContent = text;
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addImageMessage(sender, url) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${sender}`;
  const img = document.createElement('img');
  img.src = url;
  img.style.maxWidth = '200px';
  img.onclick = () => window.open(url, '_blank');
  msgDiv.appendChild(img);
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addSystemMessage(text) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message system';
  msgDiv.textContent = text;
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// إرسال الرسائل
function sendTextMessage(text) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    addSystemMessage('❌ لا يوجد اتصال');
    return false;
  }
  ws.send(JSON.stringify({ type: 'text', text }));
  addMessage('user', text);
  return true;
}

async function sendImage(file) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    addSystemMessage('❌ لا يوجد اتصال');
    return;
  }
  
  const formData = new FormData();
  formData.append('image', file);
  
  try {
    const res = await fetch(`${SERVER_BASE}/api/upload`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.url) {
      ws.send(JSON.stringify({ type: 'image', url: data.url }));
      addImageMessage('user', data.url);
    }
  } catch (err) {
    addSystemMessage('فشل رفع الصورة');
  }
}

// فتح الدردشة
async function openChat() {
  if (!currentSessionId) {
    const ok = await askCookieConsent();
    if (!ok) {
      alert('لا يمكن بدء الدردشة بدون الموافقة');
      return false;
    }
    currentSessionId = getOrCreateSessionId();
  }
  
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    connectWebSocket(currentSessionId);
  }
  
  chatModal.classList.remove('hidden');
  return true;
}

// تحميل المنتجات
async function loadCategoriesAndProducts() {
  try {
    const [catRes, prodRes] = await Promise.all([
      fetch(`${SERVER_BASE}/api/categories`),
      fetch(`${SERVER_BASE}/api/products`)
    ]);
    
    categories = await catRes.json();
    products = await prodRes.json();
    
    let html = '';
    for (const cat of categories) {
      const catProducts = products.filter(p => p.categoryId === cat.id);
      if (catProducts.length === 0) continue;
      
      html += `<div class="category-section"><h2>${cat.icon || '📦'} ${cat.name}</h2><div class="products-grid">`;
      catProducts.forEach(p => {
        html += `
          <div class="product-card">
            <img src="${p.image}" alt="${p.name}">
            <h3>${p.name}</h3>
            <div class="price">${p.price} $</div>
            <button class="buy-btn" data-product-id="${p.id}">شراء</button>
          </div>
        `;
      });
      html += `</div></div>`;
    }
    
    productsDiv.innerHTML = html || '<div class="loading">لا توجد منتجات</div>';
    
    document.querySelectorAll('.buy-btn').forEach(btn => {
      btn.addEventListener('click', async () => await openChat());
    });
  } catch (err) {
    productsDiv.innerHTML = '<div class="loading">⚠️ فشل تحميل المنتجات</div>';
  }
}

// مسح الكوكيز
function handleClearCookies() {
  if (confirm('مسح الكوكيز؟')) {
    deleteCookie('support_session');
    if (ws) ws.close();
    currentSessionId = null;
    location.reload();
  }
}

// ربط الأحداث
sendBtn.addEventListener('click', () => {
  const text = chatInput.value.trim();
  if (text) {
    sendTextMessage(text);
    chatInput.value = '';
  }
});

chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendBtn.click();
});

closeChatBtn.addEventListener('click', () => {
  chatModal.classList.add('hidden');
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files[0]) sendImage(e.target.files[0]);
  fileInput.value = '';
});

clearCookiesBtn.addEventListener('click', handleClearCookies);

// بدء التطبيق
currentSessionId = getCookie('support_session');
loadCategoriesAndProducts();
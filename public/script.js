// ── إعداد الرابط ──────────────────────────────────────────
// الموقع على GitHub Pages والسيرفر على pella.app
// config.js يُحدَّث تلقائياً برابط السيرفر عند كل تشغيل

let SERVER_BASE = '';

function initServerUrl() {
  // 1. أولوية: config.js (يُحدَّث تلقائياً بواسطة السيرفر)
  if (
    typeof window.SERVER_URL !== 'undefined' &&
    window.SERVER_URL &&
    window.SERVER_URL !== 'https://example.loca.lt' &&
    !window.SERVER_URL.includes('example.loca.lt')
  ) {
    SERVER_BASE = window.SERVER_URL.replace(/\/$/, '');
    console.log('✅ رابط السيرفر من config.js:', SERVER_BASE);
    return Promise.resolve(SERVER_BASE);
  }

  // 2. احتياطي: localStorage (لو حُفظ من قبل)
  const cached = localStorage.getItem('server_url');
  if (cached) {
    SERVER_BASE = cached;
    console.log('✅ رابط السيرفر من cache:', SERVER_BASE);
    return Promise.resolve(SERVER_BASE);
  }

  // 3. لا يوجد رابط: أظهر رسالة واضحة
  console.error('❌ لا يوجد رابط سيرفر في config.js');
  return Promise.resolve(null);
}

// ── عناصر DOM ─────────────────────────────────────────────
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
let wsReconnectTimer = null;
let wsReconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// ── دوال الكوكيز ──────────────────────────────────────────
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
    id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).substring(2);
    setCookie('support_session', id, 365);
  }
  return id;
}

// ── WebSocket ──────────────────────────────────────────────
function getWsUrl(sessionId) {
  const base = SERVER_BASE.replace(/^https?:\/\//, '');
  const protocol = SERVER_BASE.startsWith('https') ? 'wss:' : 'ws:';
  return `${protocol}//${base}/?sessionId=${sessionId}`;
}

function connectWebSocket(sessionId) {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;

  const wsUrl = getWsUrl(sessionId);
  console.log('🔌 جاري الاتصال:', wsUrl);

  try {
    ws = new WebSocket(wsUrl);
  } catch (err) {
    addSystemMessage('❌ تعذّر بدء الاتصال');
    return;
  }

  ws.onopen = () => {
    wsReconnectAttempts = 0;
    if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
    addSystemMessage('✅ متصل بالدعم الفني');
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
      console.error('خطأ في تحليل رسالة:', err);
    }
  };

  ws.onerror = () => {};

  ws.onclose = (event) => {
    if (event.code !== 1000 && event.code !== 4000 && wsReconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      wsReconnectAttempts++;
      const delay = Math.min(2000 * wsReconnectAttempts, 15000);
      addSystemMessage(`⚠️ انقطع الاتصال، إعادة المحاولة ${wsReconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}...`);
      wsReconnectTimer = setTimeout(() => connectWebSocket(sessionId), delay);
    } else if (wsReconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      addSystemMessage('❌ تعذّر إعادة الاتصال. أعد تحميل الصفحة.');
    }
  };
}

// ── دوال الرسائل ──────────────────────────────────────────
function escapeHtml(text) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

function addMessage(sender, text) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${sender}`;
  const time = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  msgDiv.innerHTML = `<span class="msg-text">${escapeHtml(text)}</span><span class="msg-time">${time}</span>`;
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addImageMessage(sender, url) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${sender}`;
  const img = document.createElement('img');
  img.src = url;
  img.alt = 'صورة';
  img.loading = 'lazy';
  img.style.cssText = 'max-width:200px;cursor:pointer;border-radius:0.5rem;display:block';
  img.onclick = () => window.open(url, '_blank');
  img.onerror = () => { img.alt = '⚠️ تعذّر تحميل الصورة'; };
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

// ── إرسال الرسائل ─────────────────────────────────────────
function sendTextMessage(text) {
  if (!text.trim()) return false;
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    addSystemMessage('❌ لا يوجد اتصال، جاري إعادة المحاولة...');
    if (currentSessionId) connectWebSocket(currentSessionId);
    return false;
  }
  ws.send(JSON.stringify({ type: 'text', text: text.trim().substring(0, 2000) }));
  addMessage('user', text.trim());
  return true;
}

async function sendImage(file) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    addSystemMessage('❌ لا يوجد اتصال');
    return;
  }
  if (!file.type.startsWith('image/')) {
    addSystemMessage('⚠️ يُسمح بالصور فقط');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    addSystemMessage('⚠️ حجم الصورة يتجاوز 10MB');
    return;
  }
  addSystemMessage('📤 جاري رفع الصورة...');
  const formData = new FormData();
  formData.append('image', file);
  try {
    const res = await fetch(`${SERVER_BASE}/api/upload`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.url) {
      ws.send(JSON.stringify({ type: 'image', url: data.url }));
      addImageMessage('user', data.url);
    }
  } catch (err) {
    addSystemMessage(`❌ فشل رفع الصورة: ${err.message}`);
  }
}

// ── فتح الدردشة ───────────────────────────────────────────
async function openChat() {
  if (!currentSessionId) {
    const ok = confirm('📝 هل توافق على استخدام الكوكيز لتمكين الدردشة مع الدعم الفني؟');
    if (!ok) {
      alert('لا يمكن بدء الدردشة بدون الموافقة على الكوكيز');
      return false;
    }
    currentSessionId = getOrCreateSessionId();
  }
  chatModal.classList.remove('hidden');
  if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
    connectWebSocket(currentSessionId);
  }
  return true;
}

// ── تحميل المنتجات ────────────────────────────────────────
async function loadCategoriesAndProducts() {
  // التحقق من وجود رابط السيرفر أولاً
  if (!SERVER_BASE) {
    productsDiv.innerHTML = `
      <div class="loading">
        ⚠️ لم يتم تحديد رابط السيرفر بعد.<br>
        <small style="opacity:0.7">تأكد من تشغيل السيرفر وتحديث config.js</small>
      </div>`;
    return;
  }

  productsDiv.innerHTML = '<div class="loading">⏳ جاري تحميل المنتجات...</div>';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10 ثانية timeout

    const [catRes, prodRes] = await Promise.all([
      fetch(`${SERVER_BASE}/api/categories`, { signal: controller.signal }),
      fetch(`${SERVER_BASE}/api/products`, { signal: controller.signal })
    ]);
    clearTimeout(timeout);

    if (!catRes.ok || !prodRes.ok) throw new Error(`HTTP Error: ${catRes.status}`);

    const categories = await catRes.json();
    const products = await prodRes.json();

    if (!Array.isArray(categories) || !Array.isArray(products)) {
      throw new Error('بيانات غير صحيحة من السيرفر');
    }

    if (products.length === 0) {
      productsDiv.innerHTML = '<div class="loading">🛍️ لا توجد منتجات حالياً</div>';
      return;
    }

    let html = '';
    for (const cat of categories) {
      const catProducts = products.filter(p => p.categoryId === cat.id);
      if (catProducts.length === 0) continue;

      html += `<div class="category-section">
        <h2>${cat.icon || '📦'} ${escapeHtml(cat.name)}</h2>
        <div class="products-grid">`;

      catProducts.forEach(p => {
        html += `
          <div class="product-card">
            <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy"
              onerror="this.src='https://via.placeholder.com/150?text=لا+صورة'">
            <h3>${escapeHtml(p.name)}</h3>
            <div class="price">${p.price} $</div>
            <button class="buy-btn" data-product-id="${escapeHtml(p.id)}">🛒 شراء</button>
          </div>`;
      });

      html += `</div></div>`;
    }

    productsDiv.innerHTML = html || '<div class="loading">🛍️ لا توجد منتجات</div>';

    document.querySelectorAll('.buy-btn').forEach(btn => {
      btn.addEventListener('click', () => openChat());
    });

  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    productsDiv.innerHTML = `
      <div class="loading">
        ⚠️ ${isTimeout ? 'انتهت مهلة الاتصال بالسيرفر' : 'فشل تحميل المنتجات'}<br>
        <small style="opacity:0.7;display:block;margin:0.5rem 0">
          ${isTimeout ? 'السيرفر لا يستجيب' : err.message}
        </small>
        <button onclick="loadCategoriesAndProducts()"
          style="margin-top:0.75rem;padding:0.4rem 1.2rem;cursor:pointer;border:none;background:#667eea;color:white;border-radius:2rem">
          🔄 إعادة المحاولة
        </button>
      </div>`;
    console.error('خطأ تحميل المنتجات:', err);
  }
}

// ── مسح الكوكيز ───────────────────────────────────────────
function handleClearCookies() {
  if (confirm('هل تريد مسح بيانات الجلسة؟')) {
    deleteCookie('support_session');
    localStorage.removeItem('server_url');
    if (ws) { ws.close(1000, 'User cleared cookies'); ws = null; }
    currentSessionId = null;
    location.reload();
  }
}

// ── ربط الأحداث ───────────────────────────────────────────
sendBtn.addEventListener('click', () => {
  const text = chatInput.value.trim();
  if (sendTextMessage(text)) chatInput.value = '';
});

chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBtn.click(); }
});

closeChatBtn.addEventListener('click', () => chatModal.classList.add('hidden'));

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) openChat().then(opened => { if (opened) sendImage(file); });
  fileInput.value = '';
});

clearCookiesBtn.addEventListener('click', handleClearCookies);

// ── بدء التطبيق ───────────────────────────────────────────
currentSessionId = getCookie('support_session');

// ✅ الإصلاح الجوهري: تحديد الرابط أولاً ثم تحميل المنتجات
initServerUrl().then(() => {
  loadCategoriesAndProducts();
});

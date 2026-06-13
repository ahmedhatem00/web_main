// ========== إعدادات السيرفر ==========
// IMPORTANT: غيّر هذا الرابط إلى الرابط العام الذي سيظهر في البوت بعد تشغيل السيرفر
// أو اتركه كما هو وسيتم تحديثه تلقائياً إذا تم تفعيل النفق
const SERVER_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000'
  : `https://${window.location.hostname}`;

// ========== عناصر DOM ==========
const productsDiv = document.getElementById('products');
const chatModal = document.getElementById('chatModal');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendMsgBtn');
const closeChatBtn = document.getElementById('closeChatBtn');
const fileInput = document.getElementById('fileInput');
const clearCookiesBtn = document.getElementById('clearCookiesBtn');

// ========== المتغيرات العامة ==========
let ws = null;
let currentSessionId = null;
let categories = [];
let products = [];

// ========== دوال الكوكيز ==========
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
    id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
    setCookie('support_session', id, 365);
  }
  return id;
}

// ========== طلب الموافقة على الكوكيز ==========
async function askCookieConsent() {
  return new Promise((resolve) => {
    const consent = confirm('📝 هل توافق على استخدام الكوكيز لتمكين الدردشة مع الدعم؟\n\nسيتم حفظ معرف جلستك لتخصيص المحادثة ولن نشارك بياناتك مع أي طرف ثالث.');
    resolve(consent);
  });
}

// ========== WebSocket ==========
function connectWebSocket(sessionId) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  let serverHost = SERVER_BASE.replace(/^https?:\/\//, '');
  let wsUrl = `${protocol}//${serverHost}/?sessionId=${sessionId}`;
  
  console.log('Connecting to WebSocket:', wsUrl);
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('WebSocket connected');
    addSystemMessage('✅ تم الاتصال بالدعم، يمكنك كتابة رسالتك.');
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'text') {
        addMessage('support', data.text);
      } else if (data.type === 'image' && data.url) {
        addImageMessage('support', data.url);
      } else if (data.type === 'system') {
        addSystemMessage(data.text);
      }
    } catch (err) {
      console.error('Parse error', err);
    }
  };

  ws.onerror = (err) => {
    console.error('WebSocket error', err);
    addSystemMessage('⚠️ خطأ في الاتصال بالدعم، جاري إعادة المحاولة...');
  };

  ws.onclose = () => {
    console.log('WebSocket closed');
    if (!chatModal.classList.contains('hidden')) {
      addSystemMessage('❌ انقطع الاتصال، سيتم إعادة المحاولة تلقائياً خلال 5 ثوانٍ.');
      setTimeout(() => {
        if (ws && ws.readyState === WebSocket.CLOSED) {
          connectWebSocket(currentSessionId);
        }
      }, 5000);
    }
  };
}

// ========== دوال عرض الرسائل ==========
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
  img.alt = 'صورة';
  img.style.maxWidth = '200px';
  img.style.borderRadius = '0.5rem';
  img.style.cursor = 'pointer';
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

// ========== إرسال الرسائل ==========
function sendTextMessage(text) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    addSystemMessage('❌ لا يوجد اتصال بالدعم، جاري إعادة الاتصال...');
    connectWebSocket(currentSessionId);
    setTimeout(() => sendTextMessage(text), 1000);
    return false;
  }
  ws.send(JSON.stringify({ type: 'text', text }));
  addMessage('user', text);
  return true;
}

async function sendImage(file) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    addSystemMessage('❌ لا يوجد اتصال بالدعم.');
    return;
  }
  
  if (file.size > 5 * 1024 * 1024) {
    addSystemMessage('⚠️ الصورة كبيرة جداً (الحد الأقصى 5MB)');
    return;
  }
  
  const formData = new FormData();
  formData.append('image', file);
  
  addSystemMessage('⏳ جاري رفع الصورة...');
  
  try {
    const res = await fetch(`${SERVER_BASE}/api/upload`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.url) {
      ws.send(JSON.stringify({ type: 'image', url: data.url }));
      addImageMessage('user', data.url);
    } else {
      addSystemMessage('فشل رفع الصورة');
    }
  } catch (err) {
    console.error(err);
    addSystemMessage('خطأ في رفع الصورة');
  }
}

// ========== فتح وإغلاق الدردشة ==========
async function openChat() {
  if (!currentSessionId) {
    const ok = await askCookieConsent();
    if (!ok) {
      alert('لا يمكن بدء الدردشة بدون الموافقة على الكوكيز');
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

function closeChat() {
  chatModal.classList.add('hidden');
}

// ========== تحميل وعرض المنتجات والفئات ==========
async function loadCategoriesAndProducts() {
  try {
    const [catRes, prodRes] = await Promise.all([
      fetch(`${SERVER_BASE}/api/categories`),
      fetch(`${SERVER_BASE}/api/products`)
    ]);
    
    if (!catRes.ok || !prodRes.ok) throw new Error('Network response failed');
    
    categories = await catRes.json();
    products = await prodRes.json();
    renderProductsByCategories();
  } catch (err) {
    console.error('Failed to load data:', err);
    productsDiv.innerHTML = '<div class="loading">⚠️ فشل تحميل المنتجات. تأكد من تشغيل السيرفر.</div>';
  }
}

function renderProductsByCategories() {
  if (!categories.length) {
    productsDiv.innerHTML = '<div class="loading">⏳ جاري تحميل الفئات...</div>';
    return;
  }
  
  let html = '';
  for (const cat of categories) {
    const catProducts = products.filter(p => p.categoryId === cat.id);
    if (catProducts.length === 0) continue;
    
    html += `<div class="category-section">`;
    html += `<h2>${cat.icon || '📦'} ${escapeHtml(cat.name)}</h2>`;
    html += `<div class="products-grid">`;
    
    catProducts.forEach(p => {
      html += `
        <div class="product-card" data-product='${escapeHtml(JSON.stringify(p))}'>
          <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" onerror="this.src='https://via.placeholder.com/150?text=No+Image'">
          <h3>${escapeHtml(p.name)}</h3>
          <div class="price">${escapeHtml(p.price)} $</div>
          <button class="buy-btn" data-product-id="${escapeHtml(p.id)}">🛒 شراء</button>
        </div>
      `;
    });
    
    html += `</div></div>`;
  }
  
  if (html === '') {
    html = '<div class="loading">📭 لا توجد منتجات متاحة حالياً.</div>';
  }
  
  productsDiv.innerHTML = html;
  
  // ربط أحداث الأزرار
  document.querySelectorAll('.buy-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await openChat();
    });
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// ========== مسح الكوكيز ==========
function handleClearCookies() {
  if (confirm('⚠️ هل أنت متأكد من مسح الكوكيز؟\n\nسيتم قطع الاتصال بالدعم وسيُطلب منك الموافقة مرة أخرى عند فتح الدردشة.')) {
    deleteCookie('support_session');
    if (ws) {
      ws.close();
      ws = null;
    }
    currentSessionId = null;
    alert('✅ تم مسح الكوكيز. سيتم تحديث الصفحة.');
    location.reload();
  }
}

// ========== ربط الأحداث ==========
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

closeChatBtn.addEventListener('click', closeChat);

fileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) {
    sendImage(e.target.files[0]);
    fileInput.value = '';
  }
});

clearCookiesBtn.addEventListener('click', handleClearCookies);

// منع إغلاق الدردشة عند الضغط خارجها (اختياري)
chatModal.addEventListener('click', (e) => e.stopPropagation());

// ========== بدء التطبيق ==========
currentSessionId = getCookie('support_session');
loadCategoriesAndProducts();

console.log('✅ تم تحميل الموقع بنجاح');
console.log('📡 السيرفر:', SERVER_BASE);
/**
 * IUH Activity Hunter - Client Application Logic
 */

// Audio Synthesizer for alerts
class SoundEffects {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
  }

  playSuccess() {
    try {
      this.init();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880.00, now + 0.15); // A5

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {
      console.warn('Audio alert error:', e);
    }
  }

  playSlotAlert() {
    try {
      this.init();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const now = this.ctx.currentTime;
      [0, 0.18, 0.36].forEach((delay, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(783.99 + idx * 100, now + delay);
        gain.gain.setValueAtTime(0.35, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.15);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + delay);
        osc.stop(now + delay + 0.15);
      });
    } catch (e) {
      console.warn('Audio alert error:', e);
    }
  }
}

const sfx = new SoundEffects();

// State management
let appState = {
  isScannerRunning: false,
  isLoggedIn: false,
  phpsessid: '',
  userMssv: '',
  scanCount: 0,
  registeredCount: 0,
  logs: [],
  activities: []
};

// DOM Elements
const elements = {
  headerStatusDot: document.getElementById('headerStatusDot'),
  scannerStatusPill: document.getElementById('scannerStatusPill'),
  scannerStatusLabel: document.getElementById('scannerStatusLabel'),
  btnToggleScanner: document.getElementById('btnToggleScanner'),
  toggleScannerText: document.getElementById('toggleScannerText'),
  toggleScannerIcon: document.getElementById('toggleScannerIcon'),

  statSession: document.getElementById('statSession'),
  statSessionUser: document.getElementById('statSessionUser'),
  statWebhook: document.getElementById('statWebhook'),
  statWebhookPing: document.getElementById('statWebhookPing'),
  statScanCount: document.getElementById('statScanCount'),
  statScanSpeed: document.getElementById('statScanSpeed'),
  statRegisteredCount: document.getElementById('statRegisteredCount'),

  btnCheckSession: document.getElementById('btnCheckSession'),
  tabLoginBtn: document.getElementById('tabLoginBtn'),
  tabCookieBtn: document.getElementById('tabCookieBtn'),
  tabLogin: document.getElementById('tabLogin'),
  tabCookie: document.getElementById('tabCookie'),

  formLogin: document.getElementById('formLogin'),
  inputMssv: document.getElementById('inputMssv'),
  inputPassword: document.getElementById('inputPassword'),
  inputCaptcha: document.getElementById('inputCaptcha'),
  imgCaptcha: document.getElementById('imgCaptcha'),
  captchaLoader: document.getElementById('captchaLoader'),
  btnRefreshCaptcha: document.getElementById('btnRefreshCaptcha'),
  btnLogin: document.getElementById('btnLogin'),
  btnLoginText: document.getElementById('btnLoginText'),

  inputCookie: document.getElementById('inputCookie'),
  btnSaveCookie: document.getElementById('btnSaveCookie'),

  inputWebhookUrl: document.getElementById('inputWebhookUrl'),
  checkPingEveryone: document.getElementById('checkPingEveryone'),
  checkSoundAlert: document.getElementById('checkSoundAlert'),
  btnTestWebhook: document.getElementById('btnTestWebhook'),
  btnSaveWebhook: document.getElementById('btnSaveWebhook'),

  checkAutoRegister: document.getElementById('checkAutoRegister'),
  rangeInterval: document.getElementById('rangeInterval'),
  lblInterval: document.getElementById('lblInterval'),
  inputTargetUrl: document.getElementById('inputTargetUrl'),
  inputKeywords: document.getElementById('inputKeywords'),
  btnSaveConfig: document.getElementById('btnSaveConfig'),

  btnManualFetch: document.getElementById('btnManualFetch'),
  lblActivitiesCount: document.getElementById('lblActivitiesCount'),
  activitiesContainer: document.getElementById('activitiesContainer'),

  terminalWindow: document.getElementById('terminalWindow'),
  btnClearLogs: document.getElementById('btnClearLogs')
};

// Helpers
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupEventListeners();
  loadInitialConfig();
  fetchCaptcha();
  startPollingLoop();
});

// Tab switcher
function setupTabs() {
  elements.tabLoginBtn.addEventListener('click', () => {
    elements.tabLoginBtn.classList.add('active');
    elements.tabCookieBtn.classList.remove('active');
    elements.tabLogin.style.display = 'block';
    elements.tabCookie.style.display = 'none';
  });

  elements.tabCookieBtn.addEventListener('click', () => {
    elements.tabCookieBtn.classList.add('active');
    elements.tabLoginBtn.classList.remove('active');
    elements.tabLogin.style.display = 'none';
    elements.tabCookie.style.display = 'block';
  });
}

// Fetch Captcha
async function fetchCaptcha() {
  elements.captchaLoader.style.display = 'block';
  elements.imgCaptcha.style.display = 'none';
  try {
    const res = await fetch('/api/captcha');
    const data = await res.json();
    if (data.success && data.captcha_b64) {
      elements.imgCaptcha.src = data.captcha_b64;
      elements.imgCaptcha.onload = () => {
        elements.captchaLoader.style.display = 'none';
        elements.imgCaptcha.style.display = 'block';
      };
      if (data.phpsessid) {
        elements.inputCookie.value = data.phpsessid;
      }
    } else {
      elements.captchaLoader.textContent = 'Lỗi captcha';
    }
  } catch (err) {
    elements.captchaLoader.textContent = 'Mất kết nối';
  }
}

// Load Initial Config
async function loadInitialConfig() {
  try {
    const res = await fetch('/api/config');
    const cfg = await res.json();

    if (cfg.webhook_url) {
      elements.inputWebhookUrl.value = cfg.webhook_url;
      elements.statWebhook.textContent = 'Đã cấu hình';
      elements.statWebhook.style.color = '#38bdf8';
    }
    if (cfg.interval_seconds) {
      elements.rangeInterval.value = cfg.interval_seconds;
      elements.lblInterval.textContent = `${cfg.interval_seconds} giây / lần`;
      elements.statScanSpeed.textContent = `Chu kỳ: ${cfg.interval_seconds}s`;
    }
    if (cfg.target_url) {
      elements.inputTargetUrl.value = cfg.target_url;
    }
    if (typeof cfg.auto_register === 'boolean') {
      elements.checkAutoRegister.checked = cfg.auto_register;
    }
    if (typeof cfg.ping_everyone === 'boolean') {
      elements.checkPingEveryone.checked = cfg.ping_everyone;
    }
    if (cfg.keywords && Array.isArray(cfg.keywords)) {
      elements.inputKeywords.value = cfg.keywords.join(', ');
    }
    if (cfg.phpsessid) {
      elements.inputCookie.value = cfg.phpsessid;
      checkSessionStatus();
    }
  } catch (e) {
    console.error('Error loading config:', e);
  }
}

// Event Listeners
function setupEventListeners() {
  // Captcha refresh
  elements.btnRefreshCaptcha.addEventListener('click', () => {
    fetchCaptcha();
    elements.inputCaptcha.value = '';
    elements.inputCaptcha.focus();
  });

  // Check Session
  elements.btnCheckSession.addEventListener('click', checkSessionStatus);

  // Interval slider
  elements.rangeInterval.addEventListener('input', (e) => {
    const val = e.target.value;
    elements.lblInterval.textContent = `${val} giây / lần`;
    elements.statScanSpeed.textContent = `Chu kỳ: ${val}s`;
  });

  // Login form submit
  elements.formLogin.addEventListener('submit', handleLogin);

  // Save Cookie manually
  elements.btnSaveCookie.addEventListener('click', handleSaveCookie);

  // Discord Test
  elements.btnTestWebhook.addEventListener('click', handleTestWebhook);

  // Save Webhook
  elements.btnSaveWebhook.addEventListener('click', () => {
    saveScannerConfig();
    alert('Đã lưu Discord Webhook!');
  });

  // Save Config
  elements.btnSaveConfig.addEventListener('click', () => {
    saveScannerConfig();
    alert('Đã cập nhật toàn bộ cấu hình Scanner!');
  });

  // Toggle Scanner
  elements.btnToggleScanner.addEventListener('click', toggleScanner);

  // Manual Activities Fetch
  elements.btnManualFetch.addEventListener('click', () => {
    fetchActivitiesList();
  });

  // Clear Logs
  elements.btnClearLogs.addEventListener('click', () => {
    elements.terminalWindow.innerHTML = '<div class="terminal-line text-muted">[SYSTEM] Đã dọn dẹp nhật ký log.</div>';
  });
}

// Handle Login
async function handleLogin() {
  const mssv = elements.inputMssv.value.trim();
  const password = elements.inputPassword.value.trim();
  const security_code = elements.inputCaptcha.value.trim();

  if (!mssv || !password || !security_code) {
    alert('Vui lòng nhập đầy đủ MSSV, Mật khẩu và mã Captcha.');
    return;
  }

  elements.btnLogin.disabled = true;
  elements.btnLoginText.textContent = 'ĐANG ĐĂNG NHẬP...';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mssv, password, security_code })
    });
    const data = await res.json();

    if (data.success) {
      appState.isLoggedIn = true;
      appState.userMssv = mssv;
      updateSessionUI(true, mssv);
      sfx.playSuccess();
      alert(`🎉 Đăng nhập thành công! MSSV: ${mssv}`);
      fetchActivitiesList();
    } else {
      alert(`⚠️ ${data.error || 'Đăng nhập thất bại'}`);
      fetchCaptcha();
      elements.inputCaptcha.value = '';
      elements.inputCaptcha.focus();
    }
  } catch (err) {
    alert('Lỗi kết nối đến server nội bộ.');
  } finally {
    elements.btnLogin.disabled = false;
    elements.btnLoginText.textContent = 'ĐĂNG NHẬP IUH';
  }
}

// Handle Save Cookie
async function handleSaveCookie() {
  const phpsessid = elements.inputCookie.value.trim();
  if (!phpsessid) {
    alert('Vui lòng nhập mã Cookie PHPSESSID.');
    return;
  }

  try {
    const res = await fetch('/api/set-cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phpsessid })
    });
    const data = await res.json();
    if (data.session_status?.logged_in) {
      const u = data.session_status.user_info;
      const userLabel = u?.name ? `${u.name} (${u.mssv})` : 'Cookie hợp lệ';
      updateSessionUI(true, userLabel);
      sfx.playSuccess();
      alert(`✅ Đã lưu cookie! Phiên hợp lệ: ${userLabel}`);
      fetchActivitiesList();
    } else {
      updateSessionUI(false, 'Chưa xác thực');
      alert('⚠️ Cookie chưa hợp lệ hoặc đã hết hạn trên portal IUH.');
    }
  } catch (e) {
    alert('Lỗi khi gửi cookie đến server.');
  }
}

// Check session
async function checkSessionStatus() {
  elements.statSession.textContent = 'Đang kiểm tra...';
  try {
    const res = await fetch('/api/session/check');
    const data = await res.json();
    const u = data.user_info;
    const userLabel = u?.name ? `${u.name} (${u.mssv})` : (u?.mssv || 'Đã xác thực');
    updateSessionUI(data.logged_in, userLabel);
    if (data.logged_in) {
      fetchActivitiesList();
    }
  } catch (e) {
    updateSessionUI(false, 'Mất kết nối');
  }
}

function updateSessionUI(isLoggedIn, mssvText) {
  appState.isLoggedIn = isLoggedIn;
  if (isLoggedIn) {
    elements.statSession.textContent = 'Sẵn sàng 🟢';
    elements.statSession.style.color = '#10b981';
    elements.statSessionUser.textContent = mssvText ? `${mssvText}` : 'Đã kết nối';
    elements.headerStatusDot.classList.add('online');
  } else {
    elements.statSession.textContent = 'Chưa đăng nhập 🔴';
    elements.statSession.style.color = '#f43f5e';
    elements.statSessionUser.textContent = 'Cần đăng nhập';
    elements.headerStatusDot.classList.remove('online');
  }
}

// Handle Test Webhook
async function handleTestWebhook() {
  const webhookUrl = elements.inputWebhookUrl.value.trim();
  if (!webhookUrl) {
    alert('Vui lòng dán link Discord Webhook URL vào ô trước.');
    return;
  }

  elements.btnTestWebhook.disabled = true;
  elements.btnTestWebhook.textContent = '⏳ Đang bắn ping...';

  const startTime = performance.now();
  try {
    const res = await fetch('/api/discord/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhook_url: webhookUrl })
    });
    const elapsed = Math.round(performance.now() - startTime);
    const data = await res.json();

    if (data.success) {
      elements.statWebhook.textContent = 'Kết nối tốt ✅';
      elements.statWebhook.style.color = '#10b981';
      elements.statWebhookPing.textContent = `Ping: ${elapsed} ms`;
      sfx.playSuccess();
      alert(`🎉 Đã gửi ping thành công vào Discord! (${elapsed}ms)\nHãy kiểm tra điện thoại/kênh Discord của bạn.`);
    } else {
      elements.statWebhook.textContent = 'Lỗi Webhook ❌';
      elements.statWebhook.style.color = '#f43f5e';
      alert(`Lỗi Discord: ${data.error}`);
    }
  } catch (e) {
    alert('Lỗi kết nối server.');
  } finally {
    elements.btnTestWebhook.disabled = false;
    elements.btnTestWebhook.textContent = '🚀 Bắn tin thử nghiệm (Test Ping)';
  }
}

// Save Scanner Config
async function saveScannerConfig() {
  const keywordsArr = elements.inputKeywords.value
    .split(',')
    .map(k => k.trim())
    .filter(k => k.length > 0);

  const payload = {
    webhook_url: elements.inputWebhookUrl.value.trim(),
    interval_seconds: parseInt(elements.rangeInterval.value, 10),
    target_url: elements.inputTargetUrl.value.trim(),
    auto_register: elements.checkAutoRegister.checked,
    ping_everyone: elements.checkPingEveryone.checked,
    keywords: keywordsArr
  };

  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.error('Error saving config:', e);
  }
}

// Toggle Scanner Run/Stop
async function toggleScanner() {
  if (appState.isScannerRunning) {
    // Dừng
    try {
      const res = await fetch('/api/scanner/stop', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setScannerRunningState(false);
      }
    } catch (e) {
      console.error(e);
    }
  } else {
    // Bắt đầu
    // Kiểm tra xem đã lưu cấu hình trước khi chạy
    await saveScannerConfig();
    try {
      const res = await fetch('/api/scanner/start', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setScannerRunningState(true);
        sfx.playSuccess();
      }
    } catch (e) {
      console.error(e);
    }
  }
}

function setScannerRunningState(running) {
  appState.isScannerRunning = running;
  if (running) {
    elements.scannerStatusPill.classList.add('active');
    elements.scannerStatusLabel.textContent = 'Đang quét liên tục...';
    elements.btnToggleScanner.classList.remove('btn-primary');
    elements.btnToggleScanner.classList.add('btn-danger');
    elements.toggleScannerIcon.textContent = '⏹';
    elements.toggleScannerText.textContent = 'TẠM DỪNG QUÉT';
  } else {
    elements.scannerStatusPill.classList.remove('active');
    elements.scannerStatusLabel.textContent = 'Đang dừng';
    elements.btnToggleScanner.classList.remove('btn-danger');
    elements.btnToggleScanner.classList.add('btn-primary');
    elements.toggleScannerIcon.textContent = '▶';
    elements.toggleScannerText.textContent = 'BẮT ĐẦU SĂN SLOT';
  }
}

// Fetch Activities List
async function fetchActivitiesList() {
  const targetUrl = elements.inputTargetUrl.value.trim();
  elements.btnManualFetch.disabled = true;
  elements.btnManualFetch.textContent = 'Đang quét...';

  try {
    const res = await fetch(`/api/activities?url=${encodeURIComponent(targetUrl)}`);
    const data = await res.json();

    if (data.success) {
      renderActivities(data.activities || []);
    } else {
      if (data.error && data.error.includes('hết hạn')) {
        updateSessionUI(false);
      }
      elements.activitiesContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <div class="empty-title">Không thể tải hoạt động</div>
          <div class="empty-desc">${escapeHtml(data.error || 'Vui lòng kiểm tra lại đăng nhập')}</div>
        </div>
      `;
    }
  } catch (e) {
    console.error('Fetch error:', e);
  } finally {
    elements.btnManualFetch.disabled = false;
    elements.btnManualFetch.textContent = '⚡ Quét thử ngay';
  }
}

// Render Activities
function renderActivities(activities) {
  elements.lblActivitiesCount.textContent = `${activities.length} hoạt động`;

  if (!activities || activities.length === 0) {
    elements.activitiesContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚡</div>
        <div class="empty-title">Chưa có hoạt động nào đang mở đăng ký</div>
        <div class="empty-desc">Bot đang túc trực quét liên tục 24/7 tại mục <strong>Đăng ký tham gia</strong>. Ngay khi Đoàn trường mở hoạt động mới hoặc có slot trống, bot sẽ lập tức cảnh báo Discord và tự động đăng ký!</div>
      </div>
    `;
    return;
  }

  let hasAvailableSlot = false;

  const html = activities.map(act => {
    const hasSlot = act.has_slot;
    if (hasSlot) hasAvailableSlot = true;

    const badgeClass = hasSlot ? 'badge-success' : 'badge-danger';
    const cardClass = hasSlot ? 'has-slot' : 'no-slot';
    const statusText = hasSlot ? '🟢 CÒN SLOT' : '🔴 HẾT CHỖ';

    return `
      <div class="activity-card ${cardClass}">
        <div class="act-info">
          <div class="act-title">${escapeHtml(act.title)}</div>
          <div class="act-details">
            <span class="act-meta-pill">Slot: <strong>${escapeHtml(act.slot)}</strong></span>
            ${act.details ? `<span class="act-meta-pill">${escapeHtml(act.details.substring(0, 100))}</span>` : ''}
          </div>
        </div>
        <div class="act-actions">
          <span class="badge ${badgeClass}">${statusText}</span>
          <button class="btn ${hasSlot ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="quickRegister('${escapeHtml(act.register_url || '')}', '${escapeHtml(act.id || '')}')">
            ${hasSlot ? '⚡ Đăng ký ngay' : 'Thử đăng ký'}
          </button>
        </div>
      </div>
    `;
  }).join('');

  elements.activitiesContainer.innerHTML = html;

  if (hasAvailableSlot && elements.checkSoundAlert.checked) {
    sfx.playSlotAlert();
  }
}

// Quick Register button click
window.quickRegister = async function(regUrl, actId) {
  if (!confirm(`Bạn có chắc muốn gửi yêu cầu đăng ký hoạt động này ngay lập tức?`)) {
    return;
  }

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ register_url: regUrl, activity_id: actId })
    });
    const data = await res.json();
    if (data.success) {
      sfx.playSuccess();
      alert(`🎉 ${data.message || 'Gửi yêu cầu đăng ký thành công!'}`);
      fetchActivitiesList();
    } else {
      alert(`⚠️ ${data.error || data.message || 'Đăng ký chưa thành công'}`);
    }
  } catch (e) {
    alert('Lỗi kết nối khi gửi đăng ký.');
  }
};

// Polling loop for Real-time Logs and Status updates
async function startPollingLoop() {
  setInterval(async () => {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();

      // Update counters
      elements.statScanCount.textContent = data.scan_count || 0;
      elements.statRegisteredCount.textContent = data.registered_count || 0;

      // Update scanner running sync
      if (data.is_running !== appState.isScannerRunning) {
        setScannerRunningState(data.is_running);
      }

      // Update session status if changed
      if (data.is_logged_in !== appState.isLoggedIn) {
        updateSessionUI(data.is_logged_in, data.user_info?.mssv);
      }

      // Update Realtime Logs
      const logRes = await fetch('/api/logs');
      const logData = await logRes.json();
      updateTerminalLogs(logData.logs || []);
    } catch (e) {
      // Server might be busy or restarting
    }
  }, 1500);
}

// Update Terminal Logs
function updateTerminalLogs(logs) {
  if (!logs || logs.length === 0) return;

  const html = logs.map(l => {
    let levelClass = 'log-level-info';
    if (l.level === 'success') levelClass = 'log-level-success';
    if (l.level === 'danger') levelClass = 'log-level-danger';
    if (l.level === 'warning') levelClass = 'log-level-warning';

    return `
      <div class="terminal-line">
        <span class="log-time">[${escapeHtml(l.time)}]</span>
        <span class="${levelClass}">[${(l.level || 'info').toUpperCase()}]</span>
        <span>${escapeHtml(l.message)}</span>
      </div>
    `;
  }).join('');

  elements.terminalWindow.innerHTML = html;
  elements.terminalWindow.scrollTop = elements.terminalWindow.scrollHeight;
}

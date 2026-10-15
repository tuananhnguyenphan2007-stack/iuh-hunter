/**
 * IUH Activity Hunter - Client Application Logic (Multi-Tenant Web SaaS)
 */

// Session & Device Management for Multi-Tenant Web SaaS
function getSessionId() {
  let sid = localStorage.getItem('iuh_session_id');
  if (!sid) {
    sid = 'sess_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    localStorage.setItem('iuh_session_id', sid);
  }
  document.cookie = `iuh_session_id=${sid}; path=/; max-age=31536000; SameSite=Lax`;
  return sid;
}

function getDeviceId() {
  let did = localStorage.getItem('iuh_device_id');
  if (!did) {
    const raw = [
      navigator.userAgent,
      screen.width + 'x' + screen.height,
      screen.colorDepth,
      navigator.language,
      Math.random()
    ].join('|');
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i);
      hash |= 0;
    }
    const hex1 = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
    const hex2 = Math.floor(Math.random() * 0xFFFFFFFF).toString(16).toUpperCase().padStart(8, '0');
    did = (hex1 + hex2).substring(0, 16);
    localStorage.setItem('iuh_device_id', did);
  }
  document.cookie = `iuh_device_id=${did}; path=/; max-age=31536000; SameSite=Lax`;
  return did;
}

// Global fetch wrapper to isolate each student's session and browser
const originalFetch = window.fetch;
window.fetch = function(url, options = {}) {
  options.headers = options.headers || {};
  if (options.headers instanceof Headers) {
    if (!options.headers.has('X-Session-ID')) options.headers.set('X-Session-ID', getSessionId());
    if (!options.headers.has('X-Device-ID')) options.headers.set('X-Device-ID', getDeviceId());
  } else {
    options.headers['X-Session-ID'] = getSessionId();
    options.headers['X-Device-ID'] = getDeviceId();
  }
  return originalFetch.call(this, url, options);
};

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
  activities: [],
  hasLoadedAdminKeys: false
};

// DOM Elements
const elements = {
  headerStatusDot: document.getElementById('headerStatusDot'),
  licenseStatusPill: document.getElementById('licenseStatusPill'),
  licenseStatusLabel: document.getElementById('licenseStatusLabel'),
  licenseIcon: document.getElementById('licenseIcon'),
  scannerStatusPill: document.getElementById('scannerStatusPill'),
  scannerStatusLabel: document.getElementById('scannerStatusLabel'),
  btnToggleScanner: document.getElementById('btnToggleScanner'),
  toggleScannerText: document.getElementById('toggleScannerText'),
  toggleScannerIcon: document.getElementById('toggleScannerIcon'),

  licenseModal: document.getElementById('licenseModal'),
  btnCloseLicenseModal: document.getElementById('btnCloseLicenseModal'),
  formActivateLicense: document.getElementById('formActivateLicense'),
  inputLicenseKey: document.getElementById('inputLicenseKey'),
  inputLicenseMssv: document.getElementById('inputLicenseMssv'),
  lblHwid: document.getElementById('lblHwid'),
  btnCopyHwid: document.getElementById('btnCopyHwid'),
  lblLicenseState: document.getElementById('lblLicenseState'),
  rowLicenseExpiry: document.getElementById('rowLicenseExpiry'),
  lblLicenseExpiry: document.getElementById('lblLicenseExpiry'),
  rowLicenseMssv: document.getElementById('rowLicenseMssv'),
  lblLicenseMssv: document.getElementById('lblLicenseMssv'),

  statSession: document.getElementById('statSession'),
  statSessionUser: document.getElementById('statSessionUser'),
  statWebhook: document.getElementById('statWebhook'),
  statWebhookPing: document.getElementById('statWebhookPing'),
  statScanCount: document.getElementById('statScanCount'),
  statScanSpeed: document.getElementById('statScanSpeed'),
  statRegisteredCount: document.getElementById('statRegisteredCount'),

  btnCheckSession: document.getElementById('btnCheckSession'),
  btnLogoutSession: document.getElementById('btnLogoutSession'),
  btnResetLicense: document.getElementById('btnResetLicense'),
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
  btnClearLogs: document.getElementById('btnClearLogs'),

  adminPanel: document.getElementById('adminPanel'),
  btnRefreshKeysList: document.getElementById('btnRefreshKeysList'),
  formAdminCreateKey: document.getElementById('formAdminCreateKey'),
  adminCustomerName: document.getElementById('adminCustomerName'),
  adminPlanDays: document.getElementById('adminPlanDays'),
  adminCustomerMssv: document.getElementById('adminCustomerMssv'),
  btnSubmitCreateKey: document.getElementById('btnSubmitCreateKey'),
  adminCreateResult: document.getElementById('adminCreateResult'),
  resKeyName: document.getElementById('resKeyName'),
  resKeyDetails: document.getElementById('resKeyDetails'),
  resKeyMessage: document.getElementById('resKeyMessage'),
  btnCopyCustomerMessage: document.getElementById('btnCopyCustomerMessage'),
  adminKeyCount: document.getElementById('adminKeyCount'),
  tbodyAdminKeys: document.getElementById('tbodyAdminKeys'),

  badgeDiscordStatus: document.getElementById('badgeDiscordStatus'),
  boxFixedDiscordNotice: document.getElementById('boxFixedDiscordNotice'),
  btnJoinDiscordServer: document.getElementById('btnJoinDiscordServer'),
  grpClientWebhookInput: document.getElementById('grpClientWebhookInput'),
  hintWebhookUrl: document.getElementById('hintWebhookUrl'),

  formAdminDiscord: document.getElementById('formAdminDiscord'),
  adminWebhookUrl: document.getElementById('adminWebhookUrl'),
  adminDiscordInviteUrl: document.getElementById('adminDiscordInviteUrl'),
  adminLockDiscordWebhook: document.getElementById('adminLockDiscordWebhook'),
  btnAdminTestDiscord: document.getElementById('btnAdminTestDiscord'),
  btnAdminSaveDiscord: document.getElementById('btnAdminSaveDiscord'),
  adminDiscordStatusBadge: document.getElementById('adminDiscordStatusBadge')
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
  checkLicenseStatus();
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

    if (cfg.lock_discord_webhook) {
      if (elements.boxFixedDiscordNotice) elements.boxFixedDiscordNotice.style.display = 'block';
      if (elements.badgeDiscordStatus) elements.badgeDiscordStatus.style.display = 'inline-block';
      if (elements.inputWebhookUrl) {
        elements.inputWebhookUrl.readOnly = true;
        elements.inputWebhookUrl.value = cfg.webhook_url || '🔒 Discord Server Chung (Đã kết nối)';
      }
      if (elements.btnSaveWebhook) elements.btnSaveWebhook.style.display = 'none';
      if (elements.hintWebhookUrl) {
        elements.hintWebhookUrl.textContent = 'Webhook đã được cố định theo máy chủ Discord của Tool. Bạn không cần tự tạo.';
      }
    } else {
      if (elements.boxFixedDiscordNotice) elements.boxFixedDiscordNotice.style.display = 'none';
      if (elements.badgeDiscordStatus) elements.badgeDiscordStatus.style.display = 'none';
      if (elements.inputWebhookUrl) elements.inputWebhookUrl.readOnly = false;
      if (elements.btnSaveWebhook) elements.btnSaveWebhook.style.display = 'inline-block';
    }

    if (cfg.discord_invite_url && elements.btnJoinDiscordServer) {
      elements.btnJoinDiscordServer.href = cfg.discord_invite_url;
      elements.btnJoinDiscordServer.style.display = 'inline-flex';
    } else if (elements.btnJoinDiscordServer) {
      elements.btnJoinDiscordServer.style.display = 'none';
    }

    // Điền dữ liệu cho Bảng Admin nếu là Admin
    if (cfg.is_admin) {
      if (elements.adminWebhookUrl) elements.adminWebhookUrl.value = cfg.webhook_url || '';
      if (elements.adminDiscordInviteUrl) elements.adminDiscordInviteUrl.value = cfg.discord_invite_url || '';
      if (elements.adminLockDiscordWebhook) elements.adminLockDiscordWebhook.checked = !!cfg.lock_discord_webhook;
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

  if (elements.btnLogoutSession) {
    elements.btnLogoutSession.addEventListener('click', handleLogout);
  }
  if (elements.btnResetLicense) {
    elements.btnResetLicense.addEventListener('click', handleResetLicense);
  }
  if (elements.licenseStatusPill) {
    elements.licenseStatusPill.addEventListener('click', openLicenseModal);
  }
  if (elements.btnCloseLicenseModal) {
    elements.btnCloseLicenseModal.addEventListener('click', closeLicenseModal);
  }
  if (elements.licenseModal) {
    elements.licenseModal.addEventListener('click', (e) => {
      if (e.target === elements.licenseModal) closeLicenseModal();
    });
  }
  if (elements.btnCopyHwid) {
    elements.btnCopyHwid.addEventListener('click', copyHwid);
  }
  if (elements.formActivateLicense) {
    elements.formActivateLicense.addEventListener('submit', handleActivateLicense);
  }
  if (elements.btnRefreshKeysList) {
    elements.btnRefreshKeysList.addEventListener('click', fetchAdminKeysList);
  }
  if (elements.formAdminCreateKey) {
    elements.formAdminCreateKey.addEventListener('submit', handleAdminCreateKey);
  }
  if (elements.btnCopyCustomerMessage) {
    elements.btnCopyCustomerMessage.addEventListener('click', copyCustomerMessage);
  }
  if (elements.btnAdminSaveDiscord) {
    elements.btnAdminSaveDiscord.addEventListener('click', handleAdminSaveDiscord);
  }
  if (elements.btnAdminTestDiscord) {
    elements.btnAdminTestDiscord.addEventListener('click', handleAdminTestDiscord);
  }
}

// License Management
let currentLicense = null;

function openLicenseModal() {
  if (elements.licenseModal) {
    elements.licenseModal.classList.add('active');
    if (elements.inputLicenseMssv) {
      elements.inputLicenseMssv.value = appState.userMssv || (elements.inputMssv ? elements.inputMssv.value.trim() : '');
    }
    if (elements.lblHwid) elements.lblHwid.textContent = getDeviceId();
    checkLicenseStatus();
  }
}

function closeLicenseModal() {
  if (elements.licenseModal) {
    elements.licenseModal.classList.remove('active');
  }
}

function copyHwid() {
  const hwid = elements.lblHwid ? elements.lblHwid.textContent.trim() : getDeviceId();
  if (hwid && hwid !== 'Đang tải...') {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(hwid).then(() => {
        elements.btnCopyHwid.textContent = '✅ Đã copy!';
        setTimeout(() => { if (elements.btnCopyHwid) elements.btnCopyHwid.textContent = '📋 Copy'; }, 2000);
      }).catch(() => {
        prompt('Mã thiết bị (Device ID) của bạn:', hwid);
      });
    } else {
      prompt('Mã thiết bị (Device ID) của bạn:', hwid);
    }
  }
}

async function checkLicenseStatus() {
  try {
    const res = await fetch('/api/license/status');
    const data = await res.json();
    currentLicense = data;
    updateLicenseUI(data);
  } catch (e) {
    console.error('Lỗi kiểm tra license:', e);
  }
}

function updateLicenseUI(lic) {
  if (!lic) return;
  currentLicense = lic;

  if (elements.lblHwid) elements.lblHwid.textContent = lic.hwid || getDeviceId();

  if (lic.is_licensed) {
    if (elements.licenseStatusPill) {
      elements.licenseStatusPill.classList.add('is-active');
      elements.licenseIcon.textContent = '👑';
      elements.licenseStatusLabel.textContent = `PRO (${lic.plan_type || 'Active'})`;
    }
    if (elements.lblLicenseState) {
      elements.lblLicenseState.textContent = '🟢 Bản quyền hợp lệ';
      elements.lblLicenseState.className = 'info-value text-green';
    }
    if (elements.rowLicenseExpiry) {
      elements.rowLicenseExpiry.style.display = 'flex';
      elements.lblLicenseExpiry.textContent = lic.expires_at || 'Vĩnh viễn';
    }
    if (elements.rowLicenseMssv && lic.mssv && lic.mssv !== 'ALL') {
      elements.rowLicenseMssv.style.display = 'flex';
      elements.lblLicenseMssv.textContent = lic.mssv;
    }
    if (elements.btnResetLicense) {
      elements.btnResetLicense.style.display = 'inline-block';
    }

    // Kiểm tra nếu là Admin Master Key -> Mở Bảng Quản Trị VIP
    if (lic.key === 'IUH-ADMIN-VIP-2026') {
      if (elements.adminPanel) {
        elements.adminPanel.style.display = 'block';
        if (!appState.hasLoadedAdminKeys) {
          appState.hasLoadedAdminKeys = true;
          fetchAdminKeysList();
        }
      }
    } else {
      if (elements.adminPanel) elements.adminPanel.style.display = 'none';
    }
  } else {
    if (elements.adminPanel) elements.adminPanel.style.display = 'none';
    if (elements.licenseStatusPill) {
      elements.licenseStatusPill.classList.remove('is-active');
      elements.licenseIcon.textContent = '🔑';
      elements.licenseStatusLabel.textContent = 'Kích hoạt Key';
    }
    if (elements.lblLicenseState) {
      elements.lblLicenseState.textContent = '🔴 Chưa kích hoạt';
      elements.lblLicenseState.className = 'info-value text-danger';
    }
    if (elements.rowLicenseExpiry) elements.rowLicenseExpiry.style.display = 'none';
    if (elements.rowLicenseMssv) elements.rowLicenseMssv.style.display = 'none';
    if (elements.btnResetLicense) elements.btnResetLicense.style.display = 'none';
  }
}

async function handleLogout() {
  if (!confirm('Bạn có chắc muốn đăng xuất tài khoản IUH khỏi phiên làm việc này?')) return;
  try {
    await fetch('/api/logout', { method: 'POST' });
    appState.isLoggedIn = false;
    appState.userMssv = '';
    elements.inputPassword.value = '';
    elements.inputCaptcha.value = '';
    elements.inputCookie.value = '';
    updateSessionUI(false);
    fetchCaptcha();
    alert('Đã đăng xuất tài khoản IUH thành công!');
  } catch (e) {
    console.error(e);
  }
}

async function handleResetLicense() {
  if (!confirm('Bạn có chắc muốn hủy bản quyền trên trình duyệt này để thử nghiệm lại?')) return;
  try {
    await fetch('/api/license/reset', { method: 'POST' });
    await checkLicenseStatus();
    alert('Đã hủy bản quyền của phiên này! Trình duyệt đã trở về trạng thái chưa kích hoạt.');
  } catch (e) {
    console.error(e);
  }
}

async function handleActivateLicense(e) {
  e.preventDefault();
  const key = elements.inputLicenseKey.value.trim().toUpperCase();
  if (!key) return;

  const mssv = (elements.inputLicenseMssv ? elements.inputLicenseMssv.value.trim() : '') ||
               appState.userMssv ||
               (elements.inputMssv ? elements.inputMssv.value.trim() : '');

  if (key !== 'IUH-ADMIN-VIP-2026' && !mssv) {
    alert('Vui lòng nhập Mã số sinh viên (MSSV) để gắn bản quyền với tài khoản của bạn!');
    if (elements.inputLicenseMssv) elements.inputLicenseMssv.focus();
    return;
  }

  const submitBtn = document.getElementById('btnSubmitLicense');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'ĐANG XÁC THỰC...';
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch('/api/license/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: key,
        mssv: mssv,
        hwid: getDeviceId()
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const data = await res.json();
    if (data.success) {
      sfx.playSuccess();
      alert(`🎉 ${data.message || 'Kích hoạt bản quyền thành công!'}`);
      updateLicenseUI(data.license);
      closeLicenseModal();
    } else {
      alert(`⚠️ ${data.error || 'License Key không hợp lệ.'}`);
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      alert('⚠️ Quá thời gian chờ phản hồi (Timeout). Vui lòng thử lại!');
    } else {
      alert('Lỗi kết nối khi gửi yêu cầu kích hoạt Key.');
    }
  } finally {
    clearTimeout(timeoutId);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '⚡ Kích Hoạt Ngay';
    }
  }
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
    if (elements.btnLogoutSession) elements.btnLogoutSession.style.display = 'inline-flex';
  } else {
    elements.statSession.textContent = 'Chưa đăng nhập 🔴';
    elements.statSession.style.color = '#f43f5e';
    elements.statSessionUser.textContent = 'Cần đăng nhập';
    elements.headerStatusDot.classList.remove('online');
    if (elements.btnLogoutSession) elements.btnLogoutSession.style.display = 'none';
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
      } else {
        alert(`⚠️ ${data.error || 'Không thể bắt đầu săn slot.'}`);
        if (data.error && (data.error.includes('bản quyền') || data.error.includes('Key'))) {
          openLicenseModal();
        }
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

      // Update License Status
      if (data.license) {
        updateLicenseUI(data.license);
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

// =========================================================================
// ADMIN VIP MANAGEMENT LOGIC (ĐỒNG BỘ GOOGLE SHEETS)
// =========================================================================

async function fetchAdminKeysList() {
  if (!elements.tbodyAdminKeys) return;
  elements.tbodyAdminKeys.innerHTML = `
    <tr>
      <td colspan="6" class="text-center text-muted" style="padding: 24px;">
        <span class="btn-icon">↻</span> Đang tải danh sách Key từ Google Sheets...
      </td>
    </tr>
  `;

  try {
    const res = await fetch('/api/admin/list-keys');
    const data = await res.json();

    if (!data.success) {
      elements.tbodyAdminKeys.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-danger" style="padding: 20px;">
            ⚠️ Không thể tải danh sách: ${escapeHtml(data.error || 'Lỗi không xác định')}
          </td>
        </tr>
      `;
      return;
    }

    const keys = data.keys || [];
    if (elements.adminKeyCount) elements.adminKeyCount.textContent = keys.length;

    if (keys.length === 0) {
      elements.tbodyAdminKeys.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-muted" style="padding: 24px;">
            Chưa có License Key nào trên Google Sheet. Bạn hãy tạo Key đầu tiên ở cột bên trái!
          </td>
        </tr>
      `;
      return;
    }

    const rows = keys.map(k => {
      const isBanned = (k.status || '').toLowerCase() === 'banned';
      const statusBadge = isBanned
        ? '<span class="badge badge-danger">Đã khóa (Banned)</span>'
        : '<span class="badge badge-success">Đang hoạt động</span>';

      const mssvBadge = k.mssv
        ? `<span class="badge badge-purple font-mono" style="font-size: 0.85rem; font-weight: 700;">${escapeHtml(k.mssv)}</span>`
        : '<span class="badge badge-secondary" style="font-size: 0.75rem; color: #94a3b8;">Chưa gắn MSSV</span>';

      return `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 6px;">
              <code class="font-mono text-accent" style="font-weight: 700; font-size: 0.88rem;">${escapeHtml(k.key)}</code>
              <button class="btn btn-ghost btn-sm" style="padding: 2px 6px; font-size: 0.75rem;" onclick="copyTextToClipboard('${escapeHtml(k.key)}', 'Đã chép mã Key!')" title="Sao chép Key">📋</button>
            </div>
            <div class="text-dim" style="font-size: 0.72rem;">Đa thiết bị</div>
          </td>
          <td>
            <strong>${escapeHtml(k.customer_name || 'Khách hàng')}</strong>
            <div class="text-dim" style="font-size: 0.75rem;">${escapeHtml(k.plan_type || '')}</div>
          </td>
          <td>${mssvBadge}</td>
          <td>
            <span class="font-mono">${escapeHtml(k.expires_at || 'Vĩnh viễn')}</span>
          </td>
          <td>${statusBadge}</td>
          <td>
            <div class="action-btn-group">
              ${isBanned 
                ? `<button class="btn btn-ghost btn-sm text-green" style="font-size: 0.75rem; padding: 3px 8px;" onclick="window.handleAdminKeyAction('unban', '${escapeHtml(k.key)}')">🔓 Mở</button>`
                : `<button class="btn btn-ghost btn-sm text-danger" style="font-size: 0.75rem; padding: 3px 8px;" onclick="window.handleAdminKeyAction('ban', '${escapeHtml(k.key)}')">🔒 Khóa</button>`
              }
              <button class="btn btn-ghost btn-sm" style="font-size: 0.75rem; padding: 3px 8px;" onclick="window.handleAdminKeyExtend('${escapeHtml(k.key)}')">⏳ +Ngày</button>
              <button class="btn btn-ghost btn-sm" style="font-size: 0.75rem; padding: 3px 8px;" onclick="window.handleAdminChangeMssv('${escapeHtml(k.key)}', '${escapeHtml(k.mssv || '')}')" title="Đổi hoặc gỡ MSSV cho khách">🔄 Đổi MSSV</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    elements.tbodyAdminKeys.innerHTML = rows;

  } catch (err) {
    console.error('Lỗi khi fetch danh sách keys:', err);
    elements.tbodyAdminKeys.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-danger" style="padding: 20px;">
          Lỗi kết nối khi gọi Google Sheets.
        </td>
      </tr>
    `;
  }
}

async function handleAdminCreateKey(e) {
  if (e) e.preventDefault();
  const customerName = elements.adminCustomerName.value.trim();
  const days = parseInt(elements.adminPlanDays.value, 10);
  const mssv = elements.adminCustomerMssv.value.trim();

  if (!customerName) {
    alert('Vui lòng nhập tên khách hàng!');
    elements.adminCustomerName.focus();
    return;
  }

  const selectElem = elements.adminPlanDays;
  const planText = selectElem.options[selectElem.selectedIndex].text;

  elements.btnSubmitCreateKey.disabled = true;
  elements.btnSubmitCreateKey.textContent = '⏳ ĐANG GHI VÀO GOOGLE SHEETS...';

  try {
    const res = await fetch('/api/admin/create-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: customerName,
        plan_type: planText,
        days: days,
        mssv: mssv
      })
    });
    const data = await res.json();

    if (data.success) {
      sfx.playSuccess();
      const generatedKey = data.key;
      const expDate = data.expires_at;

      // Hiển thị hộp kết quả
      if (elements.adminCreateResult) {
        elements.adminCreateResult.style.display = 'block';
      }
      if (elements.resKeyName) elements.resKeyName.textContent = generatedKey;
      if (elements.resKeyDetails) {
        elements.resKeyDetails.textContent = `Khách: ${customerName} | Gói: ${planText} | Hạn dùng: ${expDate}`;
      }

      // Tin nhắn gửi khách hàng chuyên nghiệp
      const webUrl = window.location.origin;
      const msg = [
        `🎉 BẢN QUYỀN IUH ACTIVITY HUNTER PRO 🎉`,
        `Xin chào ${customerName},`,
        `Cảm ơn bạn đã đăng ký sử dụng Tool Săn Hoạt Động & Điểm Rèn Luyện IUH!`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `🔑 License Key: ${generatedKey}`,
        `📦 Gói sử dụng: ${planText}`,
        `⏳ Hạn dùng đến: ${expDate}`,
        `👤 MSSV áp dụng: ${mssv ? mssv : 'Tự động gắn theo MSSV của bạn khi kích hoạt lần đầu'}`,
        `📱 Đa thiết bị: Không giới hạn! Bạn có thể dùng trên cả Điện thoại, Laptop, Máy tính cá nhân.`,
        `🌐 Link truy cập Web: ${webUrl}`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `📌 Hướng dẫn kích hoạt:`,
        `1. Mở link Web trên máy tính hoặc điện thoại: ${webUrl}`,
        `2. Bấm vào nút "🔑 Kích hoạt Key" ở góc trên bên phải màn hình.`,
        `3. Nhập mã Key: "${generatedKey}" và MSSV của bạn -> Bấm "Kích Hoạt Ngay".`,
        `Chúc bạn săn được thật nhiều slot hoạt động IUH thành công! 🚀`
      ].join('\n');

      if (elements.resKeyMessage) {
        elements.resKeyMessage.value = msg;
      }

      // Reset form
      elements.adminCustomerName.value = '';
      elements.adminCustomerMssv.value = '';

      // Tự động làm mới danh sách bảng
      fetchAdminKeysList();
    } else {
      alert(`⚠️ Không thể tạo Key: ${data.error || 'Lỗi không xác định'}`);
    }
  } catch (err) {
    alert('Lỗi kết nối khi gửi yêu cầu tạo Key.');
    console.error(err);
  } finally {
    elements.btnSubmitCreateKey.disabled = false;
    elements.btnSubmitCreateKey.textContent = '⚡ TẠO KEY & GHI VÀO GOOGLE SHEETS';
  }
}

function copyCustomerMessage() {
  if (!elements.resKeyMessage) return;
  const text = elements.resKeyMessage.value;
  if (!text) return;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      elements.btnCopyCustomerMessage.textContent = '✅ Đã copy tin nhắn!';
      setTimeout(() => {
        elements.btnCopyCustomerMessage.textContent = '📋 Sao chép tin nhắn gửi cho khách';
      }, 2500);
    }).catch(() => {
      elements.resKeyMessage.select();
      document.execCommand('copy');
      alert('Đã copy tin nhắn gửi khách!');
    });
  } else {
    elements.resKeyMessage.select();
    document.execCommand('copy');
    alert('Đã copy tin nhắn gửi khách!');
  }
}

window.copyTextToClipboard = function(text, successMsg = 'Đã sao chép!') {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      alert(successMsg);
    });
  } else {
    prompt('Sao chép mã:', text);
  }
};

window.handleAdminKeyExtend = async function(key) {
  const input = prompt(`Nhập số ngày muốn gia hạn thêm cho Key "${key}":`, '30');
  if (input === null) return;
  const days = parseInt(input.trim(), 10);
  if (isNaN(days) || days <= 0) {
    alert('Vui lòng nhập số ngày hợp lệ!');
    return;
  }
  await window.handleAdminKeyAction('extend', key, days);
};

window.handleAdminKeyAction = async function(action, key, days = 30) {
  let confirmMsg = '';
  if (action === 'ban') confirmMsg = `Bạn có chắc muốn KHÓA (Ban) License Key "${key}"? Khách sẽ không thể dùng tool nữa!`;
  else if (action === 'unban') confirmMsg = `MỞ KHÓA (Unban) License Key "${key}"?`;
  else if (action === 'reset_device') confirmMsg = `RESET thiết bị cho Key "${key}"? Khách có thể đổi sang đăng nhập trên máy tính / điện thoại mới!`;
  else if (action === 'extend') confirmMsg = `Gia hạn thêm ${days} ngày cho Key "${key}"?`;

  if (confirmMsg && !confirm(confirmMsg)) return;

  try {
    const res = await fetch('/api/admin/action-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action, key: key, days: days })
    });
    const data = await res.json();
    if (data.success) {
      sfx.playSuccess();
      alert(`✅ Thao tác thành công: ${data.message || 'Đã cập nhật trên Google Sheets!'}`);
      fetchAdminKeysList();
    } else {
      alert(`⚠️ Thất bại: ${data.error || 'Có lỗi xảy ra'}`);
    }
  } catch (err) {
    alert('Lỗi kết nối khi gửi thao tác quản trị.');
    console.error(err);
  }
};

window.handleAdminChangeMssv = async function(key, currentMssv) {
  const promptMsg = currentMssv
    ? `Key "${key}" hiện đang gắn cố định với MSSV: ${currentMssv}.\n\nNhập MSSV mới (hoặc để trống nếu muốn gỡ để khách tự kích hoạt lại):`
    : `Nhập MSSV muốn gán cố định cho Key "${key}":`;
  const input = prompt(promptMsg, currentMssv || '');
  if (input === null) return;
  const newMssv = input.trim();

  try {
    const res = await fetch('/api/admin/action-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'change_mssv', key: key, new_mssv: newMssv })
    });
    const data = await res.json();
    if (data.success) {
      sfx.playSuccess();
      alert(`✅ ${data.message || 'Đã cập nhật MSSV thành công!'}`);
      fetchAdminKeysList();
    } else {
      alert(`⚠️ Thất bại: ${data.error || 'Có lỗi xảy ra'}`);
    }
  } catch (err) {
    alert('Lỗi kết nối khi cập nhật MSSV.');
    console.error(err);
  }
};

async function handleAdminSaveDiscord(e) {
  if (e) e.preventDefault();
  const wh = elements.adminWebhookUrl ? elements.adminWebhookUrl.value.trim() : '';
  const invite = elements.adminDiscordInviteUrl ? elements.adminDiscordInviteUrl.value.trim() : '';
  const locked = elements.adminLockDiscordWebhook ? elements.adminLockDiscordWebhook.checked : true;

  if (!wh) {
    alert('Vui lòng nhập Discord Webhook URL cho kênh thông báo server của bạn!');
    if (elements.adminWebhookUrl) elements.adminWebhookUrl.focus();
    return;
  }

  elements.btnAdminSaveDiscord.disabled = true;
  elements.btnAdminSaveDiscord.textContent = '⏳ Đang lưu...';

  try {
    const res = await fetch('/api/admin/discord-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhook_url: wh,
        discord_invite_url: invite,
        lock_discord_webhook: locked
      })
    });
    const data = await res.json();
    if (data.success) {
      sfx.playSuccess();
      alert(`🎉 ${data.message || 'Đã lưu cấu hình Discord Server thành công!'}`);
      loadInitialConfig();
    } else {
      alert(`⚠️ Lỗi: ${data.error || 'Có lỗi xảy ra'}`);
    }
  } catch (err) {
    alert('Lỗi kết nối khi lưu cấu hình Discord.');
  } finally {
    elements.btnAdminSaveDiscord.disabled = false;
    elements.btnAdminSaveDiscord.textContent = '💾 Lưu Cấu Hình Discord Server';
  }
}

async function handleAdminTestDiscord() {
  const wh = elements.adminWebhookUrl ? elements.adminWebhookUrl.value.trim() : '';
  if (!wh) {
    alert('Vui lòng nhập Webhook URL trước khi thử nghiệm!');
    return;
  }
  elements.btnAdminTestDiscord.disabled = true;
  elements.btnAdminTestDiscord.textContent = 'Đang bắn tin...';
  try {
    const res = await fetch('/api/discord/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhook_url: wh, mssv: 'ADMIN TEST' })
    });
    const data = await res.json();
    if (data.success) {
      sfx.playSuccess();
      alert('🎉 Đã bắn tin thử nghiệm lên Discord Server thành công! Hãy kiểm tra kênh chat Discord của bạn.');
    } else {
      alert(`⚠️ Thất bại: ${data.error || 'Lỗi gửi tin'}`);
    }
  } catch (e) {
    alert('Lỗi kết nối server.');
  } finally {
    elements.btnAdminTestDiscord.disabled = false;
    elements.btnAdminTestDiscord.textContent = '🚀 Bắn Tin Thử Lên Server';
  }
}




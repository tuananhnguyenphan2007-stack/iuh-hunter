"""
Session Manager: Quản lý phiên làm việc đa người dùng (Multi-Tenant Web SaaS)
Cho phép nhiều sinh viên cùng truy cập vào website của bạn trên Render,
mỗi người dùng có một phiên hoàn toàn độc lập:
- Tài khoản IUH riêng (MSSV, mật khẩu, captcha, PHPSESSID).
- Webhook Discord riêng để nhận thông báo về điện thoại của từng người.
- Luồng bot quét riêng (ActivityScanner) chạy ngầm 24/7 độc lập.
- License Key riêng (khóa theo MSSV và Browser/Device ID của từng người).
"""

import os
import json
import time
import threading
from typing import Dict, Any, Optional

from iuh_client import IUHClient
from discord_notifier import DiscordNotifier
from scanner import ActivityScanner
from license_manager import LicenseManager

SESSIONS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sessions.json")


class UserSession:
    def __init__(self, session_id: str, device_id: str = "", api_url: str = "", default_webhook_url: str = ""):
        self.session_id = session_id
        self.device_id = device_id
        self.config: Dict[str, Any] = {
            "webhook_url": default_webhook_url,
            "interval_seconds": 3,
            "target_url": "https://doantn.iuh.edu.vn/doanvien.html",
            "auto_register": True,
            "keywords": [],
            "ping_everyone": True,
            "phpsessid": ""
        }
        self.client = IUHClient()
        self.notifier = DiscordNotifier(webhook_url=default_webhook_url)
        self.scanner = ActivityScanner(client=self.client, notifier=self.notifier)
        self.license_mgr = LicenseManager(api_url=api_url, cache_file=None)
        self.created_at = time.time()
        self.last_active = time.time()

    def update_config(self, new_cfg: Dict[str, Any]):
        self.config.update(new_cfg)
        self.scanner.update_config(new_cfg)
        if "webhook_url" in new_cfg:
            self.notifier.set_webhook_url(new_cfg["webhook_url"])
        if "phpsessid" in new_cfg and new_cfg["phpsessid"]:
            self.client.set_session_cookie(new_cfg["phpsessid"])
        self.last_active = time.time()

    def get_status(self) -> Dict[str, Any]:
        st = self.scanner.get_status()
        st["license"] = self.license_mgr.get_license_status(client_hwid=self.device_id)
        st["session_id"] = self.session_id
        st["device_id"] = self.device_id
        return st

    def to_dict(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "device_id": self.device_id,
            "config": self.config,
            "phpsessid": self.client.get_current_phpsessid() or self.config.get("phpsessid", ""),
            "user_info": self.client.user_info,
            "cached_license": self.license_mgr.cached_license,
            "is_running": self.scanner.is_running,
            "created_at": self.created_at,
            "last_active": self.last_active
        }

    def load_from_dict(self, data: Dict[str, Any]):
        self.device_id = data.get("device_id", self.device_id)
        if "config" in data and isinstance(data["config"], dict):
            self.update_config(data["config"])
        phpsessid = data.get("phpsessid") or self.config.get("phpsessid")
        if phpsessid:
            self.client.set_session_cookie(phpsessid)
            if data.get("user_info"):
                self.client.user_info = data["user_info"]
        if "cached_license" in data and isinstance(data["cached_license"], dict):
            self.license_mgr.cached_license = data["cached_license"]
        self.created_at = data.get("created_at", self.created_at)
        self.last_active = data.get("last_active", self.last_active)
        # Nếu phiên trước đó đang chạy scanner và đã đăng nhập, tự động khôi phục chạy tiếp
        if data.get("is_running") and self.client.is_logged_in:
            if self.license_mgr.is_valid_to_run(self.client.user_info.get("mssv", ""), self.device_id):
                self.scanner.start()


class SessionManager:
    def __init__(self, api_url: str = "", default_webhook_url: str = "", discord_invite_url: str = "", lock_discord_webhook: bool = True):
        self.api_url = api_url.strip()
        self.default_webhook_url = default_webhook_url.strip()
        self.discord_invite_url = discord_invite_url.strip()
        self.lock_discord_webhook = lock_discord_webhook
        self.sessions: Dict[str, UserSession] = {}
        self.lock = threading.Lock()
        self.load_sessions()
        self.start_keepalive_worker()

    def set_api_url(self, url: str):
        self.api_url = url.strip()
        with self.lock:
            for s in self.sessions.values():
                s.license_mgr.set_api_url(self.api_url)

    def set_discord_config(self, webhook_url: str, invite_url: str = "", lock_webhook: bool = True):
        with self.lock:
            self.default_webhook_url = webhook_url.strip()
            self.discord_invite_url = invite_url.strip()
            self.lock_discord_webhook = lock_webhook
            if lock_webhook and self.default_webhook_url:
                for s in self.sessions.values():
                    s.config["webhook_url"] = self.default_webhook_url
                    s.notifier.set_webhook_url(self.default_webhook_url)

    def get_or_create(self, session_id: str, device_id: str = "") -> UserSession:
        if not session_id:
            session_id = f"sess_{int(time.time()*1000)}"
        with self.lock:
            if session_id not in self.sessions:
                s = UserSession(
                    session_id=session_id,
                    device_id=device_id,
                    api_url=self.api_url,
                    default_webhook_url=self.default_webhook_url if self.lock_discord_webhook else ""
                )
                self.sessions[session_id] = s
            else:
                s = self.sessions[session_id]
                if device_id and not s.device_id:
                    s.device_id = device_id
                if self.lock_discord_webhook and self.default_webhook_url:
                    s.config["webhook_url"] = self.default_webhook_url
                    s.notifier.set_webhook_url(self.default_webhook_url)
            s.last_active = time.time()
            return s

    def logout(self, session_id: str) -> bool:
        with self.lock:
            if session_id in self.sessions:
                s = self.sessions[session_id]
                s.scanner.stop()
                s.client.phpsessid = None
                s.client.is_logged_in = False
                s.client.user_info = {}
                s.config["phpsessid"] = ""
                self.save_sessions()
                return True
        return False

    def reset_license(self, session_id: str) -> bool:
        with self.lock:
            if session_id in self.sessions:
                s = self.sessions[session_id]
                s.license_mgr.cached_license = {}
                self.save_sessions()
                return True
        return False

    def save_sessions(self):
        with self.lock:
            data = {}
            for sid, s in self.sessions.items():
                # Chỉ lưu những session có tài khoản hoặc có cấu hình webhook hoặc có key bản quyền
                if s.config.get("phpsessid") or s.config.get("webhook_url") or s.license_mgr.cached_license:
                    data[sid] = s.to_dict()
            try:
                with open(SESSIONS_FILE, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
            except Exception as e:
                print(f"Lỗi lưu sessions.json: {e}")

    def load_sessions(self):
        if not os.path.exists(SESSIONS_FILE):
            return
        try:
            with open(SESSIONS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            with self.lock:
                for sid, s_dict in data.items():
                    s = UserSession(session_id=sid, device_id=s_dict.get("device_id", ""), api_url=self.api_url)
                    s.load_from_dict(s_dict)
                    self.sessions[sid] = s
            print(f"Đã khôi phục {len(self.sessions)} phiên người dùng từ sessions.json")
        except Exception as e:
            print(f"Lỗi đọc sessions.json: {e}")

    def start_keepalive_worker(self):
        def worker():
            while True:
                time.sleep(60)
                with self.lock:
                    active_sessions = list(self.sessions.values())
                for s in active_sessions:
                    try:
                        if s.client.get_current_phpsessid():
                            s.client.check_session()
                    except Exception:
                        pass
                # Định kỳ dọn dẹp các session không hoạt động > 7 ngày
                now = time.time()
                with self.lock:
                    stale_ids = [sid for sid, s in self.sessions.items() if now - s.last_active > 7 * 86400 and not s.scanner.is_running]
                    for sid in stale_ids:
                        del self.sessions[sid]
                self.save_sessions()

        t = threading.Thread(target=worker, daemon=True)
        t.start()

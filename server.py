"""
IUH Activity Hunter - Multi-Tenant Web Server
Phục vụ giao diện Web Dashboard và API xử lý săn slot tự động.
Hỗ trợ Multi-Tenant SaaS (Mỗi khách hàng truy cập có phiên riêng biệt:
tài khoản IUH riêng, webhook Discord riêng, bot quét riêng, key bản quyền riêng).
"""

import os
import sys
import json
import time
import re
import mimetypes
from urllib.parse import urlparse, parse_qs
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Dict, Any

from session_manager import SessionManager, SESSIONS_FILE

CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
WEB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")


def load_config() -> Dict[str, Any]:
    default_config = {
        "webhook_url": "",
        "interval_seconds": 3,
        "target_url": "https://doantn.iuh.edu.vn/doanvien.html",
        "auto_register": True,
        "keywords": [],
        "ping_everyone": True,
        "phpsessid": "",
        "license_api_url": ""
    }

    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                default_config.update(saved)
        except Exception as e:
            print(f"Lỗi đọc config.json: {e}")

    # Ghi đè bởi biến môi trường nếu chạy trên Render/Docker
    if os.environ.get("LICENSE_API_URL"):
        default_config["license_api_url"] = os.environ["LICENSE_API_URL"]

    return default_config


def save_config(cfg: Dict[str, Any]):
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Lỗi lưu config.json: {e}")


import ssl
import urllib.request
import urllib.parse


def call_sheets_api(api_url: str, params: Dict[str, Any]) -> Dict[str, Any]:
    if not api_url:
        return {"success": False, "error": "Chưa cấu hình LICENSE_API_URL."}
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    query_str = urllib.parse.urlencode(params)
    sep = "&" if "?" in api_url else "?"
    full_url = f"{api_url}{sep}{query_str}"
    req = urllib.request.Request(full_url, headers={"User-Agent": "Mozilla/5.0 IUH-Hunter-Admin/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=12, context=ctx) as resp:
            data = resp.read().decode("utf-8")
            return json.loads(data)
    except Exception as e:
        return {"success": False, "error": f"Lỗi gọi Google Sheets: {str(e)}"}


# Khởi tạo quản lý phiên đa người dùng
app_config = load_config()
session_mgr = SessionManager(api_url=app_config.get("license_api_url", ""))


def start_discord_bot_thread():
    bot_token = os.environ.get("DISCORD_BOT_TOKEN") or app_config.get("discord_bot_token", "")
    api_url = app_config.get("license_api_url", "")
    if not bot_token:
        print("[DISCORD BOT] Chưa thiết lập biến DISCORD_BOT_TOKEN trên Render. Bỏ qua khởi động Discord Bot.", flush=True)
        return
    try:
        from discord_bot import run_bot
        import threading
        t = threading.Thread(target=run_bot, args=(bot_token, api_url), daemon=True)
        t.start()
        print(f"[DISCORD BOT] Đã khởi động Discord Admin Bot trong luồng ngầm (Token: {bot_token[:10]}...).", flush=True)
    except Exception as e:
        print(f"[DISCORD BOT] Lỗi khởi động Discord Bot: {e}", flush=True)

start_discord_bot_thread()


class RequestHandler(BaseHTTPRequestHandler):
    def send_json(self, data: Any, status: int = 200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Session-ID, X-Device-ID")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Session-ID, X-Device-ID")
        self.end_headers()

    def do_HEAD(self):
        """Hỗ trợ UptimeRobot và các dịch vụ Ping kiểm tra trạng thái bằng phương thức HEAD"""
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

    def get_session_info(self):
        """Trích xuất session_id và device_id của từng người dùng truy cập web"""
        sid = self.headers.get("X-Session-ID", "").strip()
        if not sid:
            cookie_header = self.headers.get("Cookie", "")
            match = re.search(r'iuh_session_id=([^;]+)', cookie_header)
            if match:
                sid = match.group(1).strip()
        if not sid:
            sid = "default_user"

        did = self.headers.get("X-Device-ID", "").strip()
        if not did:
            cookie_header = self.headers.get("Cookie", "")
            match = re.search(r'iuh_device_id=([^;]+)', cookie_header)
            if match:
                did = match.group(1).strip()

        session = session_mgr.get_or_create(session_id=sid, device_id=did)
        return sid, did, session

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path.startswith("/api/"):
            self.handle_api_get(path, parse_qs(parsed.query))
            return

        # Phục vụ Static Files từ thư mục web
        if path == "/" or path == "":
            file_path = os.path.join(WEB_DIR, "index.html")
        else:
            rel_path = path.lstrip("/")
            file_path = os.path.join(WEB_DIR, rel_path)

        if os.path.exists(file_path) and os.path.isfile(file_path):
            mime_type, _ = mimetypes.guess_type(file_path)
            mime_type = mime_type or "application/octet-stream"
            try:
                with open(file_path, "rb") as f:
                    content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", f"{mime_type}; charset=utf-8" if "text" in mime_type or "javascript" in mime_type else mime_type)
                self.send_header("Content-Length", str(len(content)))
                self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
                self.send_header("Pragma", "no-cache")
                self.send_header("Expires", "0")
                self.end_headers()
                self.wfile.write(content)
            except Exception as e:
                self.send_json({"error": str(e)}, 500)
        else:
            self.send_json({"error": "File not found"}, 404)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        content_length = int(self.headers.get("Content-Length", 0))
        body_bytes = self.rfile.read(content_length)
        body = {}
        if body_bytes:
            try:
                body = json.loads(body_bytes.decode("utf-8"))
            except Exception:
                body = {}

        if path.startswith("/api/"):
            self.handle_api_post(path, body)
            return

        self.send_json({"error": "Unknown POST route"}, 404)

    def handle_api_get(self, path: str, query: Dict[str, Any]):
        sid, did, session = self.get_session_info()

        if path == "/api/status":
            self.send_json(session.get_status())

        elif path == "/api/license/status":
            self.send_json(session.license_mgr.get_license_status(client_hwid=did))

        elif path == "/api/captcha":
            res = session.client.get_captcha_base64()
            self.send_json(res)

        elif path == "/api/session/check":
            res = session.client.check_session()
            self.send_json(res)

        elif path == "/api/activities":
            target = query.get("url", [session.config.get("target_url")])[0]
            res = session.client.fetch_activities(target)
            self.send_json(res)

        elif path == "/api/logs":
            self.send_json({"logs": session.scanner.logs})

        elif path == "/api/config":
            cfg_data = dict(session.config)
            cfg_data["license_api_url"] = session_mgr.api_url
            self.send_json(cfg_data)

        elif path == "/api/admin/list-keys":
            lic_stat = session.license_mgr.get_license_status(client_hwid=did)
            if not lic_stat.get("is_licensed") or lic_stat.get("key") != "IUH-ADMIN-VIP-2026":
                self.send_json({"success": False, "error": "Chỉ Admin Master Key mới có quyền truy cập."}, 403)
                return
            res = call_sheets_api(session_mgr.api_url, {"action": "list_keys"})
            self.send_json(res)

        else:
            self.send_json({"error": "API route not found"}, 404)

    def handle_api_post(self, path: str, body: Dict[str, Any]):
        sid, did, session = self.get_session_info()

        if path == "/api/login":
            mssv = body.get("mssv", "")
            password = body.get("password", "")
            security_code = body.get("security_code", "")
            res = session.client.login(mssv, password, security_code)
            if res.get("success"):
                session.scanner.log(f"Đăng nhập thành công tài khoản: {mssv}", "success")
                session.config["phpsessid"] = session.client.get_current_phpsessid() or ""
                session_mgr.save_sessions()
            else:
                session.scanner.log(f"Đăng nhập thất bại: {res.get('error')}", "warning")
            self.send_json(res)

        elif path == "/api/logout":
            session_mgr.logout(sid)
            self.send_json({"success": True, "message": "Đã đăng xuất thành công."})

        elif path == "/api/set-cookie":
            phpsessid = body.get("phpsessid", "")
            session.client.set_session_cookie(phpsessid)
            check = session.client.check_session()
            session.scanner.log(f"Đã cập nhật PHPSESSID: {phpsessid[:10]}...", "info")
            session.config["phpsessid"] = phpsessid
            session_mgr.save_sessions()
            self.send_json({
                "success": True,
                "phpsessid": phpsessid,
                "session_status": check
            })

        elif path == "/api/license/activate":
            key = body.get("key", "")
            mssv = body.get("mssv", "") or session.client.user_info.get("mssv", "")
            client_hwid = body.get("hwid") or did
            res = session.license_mgr.activate_key(key=key, mssv=mssv, client_hwid=client_hwid)
            if res.get("success"):
                session.scanner.log(f"Kích hoạt License thành công! Hạn dùng: {res.get('license', {}).get('expires_at')}", "success")
                session_mgr.save_sessions()
            else:
                session.scanner.log(f"Kích hoạt License thất bại: {res.get('error')}", "warning")
            self.send_json(res)

        elif path == "/api/license/reset":
            session_mgr.reset_license(sid)
            self.send_json({"success": True, "message": "Đã hủy kích hoạt key của phiên này."})

        elif path == "/api/license/config":
            api_url = body.get("api_url", "")
            session_mgr.set_api_url(api_url)
            app_config["license_api_url"] = api_url
            save_config(app_config)
            self.send_json({"success": True, "api_url": api_url})

        elif path == "/api/discord/test":
            webhook_url = body.get("webhook_url")
            if webhook_url:
                session.notifier.set_webhook_url(webhook_url)
                session.config["webhook_url"] = webhook_url
                session_mgr.save_sessions()
            res = session.notifier.send_test_message()
            if res.get("success"):
                session.scanner.log("Đã gửi tin nhắn thử nghiệm Discord thành công!", "success")
            else:
                session.scanner.log(f"Lỗi gửi tin Discord: {res.get('error')}", "danger")
            self.send_json(res)

        elif path == "/api/config":
            session.update_config(body)
            if "license_api_url" in body:
                session_mgr.set_api_url(body["license_api_url"])
                app_config["license_api_url"] = body["license_api_url"]
                save_config(app_config)
            session_mgr.save_sessions()
            self.send_json({"success": True, "config": session.config})

        elif path == "/api/scanner/start":
            current_mssv = session.client.user_info.get("mssv", "")
            if not session.license_mgr.is_valid_to_run(current_mssv, client_hwid=did):
                lic_stat = session.license_mgr.get_license_status(client_hwid=did)
                err_msg = lic_stat.get("error") or "Vui lòng kích hoạt License Key để bắt đầu săn slot!"
                session.scanner.log(f"Bị chặn: {err_msg}", "warning")
                self.send_json({"success": False, "error": err_msg})
                return
            res = session.scanner.start()
            session_mgr.save_sessions()
            self.send_json(res)

        elif path == "/api/scanner/stop":
            res = session.scanner.stop()
            session_mgr.save_sessions()
            self.send_json(res)

        elif path == "/api/register":
            current_mssv = session.client.user_info.get("mssv", "")
            if not session.license_mgr.is_valid_to_run(current_mssv, client_hwid=did):
                self.send_json({"success": False, "error": "Vui lòng kích hoạt License Key để đăng ký hoạt động."})
                return
            reg_url = body.get("register_url")
            act_id = body.get("activity_id")
            session.scanner.log(f"Người dùng gửi yêu cầu đăng ký thủ công cho: {act_id or reg_url}", "info")
            res = session.client.register_activity(register_url=reg_url, activity_id=act_id)
            if res.get("success"):
                session.scanner.log(f"Đăng ký thành công: {res.get('message')}", "success")
            else:
                session.scanner.log(f"Đăng ký thất bại: {res.get('error') or res.get('message')}", "warning")
            self.send_json(res)

        elif path == "/api/admin/create-key":
            lic_stat = session.license_mgr.get_license_status(client_hwid=did)
            if not lic_stat.get("is_licensed") or lic_stat.get("key") != "IUH-ADMIN-VIP-2026":
                self.send_json({"success": False, "error": "Chỉ Admin Master Key mới có quyền tạo Key."}, 403)
                return
            customer_name = body.get("customer_name", "Khách hàng")
            plan_type = body.get("plan_type", "Gói 1 Tháng")
            days = body.get("days", 30)
            mssv = body.get("mssv", "")
            key_name = body.get("key", "")
            res = call_sheets_api(session_mgr.api_url, {
                "action": "create_key",
                "key": key_name,
                "customer_name": customer_name,
                "plan_type": plan_type,
                "days": days,
                "mssv": mssv
            })
            self.send_json(res)

        elif path == "/api/admin/action-key":
            lic_stat = session.license_mgr.get_license_status(client_hwid=did)
            if not lic_stat.get("is_licensed") or lic_stat.get("key") != "IUH-ADMIN-VIP-2026":
                self.send_json({"success": False, "error": "Chỉ Admin Master Key mới có quyền thao tác."}, 403)
                return
            action = body.get("action", "")
            key_target = body.get("key", "")
            days = body.get("days", 30)
            new_mssv = body.get("new_mssv", "")
            res = call_sheets_api(session_mgr.api_url, {
                "action": action,
                "key": key_target,
                "days": days,
                "new_mssv": new_mssv
            })
            self.send_json(res)

        else:
            self.send_json({"error": "Unknown POST route"}, 404)


def run(port: int = 5000):
    server_address = ("", port)
    httpd = HTTPServer(server_address, RequestHandler)
    print(f"============================================================")
    print(f"  ⚡ IUH Activity Hunter - Multi-Tenant Web SaaS Server")
    print(f"  🌐 URL: http://localhost:{port}")
    print(f"  🔐 License System: {'Google Sheets Connected' if session_mgr.api_url else 'Ready'}")
    print(f"============================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nĐang tắt server...")
        session_mgr.save_sessions()
        httpd.server_close()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    run(port=port)

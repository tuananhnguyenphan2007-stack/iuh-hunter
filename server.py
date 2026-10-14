"""
Server: Web API & Static Server phục vụ giao diện quản trị IUH Hunter Bot
Sử dụng thư viện tiêu chuẩn http.server của Python. Không cần Flask/FastAPI/Node.js.
Chạy trực tiếp trên cổng 5000 (http://localhost:5000).
"""

import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

import os
import json
import mimetypes
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from typing import Dict, Any

from iuh_client import IUHClient
from discord_notifier import DiscordNotifier
from scanner import ActivityScanner

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
        "phpsessid": ""
    }
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                default_config.update(data)
        except Exception as e:
            print(f"Không thể đọc config.json: {e}")

    # Ghi đè bằng biến môi trường (Environment Variables) nếu chạy trên Render/Cloud
    if os.environ.get("WEBHOOK_URL"):
        default_config["webhook_url"] = os.environ["WEBHOOK_URL"]
    if os.environ.get("PHPSESSID"):
        default_config["phpsessid"] = os.environ["PHPSESSID"]
    if os.environ.get("INTERVAL_SECONDS"):
        try:
            default_config["interval_seconds"] = int(os.environ["INTERVAL_SECONDS"])
        except ValueError:
            pass

    return default_config


def save_config(cfg: Dict[str, Any]):
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Lỗi lưu config.json: {e}")


# Khởi tạo các singleton
app_config = load_config()
client = IUHClient(phpsessid=app_config.get("phpsessid"))
notifier = DiscordNotifier(webhook_url=app_config.get("webhook_url"))
scanner = ActivityScanner(client=client, notifier=notifier)
scanner.config.update(app_config)


def start_session_keepalive():
    """Luồng ngầm tự động gửi ping làm mới phiên mỗi 60 giây để session không bao giờ bị hủy"""
    def worker():
        while True:
            time.sleep(60)
            try:
                if client.get_current_phpsessid():
                    client.check_session()
            except Exception:
                pass

    t = threading.Thread(target=worker, daemon=True)
    t.start()

start_session_keepalive()



class RequestHandler(BaseHTTPRequestHandler):
    def send_json(self, data: Any, status: int = 200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_HEAD(self):
        """Hỗ trợ UptimeRobot và các dịch vụ Ping kiểm tra trạng thái bằng phương thức HEAD"""
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

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
        if path == "/api/status":
            self.send_json(scanner.get_status())
        elif path == "/api/captcha":
            res = client.get_captcha_base64()
            self.send_json(res)
        elif path == "/api/session/check":
            res = client.check_session()
            self.send_json(res)
        elif path == "/api/activities":
            target = query.get("url", [scanner.config.get("target_url")])[0]
            res = client.fetch_activities(target)
            self.send_json(res)
        elif path == "/api/logs":
            self.send_json({"logs": scanner.logs})
        elif path == "/api/config":
            self.send_json(scanner.config)
        else:
            self.send_json({"error": "API route not found"}, 404)

    def handle_api_post(self, path: str, body: Dict[str, Any]):
        if path == "/api/login":
            mssv = body.get("mssv", "")
            password = body.get("password", "")
            security_code = body.get("security_code", "")
            res = client.login(mssv, password, security_code)
            if res.get("success"):
                scanner.log(f"Đăng nhập thành công tài khoản: {mssv}", "success")
                app_config["phpsessid"] = client.get_current_phpsessid() or ""
                save_config(app_config)
            else:
                scanner.log(f"Đăng nhập thất bại: {res.get('error')}", "warning")
            self.send_json(res)

        elif path == "/api/set-cookie":
            phpsessid = body.get("phpsessid", "")
            client.set_session_cookie(phpsessid)
            check = client.check_session()
            scanner.log(f"Đã cập nhật PHPSESSID: {phpsessid[:10]}...", "info")
            app_config["phpsessid"] = phpsessid
            save_config(app_config)
            self.send_json({
                "success": True,
                "phpsessid": phpsessid,
                "session_status": check
            })

        elif path == "/api/discord/test":
            webhook_url = body.get("webhook_url")
            if webhook_url:
                notifier.set_webhook_url(webhook_url)
                app_config["webhook_url"] = webhook_url
                save_config(app_config)
            res = notifier.send_test_message()
            if res.get("success"):
                scanner.log("Đã gửi tin nhắn thử nghiệm Discord thành công!", "success")
            else:
                scanner.log(f"Lỗi gửi tin Discord: {res.get('error')}", "danger")
            self.send_json(res)

        elif path == "/api/config":
            scanner.update_config(body)
            app_config.update(scanner.config)
            save_config(app_config)
            self.send_json({"success": True, "config": scanner.config})

        elif path == "/api/scanner/start":
            res = scanner.start()
            self.send_json(res)

        elif path == "/api/scanner/stop":
            res = scanner.stop()
            self.send_json(res)

        elif path == "/api/register":
            reg_url = body.get("register_url")
            act_id = body.get("activity_id")
            scanner.log(f"Người dùng gửi yêu cầu đăng ký thủ công cho: {act_id or reg_url}", "info")
            res = client.register_activity(register_url=reg_url, activity_id=act_id)
            if res.get("success"):
                scanner.log(f"Đăng ký thành công: {res.get('message')}", "success")
            else:
                scanner.log(f"Đăng ký thất bại: {res.get('error') or res.get('message')}", "warning")
            self.send_json(res)

        else:
            self.send_json({"error": "API route not found"}, 404)


import webbrowser
import threading


def run_server(initial_port: int = 5000):
    env_port = os.environ.get("PORT")
    if env_port:
        try:
            initial_port = int(env_port)
            ports_to_try = [initial_port]
        except ValueError:
            ports_to_try = [initial_port, 5001, 5002, 8080, 8888]
    else:
        ports_to_try = [initial_port, 5001, 5002, 8080, 8888]

    httpd = None
    actual_port = initial_port

    for p in ports_to_try:
        try:
            server_address = ('0.0.0.0', p)
            httpd = HTTPServer(server_address, RequestHandler)
            actual_port = p
            break
        except OSError as e:
            if p == ports_to_try[-1]:
                print(f"[LỖI] Không thể mở cổng nào trong danh sách: {ports_to_try}. Chi tiết: {e}")
                return
            continue

    local_ip = '127.0.0.1'
    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        pass

    url = f"http://127.0.0.1:{actual_port}"
    lan_url = f"http://{local_ip}:{actual_port}"

    print("=" * 65)
    print("🚀 IUH ACTIVITY HUNTER - WEB DASHBOARD SERVER ĐÃ SẴN SÀNG!")
    print("=" * 65)
    print(f"👉 Máy của bạn:              {url}")
    print(f"👉 Bạn bè chung mạng Wi-Fi:   {lan_url}")
    print(f"👉 Cổng hoạt động IUH:       https://doantn.iuh.edu.vn")
    print("👉 Nhấn Ctrl + C để dừng server.")
    print("=" * 65)

    # Tự động mở trình duyệt sau khi server đã lắng nghe ổn định
    def open_browser():
        try:
            webbrowser.open(url)
        except Exception:
            pass

    threading.Timer(0.8, open_browser).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nĐang dừng server...")
        scanner.stop()
        httpd.server_close()
        print("Đã tắt server.")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    run_server(port)


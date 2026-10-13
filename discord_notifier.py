"""
Discord Notifier: Module gửi thông báo tức thì qua Discord Webhook
Sử dụng thư viện tiêu chuẩn Python (urllib.request, json).
Gửi Rich Embed đẹp mắt với màu sắc trực quan và âm thanh thông báo Discord.
"""

import urllib.request
import urllib.parse
import json
import ssl
import time
from typing import Dict, Any, Optional, List


class DiscordNotifier:
    def __init__(self, webhook_url: Optional[str] = None):
        self.webhook_url = webhook_url.strip() if webhook_url else ""
        self.ssl_context = ssl.create_default_context()
        self.ssl_context.check_hostname = False
        self.ssl_context.verify_mode = ssl.CERT_NONE

    def set_webhook_url(self, webhook_url: str):
        self.webhook_url = webhook_url.strip()

    def _get_target_urls(self) -> List[str]:
        if not self.webhook_url:
            return []
        urls = [self.webhook_url]
        # Nếu đang dùng domain gốc của Discord, chuẩn bị sẵn proxy fallback
        # Giải quyết triệt để lỗi HTTP 429 "global rate limits" do dải IP của Render/Cloud bị Discord chặn
        if "discord.com" in self.webhook_url:
            proxy_url = self.webhook_url.replace("discord.com", "webhook.lewisakura.moe")
            urls.append(proxy_url)
        elif "discordapp.com" in self.webhook_url:
            proxy_url = self.webhook_url.replace("discordapp.com", "webhook.lewisakura.moe")
            urls.append(proxy_url)
        return urls

    def send_raw(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Gửi raw JSON payload đến Discord Webhook với tự động dự phòng proxy khi gặp lỗi 429"""
        if not self.webhook_url:
            return {"success": False, "error": "Chưa cấu hình Discord Webhook URL."}

        target_urls = self._get_target_urls()
        last_error = ""

        for target_url in target_urls:
            try:
                data = json.dumps(payload).encode("utf-8")
                req = urllib.request.Request(
                    target_url,
                    data=data,
                    headers={
                        "Content-Type": "application/json",
                        "User-Agent": "IUH-Activity-Bot/1.0"
                    },
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=10, context=self.ssl_context) as resp:
                    if resp.status in [200, 204]:
                        return {
                            "success": True,
                            "status_code": resp.status
                        }
            except urllib.error.HTTPError as e:
                err_msg = e.read().decode('utf-8', errors='ignore') if hasattr(e, 'read') else str(e)
                last_error = f"Lỗi Discord HTTP {e.code}: {err_msg}"
                # Nếu dính lỗi 429 (Cloudflare rate limit trên Render), thử tiếp proxy dự phòng
                if e.code == 429:
                    continue
            except Exception as e:
                last_error = f"Lỗi kết nối Discord: {str(e)}"
                continue

        return {"success": False, "error": last_error}

    def send_test_message(self) -> Dict[str, Any]:
        """Gửi thông báo thử nghiệm kết nối Webhook"""
        payload = {
            "username": "IUH Activity Hunter",
            "avatar_url": "https://doantn.iuh.edu.vn/templates/images/logo.png",
            "content": "🔔 **[TEST THÔNG BÁO]** Bot săn hoạt động IUH đã kết nối thành công!",
            "embeds": [
                {
                    "title": "✅ Kết nối Discord Webhook thành công",
                    "description": "Hệ thống sẵn sàng nhận thông báo slot hoạt động Đoàn - Hội IUH tức thì.",
                    "color": 3447003, # Blue
                    "fields": [
                        {"name": "Trạng thái", "value": "🟢 Online & Sẵn sàng", "inline": True},
                        {"name": "Thời gian", "value": time.strftime("%H:%M:%S %d/%m/%Y"), "inline": True}
                    ],
                    "footer": {
                        "text": "IUH Activity Hunter Bot • Phát triển dành riêng cho sinh viên IUH"
                    }
                }
            ]
        }
        return self.send_raw(payload)

    def send_slot_detected(self, activity_title: str, slot_info: str, register_url: Optional[str] = None, auto_registered: bool = False, register_result: Optional[str] = None, ping_everyone: bool = True) -> Dict[str, Any]:
        """
        Bắn thông báo khẩn cấp khi phát hiện hoạt động mới hoặc còn slot.
        """
        title = "🎉 ĐÃ TỰ ĐỘNG ĐĂNG KÝ THÀNH CÔNG!" if auto_registered else "🔥 CÓ SLOT HOẠT ĐỘNG MỚI - ĐĂNG KÝ NGAY!"
        color = 3066993 if auto_registered else 15964690 # Green or Orange

        content = "@everyone ⚡ **CÓ HOẠT ĐỘNG MỚI CÒN SLOT!**" if ping_everyone else "⚡ **CÓ HOẠT ĐỘNG MỚI CÒN SLOT!**"

        fields = [
            {"name": "📌 Tên hoạt động", "value": f"**{activity_title}**", "inline": False},
            {"name": "🎯 Tình trạng slot", "value": f"`{slot_info}`", "inline": True},
            {"name": "⏰ Thời gian quét", "value": time.strftime("%H:%M:%S %d/%m/%Y"), "inline": True}
        ]

        if auto_registered and register_result:
            fields.append({"name": "🤖 Kết quả Auto-Register", "value": f"✅ {register_result}", "inline": False})
        
        if register_url:
            fields.append({"name": "🔗 Link trực tiếp", "value": f"[Bấm vào đây để vào portal]({register_url})", "inline": False})
        else:
            fields.append({"name": "🔗 Link cổng Đoàn", "value": "[Cổng doantn.iuh.edu.vn](https://doantn.iuh.edu.vn/home.html)", "inline": False})

        payload = {
            "username": "IUH Activity Hunter",
            "avatar_url": "https://doantn.iuh.edu.vn/templates/images/logo.png",
            "content": content,
            "embeds": [
                {
                    "title": title,
                    "description": "Hoạt động Đoàn - Hội IUH vừa xuất hiện chỗ trống!",
                    "color": color,
                    "fields": fields,
                    "footer": {
                        "text": "IUH Activity Hunter Bot • Thông báo tức thì"
                    }
                }
            ]
        }
        return self.send_raw(payload)

    def send_session_expired_alert(self) -> Dict[str, Any]:
        """Cảnh báo khi Cookie/Session IUH hết hạn cần đăng nhập lại"""
        payload = {
            "username": "IUH Activity Hunter",
            "avatar_url": "https://doantn.iuh.edu.vn/templates/images/logo.png",
            "content": "⚠️ **CẢNH BÁO: PHIÊN ĐĂNG NHẬP IUH ĐÃ HẾT HẠN!**",
            "embeds": [
                {
                    "title": "❌ Cần gia hạn phiên đăng nhập",
                    "description": "Cookie hoặc phiên làm việc trên `doantn.iuh.edu.vn` đã hết hạn. Bot không thể quét hoặc auto-register nếu chưa có phiên hợp lệ.",
                    "color": 15158332, # Red
                    "fields": [
                        {"name": "Cách xử lý", "value": "Mở Dashboard của Tool tại máy tính để đăng nhập lại hoặc dán PHPSESSID mới.", "inline": False}
                    ],
                    "footer": {
                        "text": "IUH Activity Hunter Bot"
                    }
                }
            ]
        }
        return self.send_raw(payload)

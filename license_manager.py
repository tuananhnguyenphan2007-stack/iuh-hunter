"""
License Manager: Quản lý bản quyền, kiểm tra License Key và chống chia sẻ tool lậu.
Tích hợp Google Sheets (thông qua Google Apps Script Web App) để quản trị key từ xa.
Hỗ trợ khóa theo MSSV, khóa theo Mã máy (HWID) và kiểm tra hạn sử dụng.
"""

import os
import sys
import json
import time
import hashlib
import subprocess
import urllib.request
import urllib.parse
import ssl
from typing import Dict, Any, Optional

LICENSE_CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "license.json")

# URL Google Apps Script Web App mặc định (người quản trị cấu hình vào config.json hoặc biến môi trường)
DEFAULT_APPS_SCRIPT_URL = ""


class LicenseManager:
    def __init__(self, api_url: Optional[str] = None, cache_file: Optional[str] = LICENSE_CACHE_FILE):
        self.api_url = (api_url or "").strip()
        self.cache_file = cache_file
        self.cached_license: Dict[str, Any] = {}
        self.ssl_context = ssl.create_default_context()
        self.ssl_context.check_hostname = False
        self.ssl_context.verify_mode = ssl.CERT_NONE
        if self.cache_file:
            self._load_cached_license()

    @staticmethod
    def get_hardware_id() -> str:
        """
        Lấy mã phần cứng duy nhất (HWID) của máy tính khách hàng.
        Kết hợp UUID mainboard/CPU để chống copy tool sang máy khác.
        """
        hw_raw = ""
        try:
            if sys.platform.startswith("win"):
                # Lấy UUID máy tính Windows qua wmic / powershell
                cmd = 'powershell -NoProfile -Command "(Get-CimInstance -Class Win32_ComputerSystemProduct).UUID"'
                output = subprocess.check_output(cmd, shell=True, timeout=3).decode().strip()
                if output and len(output) > 10:
                    hw_raw = output
            elif sys.platform.startswith("linux"):
                if os.path.exists("/etc/machine-id"):
                    with open("/etc/machine-id", "r") as f:
                        hw_raw = f.read().strip()
        except Exception:
            pass

        if not hw_raw:
            # Fallback nếu không đọc được UUID: dùng thông tin môi trường máy
            import platform
            hw_raw = f"{platform.node()}_{platform.processor()}_{os.environ.get('USERNAME', 'user')}"

        # Băm SHA256 lấy 16 ký tự viết hoa dễ nhìn
        return hashlib.sha256(hw_raw.encode("utf-8")).hexdigest()[:16].upper()

    def set_api_url(self, url: str):
        self.api_url = url.strip()

    def _load_cached_license(self):
        """Đọc thông tin bản quyền đã lưu trên máy"""
        if self.cache_file and os.path.exists(self.cache_file):
            try:
                with open(self.cache_file, "r", encoding="utf-8") as f:
                    self.cached_license = json.load(f)
            except Exception:
                self.cached_license = {}

    def _save_cached_license(self, data: Dict[str, Any]):
        """Lưu bản quyền vào file để không cần gọi mạng mỗi giây"""
        self.cached_license = data
        if self.cache_file:
            try:
                with open(self.cache_file, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
            except Exception as e:
                print(f"Lỗi lưu license file: {e}")

    def activate_key(self, key: str, mssv: str = "", client_hwid: str = "") -> Dict[str, Any]:
        """
        Kích hoạt License Key gửi lên Google Sheets API.
        """
        key = key.strip().upper()
        if not key:
            return {"success": False, "error": "Vui lòng nhập License Key."}

        hwid = client_hwid.strip().upper() if client_hwid else self.get_hardware_id()

        # 1. Master Developer Key dành cho bạn (Admin/Chủ tool): Luôn kích hoạt thành công ngay lập tức
        if key == "IUH-ADMIN-VIP-2026" or key.startswith("IUH-DEV-"):
            lic_data = {
                "is_licensed": True,
                "key": key,
                "hwid": hwid,
                "mssv": mssv or "ALL",
                "customer_name": "Admin Master",
                "type": "Admin Master Key",
                "expires_at": "2099-12-31",
                "activated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "last_verified": time.time()
            }
            self._save_cached_license(lic_data)
            return {
                "success": True,
                "message": "Kích hoạt Master Key thành công (Vĩnh viễn)!",
                "license": lic_data
            }

        # 2. Key của khách hàng: Yêu cầu đã cấu hình Google Apps Script URL
        if not self.api_url:
            return {
                "success": False,
                "error": "Chưa cấu hình URL hệ thống License Server (Google Apps Script). Vui lòng cấu hình LICENSE_API_URL."
            }

        try:
            params = urllib.parse.urlencode({
                "action": "activate",
                "key": key,
                "mssv": mssv.strip(),
                "hwid": hwid
            })
            sep = "&" if "?" in self.api_url else "?"
            req_url = f"{self.api_url}{sep}{params}"
            req = urllib.request.Request(
                req_url,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) IUH-Hunter/1.0"}
            )
            with urllib.request.urlopen(req, timeout=8, context=self.ssl_context) as resp:
                raw_data = resp.read().decode("utf-8")
                try:
                    res = json.loads(raw_data)
                except Exception:
                    return {
                        "success": False,
                        "error": "Máy chủ Google Apps Script chưa phản hồi JSON hợp lệ. Vui lòng kiểm tra quyền truy cập (Who has access: Anyone)."
                    }

                if res.get("valid") or res.get("success"):
                    lic_data = {
                        "is_licensed": True,
                        "key": key,
                        "hwid": hwid,
                        "mssv": res.get("mssv") or mssv,
                        "customer_name": res.get("customer_name", "Sinh viên IUH"),
                        "type": res.get("plan_type", "Gói Bản Quyền"),
                        "expires_at": res.get("expires_at", "Không xác định"),
                        "activated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                        "last_verified": time.time()
                    }
                    self._save_cached_license(lic_data)
                    return {
                        "success": True,
                        "message": f"Kích hoạt thành công! Hạn dùng: {lic_data['expires_at']}",
                        "license": lic_data
                    }
                else:
                    return {
                        "success": False,
                        "error": res.get("message") or res.get("error") or "License Key không hợp lệ."
                    }
        except Exception as e:
            return {"success": False, "error": f"Lỗi kết nối máy chủ xác thực Key: {str(e)}"}

    def get_license_status(self, client_hwid: str = "") -> Dict[str, Any]:
        """
        Lấy trạng thái bản quyền hiện tại.
        Kiểm tra thời hạn sử dụng và tính hợp lệ.
        """
        hwid = client_hwid.strip().upper() if client_hwid else self.get_hardware_id()

        if not self.cached_license or not self.cached_license.get("is_licensed"):
            return {
                "is_licensed": False,
                "hwid": hwid,
                "status_text": "Chưa kích hoạt bản quyền",
                "error": "Vui lòng kích hoạt License Key để sử dụng tính năng săn slot."
            }

        # Lưu ý: Không khóa theo phần cứng (HWID) nữa để sinh viên có thể dùng trên
        # nhiều thiết bị (Điện thoại, Laptop, PC...). Bản quyền được bảo vệ bằng MSSV.

        # Kiểm tra ngày hết hạn (Expires At)
        expires_at = self.cached_license.get("expires_at", "")
        if expires_at and expires_at != "Vĩnh viễn" and expires_at != "2099-12-31":
            try:
                exp_time = time.strptime(expires_at, "%Y-%m-%d")
                if time.time() > time.mktime(exp_time):
                    return {
                        "is_licensed": False,
                        "hwid": hwid,
                        "status_text": "Bản quyền đã hết hạn",
                        "error": f"Bản quyền đã hết hạn vào ngày {expires_at}. Vui lòng gia hạn để tiếp tục."
                    }
            except Exception:
                pass

        return {
            "is_licensed": True,
            "hwid": hwid,
            "key": self.cached_license.get("key", ""),
            "mssv": self.cached_license.get("mssv", ""),
            "customer_name": self.cached_license.get("customer_name", "Sinh viên"),
            "plan_type": self.cached_license.get("type", "Bản Quyền"),
            "expires_at": expires_at or "Vĩnh viễn",
            "status_text": "🟢 Bản quyền hợp lệ"
        }

    def is_valid_to_run(self, current_mssv: str = "", client_hwid: str = "") -> bool:
        """Kiểm tra nhanh xem bot có đủ điều kiện để bắt đầu săn slot không"""
        status = self.get_license_status(client_hwid=client_hwid)
        if not status.get("is_licensed"):
            return False

        # Nếu Key gắn với MSSV cụ thể, kiểm tra MSSV đang đăng nhập
        licensed_mssv = (status.get("mssv") or "").strip()
        if licensed_mssv and licensed_mssv not in ["ALL", ""]:
            if not current_mssv or current_mssv.strip() != licensed_mssv:
                return False

        return True

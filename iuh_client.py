"""
IUH Client: Module giao tiếp với cổng https://doantn.iuh.edu.vn
Sử dụng hoàn toàn thư viện tiêu chuẩn Python (urllib, http.cookiejar, re, json, base64)
Không phụ thuộc bất kỳ thư viện bên ngoài nào.
"""

import urllib.request
import urllib.parse
import http.cookiejar
import ssl
import re
import base64
import time
from typing import Optional, Dict, Any, List, Tuple


class IUHClient:
    BASE_URL = "https://doantn.iuh.edu.vn"
    LOGIN_URL = f"{BASE_URL}/login.html"
    CAPTCHA_URL = f"{BASE_URL}/components/com_contact/captcha.php"
    HOME_URL = f"{BASE_URL}/doanvien.html"

    def __init__(self, phpsessid: Optional[str] = None):
        self.cookie_jar = http.cookiejar.CookieJar()
        
        # Thiết lập SSL context hỗ trợ giao thức bảo mật
        self.ssl_context = ssl.create_default_context()
        self.ssl_context.check_hostname = False
        self.ssl_context.verify_mode = ssl.CERT_NONE

        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.cookie_jar),
            urllib.request.HTTPSHandler(context=self.ssl_context)
        )

        self.user_agent = (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
        )
        
        self.is_logged_in = False
        self.user_info: Dict[str, str] = {}
        self.last_check_time = 0.0

        if phpsessid:
            self.set_session_cookie(phpsessid)

    def set_session_cookie(self, phpsessid: str):
        """Đặt cookie PHPSESSID thủ công (ví dụ lấy từ trình duyệt)"""
        clean_cookie = phpsessid.strip()
        cookie = http.cookiejar.Cookie(
            version=0,
            name='PHPSESSID',
            value=clean_cookie,
            port=None,
            port_specified=False,
            domain='doantn.iuh.edu.vn',
            domain_specified=True,
            domain_initial_dot=False,
            path='/',
            path_specified=True,
            secure=False,
            expires=int(time.time()) + 86400 * 7,
            discard=False,
            comment=None,
            comment_url=None,
            rest={'HttpOnly': None},
            rfc2109=False
        )
        self.cookie_jar.set_cookie(cookie)

    def get_current_phpsessid(self) -> Optional[str]:
        """Lấy giá trị PHPSESSID hiện tại trong cookie jar"""
        for cookie in self.cookie_jar:
            if cookie.name == 'PHPSESSID':
                return cookie.value
        return None

    def _request(self, url: str, method: str = "GET", data: Optional[Dict[str, Any]] = None, headers: Optional[Dict[str, str]] = None) -> Tuple[int, str, str]:
        """Gửi HTTP request và trả về (status_code, final_url, content_text)"""
        req_headers = {
            "User-Agent": self.user_agent,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        }
        if headers:
            req_headers.update(headers)

        encoded_data = None
        if data is not None:
            encoded_data = urllib.parse.urlencode(data).encode("utf-8")
            req_headers["Content-Type"] = "application/x-www-form-urlencoded"

        req = urllib.request.Request(url, data=encoded_data, headers=req_headers, method=method)
        try:
            with self.opener.open(req, timeout=15) as resp:
                status_code = resp.status
                final_url = resp.url
                raw_bytes = resp.read()
                content = raw_bytes.decode("utf-8", errors="ignore")
                return status_code, final_url, content
        except urllib.error.HTTPError as e:
            content = e.read().decode("utf-8", errors="ignore") if hasattr(e, 'read') else str(e)
            return e.code, url, content
        except Exception as e:
            return 500, url, f"Error: {e}"

    def get_captcha_base64(self) -> Dict[str, Any]:
        """Tải ảnh Captcha mới nhất và trả về định dạng base64 kèm cookie session"""
        try:
            req_headers = {
                "User-Agent": self.user_agent,
                "Referer": self.LOGIN_URL
            }
            req = urllib.request.Request(self.CAPTCHA_URL, headers=req_headers)
            with self.opener.open(req, timeout=10) as resp:
                img_bytes = resp.read()
                b64_str = base64.b64encode(img_bytes).decode('utf-8')
                return {
                    "success": True,
                    "captcha_b64": f"data:image/png;base64,{b64_str}",
                    "phpsessid": self.get_current_phpsessid()
                }
        except Exception as e:
            return {
                "success": False,
                "error": f"Không thể tải ảnh captcha: {str(e)}"
            }

    def login(self, mssv: str, password: str, security_code: str) -> Dict[str, Any]:
        """Thực hiện đăng nhập tài khoản sinh viên IUH"""
        data = {
            "mssv": mssv.strip(),
            "password": password.strip(),
            "security_code": security_code.strip(),
            "btLogin": "Đăng nhập"
        }
        headers = {
            "Referer": self.LOGIN_URL,
            "Origin": self.BASE_URL
        }

        status, final_url, content = self._request(self.LOGIN_URL, method="POST", data=data, headers=headers)

        if "Captcha không hợp lệ" in content:
            self.is_logged_in = False
            return {"success": False, "error": "Mã bảo mật (Captcha) không chính xác, vui lòng thử lại."}
        
        if "Tài khoản" in content and "không chính xác" in content:
            self.is_logged_in = False
            return {"success": False, "error": "MSSV hoặc mật khẩu không chính xác."}

        # Kiểm tra phiên qua doanvien.html
        check_res = self.check_session()
        if check_res.get("logged_in"):
            self.is_logged_in = True
            return {
                "success": True,
                "message": f"Đăng nhập thành công! MSSV: {self.user_info.get('mssv', mssv)} - {self.user_info.get('name', '')}",
                "phpsessid": self.get_current_phpsessid(),
                "user_info": self.user_info
            }

        return {
            "success": False,
            "error": "Đăng nhập chưa thành công. Vui lòng kiểm tra lại thông tin MSSV, Mật khẩu hoặc mã Captcha."
        }

    def check_session(self) -> Dict[str, Any]:
        """Kiểm tra xem Cookie session hiện tại có còn đăng nhập hợp lệ không"""
        status, final_url, content = self._request(self.HOME_URL, method="GET")
        self.last_check_time = time.time()

        # Kiểm tra dấu hiệu chưa đăng nhập / redirect về login
        if "login.html" in final_url or "<meta http-equiv='refresh' content='0;URL=login.html'>" in content or "URL=login.html" in content:
            self.is_logged_in = False
            return {
                "logged_in": False,
                "message": "Phiên làm việc đã hết hạn hoặc chưa đăng nhập.",
                "phpsessid": self.get_current_phpsessid()
            }
        
        # Nếu trang chứa logout.html, MSSV hoặc bảng đoàn viên -> ĐÃ ĐĂNG NHẬP
        if "logout.html" in content or "tblDoanvien" in content or "MSSV:" in content:
            self.is_logged_in = True
            
            # Trích xuất thông tin sinh viên
            name_m = re.search(r'Sinh vi(?:&ecirc;|ê)n:\s*</td>\s*<td[^>]*>(.*?)</td>', content, re.I)
            mssv_m = re.search(r'MSSV:\s*</td>\s*<td[^>]*>(.*?)</td>', content, re.I)
            cls_m = re.search(r'L(?:&plusmn;|ớ)p:\s*</td>\s*<td[^>]*>(.*?)</td>', content, re.I)

            if name_m:
                self.user_info["name"] = re.sub(r'<[^>]+>', '', name_m.group(1)).strip()
            if mssv_m:
                self.user_info["mssv"] = re.sub(r'<[^>]+>', '', mssv_m.group(1)).strip()
            if cls_m:
                self.user_info["class"] = re.sub(r'<[^>]+>', '', cls_m.group(1)).strip()

            return {
                "logged_in": True,
                "message": f"Phiên hợp lệ: {self.user_info.get('name', '')} ({self.user_info.get('mssv', '')})",
                "phpsessid": self.get_current_phpsessid(),
                "user_info": self.user_info
            }

        self.is_logged_in = False
        return {
            "logged_in": False,
            "message": "Chưa xác thực được phiên đăng nhập.",
            "phpsessid": self.get_current_phpsessid()
        }

    def fetch_activities(self, target_url: Optional[str] = None) -> Dict[str, Any]:
        """
        Quét danh sách hoạt động từ website IUH (mặc định doanvien.html).
        """
        url = target_url.strip() if target_url else self.HOME_URL
        status, final_url, content = self._request(url, method="GET")

        if "login.html" in final_url or "URL=login.html" in content:
            self.is_logged_in = False
            return {
                "success": False,
                "error": "Phiên làm việc đã hết hạn, vui lòng đăng nhập lại.",
                "activities": []
            }

        activities = self._parse_activities_from_html(content, url)
        return {
            "success": True,
            "url": final_url,
            "count": len(activities),
            "activities": activities,
            "raw_length": len(content)
        }

    def _parse_activities_from_html(self, html: str, base_url: str) -> List[Dict[str, Any]]:
        """Phân tích HTML bảng tblDoanvien của IUH để bóc tách hoạt động, slot và nút đăng ký"""
        activities = []

        # 1. Tìm bảng tblDoanvien chính thức của Đoàn trường IUH
        tbl_match = re.search(r'<table[^>]*tblDoanvien[^>]*>(.*?)</table>', html, re.DOTALL | re.IGNORECASE)
        if tbl_match:
            rows = re.findall(r'<tr\b[^>]*>(.*?)</tr>', tbl_match.group(1), re.DOTALL | re.IGNORECASE)
            for r in rows:
                cells = re.findall(r'<td\b[^>]*>(.*?)</td>', r, re.DOTALL | re.IGNORECASE)
                if len(cells) >= 5:
                    title_cell = cells[1]
                    title_clean = re.sub(r'<[^>]+>', ' ', title_cell).strip()
                    
                    # Trích xuất Modal ID (ví dụ: myModal_4196)
                    modal_id_match = re.search(r'data-target=["\']#([a-zA-Z0-9_-]+)["\']', title_cell)
                    modal_id = modal_id_match.group(1) if modal_id_match else ""
                    
                    # Trích xuất ID số của hoạt động (ví dụ 4196)
                    act_num_id = ""
                    if modal_id:
                        num_m = re.search(r'\d+', modal_id)
                        if num_m:
                            act_num_id = num_m.group(0)

                    # Trích xuất số slot: ví dụ (400/400) hoặc (350/400)
                    slot_match = re.search(r'\((\d+)\s*/\s*(\d+)\)', title_clean)
                    cur_slot, max_slot = (int(slot_match.group(1)), int(slot_match.group(2))) if slot_match else (0, 0)
                    slot_str = f"{cur_slot}/{max_slot}" if max_slot > 0 else "N/A"

                    # Cột đăng ký (thường là ô thứ 6)
                    reg_cell = cells[5] if len(cells) > 5 else ""
                    reg_clean = re.sub(r'<[^>]+>', '', reg_cell).strip()
                    
                    # Link hoặc action đăng ký
                    reg_url = None
                    link_match = re.search(r'href=["\']([^"\']+)["\']', reg_cell)
                    if link_match and link_match.group(1) != '#':
                        reg_url = urllib.parse.urljoin(base_url, link_match.group(1))

                    # Xác định còn slot hay không:
                    # Nếu số lượng đã đăng ký < tổng số lượng -> CÒN SLOT
                    has_slot = (cur_slot < max_slot and max_slot > 0)
                    if not has_slot and reg_url:
                        has_slot = True
                    if "đủ số lượng" in reg_clean.lower() or "hết slot" in reg_clean.lower() or "hết chỗ" in reg_clean.lower():
                        has_slot = False

                    # Trích xuất chi tiết mô tả từ Popup Modal
                    desc = ""
                    if modal_id:
                        modal_regex = r'<div[^>]*id=["\']' + re.escape(modal_id) + r'["\'][^>]*>.*?<div class=["\']modal-body["\']>(.*?)</div>'
                        modal_match = re.search(modal_regex, html, re.DOTALL | re.IGNORECASE)
                        if modal_match:
                            desc = re.sub(r'<br\s*/?>', ' | ', modal_match.group(1)).strip()
                            desc = re.sub(r'<[^>]+>', ' ', desc).strip()

                    # Cột điểm rèn luyện & kết thúc
                    diem_drl = re.sub(r'<[^>]+>', '', cells[3]).strip() if len(cells) > 3 else ""
                    deadline = re.sub(r'<[^>]+>', '', cells[4]).strip() if len(cells) > 4 else ""

                    meta_desc = f"+{diem_drl} ĐRL | Hạn: {deadline}"
                    if desc:
                        meta_desc = f"{meta_desc} | {desc}"

                    activities.append({
                        "id": act_num_id or modal_id or f"act_{len(activities)+1}",
                        "title": title_clean,
                        "slot": slot_str,
                        "has_slot": has_slot,
                        "status_text": reg_clean or ("Còn slot" if has_slot else "Hết chỗ"),
                        "details": meta_desc,
                        "register_url": reg_url
                    })

        # 2. Fallback nếu không có tblDoanvien: quét bảng chung
        if not activities:
            table_matches = re.findall(r'<table\b[^>]*>(.*?)</table>', html, re.DOTALL | re.IGNORECASE)
            for t_html in table_matches:
                rows = re.findall(r'<tr\b[^>]*>(.*?)</tr>', t_html, re.DOTALL | re.IGNORECASE)
                for row in rows:
                    cols = re.findall(r'<td\b[^>]*>(.*?)</td>', row, re.DOTALL | re.IGNORECASE)
                    if not cols or len(cols) < 2:
                        continue
                    clean_cols = [re.sub(r'<[^>]+>', ' ', c).strip() for c in cols]
                    title = clean_cols[1] if len(clean_cols) > 1 else clean_cols[0]
                    if any(h in title.lower() for h in ['stt', 'tên hoạt động', 'tiêu đề']):
                        continue
                    activities.append({
                        "id": f"act_{len(activities)+1}",
                        "title": title[:120],
                        "details": " | ".join(clean_cols[:4]),
                        "slot": "N/A",
                        "has_slot": any(k in row.lower() for k in ['đăng ký', 'dang ky', 'confirmregister']),
                        "register_url": None
                    })

        # 2. Tìm kiếm trong các div container (nếu không dùng bảng mà dùng card/list)
        if not activities:
            card_matches = re.findall(r'<div\b[^>]*class=[\'"][^\'"]*(?:item|panel|activity|hoatdong)[^\'"]*[\'"][^>]*>(.*?)</div>', html, re.DOTALL | re.IGNORECASE)
            for idx, card in enumerate(card_matches):
                clean_text = re.sub(r'<[^>]+>', ' ', card).strip()
                if len(clean_text) < 10:
                    continue
                
                has_reg = any(k in card.lower() for k in ['đăng ký', 'dang ky', 'confirmregister'])
                link_match = re.search(r'href=[\'"]([^\'"]+)[\'"]', card)
                reg_link = urllib.parse.urljoin(base_url, link_match.group(1)) if link_match else None

                activities.append({
                    "id": f"card_{idx+1}",
                    "title": clean_text[:100],
                    "details": clean_text[:200],
                    "slot": "Đang cập nhật",
                    "has_slot": has_reg,
                    "register_url": reg_link
                })

        return activities

    def register_activity(self, register_url: Optional[str] = None, activity_id: Optional[str] = None, form_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Thực hiện gửi request đăng ký hoạt động tức thì.
        Hỗ trợ cả dạng GET link trực tiếp hoặc POST form.
        """
        if not register_url and not activity_id:
            return {"success": False, "error": "Thiếu thông tin URL hoặc ID hoạt động để đăng ký."}

        target = register_url
        if not target and activity_id:
            target = f"{self.BASE_URL}/dang-ky.html?id={activity_id}"

        method = "POST" if form_data else "GET"
        headers = {
            "Referer": self.HOME_URL,
            "Origin": self.BASE_URL
        }

        start_time = time.time()
        status, final_url, content = self._request(target, method=method, data=form_data, headers=headers)
        elapsed_ms = int((time.time() - start_time) * 1000)

        # Kiểm tra phản hồi
        lower_content = content.lower()
        if any(w in lower_content for w in ['thành công', 'đã đăng ký', 'thanh cong', 'success', 'hoàn tất']):
            return {
                "success": True,
                "message": f"Đăng ký thành công! (Thời gian xử lý: {elapsed_ms}ms)",
                "elapsed_ms": elapsed_ms
            }
        
        if any(w in lower_content for w in ['hết chỗ', 'hết slot', 'đã đủ số lượng', 'het cho', 'het slot']):
            return {
                "success": False,
                "error": f"Rất tiếc, hoạt động đã hết slot! (Xử lý trong {elapsed_ms}ms)",
                "elapsed_ms": elapsed_ms
            }

        return {
            "success": status in [200, 302],
            "message": f"Đã gửi request đăng ký (HTTP {status}, {elapsed_ms}ms). Vui lòng kiểm tra lại trạng thái.",
            "elapsed_ms": elapsed_ms,
            "snippet": re.sub(r'<[^>]+>', ' ', content)[:250]
        }

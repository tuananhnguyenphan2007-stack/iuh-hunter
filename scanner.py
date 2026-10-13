"""
Scanner: Quản lý luồng quét ngầm liên tục, phát hiện slot và auto-register
"""

import threading
import time
from typing import Dict, Any, List, Optional
from iuh_client import IUHClient
from discord_notifier import DiscordNotifier


class ActivityScanner:
    def __init__(self, client: IUHClient, notifier: DiscordNotifier):
        self.client = client
        self.notifier = notifier
        self.is_running = False
        self.thread: Optional[threading.Thread] = None

        # Cấu hình mặc định
        self.config: Dict[str, Any] = {
            "interval_seconds": 3,
            "target_url": "https://doantn.iuh.edu.vn/doanvien.html",
            "auto_register": True,
            "keywords": [],
            "ping_everyone": True,
            "webhook_url": ""
        }

        # Lưu trữ trạng thái và lịch sử
        self.known_activities: Dict[str, Dict[str, Any]] = {}
        self.registered_activities: List[str] = []
        self.logs: List[Dict[str, Any]] = []
        self.max_logs = 100
        self.scan_count = 0
        self.last_scan_time: Optional[float] = None
        self.last_status = "Đang dừng"

    def log(self, message: str, level: str = "info"):
        """Ghi nhật ký hoạt động có timestamp"""
        entry = {
            "time": time.strftime("%H:%M:%S"),
            "timestamp": time.time(),
            "message": message,
            "level": level
        }
        self.logs.append(entry)
        if len(self.logs) > self.max_logs:
            self.logs.pop(0)
        print(f"[{entry['time']}] [{level.upper()}] {message}")

    def update_config(self, new_cfg: Dict[str, Any]):
        """Cập nhật các thiết lập cho scanner"""
        for k, v in new_cfg.items():
            if k in self.config:
                self.config[k] = v
        if "webhook_url" in new_cfg:
            self.notifier.set_webhook_url(new_cfg["webhook_url"])
        self.log(f"Đã cập nhật cấu hình: Chu kỳ {self.config['interval_seconds']}s, Auto-Register: {self.config['auto_register']}")

    def start(self) -> Dict[str, Any]:
        """Bắt đầu quét ngầm"""
        if self.is_running:
            return {"success": False, "message": "Scanner đã đang chạy."}

        self.is_running = True
        self.last_status = "Đang quét liên tục"
        self.thread = threading.Thread(target=self._run_loop, daemon=True)
        self.thread.start()
        self.log(f"Đã khởi động tiến trình săn slot (Chu kỳ: {self.config['interval_seconds']} giây).", "success")
        return {"success": True, "message": "Đã bắt đầu săn slot!"}

    def stop(self) -> Dict[str, Any]:
        """Dừng tiến trình quét"""
        if not self.is_running:
            return {"success": False, "message": "Scanner đang không chạy."}

        self.is_running = False
        self.last_status = "Đã tạm dừng"
        self.log("Đã dừng tiến trình săn slot.", "warning")
        return {"success": True, "message": "Đã dừng quét."}

    def _run_loop(self):
        """Vòng lặp chạy ngầm chính"""
        keepalive_timer = time.time()

        while self.is_running:
            try:
                self.scan_count += 1
                self.last_scan_time = time.time()

                # Định kỳ 5 phút kiểm tra session keepalive
                if time.time() - keepalive_timer > 300:
                    keepalive_timer = time.time()
                    check_sess = self.client.check_session()
                    if not check_sess.get("logged_in"):
                        self.log("Phiên IUH đã hết hạn trong lúc quét!", "danger")
                        self.notifier.send_session_expired_alert()

                # Thực hiện quét danh sách hoạt động
                target_url = self.config.get("target_url")
                fetch_res = self.client.fetch_activities(target_url)

                if not fetch_res.get("success"):
                    self.log(f"Quét không thành công: {fetch_res.get('error', 'Lỗi không xác định')}", "danger")
                    time.sleep(self.config.get("interval_seconds", 3))
                    continue

                activities = fetch_res.get("activities", [])
                
                # Xử lý từng hoạt động
                for act in activities:
                    act_id = act.get("id") or act.get("title")
                    title = act.get("title", "Không rõ tên")
                    has_slot = act.get("has_slot", False)
                    slot_str = act.get("slot", "N/A")
                    reg_url = act.get("register_url")

                    # Kiểm tra bộ lọc từ khóa nếu người dùng có cài
                    keywords = self.config.get("keywords", [])
                    if keywords:
                        match_keyword = any(kw.lower() in title.lower() for kw in keywords if kw.strip())
                        if not match_keyword:
                            continue

                    # Nếu hoạt động còn slot
                    if has_slot:
                        # Kiểm tra xem hoạt động này đã được xử lý chưa
                        prev_state = self.known_activities.get(act_id)
                        
                        # Chỉ thông báo và đăng ký khi:
                        # 1. Hoạt động mới toanh chưa từng thấy
                        # 2. Hoặc trước đó hết slot mà nay vừa có slot lại
                        should_trigger = False
                        if not prev_state:
                            should_trigger = True
                        elif not prev_state.get("has_slot"):
                            should_trigger = True

                        if should_trigger:
                            self.log(f"🔥 PHÁT HIỆN SLOT: '{title}' - Slot: {slot_str}", "success")
                            
                            auto_registered = False
                            reg_result_msg = ""

                            # 1. Thực hiện Auto-Register nếu bật
                            if self.config.get("auto_register"):
                                self.log(f"⚡ Đang gửi request AUTO-REGISTER cho: {title}...", "info")
                                reg_res = self.client.register_activity(
                                    register_url=reg_url,
                                    activity_id=act_id
                                )
                                auto_registered = reg_res.get("success", False)
                                reg_result_msg = reg_res.get("message", reg_res.get("error", ""))
                                
                                if auto_registered:
                                    self.log(f"🎉 AUTO-REGISTER THÀNH CÔNG: {title} ({reg_res.get('elapsed_ms')}ms)", "success")
                                    self.registered_activities.append(act_id)
                                else:
                                    self.log(f"⚠️ AUTO-REGISTER Thất bại: {reg_result_msg}", "warning")

                            # 2. Gửi thông báo Discord Webhook tức thì
                            if self.notifier.webhook_url:
                                self.log("Đang bắn thông báo Discord Webhook...", "info")
                                self.notifier.send_slot_detected(
                                    activity_title=title,
                                    slot_info=slot_str,
                                    register_url=reg_url,
                                    auto_registered=auto_registered,
                                    register_result=reg_result_msg,
                                    ping_everyone=self.config.get("ping_everyone", True)
                                )

                    # Cập nhật trạng thái đã biết
                    self.known_activities[act_id] = {
                        "title": title,
                        "has_slot": has_slot,
                        "slot": slot_str,
                        "last_seen": time.time()
                    }

            except Exception as e:
                self.log(f"Lỗi ngoại lệ trong vòng lặp quét: {str(e)}", "danger")

            # Nghỉ theo chu kỳ
            time.sleep(self.config.get("interval_seconds", 3))

    def get_status(self) -> Dict[str, Any]:
        """Lấy toàn bộ thông số trạng thái của scanner"""
        return {
            "is_running": self.is_running,
            "status_text": self.last_status,
            "scan_count": self.scan_count,
            "last_scan_time": self.last_scan_time,
            "config": self.config,
            "known_activities_count": len(self.known_activities),
            "registered_count": len(self.registered_activities),
            "is_logged_in": self.client.is_logged_in,
            "phpsessid": self.client.get_current_phpsessid(),
            "user_info": self.client.user_info
        }

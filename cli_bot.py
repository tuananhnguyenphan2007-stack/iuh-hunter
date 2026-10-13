"""
IUH Activity Hunter - Chế độ CLI (Terminal Headless)
Chạy trực tiếp từ dòng lệnh không cần mở trình duyệt web.
"""

import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

import time
import json
import os
from iuh_client import IUHClient
from discord_notifier import DiscordNotifier
from scanner import ActivityScanner

CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")


def main():
    print("=" * 65)
    print("   ⚡ IUH ACTIVITY HUNTER - HEADLESS TERMINAL BOT ⚡")
    print("=" * 65)

    cfg = {
        "webhook_url": "",
        "interval_seconds": 3,
        "target_url": "https://doantn.iuh.edu.vn/home.html",
        "auto_register": True,
        "keywords": [],
        "ping_everyone": True,
        "phpsessid": ""
    }

    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg.update(json.load(f))
        except Exception:
            pass

    client = IUHClient(phpsessid=cfg.get("phpsessid"))
    notifier = DiscordNotifier(webhook_url=cfg.get("webhook_url"))

    # Kiểm tra session
    print("\n[1] Kiểm tra phiên đăng nhập IUH...")
    check = client.check_session()
    if check.get("logged_in"):
        print(f"  -> ✅ Phiên đăng nhập hợp lệ (PHPSESSID: {client.get_current_phpsessid()[:10]}...)")
    else:
        print("  -> ⚠️ Chưa có phiên đăng nhập hợp lệ!")
        print("  -> Bạn có thể: ")
        print("     1. Chạy start.bat để đăng nhập qua giao diện Web Captcha.")
        print("     2. Dán mã PHPSESSID từ trình duyệt.")
        choice = input("\nBạn có muốn nhập PHPSESSID thủ công không? (y/N): ").strip().lower()
        if choice == 'y':
            cookie_input = input("Nhập PHPSESSID: ").strip()
            client.set_session_cookie(cookie_input)
            cfg["phpsessid"] = cookie_input
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(cfg, f, indent=2, ensure_ascii=False)
            recheck = client.check_session()
            if recheck.get("logged_in"):
                print("  -> ✅ Đã xác nhận phiên thành công!")
            else:
                print("  -> ⚠️ Cookie không hợp lệ, tiếp tục chế độ quét thông báo công khai.")

    # Kiểm tra Discord Webhook
    if not cfg.get("webhook_url"):
        print("\n[2] Cấu hình Discord Webhook:")
        wh = input("Nhập Discord Webhook URL (hoặc Enter để bỏ qua): ").strip()
        if wh:
            cfg["webhook_url"] = wh
            notifier.set_webhook_url(wh)
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(cfg, f, indent=2, ensure_ascii=False)
            print("  -> Đang gửi thử ping...")
            notifier.send_test_message()

    scanner = ActivityScanner(client=client, notifier=notifier)
    scanner.config.update(cfg)

    print("\n" + "=" * 65)
    print(f"🎯 BẮT ĐẦU SĂN SLOT HOẠT ĐỘNG...")
    print(f"   • Chu kỳ quét: {cfg['interval_seconds']} giây/lần")
    print(f"   • Auto-Register: {'BẬT (Tự động chiếm slot)' if cfg['auto_register'] else 'TẮT (Chỉ báo tin)'}")
    print(f"   • Nhấn Ctrl + C để dừng bất kỳ lúc nào.")
    print("=" * 65 + "\n")

    scanner.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[*] Đang dừng bot...")
        scanner.stop()
        print("[*] Đã tắt thành công. Tạm biệt!")


if __name__ == "__main__":
    main()

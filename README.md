# ⚡ IUH Activity Hunter - Bot Săn Hoạt Động & Auto-Register

Công cụ tự động quét, phát hiện slot trống và đăng ký hoạt động Đoàn - Hội dành riêng cho sinh viên **Trường Đại học Công nghiệp TP.HCM (IUH)** trên cổng [doantn.iuh.edu.vn](https://doantn.iuh.edu.vn).

---

## 🚀 Tính năng nổi bật

- ⚡ **Quét siêu tốc (High-frequency Polling)**: Kiểm tra danh sách hoạt động liên tục mỗi 1 - 3 giây mà không gây lag hay nặng máy.
- 🤖 **Auto-Register tức thì**: Gửi request chiếm slot ngay mili-giây đầu tiên khi hệ thống vừa mở chỗ trống.
- 💬 **Báo động Discord Webhook**: Gửi thông báo Rich Embed kèm tag `@everyone` và chuông rung về điện thoại/máy tính của bạn ngay lập tức.
- 🖥️ **Giao diện Web Dashboard cực đẹp**: Quản lý trực quan tại `http://localhost:5000`, hiển thị captcha trực tiếp, theo dõi bảng hoạt động và live terminal log như hacker.
- 🔄 **Keep-Alive chống rớt phiên**: Định kỳ tự động duy trì session để không bị logout đột ngột.
- 📦 **Zero-Dependencies**: Sử dụng 100% thư viện tiêu chuẩn Python 3, không cần cài đặt thêm bất kỳ thư viện ngoài (`pip`) nào!

---

## 🛠️ Hướng dẫn khởi chạy nhanh

### Cách 1: Chạy bằng file `start.bat` (Khuyên dùng)
Chỉ cần **click đúp vào file `start.bat`**, hệ thống sẽ tự động khởi động server và mở trình duyệt tại `http://localhost:5000`.

### Cách 2: Chạy bằng dòng lệnh Terminal
```bash
# Di chuyển vào thư mục bot
cd "C:\Users\Tuann Anhh\.gemini\antigravity-ide\scratch\iuh-activity-bot"

# Khởi động Web Dashboard Server
python server.py

# HOẶC chạy ở chế độ Terminal Headless (không cần web)
python cli_bot.py
```

---

## 📖 Hướng dẫn cấu hình chi tiết

### 1. Tạo Discord Webhook để nhận thông báo về điện thoại
1. Mở ứng dụng **Discord** (trên máy tính hoặc web).
2. Vào một máy chủ (server) của bạn -> Chuột phải vào kênh chat muốn nhận thông báo -> Chọn **Chỉnh sửa kênh (Edit Channel)**.
3. Chọn mục **Tích hợp (Integrations)** -> Bấm **Tạo Webhook (Create Webhook)**.
4. Bấm **Sao chép URL Webhook (Copy Webhook URL)**.
5. Dán link vừa copy vào ô **Discord Webhook URL** trên giao diện tool và bấm **Bắn tin thử nghiệm (Test Ping)**.

### 2. Đăng nhập tài khoản IUH
Tool hỗ trợ 2 cách đăng nhập:
- **Cách 1 (Trực quan)**: Nhập MSSV, Mật khẩu và gõ 5 ký tự Captcha hiển thị trên Web Dashboard -> Bấm **Đăng nhập IUH**.
- **Cách 2 (Dán Cookie PHPSESSID)**: Nếu bạn đã đăng nhập sẵn trên Google Chrome/Cốc Cốc/Edge:
  1. Nhấn `F12` trên trang `doantn.iuh.edu.vn`.
  2. Chọn tab **Application** (hoặc Lưu trữ) -> Nhìn cột trái chọn **Cookies** -> `https://doantn.iuh.edu.vn`.
  3. Copy giá trị của dòng **PHPSESSID** (dạng chuỗi ký tự ngẫu nhiên).
  4. Chuyển sang tab **Dán Cookie PHPSESSID** trên Dashboard và bấm **Lưu & Áp Dụng**.

### 3. Bắt đầu săn slot
1. Bật công tắc **Tự Động Đăng Ký (Auto-Register)** nếu bạn muốn bot tự động bấm đăng ký thay vì chỉ thông báo.
2. Điều chỉnh thanh trượt **Tốc độ quét** (khuyên dùng **2 - 3 giây / lần**).
3. Bấm nút to màu xanh **BẮT ĐẦU SĂN SLOT**.
4. Cứ để bot chạy ngầm, khi trường vừa mở slot, điện thoại bạn sẽ ping chuông Discord ngay tức thì!

---

## 📁 Cấu trúc thư mục

```
iuh-activity-bot/
├── iuh_client.py       # Module xử lý giao thức HTTP, captcha, login, session
├── discord_notifier.py # Module gửi thông báo Rich Embed qua Discord Webhook
├── scanner.py          # Luồng quét ngầm liên tục và trigger auto-register
├── server.py           # Local HTTP Web & API Server (localhost:5000)
├── cli_bot.py          # Chế độ chạy dòng lệnh gọn nhẹ
├── config.json         # Tệp lưu trữ cấu hình người dùng
├── start.bat           # File một chạm khởi chạy bot trên Windows
└── web/
    ├── index.html      # Giao diện Web Dashboard
    ├── style.css       # Giao diện Cyber Dark Mode Glassmorphism
    └── app.js          # Logic thời gian thực, audio alert & polling
```

# ⚡ IUH Activity Hunter - Bot Săn Hoạt Động & Auto-Register (v2.0 PRO)

Công cụ tự động quét, phát hiện slot trống và đăng ký hoạt động Đoàn - Hội dành riêng cho sinh viên **Trường Đại học Công nghiệp TP.HCM (IUH)** trên cổng [doantn.iuh.edu.vn](https://doantn.iuh.edu.vn).

Tích hợp sẵn hệ thống **Quản lý Bản quyền (License Server)** bảo mật qua Google Sheets, chống chia sẻ tool lậu (khóa theo Mã máy tính HWID & MSSV).

---

## 🚀 Tính năng nổi bật

- ⚡ **Quét siêu tốc (High-frequency Polling)**: Kiểm tra danh sách hoạt động liên tục mỗi 1 - 3 giây mà không gây lag hay nặng máy.
- 🤖 **Auto-Register tức thì**: Gửi request chiếm slot ngay mili-giây đầu tiên khi hệ thống vừa mở chỗ trống.
- 💬 **Báo động Discord Webhook**: Gửi thông báo Rich Embed kèm tag `@everyone` và chuông rung về điện thoại/máy tính của bạn ngay lập tức (hỗ trợ proxy chống lỗi 429 & 403).
- 🔐 **Hệ thống Bản quyền Google Sheets (License Server)**:
  - Khóa theo **Mã máy tính (HWID)**: Khách mua key không thể sao chép tool sang máy khác.
  - Khóa theo **MSSV**: Đảm bảo chỉ tài khoản sinh viên được mua mới sử dụng được.
  - Hỗ trợ ngày hết hạn (`Expires_At`) và nút khóa khẩn cấp (`Banned`).
  - Quản trị trực tiếp trên Google Sheets trên điện thoại hoặc máy tính cực tiện lợi.
- 🖥️ **Giao diện Web Dashboard Cyberpunk Glassmorphism**: Quản lý trực quan tại `http://localhost:5000` (hoặc domain Render), hiển thị captcha trực tiếp, theo dõi bảng hoạt động và live terminal log.
- 🔄 **Keep-Alive chống rớt phiên**: Định kỳ tự động duy trì session để không bị logout đột ngột.
- 📦 **Zero-Dependencies**: Sử dụng 100% thư viện tiêu chuẩn Python 3, không cần cài đặt thêm bất kỳ thư viện ngoài (`pip`) nào!

---

## 🛠️ Hướng dẫn khởi chạy nhanh

### Cách 1: Chạy bằng file `start.bat` (Khuyên dùng trên Windows)
Chỉ cần **click đúp vào file `start.bat`**, hệ thống sẽ tự động khởi động server và mở trình duyệt tại `http://localhost:5000`.

### Cách 2: Chạy bằng dòng lệnh Terminal
```bash
# Khởi động Web Dashboard Server
python server.py

# HOẶC chạy ở chế độ Terminal Headless (không cần web)
python cli_bot.py
```

---

## 🔑 HƯỚNG DẪN CẤU HÌNH HỆ THỐNG BẢN QUYỀN (CHO CHỦ TOOL BÁN KEY)

Chỉ mất **1 phút** để thiết lập máy chủ cấp phép bản quyền miễn phí 100% qua Google Sheets:

### Bước 1: Tạo Google Sheet quản lý Key
1. Truy cập [Google Sheets](https://sheets.new) và tạo 1 bảng tính mới (đặt tên: `IUH Hunter - License Manager`).
2. Tại **Hàng 1 (Tiêu đề)**, đặt tên cho 8 cột từ **A đến H** chính xác như sau:
   - **Cột A**: `License_Key`
   - **Cột B**: `Customer_Name`
   - **Cột C**: `MSSV`
   - **Cột D**: `Plan_Type`
   - **Cột E**: `HWID`
   - **Cột F**: `Expires_At`
   - **Cột G**: `Status`
   - **Cột H**: `Activated_At`

### Bước 2: Dán code Google Apps Script
1. Trên thanh công cụ của Google Sheets, chọn **Tiện ích mở rộng (Extensions)** ➔ **Apps Script**.
2. Xóa hết code mặc định, mở file [`google_apps_script_template.js`](./google_apps_script_template.js) trong thư mục bot, copy toàn bộ nội dung và dán vào.
3. Nhấn **Ctrl + S** (hoặc icon đĩa mềm) để Lưu dự án.

### Bước 3: Triển khai ứng dụng Web (Deploy Web App)
1. Bấm nút **Triển khai (Deploy)** ở góc trên bên phải ➔ Chọn **Tùy chọn triển khai mới (New deployment)**.
2. Bấm vào icon bánh răng bên cạnh mục *Chọn loại* ➔ Chọn **Ứng dụng web (Web app)**.
3. Điền các trường:
   - **Mô tả**: `IUH License Server API`
   - **Thực thi dưới dạng (Execute as)**: `Tôi (Me)`
   - **Ai có quyền truy cập (Who has access)**: **`Bất kỳ ai (Anyone)`** *(Quan trọng: Phải chọn Anyone để bot của khách có thể gửi yêu cầu xác thực)*.
4. Bấm **Triển khai (Deploy)**. Nếu có bảng cấp quyền hiện ra, chọn tài khoản Google của bạn ➔ Bấm **Advanced (Nâng cao)** ➔ Bấm **Go to ... (unsafe)** ➔ Bấm **Allow (Cho phép)**.
5. Sao chép đường dẫn **URL Ứng dụng Web** (có dạng `https://script.google.com/macros/s/.../exec`).

### Bước 4: Kết nối URL vào Bot
- **Khi chạy cục bộ (Local)**: Dán URL vào file `config.json` ở trường `"license_api_url": "URL_CỦA_BẠN"` hoặc dán trực tiếp qua API.
- **Khi chạy trên Render.com**: Thêm biến môi trường (Environment Variable) tên:
  - `LICENSE_API_URL` = `https://script.google.com/macros/s/.../exec`

---

## 💡 Cách tạo Key bán cho khách hàng

Để bán cho một bạn sinh viên:
1. Bạn mở Google Sheet của bạn, thêm 1 dòng mới:
   - **Cột A (License_Key)**: Tạo mã bất kỳ, ví dụ `IUH-VIP-K20-8899`
   - **Cột B (Customer_Name)**: Tên khách (ví dụ: `Nguyễn Văn A`)
   - **Cột C (MSSV)**: Để trống (hoặc điền MSSV của bạn đó nếu muốn khóa cứng)
   - **Cột D (Plan_Type)**: `Gói 1 Tháng` hoặc `Gói Trọn Đời`
   - **Cột E (HWID)**: **Để trống** (Khi khách nhập key trên máy của họ, bot sẽ tự động gửi HWID máy họ lên điền vào ô này và khóa vĩnh viễn vào máy đó!)
   - **Cột F (Expires_At)**: Điền ngày hết hạn theo chuẩn `YYYY-MM-DD` (Ví dụ: `2026-11-15`), hoặc để trống / `2099-12-31` cho vĩnh viễn.
   - **Cột G (Status)**: `Active` (Nếu khách bùng tiền hoặc cho người khác mượn key, chỉ cần đổi thành `Banned` là tool bên máy khách sẽ bị khóa ngay lập tức!).
2. Gửi key cho khách: Khách chỉ việc mở Web tool, bấm vào biểu tượng 🔑 **Kích hoạt Key**, dán key vào và bấm **Kích Hoạt Ngay**.

> [!TIP]
> **Key Master dành riêng cho bạn (Admin)**: `IUH-ADMIN-VIP-2026` được lập trình sẵn để bạn có quyền truy cập vĩnh viễn trên bất kỳ máy nào mà không cần kết nối Google Sheet.

---

## 📖 Hướng dẫn sử dụng tính năng cho khách hàng

### 1. Tạo Discord Webhook nhận thông báo
1. Mở ứng dụng **Discord** (trên máy tính hoặc điện thoại).
2. Vào Server của bạn ➔ Chọn Kênh chat ➔ **Chỉnh sửa kênh** ➔ **Tích hợp (Integrations)** ➔ **Tạo Webhook**.
3. Sao chép link Webhook và dán vào ô **Discord Webhook URL** trên tool, bấm **Bắn tin thử nghiệm**.

### 2. Đăng nhập tài khoản IUH
- **Cách 1 (Nhập form)**: Điền MSSV, Mật khẩu và mã Captcha ➔ Bấm **Đăng nhập IUH**.
- **Cách 2 (Cookie)**: Dán cookie `PHPSESSID` từ trình duyệt vào tab Dán Cookie.

### 3. Săn slot
1. Bật công tắc **Tự Động Đăng Ký (Auto-Register)**.
2. Chỉnh tần số quét (khuyên dùng **2 - 3 giây**).
3. Bấm **BẮT ĐẦU SĂN SLOT**.

---

## 📁 Cấu trúc thư mục

```
iuh-hunter/
├── license_manager.py           # Quản lý bản quyền, HWID hashing, kết nối Google Sheets
├── google_apps_script_template.js # Backend Google Apps Script Web App để dán vào Google Sheets
├── iuh_client.py                # Xử lý HTTP session, captcha, login, trích xuất dữ liệu tblDoanvien
├── discord_notifier.py          # Gửi thông báo Rich Embed qua Discord Webhook (có proxy)
├── scanner.py                   # Luồng quét ngầm liên tục và trigger auto-register
├── server.py                    # Local & Cloud Web Server (hỗ trợ HEAD ping cho UptimeRobot)
├── cli_bot.py                   # Chế độ chạy dòng lệnh gọn nhẹ
├── config.json                  # Cấu hình người dùng (tự động bỏ qua git)
├── start.bat                    # File click chạy nhanh trên Windows
└── web/
    ├── index.html               # Giao diện Web Cyberpunk kèm Modal kích hoạt Key
    ├── style.css                # Giao diện Glassmorphism và huy hiệu PRO
    └── app.js                   # Logic thời gian thực, audio alert & xác thực license
```

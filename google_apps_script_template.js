/**
 * GOOGLE APPS SCRIPT - MÁY CHỦ BẢN QUYỀN (LICENSE SERVER) CHO IUH HUNTER
 * 
 * Hướng dẫn cài đặt trong 1 phút:
 * 1. Tạo 1 file Google Trang tính (Google Sheets) mới.
 * 2. Đặt tên các cột ở Hàng 1 (Tiêu đề):
 *    A: License_Key | B: Customer_Name | C: MSSV | D: Plan_Type | E: HWID | F: Expires_At | G: Status | H: Activated_At
 * 3. Vào menu: Tiện ích mở rộng (Extensions) -> Apps Script.
 * 4. Xóa code cũ, dán toàn bộ đoạn code dưới đây vào và nhấn Lưu (Ctrl + S).
 * 5. Bấm nút "Triển khai" (Deploy) -> "Tùy chọn triển khai mới" (New deployment)
 *    - Chọn loại: "Ứng dụng web" (Web app)
 *    - Thực thi dưới dạng (Execute as): "Tôi" (Me)
 *    - Ai có quyền truy cập (Who has access): "Bất kỳ ai" (Anyone)
 * 6. Bấm "Triển khai" và sao chép URL Ứng dụng Web (dạng https://script.google.com/macros/s/.../exec)
 *    để dán vào tool hoặc config.json!
 */

function doGet(e) {
  var params = e.parameter || {};
  var action = params.action || "check";
  var key = (params.key || "").trim().toUpperCase();
  var mssv = (params.mssv || "").trim();
  var hwid = (params.hwid || "").trim();

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();

  if (!key) {
    return createJsonResponse({ valid: false, error: "Vui lòng cung cấp License Key." });
  }

  // Tìm dòng chứa Key trong bảng (bắt đầu từ hàng 2)
  var keyRowIndex = -1;
  var rowData = null;

  for (var i = 1; i < data.length; i++) {
    var rowKey = (data[i][0] || "").toString().trim().toUpperCase();
    if (rowKey === key) {
      keyRowIndex = i + 1; // 1-based index cho sheet.getRange
      rowData = data[i];
      break;
    }
  }

  if (keyRowIndex === -1 || !rowData) {
    return createJsonResponse({ valid: false, error: "License Key không tồn tại trên hệ thống." });
  }

  var customerName = rowData[1] || "Khách hàng";
  var savedMssv = (rowData[2] || "").toString().trim();
  var planType = rowData[3] || "Gói Tiêu Chuẩn";
  var savedHwid = (rowData[4] || "").toString().trim();
  var expiresAt = rowData[5] ? Utilities.formatDate(new Date(rowData[5]), "GMT+7", "yyyy-MM-dd") : "2099-12-31";
  var status = (rowData[6] || "Active").toString().trim();

  // 1. Kiểm tra trạng thái bị Admin khóa (Banned)
  if (status.toLowerCase() === "banned" || status.toLowerCase() === "block") {
    return createJsonResponse({ valid: false, error: "License Key này đã bị tạm khóa do vi phạm hoặc hết hạn thanh toán." });
  }

  // 2. Kiểm tra ngày hết hạn
  var today = new Date();
  var expDate = new Date(expiresAt);
  expDate.setHours(23, 59, 59, 999);

  if (today > expDate && expiresAt !== "2099-12-31") {
    sheet.getRange(keyRowIndex, 7).setValue("Expired");
    return createJsonResponse({ valid: false, error: "License Key đã hết hạn vào ngày " + expiresAt + ". Vui lòng liên hệ gia hạn." });
  }

  // 3. Kiểm tra khóa theo Mã máy tính (HWID)
  if (savedHwid && savedHwid !== "" && savedHwid !== "ALL") {
    if (hwid && savedHwid !== hwid) {
      return createJsonResponse({
        valid: false,
        error: "Key này đã được kích hoạt trên một thiết bị khác! Mỗi key chỉ được phép dùng trên 1 máy tính duy nhất."
      });
    }
  }

  // 4. Kiểm tra khóa theo MSSV sinh viên
  if (savedMssv && savedMssv !== "" && savedMssv !== "ALL") {
    if (mssv && savedMssv !== mssv) {
      return createJsonResponse({
        valid: false,
        error: "Key này chỉ được cấp phép cho MSSV: " + savedMssv + ". Tài khoản hiện tại không được phép dùng."
      });
    }
  }

  // 5. Nếu kích hoạt lần đầu (action = activate): Tự động ghi nhận HWID, MSSV và ngày kích hoạt vào Google Sheet
  if (action === "activate") {
    if (!savedHwid && hwid) {
      sheet.getRange(keyRowIndex, 5).setValue(hwid);
    }
    if (!savedMssv && mssv) {
      sheet.getRange(keyRowIndex, 3).setValue(mssv);
    }
    var nowFormatted = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd HH:mm:ss");
    sheet.getRange(keyRowIndex, 8).setValue(nowFormatted);
  }

  return createJsonResponse({
    valid: true,
    success: true,
    key: key,
    customer_name: customerName,
    mssv: savedMssv || mssv,
    plan_type: planType,
    expires_at: expiresAt,
    message: "Bản quyền hợp lệ! Hạn dùng: " + expiresAt
  });
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

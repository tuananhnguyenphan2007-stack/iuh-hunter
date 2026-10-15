/**
 * GOOGLE APPS SCRIPT - MÁY CHỦ BẢN QUYỀN (LICENSE SERVER) CHO IUH HUNTER
 * Hỗ trợ xác thực bản quyền Web, tự động khóa theo Thiết bị & MSSV,
 * và hỗ trợ Bot Discord Admin tạo/khóa/gia hạn Key trực tiếp từ xa.
 * 
 * Hướng dẫn cập nhật:
 * 1. Mở Google Sheet -> Tiện ích mở rộng (Extensions) -> Apps Script.
 * 2. Thay thế toàn bộ mã bằng file này và bấm Lưu (Ctrl + S).
 * 3. Bấm Triển khai (Deploy) -> Quản lý các bản triển khai -> Chọn bản hiện tại -> Chỉnh sửa -> Chọn phiên bản MỚI -> Triển khai.
 */

function doGet(e) {
  var params = e.parameter || {};
  var action = (params.action || "check").toLowerCase();
  var key = (params.key || "").trim().toUpperCase();
  var mssv = (params.mssv || "").trim();
  var hwid = (params.hwid || "").trim();

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();

  // =========================================================================
  // TÍNH NĂNG 1: TẠO KEY MỚI (TỪ DISCORD BOT HOẶC ADMIN)
  // =========================================================================
  if (action === "create_key" || action === "taokey") {
    var newKey = key;
    if (!newKey) {
      newKey = "IUH-" + Utilities.getUuid().substring(0, 8).toUpperCase();
    }
    var customerName = params.customer_name || "Khách hàng";
    var planType = params.plan_type || "Gói Tiêu Chuẩn";
    var days = parseInt(params.days || "30", 10);
    var expDateStr = params.expires_at || "";

    if (!expDateStr) {
      if (days >= 9999 || params.plan_type === "Vĩnh viễn") {
        expDateStr = "2099-12-31";
      } else {
        var d = new Date();
        d.setDate(d.getDate() + days);
        expDateStr = Utilities.formatDate(d, "GMT+7", "yyyy-MM-dd");
      }
    }

    // Kiểm tra xem Key đã tồn tại chưa
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || "").toString().trim().toUpperCase() === newKey) {
        return createJsonResponse({ success: false, error: "Mã Key này đã tồn tại trên Sheet!" });
      }
    }

    // Thêm dòng mới vào Google Sheet:
    // Cột A: Key | B: Tên | C: MSSV | D: Gói | E: HWID | F: Hạn dùng | G: Status | H: Ngày kích hoạt
    sheet.appendRow([newKey, customerName, mssv || "", planType, "", expDateStr, "Active", ""]);

    return createJsonResponse({
      success: true,
      key: newKey,
      customer_name: customerName,
      mssv: mssv,
      plan_type: planType,
      expires_at: expDateStr,
      status: "Active",
      message: "Tạo License Key thành công!"
    });
  }

  // =========================================================================
  // CÁC HÀNH ĐỘNG CẦN TÌM KEY CÓ SẴN (Check, Activate, Ban, Unban, Extend, Reset)
  // =========================================================================
  if (!key) {
    return createJsonResponse({ valid: false, success: false, error: "Vui lòng cung cấp License Key." });
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
    return createJsonResponse({ valid: false, success: false, error: "License Key không tồn tại trên hệ thống." });
  }

  var customerName = rowData[1] || "Khách hàng";
  var savedMssv = (rowData[2] || "").toString().trim();
  var planType = rowData[3] || "Gói Tiêu Chuẩn";
  var savedHwid = (rowData[4] || "").toString().trim();
  var expiresAt = rowData[5] ? Utilities.formatDate(new Date(rowData[5]), "GMT+7", "yyyy-MM-dd") : "2099-12-31";
  var status = (rowData[6] || "Active").toString().trim();

  // --- TÍNH NĂNG 2: KHÓA KEY (BAN) ---
  if (action === "ban" || action === "khoakey") {
    sheet.getRange(keyRowIndex, 7).setValue("Banned");
    return createJsonResponse({ success: true, key: key, message: "Đã khóa License Key thành công." });
  }

  // --- TÍNH NĂNG 3: MỞ KHÓA KEY (UNBAN) ---
  if (action === "unban" || action === "mokey") {
    sheet.getRange(keyRowIndex, 7).setValue("Active");
    return createJsonResponse({ success: true, key: key, message: "Đã mở khóa License Key thành công." });
  }

  // --- TÍNH NĂNG 4: GIA HẠN THÊM NGÀY ---
  if (action === "extend" || action === "giahan") {
    var addDays = parseInt(params.days || "30", 10);
    var curExp = new Date(expiresAt);
    if (isNaN(curExp.getTime()) || curExp < new Date()) {
      curExp = new Date();
    }
    curExp.setDate(curExp.getDate() + addDays);
    var newExpStr = Utilities.formatDate(curExp, "GMT+7", "yyyy-MM-dd");
    sheet.getRange(keyRowIndex, 6).setValue(newExpStr);
    sheet.getRange(keyRowIndex, 7).setValue("Active");
    return createJsonResponse({ success: true, key: key, expires_at: newExpStr, message: "Đã gia hạn thêm " + addDays + " ngày." });
  }

  // --- TÍNH NĂNG 5: RESET THIẾT BỊ (ĐỔI MÁY MỚI) ---
  if (action === "reset_device" || action === "reset_hwid") {
    sheet.getRange(keyRowIndex, 5).setValue("");
    return createJsonResponse({ success: true, key: key, message: "Đã xóa mã thiết bị cũ. Khách có thể kích hoạt trên máy mới." });
  }

  // =========================================================================
  // XÁC THỰC BẢN QUYỀN CHO BOT SĂN SLOT (Check & Activate)
  // =========================================================================

  // 1. Kiểm tra trạng thái bị Admin khóa (Banned)
  if (status.toLowerCase() === "banned" || status.toLowerCase() === "block") {
    return createJsonResponse({ valid: false, success: false, error: "License Key này đã bị tạm khóa do vi phạm hoặc hết hạn thanh toán." });
  }

  // 2. Kiểm tra ngày hết hạn
  var today = new Date();
  var expDate = new Date(expiresAt);
  expDate.setHours(23, 59, 59, 999);

  if (today > expDate && expiresAt !== "2099-12-31") {
    sheet.getRange(keyRowIndex, 7).setValue("Expired");
    return createJsonResponse({ valid: false, success: false, error: "License Key đã hết hạn vào ngày " + expiresAt + ". Vui lòng liên hệ gia hạn." });
  }

  // 3. Kiểm tra khóa theo Mã thiết bị (HWID / Device ID)
  if (savedHwid && savedHwid !== "" && savedHwid !== "ALL") {
    if (hwid && savedHwid !== hwid) {
      return createJsonResponse({
        valid: false,
        success: false,
        error: "Key này đã được kích hoạt trên một thiết bị khác! Mỗi key chỉ được phép dùng trên 1 thiết bị duy nhất."
      });
    }
  }

  // 4. Kiểm tra khóa theo MSSV sinh viên
  if (savedMssv && savedMssv !== "" && savedMssv !== "ALL") {
    if (mssv && savedMssv !== mssv) {
      return createJsonResponse({
        valid: false,
        success: false,
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

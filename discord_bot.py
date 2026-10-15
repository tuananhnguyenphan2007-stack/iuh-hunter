"""
IUH Hunter - Admin Discord Bot
Cho phép chủ tool quản lý và cấp phát License Key trực tiếp qua Discord:
- !taokey <thời_hạn> <tên_khách> [mssv] : Tạo key mới và tự ghi vào Google Sheets
- !khoakey <mã_key>                     : Khóa key trên Google Sheets
- !mokey <mã_key>                       : Mở khóa key trên Google Sheets
- !giahan <mã_key> <số_ngày>            : Gia hạn thêm ngày dùng
- !resetmay <mã_key>                    : Xóa mã máy cũ để khách đổi thiết bị
- !checkkey <mã_key>                    : Kiểm tra trạng thái key trên Google Sheets
- !helpkey                              : Xem bảng hướng dẫn lệnh
"""

import os
import sys
import json
import urllib.request
import urllib.parse
import ssl
import asyncio
from typing import Dict, Any

try:
    import discord
    from discord.ext import commands
    HAS_DISCORD_LIB = True
except ImportError:
    HAS_DISCORD_LIB = False


def call_sheets_api(api_url: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """Gọi trực tiếp lên Google Apps Script Web App"""
    if not api_url:
        return {"success": False, "error": "Chưa cấu hình LICENSE_API_URL."}

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    query_str = urllib.parse.urlencode(params)
    sep = "&" if "?" in api_url else "?"
    full_url = f"{api_url}{sep}{query_str}"

    req = urllib.request.Request(
        full_url,
        headers={"User-Agent": "Mozilla/5.0 IUH-Hunter-DiscordBot/1.0"}
    )
    try:
        with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
            data = resp.read().decode("utf-8")
            return json.loads(data)
    except Exception as e:
        return {"success": False, "error": f"Lỗi gọi Google Sheets: {str(e)}"}


def run_bot(token: str, api_url: str):
    if not HAS_DISCORD_LIB:
        print("[DISCORD BOT] Thư viện discord.py chưa được cài đặt. Chạy 'pip install discord.py' để kích hoạt.")
        return

    intents = discord.Intents.default()
    intents.message_content = True

    bot = commands.Bot(command_prefix="!", intents=intents, help_command=None)

    @bot.event
    async def on_ready():
        print(f"============================================================")
        print(f"  🤖 Discord Admin Bot đã kết nối thành công: {bot.user}")
        print(f"============================================================")
        await bot.change_presence(activity=discord.Activity(type=discord.ActivityType.watching, name="IUH License Manager"))

    # LỆNH: !taokey
    @bot.command(name="taokey")
    async def cmd_taokey(ctx, duration: str = "30d", customer_name: str = "Khách", mssv: str = ""):
        """Tạo mã License Key mới: !taokey <30d/60d/vinhvien> <tên_khách> [mssv]"""
        dur_clean = duration.lower().strip()
        days = 30
        plan_title = "Gói 1 Tháng"

        if "vinh" in dur_clean or "forever" in dur_clean or "999" in dur_clean:
            days = 99999
            plan_title = "Gói Vĩnh Viễn"
        else:
            num_str = "".join([c for c in dur_clean if c.isdigit()])
            if num_str:
                days = int(num_str)
                plan_title = f"Gói {days} Ngày"

        async with ctx.typing():
            res = call_sheets_api(api_url, {
                "action": "create_key",
                "customer_name": customer_name,
                "days": days,
                "plan_type": plan_title,
                "mssv": mssv
            })

        if not res.get("success"):
            await ctx.send(f"❌ **Lỗi tạo Key:** {res.get('error') or 'Không thể kết nối Google Sheets'}")
            return

        key_gen = res.get("key")
        exp_date = res.get("expires_at")

        embed = discord.Embed(
            title="⚡ TẠO LICENSE KEY THÀNH CÔNG!",
            description="Thông tin bản quyền đã được ghi trực tiếp vào Google Sheets.",
            color=0x10b981
        )
        embed.add_field(name="🔑 Mã License Key", value=f"`{key_gen}`", inline=False)
        embed.add_field(name="👤 Khách hàng", value=customer_name, inline=True)
        embed.add_field(name="📦 Gói cấp phép", value=plan_title, inline=True)
        embed.add_field(name="📅 Hạn sử dụng", value=f"`{exp_date}`", inline=True)
        if mssv:
            embed.add_field(name="🎓 Khóa cứng MSSV", value=f"`{mssv}`", inline=True)

        embed.set_footer(text="IUH Activity Hunter • Admin Remote License Manager")
        await ctx.send(embed=embed)

        # Gửi mẫu tin nhắn sẵn sàng để chủ tool chỉ cần Copy gửi cho khách
        msg_template = (
            f"📋 **MẪU TIN NHẮN BÀN GIAO CHO KHÁCH (CHỈ CẦN COPY & GỬI):**\n"
            f"```text\n"
            f"🎉 Chào bạn, đây là thông tin kích hoạt bản quyền Tool Săn Slot IUH Hunter:\n\n"
            f"🔑 Mã License Key: {key_gen}\n"
            f"📦 Gói: {plan_title}\n"
            f"📅 Hạn dùng đến: {exp_date}\n\n"
            f"📌 HƯỚNG DẪN KÍCH HOẠT:\n"
            f"1. Mở Web Tool của bạn lên.\n"
            f"2. Bấm vào nút '🔑 Kích hoạt Key' ở góc trên bên phải.\n"
            f"3. Dán mã key ở trên vào và bấm 'Kích Hoạt Ngay'.\n\n"
            f"⚠️ Lưu ý: Mỗi key tự động khóa vào 1 thiết bị/tài khoản duy nhất. Chúc bạn săn slot thành công!\n"
            f"```"
        )
        await ctx.send(msg_template)

    # LỆNH: !khoakey
    @bot.command(name="khoakey")
    async def cmd_khoakey(ctx, key: str):
        """Khóa khẩn cấp một key: !khoakey <mã_key>"""
        async with ctx.typing():
            res = call_sheets_api(api_url, {"action": "ban", "key": key.strip().toUpperCase()})
        if res.get("success"):
            await ctx.send(f"🔒 **Đã khóa thành công License Key:** `{key}` trên Google Sheets!")
        else:
            await ctx.send(f"❌ **Lỗi:** {res.get('error') or 'Không tìm thấy Key'}")

    # LỆNH: !mokey
    @bot.command(name="mokey")
    async def cmd_mokey(ctx, key: str):
        """Mở khóa lại một key: !mokey <mã_key>"""
        async with ctx.typing():
            res = call_sheets_api(api_url, {"action": "unban", "key": key.strip().toUpperCase()})
        if res.get("success"):
            await ctx.send(f"🔓 **Đã mở khóa thành công License Key:** `{key}` trên Google Sheets!")
        else:
            await ctx.send(f"❌ **Lỗi:** {res.get('error') or 'Không tìm thấy Key'}")

    # LỆNH: !giahan
    @bot.command(name="giahan")
    async def cmd_giahan(ctx, key: str, days: int = 30):
        """Gia hạn thêm ngày: !giahan <mã_key> <số_ngày>"""
        async with ctx.typing():
            res = call_sheets_api(api_url, {"action": "extend", "key": key.strip().toUpperCase(), "days": days})
        if res.get("success"):
            await ctx.send(f"🎉 **Đã gia hạn thêm {days} ngày cho Key `{key}`!** Hạn mới: `{res.get('expires_at')}`")
        else:
            await ctx.send(f"❌ **Lỗi gia hạn:** {res.get('error') or 'Không tìm thấy Key'}")

    # LỆNH: !resetmay
    @bot.command(name="resetmay")
    async def cmd_resetmay(ctx, key: str):
        """Xóa mã máy cũ để khách đổi sang máy tính mới: !resetmay <mã_key>"""
        async with ctx.typing():
            res = call_sheets_api(api_url, {"action": "reset_device", "key": key.strip().toUpperCase()})
        if res.get("success"):
            await ctx.send(f"🔄 **Đã xóa mã thiết bị cũ của Key `{key}`.** Khách giờ có thể kích hoạt trên máy mới!")
        else:
            await ctx.send(f"❌ **Lỗi:** {res.get('error') or 'Không tìm thấy Key'}")

    # LỆNH: !checkkey
    @bot.command(name="checkkey")
    async def cmd_checkkey(ctx, key: str):
        """Kiểm tra trạng thái key: !checkkey <mã_key>"""
        async with ctx.typing():
            res = call_sheets_api(api_url, {"action": "check", "key": key.strip().toUpperCase()})
        if res.get("valid") or res.get("success"):
            embed = discord.Embed(title=f"🔎 THÔNG TIN KEY: {key.upper()}", color=0x38bdf8)
            embed.add_field(name="Khách hàng", value=res.get("customer_name", "N/A"), inline=True)
            embed.add_field(name="MSSV", value=res.get("mssv") or "Chưa gắn", inline=True)
            embed.add_field(name="Gói", value=res.get("plan_type", "Tiêu chuẩn"), inline=True)
            embed.add_field(name="Hạn dùng", value=res.get("expires_at", "Vĩnh viễn"), inline=True)
            embed.add_field(name="Trạng thái", value="🟢 Hợp lệ (Active)", inline=True)
            await ctx.send(embed=embed)
        else:
            await ctx.send(f"⚠️ **Key không hợp lệ hoặc đã bị khóa:** {res.get('error')}")

    # LỆNH: !helpkey
    @bot.command(name="helpkey")
    async def cmd_helpkey(ctx):
        """Bảng hướng dẫn lệnh"""
        embed = discord.Embed(title="📖 DANH SÁCH LỆNH QUẢN LÝ LICENSE BOT", color=0x8b5cf6)
        embed.add_field(name="`!taokey <hạn> <tên> [mssv]`", value="Tạo key mới (Ví dụ: `!taokey 30d NguyenVanA` hoặc `!taokey vinhvien TranVanB 25635931`)", inline=False)
        embed.add_field(name="`!khoakey <key>`", value="Khóa khẩn cấp 1 key trên Google Sheet", inline=False)
        embed.add_field(name="`!mokey <key>`", value="Mở khóa lại key đã bị khóa", inline=False)
        embed.add_field(name="`!giahan <key> <ngày>`", value="Cộng thêm số ngày dùng (Ví dụ: `!giahan IUH-XXX 30`)", inline=False)
        embed.add_field(name="`!resetmay <key>`", value="Xóa mã máy cũ để khách đổi laptop mới", inline=False)
        embed.add_field(name="`!checkkey <key>`", value="Xem thông tin chi tiết của key trên Google Sheet", inline=False)
        embed.set_footer(text="Dữ liệu đồng bộ trực tiếp 100% với Google Sheets!")
        await ctx.send(embed=embed)

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(bot.start(token))
    except Exception as e:
        print(f"[DISCORD BOT] Lỗi chạy bot: {e}")

FROM python:3.11-alpine

WORKDIR /app

# Copy toàn bộ mã nguồn
COPY . /app

# Mở cổng 5000 cho Web Dashboard
EXPOSE 5000

# Khởi chạy server
CMD ["python", "server.py"]

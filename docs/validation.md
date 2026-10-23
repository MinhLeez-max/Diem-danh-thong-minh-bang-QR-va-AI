# Kết quả xác minh

Đã thực hiện trên môi trường phát triển hiện tại:

- Cài dependencies với pnpm 10.32.1 và lockfile cố định: đạt, cài lại được.
- Tạo lại client/validator từ OpenAPI: đạt.
- TypeScript và build toàn workspace: đạt. Giao diện build đầy đủ các chunk AI khi bật nhánh ứng dụng; vẫn có cảnh báo sourcemap của tooltip và kích thước chunk, không làm build thất bại.
- 11 kiểm thử tích hợp SQL Server: đạt, không bỏ qua test. Bao gồm phân quyền lớp/vai trò, dữ liệu tiếng Việt, QR sai lớp/hết hạn/trùng, thao tác đồng thời, ghi vắng, chỉnh giờ điểm danh, mẫu số báo cáo lịch sử, camera aggregate và bảo vệ admin cuối cùng.
- 2 kiểm thử CSV: đạt, gồm Unicode, dấu nháy, dòng mới và công thức bảng tính.
- Chromium: trang thiếu cấu hình đăng nhập hiển thị đúng, không có page exception; TensorFlow WebGL tính tensor thành công.
- Migration chạy lặp: đạt, không xóa dữ liệu.
- Sao lưu và phục hồi vào container SQL Server độc lập: đạt, phục hồi đủ 7 bảng nghiệp vụ. Container/volume phục vụ kiểm tra đã được dọn.
- API build đã khởi động; `/api/healthz` trả HTTP 200. `/api/readyz` trực tiếp và qua Vite trả HTTP 503 với `database=ok`, `authentication=missing`, đúng trạng thái thực tế.
- PostgreSQL cũ có tổng cộng 0 dòng nghiệp vụ; không có dữ liệu cần chuyển trong workspace này. Không kiểm tra hay chuyển dữ liệu từ các database bên ngoài.

Chưa xác minh được:

- Đăng nhập Clerk thật và luồng giao diện sau đăng nhập: chưa có khóa Clerk. Bộ test nghiệp vụ sử dụng danh tính trong test harness, không có đường bỏ qua đăng nhập trong ứng dụng.
- Tải đầy đủ mô hình và suy luận từ camera: proxy chặn `storage.googleapis.com` trong lượt kiểm tra. Miền này đã được thêm vào bản nháp cấu hình mạng; cần lưu cấu hình và kiểm tra lại. Chưa đo độ chính xác đếm người trên camera thật.
- Kết nối SSMS từ máy Windows của người dùng: cloud SQL Server chỉ bind loopback. README giải thích kết nối khi chạy Docker trên máy Windows hoặc qua kết nối riêng phù hợp.
- Publish/khôi phục cloud task mới: cấu hình mới đã lưu dưới dạng draft; chưa publish hoặc kiểm tra trong task mới.

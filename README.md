- Database: `attendance`.
- Bật Trust server certificate cho container phát triển có chứng chỉ tự ký.

`localhost` trên máy Windows không trỏ đến cloud workspace. SQL Server trong cloud hiện chỉ bind loopback, không được công khai; để dùng SSMS từ Windows, chạy dự án/Docker trên máy đó hoặc dùng kết nối riêng do hạ tầng của bạn cung cấp. Không mở SQL Server ra Internet chỉ để thử SSMS.

## Luồng nghiệp vụ

1. Tài khoản đăng nhập đầu tiên nhận quyền admin; các tài khoản sau chờ admin phân quyền. Đăng nhập bằng tài khoản quản trị của trường đầu tiên.
2. Admin tạo lớp và hồ sơ học sinh, gán giáo viên vào lớp, liên kết tài khoản học sinh với hồ sơ tương ứng. Một hồ sơ chỉ liên kết một tài khoản.
3. Giáo viên chỉ xem và thao tác lớp được phân công. Mỗi lớp có tối đa một buổi điểm danh đang hoạt động.
4. Học sinh quét QR và đăng nhập; hệ thống xác nhận bằng hồ sơ đã liên kết, không yêu cầu nhập mã học sinh. QR hết hạn sau 45 giây và được làm mới khi trang buổi học cập nhật.
5. Quét lặp trả lại bản ghi đã có (HTTP 409); QR sai lớp/hết hạn/đã đóng bị từ chối. Học sinh xem 100 lượt điểm danh gần nhất trong không gian cá nhân.
6. Đóng buổi tự ghi vắng cho học sinh chưa điểm danh; giáo viên có thể sửa trạng thái có mặt/đi muộn/vắng trong danh sách. Đóng lặp không ghi trùng. Thay đổi trạng thái giữ giờ điểm danh gốc nếu đã có.
7. Báo cáo dùng buổi đã đóng, giữ mẫu số lịch sử khi thêm học sinh mới, xuất CSV UTF-8 và xử lý tên lớp có ký tự công thức Excel.
8. Camera tải mô hình COCO-SSD/TensorFlow khi được mở, cần quyền camera và truy cập `storage.googleapis.com`. Chỉ lưu số đếm, độ tin cậy và thời gian; giáo viên xác nhận thủ công khi có chênh lệch.

## Kiểm thử

```bash
PORT=5173 BASE_PATH=/ pnpm run build
pnpm --filter @workspace/smart-attendance test
# Nạp biến kết nối SQL Server trước khi chạy:
pnpm --filter @workspace/api-server test
```

Kiểm thử API tạo database tên ngẫu nhiên `attendance_test_*`, chạy migration hai lần, kiểm tra với SQL Server thật rồi xóa **database của chính lượt chạy**. Cần tài khoản phát triển có quyền tạo/xóa database. Bộ kiểm thử cấp danh tính trong test harness để kiểm tra phân quyền và nghiệp vụ; không thay thế kiểm thử đăng nhập Clerk thật. Không có đường bỏ qua đăng nhập trong ứng dụng.

Sau khi sửa OpenAPI, tạo lại client và validator bằng `pnpm --filter @workspace/api-spec run codegen`.

## Sao lưu và khởi động lại

```bash
node scripts/dev-db.mjs backup
node scripts/dev-db.mjs stop
node scripts/dev-db.mjs up
```

Volume Docker giữ dữ liệu giữa các lần dừng/chạy container. Lệnh backup lưu `.local/cloud/attendance.bak` trong checkout bị Git bỏ qua để có thể giữ cùng snapshot cloud. Khi database chưa tồn tại, helper có thể phục hồi bản sao lưu này. Hãy sao lưu lại trước khi chụp snapshot nếu dữ liệu đã thay đổi. Các tiến trình API, Vite và Docker cần khởi động lại trong phiên làm việc mới.

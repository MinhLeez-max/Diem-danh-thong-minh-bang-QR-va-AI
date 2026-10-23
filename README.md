# Điểm danh thông minh bằng QR và AI

Ứng dụng quản lý lớp, phân quyền admin/giáo viên/học sinh, điểm danh QR theo tài khoản trường và đối chiếu với số người ước lượng bằng camera. Camera chỉ xử lý tổng số người trên thiết bị, không nhận diện khuôn mặt và không gửi/lưu khung hình.

Dữ liệu sử dụng **Microsoft SQL Server 2022**, Kysely và driver Tedious. SSMS là công cụ quản trị trên Windows; có thể xem/chỉnh dữ liệu SQL Server bằng SSMS. Không còn dùng PostgreSQL hoặc `DATABASE_URL`.

## Cài đặt

Cần Node.js 24, pnpm 10.32.1 và Docker chạy Linux container x64 (SQL Server Developer chỉ dùng cho phát triển/kiểm thử).

```bash
pnpm install --frozen-lockfile
node scripts/dev-db.mjs up
```

Lệnh trên khởi động SQL Server ở cổng `1433`, tự tạo database `attendance` và mật khẩu phát triển ngẫu nhiên trong `.local/cloud/sqlserver.env` (quyền 0600, được Git bỏ qua). Không chạy đồng thời helper và Docker Compose trên cùng cổng.

Trong Bash:

```bash
set -a
source .local/cloud/sqlserver.env
set +a
pnpm --filter @workspace/db run migrate
```

Migration được quản lý phiên bản, kiểm tra checksum và chạy trong transaction; chạy lại không xóa dữ liệu. Khi thay đổi schema, thêm file SQL mới trong `lib/db/migrations`; không sửa migration đã áp dụng. Dữ liệu PostgreSQL cũ không tự động chuyển sang SQL Server; môi trường onboarding ban đầu không có dữ liệu nghiệp vụ. Nếu có cơ sở dữ liệu PostgreSQL bên ngoài, cần một bước chuyển dữ liệu riêng trước khi đổi môi trường đang sử dụng.

Có thể dùng SQL Server đã có: cấu hình `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` qua môi trường rồi chạy migration. Database phải tồn tại và tài khoản migration cần quyền tạo bảng/index và transaction application lock. Kết nối luôn mã hóa; `DB_TRUST_SERVER_CERTIFICATE=true` chỉ dành cho container phát triển có chứng chỉ tự ký. Với máy chủ có chứng chỉ hợp lệ, đặt `false`.

Phương án Docker Compose: sao chép `.env.example` thành `.env`, đặt mật khẩu đủ mạnh trong `DB_PASSWORD`, rồi `docker compose up -d`. Helper `dev-db.mjs` dành cho container do chính helper quản lý; sao lưu container Compose bằng công cụ SQL Server riêng.

## Đăng nhập và chạy ứng dụng

Cấu hình khóa của **cùng một Clerk instance**, không đưa khóa vào Git:

- `CLERK_SECRET_KEY`: khóa bí mật, chỉ backend đọc.
- `CLERK_PUBLISHABLE_KEY`: publishable key của backend.
- `VITE_CLERK_PUBLISHABLE_KEY`: cùng publishable key cho frontend.

Trong cloud, nhập các giá trị trong Environment settings. Khi chạy máy cá nhân, dùng biến môi trường hoặc nạp file `.env` cục bộ trong từng terminal. Vite phải được khởi động/build lại sau khi đổi khóa frontend. Khai báo origin/redirect URL phát triển trong Clerk. Dùng publishable key trực tiếp; không tự suy ra Clerk domain từ hostname ứng dụng.

Terminal API, đã nạp các biến DB/Clerk:

```bash
PORT=5000 pnpm --filter @workspace/api-server run dev
```

Terminal giao diện, đã nạp khóa Clerk:

```bash
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/smart-attendance run dev
```

Vite chuyển tiếp `/api` đến backend cổng 5000. Kiểm tra nội bộ `GET /api/readyz` báo trạng thái DB và việc có cấu hình Clerk (không xác nhận khóa đã hợp lệ). `GET /api/healthz` trả `{"status":"ok"}`; đây là liveness của API, không phải xác nhận DB/Clerk đã sẵn sàng. API bảo vệ trả HTTP 503 với mã `AUTH_NOT_CONFIGURED` nếu thiếu cấu hình Clerk; không mở quyền truy cập để vượt qua đăng nhập.

## Kết nối bằng SSMS

Khi Docker và SSMS chạy trên cùng máy Windows:

- Server type: Database Engine.
- Server name: `localhost,1433`.
- Authentication: SQL Server Authentication.
- Login: `sa`; Password: mật khẩu phát triển trong `.local/cloud/sqlserver.env` hoặc file `.env` của bạn.
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

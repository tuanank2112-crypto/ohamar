# Lead Core migrations

Framework migration có phiên bản (P10). Cách hoạt động:

- `schema.sql` là **baseline idempotent** (CREATE ... IF NOT EXISTS), chạy MỖI lần.
- Mọi thay đổi schema VỀ SAU (ALTER TABLE, thêm bảng/index, backfill...) đặt
  thành 1 file `.sql` trong thư mục này.

## Quy ước

- Đặt tên tăng dần, zero-pad: `0001_mo_ta.sql`, `0002_mo_ta.sql`, ...
- Mỗi file chạy **đúng một lần**, theo thứ tự tên, trong **1 transaction**
  (framework tự bọc BEGIN/COMMIT — **không** tự viết BEGIN/COMMIT trong file).
- Đã áp dụng rồi thì **không sửa** nữa. Muốn đổi -> tạo migration MỚI.
  (Sửa file cũ sẽ bị cảnh báo checksum và KHÔNG chạy lại.)
- Dùng `CREATE ... IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN` khi có thể để an toàn.

Trạng thái được ghi trong bảng `schema_migrations (version, checksum, applied_at)`.
Chạy thủ công: `npm run migrate` (hoặc tự chạy khi server khởi động).
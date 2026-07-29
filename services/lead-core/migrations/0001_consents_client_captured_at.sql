-- P6: tách mốc thời gian client khai báo ra cột riêng.
--   captured_at        = thời gian SERVER, dùng cho thứ tự "bản mới nhất thắng".
--   client_captured_at = mốc CLIENT tự khai (chỉ để đối chiếu/compliance,
--                        KHÔNG bao giờ dùng để sắp thứ tự — chống G5).
ALTER TABLE consents ADD COLUMN client_captured_at TEXT;
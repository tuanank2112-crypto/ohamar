# Ohamar lên VPS Windows (không cần WSL / Linux)

Em **không SSH/RDP được vào VPS của anh** — anh chỉ cần làm các bước dưới trên VPS.

## 1) Copy zip lên VPS

Từ máy anh (USB / WinSCP / RDP copy):

- File: `ohamar-zalo-vps-WINDOWS.zip` (bản clean — **không** chứa `*:Zone.Identifier`)
- Để ví dụ: `C:\Users\Administrator\Desktop\`

## 2) Giải nén (dùng `tar` — tránh lỗi Expand-Archive)

PowerShell **Run as Administrator** (khuyến nghị lần đầu):

```powershell
# Xóa partial extract cũ (nếu có)
if (Test-Path C:\ohamar-deploy) { Remove-Item C:\ohamar-deploy -Recurse -Force }

# Tạo thư mục + giải nén bằng tar (Windows 10/11 / Server 2019+ có sẵn)
New-Item -ItemType Directory -Path C:\ohamar-deploy -Force | Out-Null
cd $env:USERPROFILE\Desktop
tar -xf .\ohamar-zalo-vps-WINDOWS.zip -C C:\ohamar-deploy

# Kiểm tra
Test-Path C:\ohamar-deploy\ohamar\package.json
dir C:\ohamar-deploy\ohamar
```

Phải ra `True` và thấy `package.json`, `scripts`, `data`, …

### Nếu vẫn lỗi Expand-Archive / path format

Nguyên nhân cũ: zip có file ADS kiểu `file.xlsx:Zone.Identifier` (dấu `:` không hợp lệ trên Windows).  
Dùng **zip clean mới** + `tar` như trên. **Không** dùng `Expand-Archive` nếu không cần.

Backup (nếu không có `tar`):

```powershell
# Chỉ khi tar không có
Expand-Archive -Path .\ohamar-zalo-vps-WINDOWS.zip -DestinationPath C:\ohamar-deploy -Force
```

## 3) Cài Node 22 (một lần)

1. Node 22 LTS Windows x64 `.msi` (đã có trên Desktop cũng được)
2. Cài (tick **Add to PATH**)
3. **Đóng hết** PowerShell, mở lại:

```powershell
node -v
```

Phải ra `v22.x`.

## 4) Chạy 1 script (cài + bật 2 bot)

```powershell
cd C:\ohamar-deploy\ohamar
Set-ExecutionPolicy -Scope Process Bypass -Force
.\scripts\windows\setup-and-start.ps1
```

Script sẽ:

- `npm install`
- cài `vendor\zaloclaw`
- mở **2 cửa sổ** chạy Gia Huy + Minh Phát
- tắt Lead Core enforce (tránh kẹt nếu không chạy Core)

## 5) Nếu Zalo không nhắn (đổi máy)

Cửa sổ PowerShell mới:

```powershell
cd C:\ohamar-deploy\ohamar
npm run zalo:login
npm run zalo:login:worker
```

Quét QR → restart 2 bot (đóng 2 cửa sổ start, chạy lại script hoặc `npm run start` / `start:worker`).

## Không cần

- WSL / Ubuntu  
- Facebook  
- PowerShell trên máy nhà để **chạy** bot (chỉ copy file là đủ)

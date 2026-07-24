# Sync code máy dev → VPS (nhánh `sync/vps`)

Mục tiêu: **sửa code ở ngoài**, VPS `git pull` / chạy script — **không zip full**, **không đè** `data/` / credentials Zalo.

## Nhánh

| Nhánh | Vai trò |
|--------|---------|
| `main` | baseline ổn định |
| `feature/*` | dev tính năng |
| **`sync/vps`** | **bản deploy Windows VPS** — chỉ merge/push khi muốn lên VPS |

`data/`, `data-worker/`, `workspace*`, `.env`, `vendor/` (zaloclaw clone), secrets → **gitignore**, ở lại VPS.

---

## 0) Repo remote (một lần — máy dev)

Repo private GitHub (ví dụ):

```bash
cd ~/ohamar
# nếu chưa có remote:
gh repo create ohamar --private --source=. --remote=origin
# hoặc remote có sẵn:
git remote -v

git checkout sync/vps
git push -u origin sync/vps
```

---

## 1) Gắn git vào folder VPS đang chạy (một lần)

**Không xóa** `C:\ohamar-deploy\ohamar`. Bot / `data/` giữ nguyên.

PowerShell **trên VPS** (đã cài [Git for Windows](https://git-scm.com/download/win)):

```powershell
cd C:\ohamar-deploy\ohamar

# Nếu chưa có .git:
git init
git remote add origin https://github.com/<USER>/ohamar.git

# Auth: Personal Access Token (repo scope) khi git hỏi password
# hoặc: gh auth login

git fetch origin sync/vps
git checkout -B sync/vps origin/sync/vps

# Kiểm tra data còn
dir data\credentials
dir data-worker\credentials
```

Nếu `git checkout` báo conflict file tracked:  
backup file đó → `git checkout -f -B sync/vps origin/sync/vps`  
(file **ignored** như `data\` không bị xóa).

`vendor\zaloclaw` đang gitignore — **giữ bản đã có trên VPS** từ zip lần đầu. Chỉ khi cần cập nhật plugin mới copy/zip vendor riêng.

---

## 2) Mỗi lần update (máy dev → VPS)

### Máy dev (WSL / nhà)

```bash
cd ~/ohamar
git checkout sync/vps
# ... sửa code ...
git add -A
git status   # không có data/ credentials
git commit -m "fix: ..."
git push origin sync/vps
```

### VPS

```powershell
cd C:\ohamar-deploy\ohamar
Set-ExecutionPolicy -Scope Process Bypass -Force
.\scripts\windows\update-from-git.ps1
```

Script sẽ: `fetch` + `reset --hard origin/sync/vps` → `npm install` → restart task `Ohamar-*` → `health`.

Chỉ pull, không restart:

```powershell
.\scripts\windows\update-from-git.ps1 -NoRestart -SkipNpm
```

---

## 3) Không làm

- `git clean -fdx` (xóa data / node_modules)
- Commit `data/openclaw.json` có secrets/token
- Zip full đè cả `data\` mỗi lần sửa
- Edit `openclaw.json` bằng Notepad **có BOM** (dùng VS Code UTF-8 without BOM)

---

## 4) Rollback nhanh trên VPS

```powershell
cd C:\ohamar-deploy\ohamar
git log --oneline -10
git reset --hard <commit_cu>
.\scripts\windows\update-from-git.ps1 -SkipNpm
# hoặc Restart-ScheduledTask thủ công
```

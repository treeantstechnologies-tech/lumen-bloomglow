# Glowbloom — Deployment guide (local + GitHub + AWS)

Full project path on your laptop:
`D:\sachin b\projects\Project Lumen - GlowBloom\glowbloom`

What deploys where:
- Backend API (Node + Express + Prisma) -> AWS (Docker on EC2).
- PostgreSQL -> your managed DB (the DATABASE_URL you put in backend/.env). Keep it as-is.
- Mobile app (Flutter) -> Google Play / App Store (separate; not on AWS).
- Optional Flutter web build -> can be hosted on the same EC2 behind nginx.

---

## A. Run locally (Windows PowerShell)

### A1. Backend
First, allow local scripts once (fixes "npm.ps1/npx.ps1 cannot be loaded" and also unblocks Flutter):
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned   # press Y
```
Then:
```powershell
cd "D:\sachin b\projects\Project Lumen - GlowBloom\glowbloom\backend"
# .env already has your DATABASE_URL
npm install
npx prisma generate         # REQUIRED - creates the Prisma client
npx prisma migrate dev --name init
npm run dev
# API at http://localhost:4000  (open /health to check)
```
If you skip the policy change, use the .cmd forms: npm.cmd / npx.cmd (e.g. `npx.cmd prisma generate`).

### A2. Smoke-test the backend
```powershell
cd "D:\sachin b\projects\Project Lumen - GlowBloom\glowbloom\backend"
bash scripts/smoke.sh
```

### A3. The game frontend
- Instant, no install: double-click
  `D:\sachin b\projects\Project Lumen - GlowBloom\glowbloom\glowbloom_demo.html`
- Real Flutter app (after installing Flutter):
```powershell
cd "D:\sachin b\projects\Project Lumen - GlowBloom\glowbloom\app"
powershell -ExecutionPolicy Bypass -File setup.ps1
flutter run -d chrome
```

---

## B. Push to GitHub

```powershell
cd "D:\sachin b\projects\Project Lumen - GlowBloom\glowbloom"
# If a partial .git folder exists from earlier, delete it first:
#   rmdir /s /q .git
git init
git add .
git commit -m "Glowbloom v0.1 - game, backend, deploy kit (TreeAnts Technologies)"
git branch -M main
git remote add origin https://github.com/treeantstechnologies-tech/lumen-bloomglow.git
git push -u origin main
```
`.gitignore` already excludes `.env`, `node_modules/`, build output and signing keys.

---

## C. Deploy the backend on AWS (EC2 + Docker)

### C1. Launch an EC2 instance
- AMI: Ubuntu Server 22.04 LTS. Type: t3.small (or t3.micro to start).
- Security group inbound rules: allow 22 (SSH), 80 (HTTP), 443 (HTTPS).
- Make sure your database allows connections from the EC2 instance's IP
  (if your Postgres is AWS RDS, add the EC2 security group to the RDS security group).

### C2. SSH in and install Docker
```bash
ssh -i your-key.pem ubuntu@<EC2_PUBLIC_IP>
sudo apt update && sudo apt install -y docker.io docker-compose-plugin git
sudo usermod -aG docker ubuntu && newgrp docker
```

### C3. Get the code and set env
```bash
git clone https://github.com/treeantstechnologies-tech/lumen-bloomglow.git
cd lumen-bloomglow
nano backend/.env     # paste DATABASE_URL, JWT_SECRET (long random), DEV_RETURN_CODES=false, CORS_ORIGIN=*
```

### C4. Build and run
```bash
docker compose up -d --build
docker compose logs -f backend     # watch it start; Ctrl-C to stop watching
curl http://localhost:4000/health  # should return {"ok":true,...}
```
Migrations run automatically on container start (`prisma migrate deploy`).

### C5. Put nginx in front (clean URL + HTTPS)
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp deploy/nginx-glowbloom.conf /etc/nginx/sites-available/glowbloom
# edit the file and set server_name to your domain or the EC2 public DNS
sudo ln -s /etc/nginx/sites-available/glowbloom /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
# If you pointed a domain at the EC2 IP, enable HTTPS:
sudo certbot --nginx -d api.yourdomain.com
```
Your API is now at `http://<EC2_PUBLIC_IP>/health` (or `https://api.yourdomain.com/health`).

### C6. Point the app at the deployed API
Build the Flutter app with your API URL:
```powershell
cd "D:\sachin b\projects\Project Lumen - GlowBloom\glowbloom\app"
flutter run --dart-define=API_BASE_URL=https://api.yourdomain.com
# or for a release Android build:
flutter build appbundle --release --dart-define=API_BASE_URL=https://api.yourdomain.com
```

### Updating after a code change
```bash
cd ~/lumen-bloomglow && git pull && docker compose up -d --build
```

---

## What I can and cannot do for you
I prepared every file and command above, but I cannot push to your GitHub or run
things inside your AWS account from here (no credentials, and this synced folder
cannot run git). Run sections B and C from your laptop / the EC2 box and you are live.

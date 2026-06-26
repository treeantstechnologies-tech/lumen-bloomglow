# Glowbloom — Deployment guide (local + GitHub + AWS EC2, no Docker)

Full project path on your laptop:
`D:\sachin b\projects\Project Lumen - GlowBloom\glowbloom`

What deploys where:
- Backend API (Node + Express + Prisma) -> AWS EC2, run with PM2 behind nginx.
- PostgreSQL -> your managed DB (the DATABASE_URL in backend/.env). Unchanged.
- Mobile app (Flutter) -> Google Play / App Store (separate).
- Multiple apps share one EC2: each app is its own PM2 process on its own port,
  and nginx routes each domain/subdomain to the right port. Glowbloom uses port 4000.

---

## A. Run locally (Windows PowerShell)

Allow local scripts once (fixes "npm.ps1/npx.ps1 cannot be loaded", also unblocks Flutter):
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned   # press Y
```
Backend:
```powershell
cd "D:\sachin b\projects\Project Lumen - GlowBloom\glowbloom\backend"
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev
# API at http://localhost:4000  (open /health)
```
Game frontend: double-click
`D:\sachin b\projects\Project Lumen - GlowBloom\glowbloom\glowbloom_demo.html`

---

## B. Push to GitHub

```powershell
cd "D:\sachin b\projects\Project Lumen - GlowBloom\glowbloom"
Remove-Item -Recurse -Force .git    # clears any broken/partial .git
git config --global user.email "treeantstechnologies@gmail.com"
git config --global user.name "TreeAnts Technologies"
git init
git add .
git commit -m "Glowbloom v0.1 - game, backend, deploy kit (TreeAnts Technologies)"
git branch -M main
git remote add origin git@github.com:treeantstechnologies-tech/lumen-bloomglow.git
git push -u origin main
```

### Authenticate with an SSH key (recommended; firm account, no personal login)
```powershell
# 1) Create a key on your machine
ssh-keygen -t ed25519 -C "treeantstechnologies@gmail.com" -f "$env:USERPROFILE\.ssh\id_ed25519"
# 2) Start the agent and load the key
Get-Service ssh-agent | Set-Service -StartupType Manual
Start-Service ssh-agent
ssh-add "$env:USERPROFILE\.ssh\id_ed25519"
# 3) Copy the PUBLIC key to clipboard
Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub" | Set-Clipboard
```
Add the public key to GitHub (pick one):
- Repo deploy key (scoped to this repo): repo -> Settings -> Deploy keys -> Add deploy key
  -> paste -> tick "Allow write access". (Cleanest; needs repo admin only.)
- Account key: sign in as the firm account -> Settings -> SSH and GPG keys -> New SSH key -> paste.

Then test and push over SSH:
```powershell
ssh -T git@github.com          # first time: type "yes"; expect a success greeting
git push -u origin main
```

### Alternative: username + token over HTTPS (no SSH key)
GitHub no longer accepts your account password for git — use a Personal Access Token
as the password.
```powershell
# 1) Create a token: GitHub -> Settings -> Developer settings -> Personal access tokens
#    -> Tokens (classic) -> generate with the "repo" scope -> copy it.
# 2) Use the HTTPS remote and clear any stale cached login:
git remote set-url origin https://github.com/treeantstechnologies-tech/lumen-bloomglow.git
cmdkey /delete:git:https://github.com
# 3) Push; when prompted enter the firm account username and PASTE THE TOKEN as password.
git push -u origin main
```
The account/username you use must have write access to the repo (collaborator or owner).

---

## C. Deploy on AWS EC2 (no Docker — Node + PM2 + nginx)

### C1. Launch / reuse an EC2 instance
- Ubuntu Server 22.04 LTS, t3.small (or your existing shared box).
- Security group inbound: 22 (SSH), 80 (HTTP), 443 (HTTPS). Do NOT open 4000 publicly —
  nginx proxies to it locally.
- Ensure your Postgres allows connections from the EC2 IP (RDS: add EC2's security group).

### C2. One-time server setup (skip what you already have)
```bash
ssh -i your-key.pem ubuntu@<EC2_PUBLIC_IP>
# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git nginx
# PM2 process manager (keeps apps running + restarts on reboot)
sudo npm install -g pm2
```

### C3. Get the code and configure env
```bash
cd /var/www                      # a common place for app code
sudo mkdir -p /var/www && sudo chown -R ubuntu:ubuntu /var/www
git clone https://github.com/treeantstechnologies-tech/lumen-bloomglow.git
cd lumen-bloomglow/backend
npm install
npx prisma generate
nano .env     # DATABASE_URL=..., JWT_SECRET=<long random>, DEV_RETURN_CODES=false, CORS_ORIGIN=*, PORT=4000
npx prisma migrate deploy        # creates tables on your DB
```

### C4. Run with PM2
```bash
pm2 start ecosystem.config.js
pm2 save                         # remember running apps
pm2 startup systemd              # prints a command; run the line it outputs (enables boot start)
pm2 status                       # glowbloom-api should be "online"
curl http://localhost:4000/health
```
Each additional app you host later: give it a different `name` and `PORT` (4001, 4002, ...)
in its own ecosystem file, then `pm2 start` it. PM2 runs them all side by side.

### C5. nginx reverse proxy (one server block per app)
```bash
sudo cp /var/www/lumen-bloomglow/deploy/nginx-glowbloom.conf /etc/nginx/sites-available/glowbloom
# edit server_name to your domain/subdomain, e.g. glowbloom-api.treeants.example
sudo nano /etc/nginx/sites-available/glowbloom
sudo ln -s /etc/nginx/sites-available/glowbloom /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```
For your other apps, add another file in sites-available with its own `server_name`
and `proxy_pass http://127.0.0.1:<that app's port>` — nginx routes by hostname.

### C6. HTTPS (recommended)
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d glowbloom-api.treeants.example
```
API is now at `https://glowbloom-api.treeants.example/health`.

### C7. Point the mobile app at the live API
```powershell
cd "D:\sachin b\projects\Project Lumen - GlowBloom\glowbloom\app"
flutter run --dart-define=API_BASE_URL=https://glowbloom-api.treeants.example
# release Android build:
flutter build appbundle --release --dart-define=API_BASE_URL=https://glowbloom-api.treeants.example
```

### Updating after a code change
```bash
cd /var/www/lumen-bloomglow && git pull
cd backend && npm install && npx prisma migrate deploy
pm2 restart glowbloom-api
```

---

## What I can and cannot do for you
I prepared every file and command above. I cannot push to your GitHub or run commands
in your AWS account from here (no credentials; this synced folder cannot run git). Run
sections B and C from your laptop / the EC2 box. The Dockerfile and docker-compose.yml
are left in the repo as an optional alternative; the PM2 path above is the no-Docker one.

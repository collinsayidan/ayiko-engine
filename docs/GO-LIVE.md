# Ayiko.ai: going live

Three parts, set up in this order:

| Part | Where | What it does |
|---|---|---|
| Database, logins, files | **Supabase** | Accounts, credits, jobs, uploaded photos, finished videos |
| Website and app | **Vercel** | Landing page, log in, studio, My videos |
| Render worker | **Hetzner** | Makes the videos: voice, AI clip, captions, FFmpeg |

Never paste a secret key into chat, email or GitHub. Keys go only into Vercel's settings and the server's `.env.worker` file.

---

## 1. Supabase (about 15 minutes)

1. Go to **supabase.com**, sign in with GitHub and click **New project**. Name it `ayiko`, choose the **London** region and save the database password somewhere safe.
2. Open **SQL Editor → New query**. Paste in **each file below, one at a time, in this order**, clicking **Run** after each one:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_waitlist.sql`
   - `supabase/migrations/0003_app_queue.sql`

   Each should say "Success. No rows returned".
3. **Project Settings → API Keys**. You need three values:
   - the **Project URL** (also under **Data API**)
   - the **publishable** key (`sb_publishable_…`). It's safe in the browser.
   - the **secret** key (`sb_secret_…`). Create one if there isn't one yet. It's server only.
4. **Authentication → URL Configuration**:
   - **Site URL:** `https://ayiko-engine.vercel.app` (change it to `https://ayiko.ai` once the domain is attached)
   - **Redirect URLs:** add `https://ayiko-engine.vercel.app/auth/callback` and `http://localhost:3000/auth/callback`
5. **Google login** (recommended, because it works without your own email setup):
   - In **console.cloud.google.com**, create a project, then go to **APIs & Services → OAuth consent screen**. Choose **External**, set the app name to "Ayiko", add your email and save.
   - Go to **Credentials → Create credentials → OAuth client ID → Web application**. Under **Authorised redirect URIs**, add `https://<your-project>.supabase.co/auth/v1/callback`. The exact address is shown on Supabase's Google provider page.
   - Copy the **Client ID** and **Client secret** into **Supabase → Authentication → Sign In / Providers → Google**, turn it on and save.
6. **Email sign-in links:** Supabase's built-in email only sends to your own team's addresses. To let the public sign in by email, connect a mail service such as **Resend** under **Authentication → Emails → SMTP Settings**. Resend needs a domain you own, so do this once **ayiko.ai** is bought. Until then, people can sign in with Google.

## 2. Vercel (5 minutes)

1. Open the **ayiko-engine** project in Vercel and go to **Settings → Environment Variables**. Add these:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key |
   | `SUPABASE_SECRET_KEY` | secret key |
   | `NEXT_PUBLIC_SITE_URL` | `https://ayiko-engine.vercel.app` |

2. Go to **Deployments**, open the menu (⋯) on the latest deployment and click **Redeploy**.
3. Open the site and click **Start free**, then sign in with Google. You should land in the studio with **20 credits**. It will say "Voices are being set up" until the worker is running.

## 3. API keys (for the worker)

| Service | Used for | Where to find the key |
|---|---|---|
| **fal.ai** | AI video clip from the photo | fal.ai → Dashboard → Keys. Add credit first. |
| **ElevenLabs** | English, French, Swahili voices | elevenlabs.io → Profile → API keys |
| **GhanaNLP (Khaya)** | Twi, Ewe, Ga voices, plus Yoruba backup | translation.ghananlp.org → subscribe to the TTS API → Profile → primary key |
| **9jaLingo** | Pidgin, Yoruba, Hausa, Igbo voices | 9jalingo.org developer access. Without it, Pidgin stays switched off. |

Only languages that have a key appear in the studio. The worker reports them to the website automatically.

## 4. Hetzner render worker (about 20 minutes)

**Create the server.** In Hetzner Cloud, click **Add Server**:
- **Location:** Nuremberg or Falkenstein
- **Image:** Ubuntu 24.04
- **Type:** 4 vCPU / 8 GB RAM (CX33, or CPX32 if CX33 isn't available)
- **SSH key:** paste your public key (`type $HOME\.ssh\id_ed25519.pub` in PowerShell shows it)
- **Backups:** on

**Set it up.** Run these in the VS Code terminal on your PC, replacing `SERVER_IP` with the server's address:

```powershell
cd C:\Users\Collins\ayiko-engine
scp deploy/setup-server.sh root@SERVER_IP:
ssh root@SERVER_IP "bash setup-server.sh"
```

The setup script ends by printing a **deploy key**. Add it on GitHub under **ayiko-engine → Settings → Deploy keys → Add deploy key**, with the title "hetzner" and **write access left off**.

**Start the worker:**

```powershell
ssh ayiko@SERVER_IP
```

Then, on the server:

```bash
git clone git@github.com:collinsayidan/ayiko-engine.git
cd ayiko-engine
cp .env.worker.example .env.worker
nano .env.worker        # paste SUPABASE_URL, SUPABASE_SECRET_KEY and the API keys; Ctrl+O, Enter, Ctrl+X
cd deploy
docker compose up -d --build
docker compose logs -f --tail 50
```

You should see `worker starting`, followed by the providers that are live. Press Ctrl+C to stop watching the logs; the worker keeps running. The studio then shows **Studio online**.

**Test the queue for free first.** Set `AYIKO_PROVIDER_MODE=mock` in `.env.worker`, then run `docker compose up -d`. Make one video from the website: it will use a test voice and a simple zoom, and cost no API credit. Once that works, switch back to `AYIKO_PROVIDER_MODE=live` and run `docker compose up -d` again.

**After every `git push` that changes the engine**, update the server with:

```bash
ssh ayiko@SERVER_IP "~/ayiko-engine/deploy/update.sh"
```

## If something goes wrong

| What you see | What to check |
|---|---|
| The studio says "Almost ready" | The Vercel environment variables are missing, or the site wasn't redeployed after adding them |
| Google login goes back to the login page | The Supabase redirect URLs (step 1.4) or the Google redirect URI (step 1.5) |
| "Studio offline" | Run `docker compose ps` and `docker compose logs --tail 100` on the server |
| A video failed | The card shows the reason, and the credits are refunded automatically. The worker logs show the details |
| A language is greyed out | That language's API key isn't in `.env.worker` |

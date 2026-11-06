# Deploying DIG

The frontend is on **Vercel** and deploys itself on every push to `main`.
This folder covers the other half: the .NET backend and the Python AI service.

## Where it runs

| | |
|---|---|
| Host | AWS Lightsail, `ca-central-1`, instance `dig-server` |
| Plan | `small_3_0` — 2 GB RAM, 60 GB disk, flat $12/month |
| Address | static IP `dig-ip` → `3.96.77.210` |
| Public URL | `https://api.datainsightgen.com` (Caddy, automatic HTTPS) |
| DNS | Namecheap — one A record, `api` → the static IP |

Paid for by AWS Free Tier credits until they expire on **2027-04-09**. The plan is
to move to Lambda (pay-per-use) before then; see "Next" below.

## Deploy

From the repo root, in Git Bash:

```bash
bash deploy/deploy.sh
```

It ships the committed code (`git archive HEAD`) plus the two `.env` files, then
rebuilds and restarts on the server. It refuses to run with uncommitted changes.

Then check it with real files and real models, about three minutes:

```bash
ssh -i ~/.ssh/dig-key.pem ubuntu@3.96.77.210 "docker exec -i dig-ai python -" < deploy/live_check.py
```

The last line says `ALL PASSED` or names what failed.

## Rebuild the server from nothing

The server is deliberately stateless — every piece of user data lives in Supabase.
That is what makes it safe to delete, and this is all it takes to recreate:

1. Lightsail → create instance: Ubuntu 24.04, plan `small_3_0`, key pair `dig-key`, name `dig-server`
2. Attach static IP `dig-ip` (or create one and update the DNS record)
3. Open ports 22, 80, 443
4. `ssh -i ~/.ssh/dig-key.pem ubuntu@<ip> 'sudo bash -s' < deploy/bootstrap.sh`
5. `bash deploy/deploy.sh`

Do **not** paste `bootstrap.sh` into Lightsail's "launch script" box. Lightsail runs
launch scripts with `/bin/sh`, which rejects the script's first line.

## Spending safety net

AWS has no hard spending limit on a Paid account, so this one is built by hand:

- **`dig-real-money-cap`** — budget of $5/month counting only real money, i.e. after
  credits. Emails at 50% and 80%. At 100% it notifies the SNS topic
  `dig-budget-alerts`, which triggers the Lambda **`dig-kill-switch`**.
- **`dig-kill-switch`** (source: [`aws/kill_switch.py`](aws/kill_switch.py)) deletes
  `dig-server` and releases `dig-ip`. It deletes rather than stops, because a stopped
  Lightsail instance is still billed its full plan price.
- **`dig-credit-burn`** — budget of $15/month of gross usage, before credits. Expected
  burn is ~$12, so an alert here means something unplanned is using credits.

Billing data lags by a few hours, so the cap can be overshot slightly before it fires.

## Logs

Containers log to the systemd journal, which keeps **30 days** and then deletes
(`/etc/systemd/journald.conf.d/dig-retention.conf`). The privacy policy promises
exactly this, so don't change it without changing the policy.

```bash
ssh -i ~/.ssh/dig-key.pem ubuntu@3.96.77.210 'journalctl CONTAINER_NAME=dig-backend -n 100'
```

## Next

Before the credits expire, move both services to Lambda. Two things block that today:
analyses run in a background `Task.Run` after the HTTP response returns (Lambda freezes
at that point), and the live workspace needs SignalR's long-lived connections.

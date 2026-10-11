# Render worker deployment

Full step-by-step guide: [docs/GO-LIVE.md](../docs/GO-LIVE.md), section 4.

- `setup-server.sh`: one-time hardening and Docker install for a fresh Ubuntu 24.04 server (run as root)
- `docker-compose.yml`: runs the worker (`.env.worker` in the repo root holds the keys)
- `update.sh`: pull the latest code and restart. In-flight videos finish first.

Useful commands on the server, run as `ayiko` in `~/ayiko-engine/deploy`:

```bash
docker compose ps                    # is it running?
docker compose logs -f --tail 100    # live logs
docker compose restart               # restart
```

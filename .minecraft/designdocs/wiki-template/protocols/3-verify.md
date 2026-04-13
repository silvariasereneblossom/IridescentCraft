# Protocol 3: Verify

Generate commands that check ground truth on live systems before accepting wiki changes. The wiki documents real configurations — this protocol produces the commands to confirm what's actually deployed.

## Trigger

"Run Protocol 3" or "Verify" — typically invoked after Protocol 1 or 2 produces findings, before the PR is merged.

## Procedure

1. **Review findings** — Read the pending findings from Protocol 1 or 2 (or any proposed wiki change that claims a factual state about live systems).
2. **Map each finding to its source of truth** — For every finding, identify where the real answer lives. Build a mapping table appropriate to your infrastructure:

   | Claim Type | Source of Truth | How to Check |
   |------------|----------------|--------------|
   | Server config | Config files on the server | `cat` or `grep` the relevant file |
   | Docker Compose stack | `docker-compose.yml` in the service directory | `cat /opt/<service>/docker-compose.yml` |
   | Network config | Network config files or router admin | `ip addr`, `cat /etc/network/interfaces` |
   | Cron schedules | Crontab on the host | `crontab -l` |
   | DNS records | DNS provider | `dig <domain>` or API query |
   | Firewall rules | Firewall config | `iptables -L` or `ufw status` |
   | Service status | Systemd / Docker | `systemctl status <service>` or `docker ps` |
   | Disk usage / mounts | Filesystem | `df -h`, `mount`, `cat /etc/fstab` |

   <!-- Customize this table for your infrastructure. The more specific, the better. -->

3. **Generate a single command block** — Produce a copyable block of shell commands that checks every finding. Each command should be preceded by an `echo` label identifying which finding it verifies.
4. **Present to user** — Output the command block for the user to run. Do NOT run these commands yourself unless you have direct access to the systems in question.
5. **Wait for results** — The user runs the commands and reports back. Adjust fixes based on what the ground truth actually shows.

## Command Generation Rules

- Group related checks under a single `echo` header.
- Use `grep` with context (`-A`, `-B`) when surrounding lines help confirm the finding.
- Prefer `cat` for short files and `grep` for long files.
- Keep the output scannable — the user should be able to glance at results and confirm each finding in seconds.

## Example Output

For a finding "the database port is documented as 5432 but may actually be 5433":

```bash
# Finding 1: Database port — 5432 vs 5433
echo "=== DATABASE PORT ==="
grep -n "port" /opt/postgres/docker-compose.yml
ss -tlnp | grep postgres
```

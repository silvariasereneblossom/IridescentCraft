"""Where the dedicated server's logs can be read from on this machine.

Until 2026-10-11 the launcher mirrored them into this repo
(.minecraft/server_distribution/TesterLogs/Server Logs), and the dev tools read
them from the checkout. That mirror is gone from the repo: it carried player
names and chat into a public history. The launcher now pushes to a private
repository, IridescentCraft-logs (folder server/).

find_server_logs() returns the first of these that holds a latest.log:

  1. $ICRAFT_SERVER_LOGS             a folder with latest.log and kubejs/
  2. the live server over the share  the run that is up right now
  3. a clone of IridescentCraft-logs next to this clone (../IridescentCraft-logs/server):
                                     the last run that was stopped; `git pull` it first
  4. the old in-repo mirror          only in a checkout from before the removal

Used by audit_loot.py and boot_signature_check.py.
"""
import os

LIVE_SERVER_LOGS = r"Z:\Users\silvariazemaitis\Desktop\IridescentCraft Dedicated Server\logs"
LOGS_REPO_NAME = "IridescentCraft-logs"


def _candidates(minecraft_dir):
    pack_root = os.path.dirname(os.path.abspath(minecraft_dir))
    env = os.environ.get("ICRAFT_SERVER_LOGS", "").strip()
    if env:
        yield env, "ICRAFT_SERVER_LOGS (%s)" % env
    yield LIVE_SERVER_LOGS, "the live server (%s)" % LIVE_SERVER_LOGS
    clone = os.path.join(os.path.dirname(pack_root), LOGS_REPO_NAME, "server")
    yield clone, "a clone of the private log mirror (%s)" % clone
    legacy = os.path.join(minecraft_dir, "server_distribution", "TesterLogs", "Server Logs")
    yield legacy, "the retired in-repo mirror (%s): this checkout predates its removal" % legacy


def find_server_logs(minecraft_dir):
    """-> (folder, description), or (None, why not)."""
    tried = []
    for folder, label in _candidates(minecraft_dir):
        try:
            if os.path.isfile(os.path.join(folder, "latest.log")):
                return folder, label
        except OSError:
            pass
        tried.append(folder)
    return None, "no server logs found (tried: %s). Set ICRAFT_SERVER_LOGS, or clone %s next to this repo." % (
        "; ".join(tried), LOGS_REPO_NAME)

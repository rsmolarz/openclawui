import { Client } from "ssh2";

const SSH_TIMEOUT_MS = 30000;
const CMD_TIMEOUT_MS = 120000;

const ALLOWED_COMMANDS: Record<string, string> = {
  status: "ps aux | grep -E 'openclaw' | grep -v grep; echo '---PORTS---'; ss -tlnp | grep 18789 || echo 'Port 18789 not listening'",
  start: "nohup openclaw gateway --host 0.0.0.0 --port 18789 > /tmp/openclaw.log 2>&1 & sleep 5 && ps aux | grep openclaw | grep -v grep && echo '---PORTS---' && ss -tlnp | grep 18789 || echo 'Started but port may not be externally bound yet'",
  stop: "kill -9 $(pgrep -f 'openclaw gateway') $(pgrep -f 'openclaw-gateway') $(pgrep -f 'openclaw node') 2>/dev/null; sleep 1; pgrep -f openclaw > /dev/null && kill -9 $(pgrep -f openclaw) 2>/dev/null; sleep 1 && echo 'OpenClaw processes stopped'",
  restart: "kill -9 $(pgrep -f 'openclaw') 2>/dev/null; sleep 2; nohup openclaw gateway --host 0.0.0.0 --port 18789 > /tmp/openclaw.log 2>&1 & sleep 5; ps aux | grep openclaw | grep -v grep; echo '---PORTS---'; ss -tlnp | grep 18789 || echo 'Port 18789 not listening'; echo '---LOG---'; tail -10 /tmp/openclaw.log",
  diagnose: "which openclaw && openclaw --version 2>/dev/null; echo '---PORTS---'; ss -tlnp | grep -E '18789|8080|3000'; echo '---PROCS---'; ps aux | grep -E 'openclaw|node' | grep -v grep; echo '---CONFIG---'; cat /etc/openclaw/config.yaml 2>/dev/null || cat ~/.openclaw/config.yaml 2>/dev/null || cat /root/.openclaw/config.yaml 2>/dev/null || echo 'No config found'; echo '---FIREWALL---'; ufw status 2>/dev/null || iptables -L INPUT -n 2>/dev/null | head -20",
  "check-firewall": "ufw status verbose 2>/dev/null || iptables -L INPUT -n 2>/dev/null",
  "open-port": "ufw allow 18789/tcp 2>/dev/null && ufw reload 2>/dev/null && echo 'Port 18789 opened' || (iptables -I INPUT -p tcp --dport 18789 -j ACCEPT 2>/dev/null && echo 'Port 18789 opened via iptables')",
  "check-config": "echo '---openclaw.json---'; cat /root/.openclaw/openclaw.json 2>/dev/null || echo 'Not found'; echo '---node.json---'; cat /root/.openclaw/node.json 2>/dev/null || echo 'Not found'; echo '---pending.json---'; cat /root/.openclaw/devices/pending.json 2>/dev/null || echo 'Not found'; echo '---paired.json---'; cat /root/.openclaw/devices/paired.json 2>/dev/null || echo 'Not found'; echo '---ENV---'; env | grep -i openclaw 2>/dev/null || echo 'No openclaw env vars'",
  "fix-binding": "sed -i 's/\"bind\": \"lan\"/\"bind\": \"0.0.0.0\"/g' /root/.openclaw/openclaw.json && sed -i 's/\"host\": \"127.0.0.1\"/\"host\": \"0.0.0.0\"/g' /root/.openclaw/node.json && echo 'Config updated. Verify:' && grep -A2 bind /root/.openclaw/openclaw.json && grep host /root/.openclaw/node.json && echo '---Now killing processes---' && kill -9 $(pgrep -f openclaw) 2>/dev/null; sleep 3 && echo '---Starting gateway---' && nohup openclaw gateway --port 18789 > /tmp/openclaw.log 2>&1 & sleep 7 && ps aux | grep openclaw | grep -v grep && echo '---PORTS---' && ss -tlnp | grep 18789 && echo '---LOG---' && tail -10 /tmp/openclaw.log || echo 'Port 18789 still not listening externally'",
  "find-config-location": "find / -maxdepth 4 -name '*.yaml' -path '*openclaw*' 2>/dev/null; find / -maxdepth 4 -name '*.yml' -path '*openclaw*' 2>/dev/null; find / -maxdepth 4 -name '*.json' -path '*openclaw*' 2>/dev/null; find / -maxdepth 4 -name '*.toml' -path '*openclaw*' 2>/dev/null; echo '---NPM---'; ls -la /usr/lib/node_modules/openclaw/ 2>/dev/null | head -20; echo '---BIN---'; which openclaw-gateway; file $(which openclaw-gateway) 2>/dev/null; ls -la /usr/local/bin/openclaw* 2>/dev/null; echo '---OPENCLAW-DIR---'; ls -la /usr/lib/node_modules/openclaw/dist/ 2>/dev/null | head -20",
  "try-env-bind": "kill -9 $(pgrep -f openclaw) 2>/dev/null; sleep 2; nohup env OPENCLAW_HOST=0.0.0.0 OPENCLAW_BIND=0.0.0.0 HOST=0.0.0.0 GATEWAY_HOST=0.0.0.0 openclaw gateway --port 18789 > /tmp/openclaw.log 2>&1 & sleep 6; ps aux | grep openclaw | grep -v grep; echo '---PORTS---'; ss -tlnp | grep 18789; echo '---LOG---'; tail -20 /tmp/openclaw.log",
  "view-log": "tail -80 /tmp/openclaw.log 2>/dev/null || echo 'No log file found'",
  "all-ports": "ss -tlnp; echo '---NETSTAT---'; netstat -tlnp 2>/dev/null || echo 'No netstat'",
  "gateway-help": "openclaw gateway --help 2>&1; echo '---CONFIGURE-HELP---'; openclaw configure --help 2>&1",
  "check-node-json": "cat /root/.openclaw/node.json && echo '---OPENCLAW-JSON-GATEWAY---' && cat /root/.openclaw/openclaw.json | python3 -c 'import sys,json; d=json.load(sys.stdin); print(json.dumps(d.get(\"gateway\",{}), indent=2))'",
  "set-gateway-mode": "python3 -c \"import json; f='/root/.openclaw/openclaw.json'; d=json.load(open(f)); d['gateway']['bind']='lan'; json.dump(d,open(f,'w'),indent=2); print('Updated gateway config:'); print(json.dumps(d['gateway'],indent=2))\"",
  "set-gateway-lan-no-ts": "python3 -c \"import json; f='/root/.openclaw/openclaw.json'; d=json.load(open(f)); d['gateway']['bind']='lan'; d['gateway']['tailscale']={'mode':'off','resetOnExit':True}; json.dump(d,open(f,'w'),indent=2); print('Updated gateway config:'); print(json.dumps(d['gateway'],indent=2))\"",
  "fix-and-restart": "nohup openclaw gateway run --bind lan --port 18789 --force > /tmp/openclaw.log 2>&1 & sleep 10 && ps aux | grep openclaw | grep -v grep && echo '---PORTS---' && ss -tlnp && echo '---LOG---' && tail -30 /tmp/openclaw.log",
  "gateway-stop": "openclaw gateway stop 2>&1 && sleep 2 && kill -9 $(pgrep -f openclaw) 2>/dev/null; echo 'Gateway stopped'; ps aux | grep openclaw | grep -v grep || echo 'No openclaw processes'",
  "gateway-start-lan": "rm -f /tmp/oc.log; nohup openclaw gateway run --bind lan --port 18789 --force --verbose > /tmp/oc.log 2>&1 & echo 'Started PID:' $! && sleep 15 && echo '---PROCS---' && ps aux | grep openclaw | grep -v grep && echo '---PORTS---' && ss -tlnp && echo '---LOG---' && cat /tmp/oc.log",
  "read-oc-log": "cat /tmp/oc.log 2>/dev/null || echo 'No log'",
  "list-nodes": "openclaw node list 2>/dev/null || openclaw nodes 2>/dev/null || echo 'Could not list nodes'",
  "list-pending-nodes": "cat /root/.openclaw/devices/pending.json 2>/dev/null || echo '[]'",
  "list-paired-nodes": "cat /root/.openclaw/devices/paired.json 2>/dev/null || echo '[]'",
  "restart-whatsapp": "systemctl restart openclaw-whatsapp 2>/dev/null && sleep 3 && systemctl is-active openclaw-whatsapp && echo 'WhatsApp bot restarted successfully' && journalctl -u openclaw-whatsapp --no-pager -n 10 || echo 'Failed to restart WhatsApp bot'",
  "whatsapp-status": "echo '---SERVICE---'; systemctl is-active openclaw-whatsapp 2>/dev/null || echo 'inactive'; echo '---LOG---'; journalctl -u openclaw-whatsapp --no-pager -n 15 2>/dev/null || tail -15 /tmp/whatsapp-bot.log 2>/dev/null || echo 'No logs found'",
  "whatsapp-clear-session": "rm -rf /root/openclaw-whatsapp-bot/session 2>/dev/null && systemctl restart openclaw-whatsapp 2>/dev/null && sleep 3 && echo 'Session cleared and bot restarted' && journalctl -u openclaw-whatsapp --no-pager -n 10 || echo 'Failed'",
  "read-gateway-json": `cat /root/.openclaw/openclaw.json 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); gw=d.get("gateway",{}); print(json.dumps({"port":gw.get("port",18789),"bind":gw.get("bind","lan"),"token":gw.get("auth",{}).get("token",""),"password":gw.get("auth",{}).get("password","")},indent=2))' 2>/dev/null || echo '{"error":"Could not read gateway config"}'`,
  "gateway-info": "openclaw gateway status 2>/dev/null; echo '---TOKEN---'; openclaw gateway token 2>/dev/null || echo 'No token command'; echo '---VERSION---'; openclaw --version 2>/dev/null",
  "check-systemd": "systemctl list-units --type=service | grep -i openclaw; echo '---SERVICE---'; systemctl cat openclaw 2>/dev/null || systemctl cat openclaw-gateway 2>/dev/null || echo 'No systemd service found'; echo '---STATUS---'; systemctl status openclaw 2>/dev/null || systemctl status openclaw-gateway 2>/dev/null || echo 'No systemd status'; echo '---SUPERVISOR---'; supervisorctl status 2>/dev/null || echo 'No supervisor'; echo '---PM2---'; pm2 list 2>/dev/null || echo 'No pm2'",
  "fix-systemd-binding": "SVC=$(systemctl list-unit-files | grep -i openclaw | awk '{print $1}' | head -1); if [ -n \"$SVC\" ]; then systemctl stop $SVC; SVCFILE=$(systemctl show -p FragmentPath $SVC | cut -d= -f2); if [ -f \"$SVCFILE\" ]; then sed -i 's/--host 127.0.0.1/--host 0.0.0.0/g' $SVCFILE; sed -i 's/--host localhost/--host 0.0.0.0/g' $SVCFILE; systemctl daemon-reload; systemctl start $SVC; sleep 3; echo \"Updated and restarted $SVC\"; cat $SVCFILE; echo '---PORTS---'; ss -tlnp | grep 18789; else echo \"Service file not found for $SVC\"; fi; else echo 'No openclaw systemd service found'; fi",
  "cli-devices-list": `MODE=$(python3 -c "import json; d=json.load(open('/root/.openclaw/openclaw.json')); print(d['gateway']['auth'].get('mode','token'))") && if [ "$MODE" = "password" ]; then AUTH="--password $(python3 -c "import json; d=json.load(open('/root/.openclaw/openclaw.json')); print(d['gateway']['auth']['password'])")"; else AUTH="--token $(python3 -c "import json; d=json.load(open('/root/.openclaw/openclaw.json')); print(d['gateway']['auth']['token'])")"; fi && eval openclaw devices list --url ws://127.0.0.1:18789 $AUTH --json 2>&1 || echo '{"error":"command failed"}'`,
  "cli-nodes-status": `MODE=$(python3 -c "import json; d=json.load(open('/root/.openclaw/openclaw.json')); print(d['gateway']['auth'].get('mode','token'))") && if [ "$MODE" = "password" ]; then AUTH="--password $(python3 -c "import json; d=json.load(open('/root/.openclaw/openclaw.json')); print(d['gateway']['auth']['password'])")"; else AUTH="--token $(python3 -c "import json; d=json.load(open('/root/.openclaw/openclaw.json')); print(d['gateway']['auth']['token'])")"; fi && eval openclaw nodes status --url ws://127.0.0.1:18789 $AUTH --json 2>&1 || echo '{"error":"command failed"}'`,
  "cli-nodes-pending": `MODE=$(python3 -c "import json; d=json.load(open('/root/.openclaw/openclaw.json')); print(d['gateway']['auth'].get('mode','token'))") && if [ "$MODE" = "password" ]; then AUTH="--password $(python3 -c "import json; d=json.load(open('/root/.openclaw/openclaw.json')); print(d['gateway']['auth']['password'])")"; else AUTH="--token $(python3 -c "import json; d=json.load(open('/root/.openclaw/openclaw.json')); print(d['gateway']['auth']['token'])")"; fi && eval openclaw nodes pending --url ws://127.0.0.1:18789 $AUTH --json 2>&1 || echo '{"error":"command failed"}'`,
  "gateway-call-node-list": `MODE=$(python3 -c "import json; d=json.load(open('/root/.openclaw/openclaw.json')); print(d['gateway']['auth'].get('mode','token'))") && if [ "$MODE" = "password" ]; then PW=$(python3 -c "import json; d=json.load(open('/root/.openclaw/openclaw.json')); print(d['gateway']['auth']['password'])") && openclaw gateway call node.list --url ws://127.0.0.1:18789 --password "$PW" --json --timeout 15000 2>&1; else TOKEN=$(python3 -c "import json; d=json.load(open('/root/.openclaw/openclaw.json')); print(d['gateway']['auth']['token'])") && openclaw gateway call node.list --url ws://127.0.0.1:18789 --token "$TOKEN" --json --timeout 15000 2>&1; fi || echo '{"error":"gateway call node.list failed"}'`,
  "gateway-call-health": `MODE=$(python3 -c "import json; d=json.load(open('/root/.openclaw/openclaw.json')); print(d['gateway']['auth'].get('mode','token'))") && if [ "$MODE" = "password" ]; then PW=$(python3 -c "import json; d=json.load(open('/root/.openclaw/openclaw.json')); print(d['gateway']['auth']['password'])") && openclaw gateway call health --url ws://127.0.0.1:18789 --password "$PW" --json --timeout 15000 2>&1; else TOKEN=$(python3 -c "import json; d=json.load(open('/root/.openclaw/openclaw.json')); print(d['gateway']['auth']['token'])") && openclaw gateway call health --url ws://127.0.0.1:18789 --token "$TOKEN" --json --timeout 15000 2>&1; fi || echo '{"error":"gateway call health failed"}'`,
  "gateway-call-status": `MODE=$(python3 -c "import json; d=json.load(open('/root/.openclaw/openclaw.json')); print(d['gateway']['auth'].get('mode','token'))") && if [ "$MODE" = "password" ]; then PW=$(python3 -c "import json; d=json.load(open('/root/.openclaw/openclaw.json')); print(d['gateway']['auth']['password'])") && openclaw gateway call status --url ws://127.0.0.1:18789 --password "$PW" --json --timeout 15000 2>&1; else TOKEN=$(python3 -c "import json; d=json.load(open('/root/.openclaw/openclaw.json')); print(d['gateway']['auth']['token'])") && openclaw gateway call status --url ws://127.0.0.1:18789 --token "$TOKEN" --json --timeout 15000 2>&1; fi || echo '{"error":"gateway call status failed"}'`,
  "kill-gateway": "echo 'WARNING: This will stop the gateway. Use force-restart-gateway instead to safely restart.'; ps aux | grep openclaw-gateway | grep -v grep || echo 'No gateway process running'",
  "find-gateway-bin": "ls -la /usr/lib/node_modules/.bin/ 2>/dev/null | grep -i claw; echo '---NPM-BIN---'; npm bin -g 2>/dev/null; ls -la $(npm bin -g 2>/dev/null)/ 2>/dev/null | grep -i claw; echo '---PKG---'; cat /usr/lib/node_modules/openclaw/package.json 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); print(\"bin:\",json.dumps(d.get(\"bin\",{}),indent=2))' 2>/dev/null; echo '---DELETED---'; ls -la /proc/*/exe 2>/dev/null | grep deleted | grep -i claw; echo '---NPX---'; npx openclaw --version 2>&1 | head -5",
  "force-restart-gateway": "ls -la /usr/lib/node_modules/openclaw/dist/gateway/ 2>/dev/null | head -15; ENTRY=$(find /usr/lib/node_modules/openclaw/dist -name 'gateway.js' -o -name 'index.js' 2>/dev/null | head -1); echo \"Entry: $ENTRY\"; if [ -n \"$ENTRY\" ]; then rm -f /tmp/oc.log; kill $(pgrep -f 'node.*gateway') 2>/dev/null; sleep 1; cd /usr/lib/node_modules/openclaw && nohup node $ENTRY run --bind lan --port 18789 --force > /tmp/oc.log 2>&1 & sleep 15; ps aux | grep -E 'gateway' | grep -v grep; echo '---PORTS---'; ss -tlnp | grep 18789; echo '---LOG---'; tail -30 /tmp/oc.log; fi",
  "npm-reinstall-openclaw": "rm -rf /usr/lib/node_modules/.openclaw-* 2>/dev/null; npm install -g openclaw@latest 2>&1 | tail -10; echo '---DONE---'; which openclaw 2>/dev/null; openclaw --version 2>/dev/null",
  "approve-all-pending": `TOKEN=$(python3 -c "import json; d=json.load(open('/root/.openclaw/openclaw.json')); print(d['gateway']['auth']['token'])") && PENDING=$(openclaw devices list --url ws://127.0.0.1:18789 --token "$TOKEN" --json 2>/dev/null) && echo "$PENDING" | python3 -c "
import json,sys,subprocess
d=json.loads(sys.stdin.read())
pending=d.get('pending',[])
if not pending:
    print('No pending devices')
    sys.exit(0)
print(f'Approving {len(pending)} devices...')
import os
token=os.popen(\"python3 -c \\\"import json; d=json.load(open('/root/.openclaw/openclaw.json')); print(d['gateway']['auth']['token'])\\\"\").read().strip()
for p in pending:
    rid=p['requestId']
    r=subprocess.run(['openclaw','devices','approve',rid,'--url','ws://127.0.0.1:18789','--token',token],capture_output=True,text=True)
    name=p.get('displayName',p.get('clientId','unknown'))
    print(f'Approved: {name} ({rid})')
print('Done')
" 2>&1 || echo '{"error":"approve failed"}'`,
  "setup-auto-approve": `cat > /usr/local/bin/openclaw-auto-approve.sh << 'SCRIPT'
#!/bin/bash
TOKEN=$(python3 -c "import json; d=json.load(open('/root/.openclaw/openclaw.json')); print(d['gateway']['auth']['token'])")
PENDING=$(openclaw devices list --url ws://127.0.0.1:18789 --token "$TOKEN" --json 2>/dev/null)
echo "$PENDING" | python3 -c "
import json,sys,subprocess,os
d=json.loads(sys.stdin.read())
pending=d.get('pending',[])
token=os.popen(\"python3 -c \\\"import json; d=json.load(open('/root/.openclaw/openclaw.json')); print(d['gateway']['auth']['token'])\\\"\").read().strip()
for p in pending:
    subprocess.run(['openclaw','devices','approve',p['requestId'],'--url','ws://127.0.0.1:18789','--token',token],capture_output=True,text=True)
" 2>/dev/null
SCRIPT
chmod +x /usr/local/bin/openclaw-auto-approve.sh
(crontab -l 2>/dev/null | grep -v openclaw-auto-approve; echo "*/1 * * * * /usr/local/bin/openclaw-auto-approve.sh >> /tmp/auto-approve.log 2>&1") | crontab -
echo "Auto-approve cron installed (runs every minute)"
crontab -l | grep openclaw`,
  "install-ripgrep": "export DEBIAN_FRONTEND=noninteractive && apt-get update -qq 2>/dev/null && apt-get install -y -qq ripgrep 2>&1 | tail -3 && echo '---VERIFY---' && which rg && rg --version | head -1",
  "install-ffmpeg": "export DEBIAN_FRONTEND=noninteractive && apt-get install -y -qq ffmpeg 2>&1 | tail -3 && echo '---VERIFY---' && which ffmpeg && ffmpeg -version | head -1",
  "install-gh": "export DEBIAN_FRONTEND=noninteractive && (type gh >/dev/null 2>&1 && echo 'gh already installed' && gh --version) || (curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main' > /etc/apt/sources.list.d/github-cli.list && apt-get update -qq 2>/dev/null && apt-get install -y -qq gh 2>&1 | tail -3 && echo '---VERIFY---' && which gh && gh --version)",
  "install-pip3": "export DEBIAN_FRONTEND=noninteractive && apt-get install -y -qq python3-pip python3-venv 2>&1 | tail -3 && echo '---VERIFY---' && which pip3 && pip3 --version",
  "install-npm-tools": "for pkg in nano-pdf summarize xurl wacli goplaces obsidian-cli gifgrep ordercli openhue himalaya songsee; do echo \"Installing $pkg...\"; npm install -g $pkg 2>&1 | tail -2; done; echo '---VERIFY---'; npm -g ls --depth=0 2>/dev/null | tail -30",
  "install-linux-skill-tools": `echo "=== Installing Linux-compatible skill tools ===" ; \
echo "--- 1Password CLI ---" ; (which op 2>/dev/null && echo "already installed" || (curl -sS https://downloads.1password.com/linux/keys/1password.asc 2>/dev/null | gpg --dearmor --output /usr/share/keyrings/1password-archive-keyring.gpg 2>/dev/null && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/1password-archive-keyring.gpg] https://downloads.1password.com/linux/debian/amd64 stable main" > /etc/apt/sources.list.d/1password.list && apt-get update -qq 2>/dev/null && apt-get install -y -qq 1password-cli 2>&1 | tail -2)) ; \
echo "--- Gemini CLI ---" ; (which gemini 2>/dev/null && echo "already installed" || npm install -g @google/gemini-cli 2>&1 | tail -3) ; \
echo "--- Notion CLI ---" ; pip3 install --break-system-packages notion-client 2>&1 | tail -2 ; \
echo "--- Trello CLI ---" ; pip3 install --break-system-packages py-trello 2>&1 | tail -2 ; \
echo "--- Slack CLI ---" ; pip3 install --break-system-packages slack-sdk 2>&1 | tail -2 ; \
echo "--- Discord CLI ---" ; pip3 install --break-system-packages discord.py 2>&1 | tail -2 ; \
echo "=== DONE ===" ; echo "---SKILLS---" ; openclaw skills list 2>&1 | head -5`,
  "clawhub-install-missing": "export PATH=$HOME/.local/bin:$PATH && clawhub sync --all 2>&1 | tail -30; echo '---SKILLS---'; openclaw skills list 2>&1 | grep -E '✓|✗' | head -60",
  "clawhub-login-token": "clawhub login --token $CLAWHUB_TOKEN --no-browser 2>&1; echo '---VERIFY---'; clawhub whoami 2>&1",
  "clawhub-read-config": "cat /root/.config/clawhub/config.json 2>/dev/null; echo '---WHOAMI---'; clawhub whoami 2>&1",
  "install-missing-skills": "MISSING=$(openclaw skills list 2>&1 | grep '✗ missing' | sed 's/.*│[^│]*│[^│]*│\\s*\\([^ ]*\\).*/\\1/' | tr -d ' '); INSTALLED=0; FAILED=0; for skill in $MISSING; do echo \"Installing $skill...\"; openclaw skills install $skill 2>&1 | tail -1; if [ $? -eq 0 ]; then INSTALLED=$((INSTALLED+1)); else FAILED=$((FAILED+1)); fi; done; echo \"---DONE--- Installed: $INSTALLED, Failed: $FAILED\"; echo '---STATUS---'; openclaw skills list 2>&1 | head -5",
  "install-uv": "curl -LsSf https://astral.sh/uv/install.sh 2>/dev/null | sh 2>&1 | tail -5; echo '---VERIFY---'; which uv 2>/dev/null || echo 'uv not found'; export PATH=$HOME/.local/bin:$PATH; uv --version 2>/dev/null",
  "check-env-keys": "env | grep -iE 'OPENAI|GITHUB|NOTION|GEMINI|GOOGLE|ELEVENLABS|TRELLO|DISCORD|SLACK' 2>/dev/null; echo '---BASHRC---'; grep -iE 'export.*(OPENAI|GITHUB|NOTION|GEMINI|GOOGLE|ELEVENLABS|TRELLO)' /root/.bashrc /root/.profile /root/.env 2>/dev/null; echo '---OPENCLAW-ENV---'; cat /root/.openclaw/openclaw.json 2>/dev/null | grep -iE 'apiKey|api_key|token' | head -20",
  "set-env-key": "echo 'Use set-api-keys instead'",
  "check-skill-status": "openclaw skills list 2>&1",
  "clawhub-auth-status": "clawhub whoami 2>&1; echo '---TOKEN-SEARCH---'; find / -maxdepth 5 -name '*.json' -path '*clawhub*' 2>/dev/null; find / -maxdepth 5 -name 'token*' -path '*clawhub*' 2>/dev/null; find /root -name '.clawhub*' -o -name 'clawhub*' 2>/dev/null | head -20; echo '---XDG---'; echo \"XDG_CONFIG_HOME=$XDG_CONFIG_HOME\"; echo \"HOME=$HOME\"; ls -la /root/.config/clawhub/ 2>/dev/null || echo 'No /root/.config/clawhub/'; ls -la /root/.clawhub/ 2>/dev/null || echo 'No /root/.clawhub/'; echo '---NPM-LOC---'; npm root -g 2>/dev/null; ls -la $(npm root -g)/clawhub/ 2>/dev/null | head -5",
  "install-himalaya-bin": `cd /tmp && \
curl -sLo himalaya.tgz "https://github.com/pimalaya/himalaya/releases/download/v1.2.0/himalaya-v1.2.0-x86_64-linux.tgz" -H "Accept: application/octet-stream" --max-redirs 5 2>&1 && \
file himalaya.tgz && head -c 20 himalaya.tgz | xxd | head -2 && \
if file himalaya.tgz | grep -q gzip; then tar xzf himalaya.tgz && mv himalaya /usr/local/bin/ && chmod +x /usr/local/bin/himalaya && himalaya --version; \
else echo "Not gzip - trying cargo install"; pip install himalaya 2>/dev/null || cargo install himalaya 2>/dev/null || echo "Could not install himalaya"; fi`,
  "enable-plugins": `openclaw plugins enable whatsapp 2>&1; \
openclaw plugins enable discord 2>&1; \
openclaw plugins enable voice-call 2>&1; \
echo "--- Restarting gateway ---" && \
openclaw gateway restart 2>&1; \
echo "=== Skills after plugin enable ===" && \
openclaw skills list 2>&1 | head -5`,
  "plugins-list": `openclaw plugins list --json 2>/dev/null || openclaw plugins list 2>&1`,
  "plugins-installed": `openclaw plugins list --installed --json 2>/dev/null || openclaw plugins list --installed 2>&1 || echo '[]'`,
  "check-skill-bins": `echo "--- Checking required skill binaries ---" && \
for cmd in goplaces himalaya memo remindctl grizzly things imsg peekaboo camsnap gifgrep wacli openhue ordercli songsee nano-pdf blu eightctl blogwatcher sonoscli sag obsidian-cli xurl rg jq whisper ffmpeg gh tmux op gemini oracle mcporter summarize openclaw clawhub; do \
  P=$(which $cmd 2>/dev/null) && echo "✓ $cmd -> $P" || echo "✗ $cmd not found"; \
done`,
  "install-clawhub-skills": `echo "=== Installing ClawHub skills on VPS ===" && \
clawhub whoami 2>&1 && \
for skill in apple-notes apple-reminders bear-notes things-mac bluebubbles camsnap gifgrep imsg nano-pdf nano-banana-pro peekaboo sag discord gog model-usage notion obsidian openai-image-gen openai-whisper openai-whisper-api session-logs slack spotify-player trello blogwatcher blucli sonoscli eightctl openhue ordercli songsee; do \
  echo "Installing $skill..."; clawhub install $skill 2>&1 | tail -1; \
done && \
echo "--- Linking workspace skills ---" && \
mkdir -p /root/.openclaw/workspace && \
if [ ! -L /root/.openclaw/workspace/skills ] && [ -d /root/skills ]; then ln -sf /root/skills /root/.openclaw/workspace/skills; echo "Linked"; elif [ -L /root/.openclaw/workspace/skills ]; then echo "Already linked"; else echo "No ~/skills dir found"; fi && \
echo "=== DONE ===" && openclaw skills list 2>&1 | head -5`,
  "check-mac-skills": `TOKEN=$(python3 -c "import json; d=json.load(open('/root/.openclaw/openclaw.json')); print(d['gateway']['auth']['token'])") && \
echo "--- Trying to pair Mac Mini node ---" && \
MAC_ID=$(openclaw gateway call node.list --url ws://127.0.0.1:18789 --token "$TOKEN" --json --timeout 15000 2>/dev/null | python3 -c "
import json,sys
data = json.loads(sys.stdin.read())
for n in data.get('nodes',[]):
    if n.get('platform') == 'darwin' and n.get('connected'):
        print(n['nodeId'])
        break
" 2>/dev/null) && \
echo "Mac node ID: $MAC_ID" && \
echo "Paired status:" && \
openclaw nodes list --url ws://127.0.0.1:18789 --token "$TOKEN" --json 2>&1 | head -30 && \
echo "--- Attempting approve ---" && \
openclaw devices approve "$MAC_ID" --url ws://127.0.0.1:18789 --token "$TOKEN" 2>&1 && \
echo "--- Post-approve node list ---" && \
openclaw nodes list --url ws://127.0.0.1:18789 --token "$TOKEN" --json 2>&1 | head -30`,
  "add-replit-origin": `python3 -c "
import json
f='/root/.openclaw/openclaw.json'
d=json.load(open(f))
origins = d.get('gateway',{}).get('controlUi',{}).get('allowedOrigins',[])
replit_origins = ['https://claw-settings.replit.app','http://claw-settings.replit.app']
changed = False
for o in replit_origins:
    if o not in origins:
        origins.append(o)
        changed = True
d['gateway']['controlUi']['allowedOrigins'] = origins
json.dump(d,open(f,'w'),indent=2)
print('Origins now:', json.dumps(origins, indent=2))
print('Changed:', changed)
"`,
};

export interface SSHConnectionConfig {
  host: string;
  port?: number;
  username?: string;
  password?: string;
  privateKey?: string;
}

interface SSHResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode?: number;
}

function getDefaultConfig(): SSHConnectionConfig | null {
  const password = process.env.VPS_ROOT_PASSWORD;
  if (!password) return null;
  return {
    host: "72.60.167.64",
    port: 22,
    username: "root",
    password,
  };
}

export function buildSSHConfigFromVps(vps: { vpsIp: string; vpsPort: number; sshUser: string; sshKeyPath?: string | null }): SSHConnectionConfig {
  const config: SSHConnectionConfig = {
    host: vps.vpsIp,
    port: vps.vpsPort,
    username: vps.sshUser,
  };
  if (vps.sshKeyPath) {
    try {
      const fs = require("fs");
      config.privateKey = fs.readFileSync(vps.sshKeyPath, "utf8");
    } catch {}
  }
  if (!config.privateKey && process.env.VPS_ROOT_PASSWORD) {
    config.password = process.env.VPS_ROOT_PASSWORD;
  }
  return config;
}

export function getSSHConfig(overrides?: Partial<SSHConnectionConfig>): SSHConnectionConfig | null {
  const defaults = getDefaultConfig();
  if (!defaults && !overrides?.host) return null;
  return { ...defaults, ...overrides } as SSHConnectionConfig;
}

export function listAllowedCommands(): string[] {
  return Object.keys(ALLOWED_COMMANDS);
}

export function buildApproveNodeCommand(nodeId: string): string {
  const safeId = nodeId.replace(/[^a-zA-Z0-9_\-]/g, "");
  if (!safeId || safeId.length < 2 || safeId.length > 128) {
    throw new Error("Invalid node ID for approval");
  }
  return `python3 -c "
import json, os, sys
pending_path = '/root/.openclaw/devices/pending.json'
paired_path = '/root/.openclaw/devices/paired.json'
node_id = '${safeId}'
if not os.path.exists(pending_path):
    print(json.dumps({'error': 'No pending.json found'})); sys.exit(1)
with open(pending_path) as f:
    pending = json.load(f)
if isinstance(pending, dict):
    pending = list(pending.values()) if pending else []
node = None
remaining = []
for n in pending:
    nid = n.get('id','') if isinstance(n, dict) else str(n)
    if nid == node_id:
        node = n
    else:
        remaining.append(n)
if not node:
    print(json.dumps({'error': 'Node not found in pending'})); sys.exit(1)
paired = []
if os.path.exists(paired_path):
    with open(paired_path) as f:
        paired = json.load(f)
    if isinstance(paired, dict):
        paired = list(paired.values()) if paired else []
paired.append(node)
os.makedirs(os.path.dirname(pending_path), exist_ok=True)
with open(pending_path, 'w') as f:
    json.dump(remaining, f, indent=2)
with open(paired_path, 'w') as f:
    json.dump(paired, f, indent=2)
print(json.dumps({'success': True, 'node': node, 'remaining_pending': len(remaining), 'total_paired': len(paired)}))
"`;
}

export function buildRemoveDeviceCommand(nodeId: string): string {
  const safeId = nodeId.replace(/[^a-zA-Z0-9_\-]/g, "");
  if (!safeId || safeId.length < 2 || safeId.length > 128) {
    throw new Error("Invalid node ID for removal");
  }
  return `python3 -c "
import json, os, sys
paired_path = '/root/.openclaw/devices/paired.json'
node_id = '${safeId}'
if not os.path.exists(paired_path):
    print(json.dumps({'error': 'No paired.json found'})); sys.exit(1)
with open(paired_path) as f:
    paired = json.load(f)
if isinstance(paired, dict):
    paired = list(paired.values()) if paired else []
node = None
remaining = []
for n in paired:
    nid = n.get('deviceId','') or n.get('id','') if isinstance(n, dict) else str(n)
    if nid == node_id:
        node = n
    else:
        remaining.append(n)
if not node:
    print(json.dumps({'error': 'Device not found in paired list'})); sys.exit(1)
with open(paired_path, 'w') as f:
    json.dump(remaining, f, indent=2)
print(json.dumps({'success': True, 'removed': node, 'remaining_paired': len(remaining)}))
"`;
}

function buildGatewayTokenExtract(): string {
  return `python3 << 'PYEOF'
import json
with open("/root/.openclaw/openclaw.json") as f:
    d = json.load(f)
print(d["gateway"]["auth"]["token"])
PYEOF`;
}

export function buildCliApproveCommand(requestId: string): string {
  const safeId = requestId.replace(/[^a-zA-Z0-9_\-]/g, "");
  if (!safeId || safeId.length < 2 || safeId.length > 128) {
    throw new Error("Invalid request ID for approval");
  }
  return `TOKEN=$(${buildGatewayTokenExtract()}) && openclaw devices approve "${safeId}" --url ws://127.0.0.1:18789 --token "$TOKEN" --json 2>&1`;
}

export function buildCliRejectCommand(requestId: string): string {
  const safeId = requestId.replace(/[^a-zA-Z0-9_\-]/g, "");
  if (!safeId || safeId.length < 2 || safeId.length > 128) {
    throw new Error("Invalid request ID for rejection");
  }
  return `TOKEN=$(${buildGatewayTokenExtract()}) && openclaw devices reject "${safeId}" --url ws://127.0.0.1:18789 --token "$TOKEN" --json 2>&1`;
}

export function buildRejectNodeCommand(nodeId: string): string {
  const safeId = nodeId.replace(/[^a-zA-Z0-9_\-]/g, "");
  if (!safeId || safeId.length < 2 || safeId.length > 128) {
    throw new Error("Invalid node ID for rejection");
  }
  return `python3 -c "
import json, os, sys
pending_path = '/root/.openclaw/devices/pending.json'
node_id = '${safeId}'
if not os.path.exists(pending_path):
    print(json.dumps({'error': 'No pending.json found'})); sys.exit(1)
with open(pending_path) as f:
    pending = json.load(f)
if isinstance(pending, dict):
    pending = list(pending.values()) if pending else []
remaining = []
removed = False
for n in pending:
    nid = n.get('id','') if isinstance(n, dict) else str(n)
    if nid == node_id:
        removed = True
    else:
        remaining.append(n)
if not removed:
    print(json.dumps({'error': 'Node not found in pending'})); sys.exit(1)
with open(pending_path, 'w') as f:
    json.dump(remaining, f, indent=2)
print(json.dumps({'success': True, 'remaining_pending': len(remaining)}))
"`;
}

export async function executeRawSSHCommand(
  command: string,
  config?: SSHConnectionConfig,
  retries = 1,
  cmdTimeoutMs?: number
): Promise<SSHResult> {
  const sshConfig = config || getDefaultConfig();
  if (!sshConfig) {
    return { success: false, output: "", error: "No SSH credentials configured." };
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await executeSSHOnce(command, "raw", sshConfig, cmdTimeoutMs);
    if (result.success || attempt === retries) return result;
    if (result.error?.includes("timed out") || result.error?.includes("connection failed")) {
      await new Promise(r => setTimeout(r, 3000));
      continue;
    }
    return result;
  }

  return { success: false, output: "", error: "SSH failed after retries" };
}

export async function executeSSHRawCommand(
  command: string,
  config?: SSHConnectionConfig,
  retries = 1
): Promise<SSHResult> {
  const sshConfig = config || getDefaultConfig();
  if (!sshConfig) {
    return { success: false, output: "", error: "No SSH credentials configured. Add a VPS connection or set VPS_ROOT_PASSWORD secret." };
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await executeSSHOnce(command, "raw", sshConfig);
    if (result.success || attempt === retries) return result;
    if (result.error?.includes("timed out") || result.error?.includes("connection failed")) {
      await new Promise(r => setTimeout(r, 3000));
      continue;
    }
    return result;
  }

  return { success: false, output: "", error: "SSH failed after retries" };
}

export async function executeSSHCommand(
  action: string,
  config?: SSHConnectionConfig,
  retries = 1
): Promise<SSHResult> {
  const command = ALLOWED_COMMANDS[action];
  if (!command) {
    return { success: false, output: "", error: `Unknown action: ${action}. Allowed: ${Object.keys(ALLOWED_COMMANDS).join(", ")}` };
  }

  const sshConfig = config || getDefaultConfig();
  if (!sshConfig) {
    return { success: false, output: "", error: "No SSH credentials configured. Add a VPS connection or set VPS_ROOT_PASSWORD secret." };
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await executeSSHOnce(command, action, sshConfig);
    if (result.success || attempt === retries) return result;
    if (result.error?.includes("timed out") || result.error?.includes("connection failed")) {
      await new Promise(r => setTimeout(r, 3000));
      continue;
    }
    return result;
  }

  return { success: false, output: "", error: "SSH failed after retries" };
}

function executeSSHOnce(
  command: string,
  action: string,
  sshConfig: SSHConnectionConfig,
  cmdTimeoutMs?: number
): Promise<SSHResult> {
  return new Promise<SSHResult>((resolve) => {
    const conn = new Client();
    let resolved = false;

    const connectionTimeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        conn.end();
        resolve({ success: false, output: "", error: "SSH connection timed out" });
      }
    }, SSH_TIMEOUT_MS);

    conn.on("ready", () => {
      clearTimeout(connectionTimeout);

      const cmdTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          conn.end();
          resolve({ success: false, output: "", error: "Command execution timed out" });
        }
      }, cmdTimeoutMs || CMD_TIMEOUT_MS);

      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(cmdTimeout);
          if (!resolved) {
            resolved = true;
            conn.end();
            resolve({ success: false, output: "", error: err.message });
          }
          return;
        }

        let stdout = "";
        let stderr = "";

        stream.on("data", (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });

        stream.on("close", (code: number) => {
          clearTimeout(cmdTimeout);
          if (!resolved) {
            resolved = true;
            conn.end();
            resolve({
              success: code === 0 || (action === "status" && stdout.trim().length > 0),
              output: stdout.trim(),
              error: stderr.trim() || undefined,
              exitCode: code,
            });
          }
        });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(connectionTimeout);
      if (!resolved) {
        resolved = true;
        resolve({ success: false, output: "", error: `SSH connection failed: ${err.message}` });
      }
    });

    conn.connect({
      host: sshConfig.host,
      port: sshConfig.port || 22,
      username: sshConfig.username || "root",
      password: sshConfig.password,
      privateKey: sshConfig.privateKey,
      readyTimeout: SSH_TIMEOUT_MS,
      algorithms: {
        kex: [
          "ecdh-sha2-nistp256",
          "ecdh-sha2-nistp384",
          "ecdh-sha2-nistp521",
          "diffie-hellman-group-exchange-sha256",
          "diffie-hellman-group14-sha256",
          "diffie-hellman-group14-sha1",
        ],
      },
    });
  });
}

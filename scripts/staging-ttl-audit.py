"""Read-only staging D1/R2 audit. Run through ~/.local/bin/bluefin-cf.
Never prints credentials, capabilities, customer metadata, or object contents.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request

ROOT = 'https://api.cloudflare.com/client/v4/accounts/fc9c616595b1d9b6edb82fca91501e47'
DATABASE = 'f87e0350-e5ef-4173-a728-a0678b882c23'
BUCKET = 'bluefin-project-uploads-staging'
ORDERS = ['966850e0-bace-4638-9440-b14524e5ce6f', '039d322c-c207-4824-87bc-810d5e41de20']
HEADERS = {'X-Auth-Key': os.environ['CLOUDFLARE_API_KEY'], 'X-Auth-Email': os.environ['CLOUDFLARE_EMAIL'], 'Content-Type': 'application/json'}

def request(path, body=None):
    req = urllib.request.Request(ROOT + path, headers=HEADERS, data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()

status, raw = request('/d1/database/' + DATABASE + '/query', {
    'sql': 'SELECT f.id,f.order_id,f.r2_key,f.state,f.expires_at,f.deleted_at,f.retries,o.created_at,o.status AS order_status FROM order_files f JOIN orders o ON o.id=f.order_id WHERE o.id IN (?,?);',
    'params': ORDERS,
})
data = json.loads(raw)
if status != 200 or not data.get('success'):
    print(json.dumps({'http': status, 'auth': 'Global API Key', 'errors': data.get('errors')}))
    raise SystemExit(1)
files = []
for row in data['result'][0]['results']:
    key = row.pop('r2_key')
    status, body = request('/r2/buckets/' + BUCKET + '/objects/' + urllib.parse.quote(key, safe='/'))
    row['r2_http'] = status
    if status == 200:
        row['object_bytes'] = len(body)
        row['sha256'] = hashlib.sha256(body).hexdigest()
    elif status != 404:
        row['verification'] = 'FAIL: unexpected R2 HTTP response; absence not established'
    row['ttl_seconds'] = row['expires_at'] - row['created_at']
    files.append(row)
status, raw = request('/d1/database/' + DATABASE + '/query', {'sql': "SELECT value FROM housekeeping WHERE key='cleanup_completed';"})
heartbeat = json.loads(raw) if status == 200 else {'http': status}
now = datetime.datetime.now(datetime.timezone.utc)
report = {'checkedAt': now.isoformat(), 'files': files, 'heartbeat': heartbeat}
path = Path('docs/staging-ttl-audit-' + now.strftime('%Y%m%dT%H%M%SZ') + '.json')
path.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))

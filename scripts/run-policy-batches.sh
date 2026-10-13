#!/usr/bin/env bash
# Run the AdPad policy suites in small batches and print one compact line per suite.
set -u
APP="$1"; shift
for group in "$@"; do
  files=""
  for f in ${group//,/ }; do files="$files --file $f"; done
  # shellcheck disable=SC2086
  timeout 420 bounded tests run --app-id "$APP" $files --json > /tmp/policy-run.json 2>/tmp/policy-run.err
  python3 - <<'PY'
import json
try:
    d = json.load(open('/tmp/policy-run.json'))
except Exception as e:
    print('PARSE FAIL', e, open('/tmp/policy-run.err').read()[:300]); raise SystemExit
for run in d.get('runs', []):
    counts = run.get('counts', {})
    bad = [s for s in run.get('steps', []) if not s.get('ok')]
    failed = run.get('status') == 'failed'
    tag = 'FAIL' if failed else ('ERR' if run.get('status') == 'error' else 'PASS')
    detail = ''
    if bad:
        detail = ' | bad steps: ' + '; '.join(f"{s.get('index')}:{s.get('op')}:{s.get('summary','')[:60]}:{s.get('denial',{}).get('message','')[:80]}" for s in bad[:4])
    print(f"{tag} {run.get('fileName')}: steps={counts.get('steps')} expects={counts.get('expects')} failed={counts.get('failed')} err={(run.get('error') or '')[:120]}{detail}")
PY
done

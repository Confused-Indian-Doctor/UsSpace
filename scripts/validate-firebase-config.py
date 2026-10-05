#!/usr/bin/env python3
import json, pathlib, sys
p = pathlib.Path(__file__).resolve().parents[1] / "app" / "google-services.json"
package = "app.usspace.couple.v012"
if not p.exists():
    print(f"ERROR: missing {p}")
    sys.exit(2)
try:
    data=json.loads(p.read_text())
except Exception as e:
    print(f"ERROR: invalid google-services.json: {e}")
    sys.exit(2)
clients=[]
for c in data.get("client",[]):
    if c.get("client_info",{}).get("android_client_info",{}).get("package_name")==package:
        clients.append(c)
if not clients:
    print(f"ERROR: config has no Android client for {package}")
    sys.exit(3)
web=[]
for c in clients:
    web += [o for o in c.get("oauth_client",[]) if o.get("client_type")==3 and o.get("client_id")]
if not web:
    print("ERROR: no Web OAuth client (client_type 3). Enable Google provider, then download an updated google-services.json.")
    sys.exit(4)
print("FIREBASE_CONFIG_OK")
print("project_id:", data.get("project_info",{}).get("project_id",""))
print("package:", package)
print("web_client_id:", web[0]["client_id"])

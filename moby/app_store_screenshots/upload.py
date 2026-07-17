#!/usr/bin/env python3
"""Upload App Store screenshots via the App Store Connect API."""
import hashlib, json, sys, time
import jwt, requests

KEY_ID = "H6LNP5SATK"
ISSUER_ID = "4e253f57-f122-43ca-808a-a17d429763c7"
KEY_PATH = "/Users/apoorvjin/Downloads/AuthKey_H6LNP5SATK.p8"
APP_ID = "6783981998"
BASE = "https://api.appstoreconnect.apple.com/v1"

SETS = [
    ("APP_IPHONE_65", "/Users/apoorvjin/markets-with-monysa/moby/app_store_screenshots/iphone_6.5in"),
    ("APP_IPAD_PRO_3GEN_129", "/Users/apoorvjin/markets-with-monysa/moby/app_store_screenshots/ipad_13in"),
]

def token():
    with open(KEY_PATH) as f:
        key = f.read()
    now = int(time.time())
    return jwt.encode(
        {"iss": ISSUER_ID, "iat": now, "exp": now + 1200, "aud": "appstoreconnect-v1"},
        key, algorithm="ES256", headers={"kid": KEY_ID})

def hdr():
    return {"Authorization": f"Bearer {token()}", "Content-Type": "application/json"}

def die(msg, r):
    print(f"FATAL {msg}: {r.status_code} {r.text[:600]}"); sys.exit(1)

# 1. editable version
r = requests.get(f"{BASE}/apps/{APP_ID}/appStoreVersions",
                 params={"filter[appStoreState]": "PREPARE_FOR_SUBMISSION", "limit": 1}, headers=hdr())
if r.status_code != 200 or not r.json()["data"]:
    die("no editable version", r)
ver_id = r.json()["data"][0]["id"]
print("version:", ver_id, r.json()["data"][0]["attributes"]["versionString"])

# 2. en-US localization
r = requests.get(f"{BASE}/appStoreVersions/{ver_id}/appStoreVersionLocalizations", headers=hdr())
loc_id = next((d["id"] for d in r.json()["data"] if d["attributes"]["locale"] == "en-US"), None)
if not loc_id:
    die("no en-US localization", r)
print("localization:", loc_id)

# 3. existing screenshot sets
r = requests.get(f"{BASE}/appStoreVersionLocalizations/{loc_id}/appScreenshotSets", headers=hdr())
existing = {d["attributes"]["screenshotDisplayType"]: d["id"] for d in r.json()["data"]}
print("existing sets:", existing)

import glob, os
for display_type, folder in SETS:
    if display_type in existing:
        set_id = existing[display_type]
        # list + delete existing screenshots in the set so we start clean
        r = requests.get(f"{BASE}/appScreenshotSets/{set_id}/appScreenshots", headers=hdr())
        for shot in r.json().get("data", []):
            requests.delete(f"{BASE}/appScreenshots/{shot['id']}", headers=hdr())
        print(f"[{display_type}] reusing set {set_id} (cleared old shots)")
    else:
        r = requests.post(f"{BASE}/appScreenshotSets", headers=hdr(), json={
            "data": {"type": "appScreenshotSets",
                     "attributes": {"screenshotDisplayType": display_type},
                     "relationships": {"appStoreVersionLocalization": {
                         "data": {"type": "appStoreVersionLocalizations", "id": loc_id}}}}})
        if r.status_code != 201:
            die(f"create set {display_type}", r)
        set_id = r.json()["data"]["id"]
        print(f"[{display_type}] created set {set_id}")

    for path in sorted(glob.glob(os.path.join(folder, "*.png"))):
        name = os.path.basename(path)
        data = open(path, "rb").read()
        # reserve
        r = requests.post(f"{BASE}/appScreenshots", headers=hdr(), json={
            "data": {"type": "appScreenshots",
                     "attributes": {"fileName": name, "fileSize": len(data)},
                     "relationships": {"appScreenshotSet": {
                         "data": {"type": "appScreenshotSets", "id": set_id}}}}})
        if r.status_code != 201:
            die(f"reserve {name}", r)
        shot = r.json()["data"]
        shot_id = shot["id"]
        for op in shot["attributes"]["uploadOperations"]:
            chunk = data[op["offset"]:op["offset"] + op["length"]]
            headers = {h["name"]: h["value"] for h in op["requestHeaders"]}
            ur = requests.request(op["method"], op["url"], data=chunk, headers=headers)
            if ur.status_code not in (200, 201):
                die(f"upload chunk {name}", ur)
        # commit
        md5 = hashlib.md5(data).hexdigest()
        r = requests.patch(f"{BASE}/appScreenshots/{shot_id}", headers=hdr(), json={
            "data": {"type": "appScreenshots", "id": shot_id,
                     "attributes": {"uploaded": True, "sourceFileChecksum": md5}}})
        if r.status_code != 200:
            die(f"commit {name}", r)
        print(f"  uploaded {name} ({len(data)//1024} KB)")

print("ALL UPLOADS COMPLETE")

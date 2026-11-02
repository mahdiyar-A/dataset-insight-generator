"""
DIG spending kill switch.

Invoked by SNS when the "dig-real-money-cap" budget crosses 100% ($5 of real,
post-credit spend in a month). Deletes the Lightsail server and releases its
static IP, which brings ongoing charges to ~$0.

Deleting rather than stopping is deliberate: a stopped Lightsail instance is
still billed its full monthly bundle price. Deleting is safe because the server
is stateless — every byte of user data lives in Supabase — so it can be rebuilt
from the repository at any time.
"""

import json
import os

import boto3

REGION = os.environ.get("LS_REGION", "ca-central-1")
INSTANCE = os.environ.get("LS_INSTANCE", "dig-server")
STATIC_IP = os.environ.get("LS_STATIC_IP", "dig-ip")

ls = boto3.client("lightsail", region_name=REGION)


def _try(label, fn, done):
    try:
        fn()
        done.append(label)
    except ls.exceptions.NotFoundException:
        print(f"{label}: not found (already gone)")
    except Exception as exc:  # keep going — one failure must not block the rest
        print(f"{label}: {type(exc).__name__}: {exc}")


def handler(event, context):
    print("event:", json.dumps(event)[:2000])
    done = []
    _try("deleted instance",
         lambda: ls.delete_instance(instanceName=INSTANCE, forceDeleteAddOns=True), done)
    _try("released static ip",
         lambda: ls.release_static_ip(staticIpName=STATIC_IP), done)
    print("kill switch result:", done or "nothing to delete")
    return {"done": done}

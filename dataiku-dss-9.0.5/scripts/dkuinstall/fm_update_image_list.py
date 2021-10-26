from __future__ import print_function

import json
import requests
from requests.auth import HTTPBasicAuth
import argparse
import os
import shutil
import time
from pathlib2 import Path
import base

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Update available DSS images in Fleet Manager configuration")

    parser.add_argument("--file", "-f", help="Update with custom file")
    parser.add_argument("--url", "-u", help="Update with custom url")
    parser.add_argument("--user", help="Basic http auth user")
    parser.add_argument("--password", help="Basic http auth password")

    args = parser.parse_args()

    if args.user and args.password and not args.url:
        print('User and password provided without custom url')
        exit(code=1)
    if args.user and not args.password:
        print('User provided without password')
        exit(code=1)
    if args.password and not args.user:
        print('Password provided without user')
        exit(code=1)
 
    # Get FM information
    fm_version = base.DipHome(os.environ["DIP_HOME"]).get_dss_version()
    cloud = "aws" # Temporary
    print('[+] Fleet Manager version {} running on {}'.format(fm_version, cloud))

    # Get new metadata
    if args.file and args.url:
        raise BaseException("--file and --url options are mutually exclusive")
    if args.file:
        with Path(args.file).open() as f:
            metadata = json.load(f)
    elif args.url:
        print('[+] Downloading custom metadata from {}'.format(args.url))
        if args.user and args.password:
            print('With authentication')
            metadata = requests.get(args.url, auth=HTTPBasicAuth(args.user, args.password)).json()
        else:
            metadata = requests.get(args.url).json()
    else:
        url = 'https://downloads.dataiku.com/public/fm/{}/metadata-latest/{}-instance-images.json'.format(fm_version, cloud)
        print('[+] Downloading metadata from {}'.format(url))
        metadata = requests.get(url).json()

    target_path = Path('{}/resources/{}-instance-images.json'.format(os.environ["DIP_HOME"], cloud))

    if target_path.exists():
        backup_path = Path('{}.backup.{}'.format(str(target_path), int(time.time())))
        print('[+] Saving old resource file to {}'.format(str(backup_path)))
        shutil.copy(str(target_path), str(backup_path))

    print('[+] Writing new resource file')
    with target_path.open('w', encoding="utf-8") as f:
        f.write(unicode(json.dumps(metadata, indent=4, ensure_ascii=False)))
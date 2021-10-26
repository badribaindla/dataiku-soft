from .utils import p_tabulate_h, add_formatting_args
from dataikuapi.utils import DataikuException
import json

def admin_key_create(cmdargs, apiclient):
        newkey = apiclient.auth().add_key(label=cmdargs.label)
        if cmdargs.output == "fancy":
            if cmdargs.header:
                print ("The new API key is:")
            print ("\t%s" % newkey["key"])
        elif cmdargs.output == "json":
            print(json.dumps(newkey))

def declare_admin_key_create(subparsers, apiclient):
	p = subparsers.add_parser("admin-key-create", help="Create an administrator API key")
	p.add_argument("--label", help="Key label", default=None)
	p.add_argument("--description", help="Key long description", default=None)
	add_formatting_args(p)
	p.set_defaults(func=admin_key_create, apiclient=apiclient)

def admin_keys_list(cmdargs, apiclient):
        if cmdargs.output == "fancy":
            data = []
            for key in apiclient.auth().list_keys():
                    data.append([key["key"], key.get("label", "-")])
            p_tabulate_h(data, ["Key", "Label"], cmdargs.header)
        elif cmdargs.output == "json":
            print(json.dumps(apiclient.auth().list_keys()))

def declare_admin_keys_list(subparsers, apiclient):
	p = subparsers.add_parser("admin-keys-list", help="List administration API keys")
	add_formatting_args(p)
	p.set_defaults(func=admin_keys_list, apiclient=apiclient)

def admin_key_delete(cmdargs, apiclient):
        try:
            apiclient.auth().delete_key(cmdargs.key)
        except DataikuException as e:
            if str(e).endswith("Key to delete not found"):
                if cmdargs.output == "fancy":
                    print ("KEY NOT FOUND")
                elif cmdargs.output == "json":
                    print('{"result":false}')
                return
            else:
                raise
        except:
            raise

        if cmdargs.output == "fancy":
            print ("OK")
        elif cmdargs.output == "json":
            print('{"result":true}')

def declare_admin_key_delete(subparsers, apiclient):
	p = subparsers.add_parser("admin-key-delete", help="Delete an administrator API key")
	p.add_argument("key", help="Key to remove")
	add_formatting_args(p)
	p.set_defaults(func=admin_key_delete, apiclient=apiclient)

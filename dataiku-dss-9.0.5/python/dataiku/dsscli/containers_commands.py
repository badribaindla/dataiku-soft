from dataiku.dsscli.utils import add_formatting_args

from dataikuapi.dss.admin import DSSGeneralSettings

def push_base_images(cmdargs, apiclient):
    settings = DSSGeneralSettings(apiclient)
    settings.push_container_exec_base_images()

def declare_push_base_images(subparsers, apiclient):
    p = subparsers.add_parser("container-exec-base-images-push", help="Push base images for containers")
    add_formatting_args(p)
    p.set_defaults(func=push_base_images, apiclient=apiclient)

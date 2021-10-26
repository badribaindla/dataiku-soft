# inspired by the kernelspec.py of ipykernel

import errno
import json
import os
import shutil
import sys
import tempfile

from jupyter_client.kernelspec import KernelSpecManager

from dataiku.base.utils import TmpFolder


def install(kernel_name, remote_kernel_type, user=False, display_name=None, prefix=None, profile=None, env_name=None, env_lang=None, project_key=None, bundle_id=None, container_conf=None):
    kernel_dict = {
        'argv': [sys.executable, '-m', 'dataiku.notebook.remote_kernel_forwarder', '--remote-type', remote_kernel_type],
        'language' : env_lang
    }
    
    # add optional arguments
    if env_name is not None:
        kernel_dict['argv'].extend(['--env-name', env_name])
    if env_lang is not None:
        kernel_dict['argv'].extend(['--env-lang', env_lang])
    if project_key is not None:
        kernel_dict['argv'].extend(['--project-key', project_key])
    if bundle_id is not None:
        kernel_dict['argv'].extend(['--bundle-id', bundle_id])
    if container_conf is not None:
        kernel_dict['argv'].extend(['--container-conf', container_conf])

    if profile:
        kernel_dict['argv'].extend(["--profile", profile])
        
    # put the connection file last
    kernel_dict['argv'].extend(['--connection-file', '{connection_file}'])

    if display_name is None:
        kernel_dict['display_name'] = kernel_name
    else:
        kernel_dict['display_name'] = display_name

    with TmpFolder(os.path.join(tempfile.gettempdir(), 'remote_livy')) as path:
        with open(os.path.join(path, 'kernel.json'), 'w') as f:
            json.dump(kernel_dict, f, indent=2)

        kernel_spec_manager = KernelSpecManager()
        dest = kernel_spec_manager.install_kernel_spec(path, kernel_name=kernel_name, user=user, prefix=prefix)
    return dest

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(prog='remote-kernel-install', description="Install the remote Livy or containerized kernel spec.")
    parser.add_argument('--user', action='store_true', help="Install for the current user instead of system-wide")
    parser.add_argument('--name', type=str, default='remote_livy', help="Specify a name for the kernelspec.")
    parser.add_argument('--remote-type', type=str, default='livy', help="Specify a type for the remote kernelspec.")
    parser.add_argument('--display-name', type=str, help="Specify the display name for the kernelspec.")
    parser.add_argument('--profile', type=str, help="Specify an IPython profile to load. ")
    parser.add_argument('--prefix', type=str, help="Specify an install prefix for the kernelspec.")
    parser.add_argument('--sys-prefix', action='store_const', const=sys.prefix, dest='prefix', help="Install to Python's sys.prefix.")
    parser.add_argument('--env-lang', type=str, default='python', help="Specify a language")
    parser.add_argument('--env-name', type=str, help="Specify a code env name")
    parser.add_argument('--project-key', type=str, help="Specify a project key")
    parser.add_argument('--bundle-id', type=str, help="Specify a bundle id")
    parser.add_argument('--container-conf', type=str, help="Specify a container conf")
    opts = parser.parse_args(sys.argv[1:])
    dest = install(kernel_name=opts.name, remote_kernel_type=opts.remote_type, user=opts.user, profile=opts.profile, prefix=opts.prefix, display_name=opts.display_name, env_name=opts.env_name, env_lang=opts.env_lang, project_key=opts.project_key, bundle_id=opts.bundle_id, container_conf=opts.container_conf)    
    print("Installed kernelspec %s in %s" % (opts.name, dest))

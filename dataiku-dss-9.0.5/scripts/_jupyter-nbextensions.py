#! /usr/bin/env python

import sys, os, json, glob, shutil

def warning_if_extension_name_is_not_valid(nbextensions_path, extension_name, action, load_extensions):
    if action == "enable" and not os.path.exists(os.path.join(os.path.join(nbextensions_path, os.path.dirname(extension_name)), os.path.basename(extension_name)) + '.js'):
        print("You are trying to {} the extension:{} but we could not find it in {}. The extension can still be present in other places".format(action, extension_name, nbextensions_path))
    elif action == "disable" and not extension_name in load_extensions:
        print("You are trying to {} the extension:{} but we could not find it in the list of enabled extensions".format(action, extension_name))


def list_available(nbextensions_path):
    yaml_file_paths = sorted(glob.glob(os.path.join(nbextensions_path, '**/*.yaml')))
    print("List of extensions available")
    for yaml_file_path in yaml_file_paths:
        with open(yaml_file_path, 'r') as yaml_file:
            for line in yaml_file:
                if line.startswith('Main:'):
                    extension_dir_path = os.path.dirname(yaml_file_path)
                    extension_dir = os.path.basename(extension_dir_path)
                    extension_name = line.split("Main:", 1)[1].strip().rstrip('.js')
                    if os.path.exists(os.path.join(extension_dir_path, extension_name + '.js')):
                        print("{}/{}".format(extension_dir, extension_name))
                    break

def list_enabled(load_extensions):
    print("List of extensions enabled")
    for extension_name in sorted(load_extensions):
        if load_extensions.get(extension_name, False):
            print(extension_name)

if __name__ == "__main__":
    dip_home = os.environ.get('DIP_HOME')
    install_dir = os.environ.get('DKUINSTALLDIR')
    jupyter_config_path = os.environ.get("JUPYTER_CONFIG_DIR", os.path.join(dip_home, 'jupyter-run/jupyter'))
    jupyter_data_dir = os.environ.get("JUPYTER_DATA_DIR", os.path.join(dip_home, 'jupyter-run/jupyter'))
    if not dip_home:
        raise AssertionError("DIP_HOME variable not set")
    if not install_dir:
        raise AssertionError("DKUINSTALLDIR variable not set")
    if len(sys.argv) < 2:
        raise AssertionError("Usage: _jupyter-nbextensions.py action (list, enable, disable, available) [extension]")
    action = sys.argv[1].lower()
    if action != "list" and action != "enable" and action != "disable" and  action != 'available':
        raise AssertionError("Action is not supported. Possible actions: list, enable, disable, available")
    if (action == "enable" or action == "disable") and len(sys.argv) < 3:
        raise AssertionError("Usage: _jupyter-nbextensions.py action (enable, disable) extension")
    nbextensions_path = os.path.join(jupyter_data_dir, 'nbextensions')
    install_nbextensions = os.path.join(os.path.join(install_dir, 'dku-jupyter'), 'nbextensions')

    if action == 'available':
        list_available(install_nbextensions)
    else:
        notebook_config = os.path.join(jupyter_config_path, 'nbconfig/notebook.json')
        if not os.path.exists(notebook_config):
            if action == "list":
                list_enabled({})
                exit(0)
            else:
                os.makedirs(os.path.dirname(notebook_config))
                with open(notebook_config, 'a+') as notebook_conf_file:
                    json.dump({'load_extensions': {}}, notebook_conf_file, indent=4)
        with open(notebook_config, 'r+') as notebook_conf_file:
            notebook_conf = json.load(notebook_conf_file)
            load_extensions = notebook_conf.get('load_extensions', {});
            if action == "list":
                list_enabled(load_extensions)
            else:
                extension = sys.argv[2]
                is_enabled = action == 'enable'
                extension_dir = os.path.join(nbextensions_path, os.path.dirname(extension))
                extension_install_dir = os.path.join(install_nbextensions, os.path.dirname(extension))
                warning_if_extension_name_is_not_valid(install_nbextensions, extension, action, load_extensions)
                load_extensions[extension] = is_enabled
                if is_enabled and not os.path.exists(extension_dir) and os.path.exists(extension_install_dir):
                    shutil.copytree(extension_install_dir, extension_dir)
                notebook_conf["load_extensions"] = load_extensions
                notebook_conf_file.seek(0)
                json.dump(notebook_conf, notebook_conf_file, indent=4)
                notebook_conf_file.truncate()
                print("Extension {} {}d successfully".format(extension, action))

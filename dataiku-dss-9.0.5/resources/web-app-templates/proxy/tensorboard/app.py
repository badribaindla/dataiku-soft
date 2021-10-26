import tensorboard.default as tb_default
import tensorboard as tb
from tensorboard.backend import application
from tensorboard.version import VERSION
from io import BytesIO
import sys
import dataiku
import os, os.path as osp
from zipfile import ZipFile
import logging
from dataiku.doctor.deep_learning import gpu
from argparse import ArgumentParser
from tensorboard.plugins import base_plugin

gpu.deactivate_gpu()


def add_to_page(page, code):
    return page.replace('<tf-tensorboard', code + '<tf-tensorboard')


def __get_logs_path(s=None):
    custom_variables = dataiku.dku_custom_variables
    logs_dir = osp.abspath(osp.join(custom_variables['dip.home'],
                                    "analysis-data", custom_variables['projectKey'],
                                    custom_variables['analysisId'], custom_variables['taskId'],
                                    "sessions", s if s else custom_variables['sessionId'], 'pp1', 'm1',
                                    'tensorboard_logs'))
    return logs_dir


def customize_tb_page(tb_page):
    custom_variables = dataiku.dku_custom_variables

    keep_alive_script = "window.parent.angular && setInterval(()=>{window.parent.angular.element(window.parent.document.body).injector(\"dataiku\").get(\"Notification\").publishToBackend(\"timeoutable-task-keepalive\",{\"projectKey\":\"" + \
                        custom_variables["projectKey"] + "\", \"taskId\":\"" + custom_variables[
                            "webappId"] + "\"});},1000*30)"

    new_tb_page = tb_page \
        .replace('#f57c00', '#2aaf5d') \
        .replace('#2aaf5d', '#55707D') \
        .replace('#ff7043', '#2aaf5d') \
        .replace('#ff9800', '#2aaf5d').replace('#FFB74D', '#2aaf5d')
    new_tb_page = add_to_page(new_tb_page, '<script>' + str(keep_alive_script) + '</script>')
    new_tb_page = add_to_page(new_tb_page,
                              "<style>.sidebar.tf-scalar-dashboard {min-width: 200px;}.tf-runs-selector-0{display: none;}.tf-tensorboard-0 #toolbar.tf-tensorboard {background-color: #5f7d8c}</style>")

    return new_tb_page


def __get_custom_assets_zip_provider():
    path = os.path.join(os.path.dirname(tb.__file__), 'webfiles.zip')
    if not os.path.exists(path):
        logging.warning('webfiles.zip static assets not found: %s', path)
        return None

    in_memory_output_file = BytesIO()
    zf = ZipFile(in_memory_output_file, 'a')

    with open(path, 'rb') as fp:
        with ZipFile(fp) as zip_:
            for path in zip_.namelist():                
                content = zip_.read(path)
                if path == 'index.html':
                    if sys.version_info > (3,0):
                        # In Py3 ZipFile.read returns bytes, that need to be decoded
                        # in order to apply customization
                        content = content.decode("utf-8")
                    content = customize_tb_page(content)
                zf.writestr(path, content)
    zf.close()
    in_memory_output_file.seek(0)

    def __get_custom_assets_zip_provider_func():
        ret = BytesIO(in_memory_output_file.read())
        in_memory_output_file.seek(0)
        return ret

    return __get_custom_assets_zip_provider_func


# From v.1.10 onward, most arguments of the method standard_tensorboard_wsgi are set via an argparse.Namespace
# argument (flags)
def init_flags(loader_list):
    parser = ArgumentParser()
    for loader in loader_list:
        loader.define_flags(parser)
    flags = parser.parse_args([])
    return flags


# In v1.10.0 and later versions, standard_tensorboard_wsgi does no longer accept a list of plugins as one of its
# arguments, but rather a list of plugin loaders. Depending on the version, the list returned by
# tb_default.get_plugins() can  contain subclasses of TBPlugin, subclasses of TBLoader or instances of subclasses of
# TBLoader
def make_plugin_loader(plugin_spec):
    """Returns a plugin loader for the given plugin.
    Args:
      plugin_spec: A TBPlugin subclass, or a TBLoader instance or subclass.
    Returns:
      A TBLoader for the given plugin.
    """
    if isinstance(plugin_spec, base_plugin.TBLoader):
        return plugin_spec
    if isinstance(plugin_spec, type):
        if issubclass(plugin_spec, base_plugin.TBLoader):
            return plugin_spec()
        if issubclass(plugin_spec, base_plugin.TBPlugin):
            return base_plugin.BasicLoader(plugin_spec)
    raise TypeError("Not a TBLoader or TBPlugin subclass: %r" % (plugin_spec,))


def __get_tb_app(tensorboard_logs):
    major, minor, micro = VERSION.split(".")
    major, minor = int(major), int(minor)
    if major <= 1 and minor < 10:
        return application.standard_tensorboard_wsgi(
            logdir=tensorboard_logs,
            assets_zip_provider=__get_custom_assets_zip_provider(),
            purge_orphaned_data=True,
            reload_interval=5,
            plugins=tb_default.get_plugins())

    # In v.1.10 only, get_plugins() is not defined, and replaced with a list of loaders
    if major == 1 and minor == 10:
        loaders = tb_default.PLUGIN_LOADERS
    else:
        plugins_or_loaders = tb_default.get_plugins()
        loaders = [make_plugin_loader(plugin_spec) for plugin_spec in plugins_or_loaders]

    flags = init_flags(loaders)
    flags.purge_orphaned_data = True
    flags.reload_interval = 5.0
    flags.logdir = tensorboard_logs

    return application.standard_tensorboard_wsgi(
        plugin_loaders=loaders,
        assets_zip_provider=__get_custom_assets_zip_provider(),
        flags=flags
    )


# Substitute the standard webapp with the one created by TB
app = __get_tb_app(__get_logs_path())

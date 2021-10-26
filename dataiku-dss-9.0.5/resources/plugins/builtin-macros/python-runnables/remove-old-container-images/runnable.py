from dataiku.runnables import Runnable, ResultTable
from six.moves import configparser
import os, json, sys, io
import subprocess

class DeleteOldContainerImages(Runnable):
    def __init__(self, project_key, raw_config, plugin_config):
        self.project_key = project_key
        self.config = self._get_config(raw_config)
        self.is_python3 = sys.version_info >= (3, 0)

    def get_progress_target(self):
        return None

    def _get_install_id(self, dip_home):
        config = configparser.RawConfigParser()
        config.read(os.path.join(dip_home, 'install.ini'))

        if config.has_option('general', 'installid'):
            return config.get('general', 'installid').lower()

        return 'notattributed'

    def _get_config(self, raw_config):
        config = {}
        config['perform_deletion'] = bool(raw_config.get('perform_deletion', False))
        config['force_rm'] = bool(raw_config.get('force_rm', False))

        for opt in ['rm_none_images', 'use_custom_host', 'dont_guess_image_name', 'rm_dss_images']:
            config[opt] = bool(raw_config.get(opt, True))

        if config['dont_guess_image_name']:
            config['base_image_name'] = raw_config.get('custom_image_name', '')
            if not config['base_image_name']:
                raise ValueError('You should input a custom base image name that is not empty.')
        else:
            config['base_image_name'] = 'dku-exec-base-' + self._get_install_id(os.environ['DIP_HOME'])

        config['custom_docker_host'] = raw_config.get('custom_docker_host', '')

        return config

    def _get_docker_cmd(self, *args):
        if self.config['use_custom_host']:
            return ['docker', '--host', self.config['custom_docker_host']] + list(args)
        else:
            return ['docker'] + list(args)
            
    def _iterate_stdout(self, p):
        if self.is_python3:
            return io.TextIOWrapper(p.stdout, encoding="utf-8")
        else:
            return iter(p.stdout.readline, '')

    def run(self, progress_callback):
        to_delete = []

        # As `docker images` sorts images by creation date, we only have to keep the most recent one built for DSS.
        # Sample cmd: $ docker images 'dku-exec-base-notattributed' --format '{{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}'
        if self.config['rm_dss_images']:
            cmd = self._get_docker_cmd('images', self.config['base_image_name'], '--format', '{{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}')
            p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            is_most_recent = True
            for line in self._iterate_stdout(p):
                elements = line.split('\t')
                if len(elements) != 4:
                    continue

                if is_most_recent:
                    is_most_recent = False
                else:
                    to_delete.append({'repo': elements[0], 'tag': elements[1], 'id': elements[2], 'createdAt': elements[3]})

        # Dangling images, that could be wiped with `docker image prune` (but would need the docker daemon to be up-to-date)
        # Sample cmd: $ docker images -f 'dangling=true' --format '{{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}'
        if self.config['rm_none_images']:
            cmd = self._get_docker_cmd('images', '-f', 'dangling=true', '--format', '{{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}')
            p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            for line in self._iterate_stdout(p):
                elements = line.split('\t')
                if len(elements) != 4:
                    continue

                to_delete.append({'repo': elements[0], 'tag': elements[1], 'id': elements[2], 'createdAt': elements[3]})

        if self.config['perform_deletion']:
            rmi_args = [elt['id'] for elt in to_delete]
            print('Will delete these images: ' + str(rmi_args))
            if self.config['force_rm']:
                rmi_args.insert(0, '--force')
            cmd = self._get_docker_cmd('rmi', *rmi_args)
            subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)

        rt = ResultTable()
        rt.set_name("Removed containers")

        rt.add_column("repo", "Repository", "STRING")
        rt.add_column("tag", "Tag", "STRING")
        rt.add_column("id", "Identifier", "STRING")
        rt.add_column("createdAt", "Created at", "STRING")

        for elt in to_delete:
            rt.add_record([elt['repo'], elt['tag'], elt['id'], elt['createdAt']])

        return rt

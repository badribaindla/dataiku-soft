#! /usr/bin/env python

# Gets the docker images available on the backend

import os, os.path as osp
import json
import subprocess

def print_separator_msg(msg):
    print('********************************')
    print(msg)

done_docker_hosts = {}

def get_docker_images(docker_host, container_conf_name):
    if docker_host in done_docker_hosts:
        print('Same DOCKER_HOST as `%s` - not listing' % done_docker_hosts[docker_host])
        return

    done_docker_hosts[docker_host] = container_conf_name

    if docker_host is None:
        docker_host = os.getenv('DOCKER_HOST', '')

    print_separator_msg('Listing Docker images from `%s`' % docker_host)
    (stdout, _) = subprocess.Popen("docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}'",
                                   env=dict(os.environ, DOCKER_HOST=docker_host),
                                   shell=True,
                                   stdout=subprocess.PIPE, stderr=subprocess.STDOUT).communicate()
    print(stdout)

# Listing Docker images from the container configurations in DSS

with open(osp.join(os.getenv('DIP_HOME'), 'config', 'general-settings.json')) as f:
    general_settings = json.load(f)

for container_conf in general_settings['containerSettings']['executionConfigs']:
    print_separator_msg('Container config `%s`' % container_conf['name'])

    # Null/empty dockerHost
    if not 'dockerHost' in container_conf or not container_conf['dockerHost']:
        get_docker_images(None, container_conf['name'])
    else:
        get_docker_images(container_conf['dockerHost'], container_conf['name'])

import sys, logging
from dataiku.notebook.server_side_forwarder import ServerSideForwarder

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] [%(process)s/%(threadName)s] [%(levelname)s] [%(name)s] %(message)s', filename='forwarder.log')

# forward zmq comm between jupyter server and local kernel to a remote kernel

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(prog='remote-kernel', description="Run a remote Livy or containerized kernel.")
    parser.add_argument('--connection-file', help="Path to local connection file")
    parser.add_argument('--remote-type', type=str, help="Specify a type for the remote kernelspec.")
    parser.add_argument('--env-lang', type=str, help="Specify a code env language")
    parser.add_argument('--env-name', type=str, help="Specify a code env name")
    parser.add_argument('--project-key', type=str, help="Specify a project key")
    parser.add_argument('--bundle-id', type=str, help="Specify a bundle id")
    parser.add_argument('--container-conf', type=str, help="Specify a container conf")
    opts = parser.parse_args(sys.argv[1:])

    remote_kernel_type = opts.remote_type
    connection_file = opts.connection_file
    env_name = opts.env_name
    env_lang = opts.env_lang
    project_key = opts.project_key
    bundle_id = opts.bundle_id
    container_conf = opts.container_conf
    
    forward = ServerSideForwarder(remote_kernel_type, connection_file, env_lang, env_name, project_key, bundle_id, container_conf)
    forward.initialize()
    forward.start()

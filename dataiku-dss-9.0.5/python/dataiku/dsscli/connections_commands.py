from dataiku.dsscli.utils import add_formatting_args, p_format_arr


def connections_list(cmdargs, apiclient):
    connections = apiclient.list_connections()
    if connections and len(connections) > 0:
        retrieved_cols = ["name", "type", "allowWrite", "allowManagedDatasets", "usableBy", "credentialsMode"]
        header_cols = ["Name", "Type", "Allow write", "Allow managed datasets", "Usable by", "Credentials mode"]
        ret = [[connection[col] for col in retrieved_cols] for connection in connections.values()]
        p_format_arr(ret, retrieved_cols, header_cols, cmdargs)

def declare_connections_list(subparsers, apiclient):
    p = subparsers.add_parser("connections-list", help="List connections")
    add_formatting_args(p)
    p.set_defaults(func=connections_list, apiclient=apiclient)

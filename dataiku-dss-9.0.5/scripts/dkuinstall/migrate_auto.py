from __future__ import print_function
from os import path as osp
import sys

import base

# Automatically migrates the proper node type

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Bad usage", file=sys.stderr)
        sys.exit(1)

    dh = base.DipHome(sys.argv[1])

    if dh.get_install_config().getNodeType() == "fm":
        import migrate_fm
        
        migrate_fm.migrate(sys.argv[1])
    elif dh.get_install_config().getNodeType() == "gh":
        import migrate_gh
        
        migrate_gh.migrate(sys.argv[1])
    else:
        import migration_base, migrate_dss, migrate_apinode

        node_type = migration_base.get_node_type(dh)

        if node_type == "design" or node_type == "automation":
            migrate_dss.migrate(sys.argv[1])
        elif node_type == "api":
            migrate_apinode.migrate(sys.argv[1])
        else:
            raise Exception("Don't know how to migrate %s" % node_type)

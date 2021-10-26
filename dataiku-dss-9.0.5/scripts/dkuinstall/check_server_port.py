# Check whether server sockets are available

from __future__ import print_function
import errno
import socket
import sys

if len(sys.argv) == 1:
    print('Usage: %s [ADDRESS:]PORT ...' % sys.argv[0], file=sys.stderr)
    sys.exit(1)

for hostPort in sys.argv[1:]:
    colon = hostPort.find(':')
    if colon == -1:
        addr = ''
        port = int(hostPort)
    else:
        addr = hostPort[0:colon]
        port = int(hostPort[(colon + 1):])

    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        s.bind((addr, port))
    except socket.error as e:
        if e.errno == errno.EADDRINUSE:
            print("*** ERROR : server port %s is already in use" % hostPort, file=sys.stderr)
        else:
            print("*** Error checking server port %s : %s" % (hostPort, e), file=sys.stderr)
        sys.exit(1)
    s.close()

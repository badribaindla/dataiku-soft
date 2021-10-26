import base, os

# Prints DSS installid on standard output

if __name__ == "__main__":
    dh = base.DipHome(os.environ["DIP_HOME"])
    print(dh.get_install_id())

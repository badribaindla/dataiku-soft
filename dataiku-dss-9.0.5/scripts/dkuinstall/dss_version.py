import base, os

# Prints DSS version on standard output

if __name__ == "__main__":
    dh = base.DipHome(os.environ["DIP_HOME"])
    print(dh.get_dss_version())

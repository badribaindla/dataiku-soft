"""
store the current version info of the notebook.

"""

# Downstream maintainer, when running `python.setup.py jsversion`,
# the version string is propagated to the JavaScript files,  do not forget to
# patch the JavaScript files in `.postN` release done by distributions. 

# Next beta/alpha/rc release: The version number for beta is X.Y.ZbN **without dots**. 

version_info = (5, 4, 0)
__version__ = '.'.join(map(str, version_info[:3])) + ''.join(version_info[3:])

# Begin DKU specific
__version__ = "%s-dku-9.0-2" % __version__

import argparse, os, subprocess, tempfile, os.path as osp, sys, shutil, re, logging, sysconfig, stat
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

DEV_MODE = os.environ.get("DEV_MODE", False)
DKUPYTHONBIN = os.environ["DKUPYTHONBIN"]
DKUINSTALLDIR = os.environ["DKUINSTALLDIR"]
MYDIR = osp.dirname(osp.realpath(__file__))
if DEV_MODE:
    DKUINSTALL_PATH = "%s/packagers/dkuinstall" % DKUINSTALLDIR
else:
    DKUINSTALL_PATH = "%s/scripts/dkuinstall" % DKUINSTALLDIR

DSS_VERSION = subprocess.check_output([DKUPYTHONBIN, "%s/dss_version.py" % DKUINSTALL_PATH])
if sys.version_info > (3,0):
    DSS_VERSION = DSS_VERSION.decode("utf8")
DSS_VERSION = DSS_VERSION.lower().replace("/", "_").strip()

PYTHONVERSION = sysconfig.get_python_version()

def compute_source_image(image_type, r, cuda, cuda_version):
    """Base image for downloading"""

    r_suffix = "-r" if r else ""
    cuda_suffix = "-cuda%s" % cuda_version if cuda else ""

    if image_type == "container-exec":
        return "dataiku-dss-container-exec-base:dss-%s%s%s-py%s" % (DSS_VERSION, r_suffix, cuda_suffix, PYTHONVERSION)
    elif image_type == "spark":
        return "dataiku-dss-spark-exec-base:dss-%s%s%s-py%s" % (DSS_VERSION, r_suffix, cuda_suffix, PYTHONVERSION)
    elif image_type == "api-deployer":
        return "dataiku-dss-apideployer-base:dss-%s%s%s-py%s" % (DSS_VERSION, r_suffix, cuda_suffix, PYTHONVERSION)
    else:
        raise Exception("invalid image type %s"% image_type)

def compute_default_tag(image_type):
    """Computes the default tag that we'll write. This logic must match the one in DSS"""
    install_id = subprocess.check_output([DKUPYTHONBIN, "%s/dss_install_id.py" % DKUINSTALL_PATH])
    if sys.version_info > (3,0):
        install_id = install_id.decode("utf8")

    install_id = install_id.lower().strip()

    if image_type == "container-exec":
        return "dku-exec-base-%s:dss-%s" % (install_id, DSS_VERSION)
    elif image_type == "spark":
        return "dku-spark-base-%s:dss-%s" % (install_id, DSS_VERSION)
    elif image_type == "api-deployer":
        return "dku-apideployer-apinode-base:dss-%s" % DSS_VERSION
    else:
        raise Exception("invalid image type %s"% image_type)


class BaseImageBuilder(object):
    """
    All image builders derive for this. It only provides generic management
    of a build env and a Dockerfile string
    """
    def __init__(self, opts):
        self.opts = opts
        self.dockerfile = ""
        self.build_env_path =tempfile.mkdtemp(dir="%s/tmp" % os.environ["DIP_HOME"], 
                                              prefix="exec-docker-base-image.")

    def copy_to_buildenv(self, from_path, to=None):
        if to is None:
            to = self.build_env_path
        else:
            to = osp.join(self.build_env_path, to)
        if osp.isdir(from_path):
            shutil.copytree(from_path, to)
        else:
            shutil.copy2(from_path, to)

    def append_to_dockerfile(self, path):
        with open(path) as f:
            self.dockerfile += f.read()


class FinalizeOnlyImageBuilder(BaseImageBuilder):
    """
    When using 'download' or 'use' mode, we'll still create a new
    image, possibly to append customer options. The FinalizeOnly builder does that
    """
    def __init__(self, opts, source_image):
        super(FinalizeOnlyImageBuilder, self).__init__(opts)
        self.source_image = source_image

    def build(self):
        self.dockerfile += "FROM %s\n" % (self.source_image)
        if self.opts.dockerfile_append:
            self.append_to_dockerfile(self.opts.dockerfile_append)

class CompleteImageBuilder(BaseImageBuilder):
    """
    When using 'build' mode, we use this family of image builders"
    """

    def initialize_dockerfile(self):
        self.dockerfile += "FROM %s\n" % (self.opts.build_from_image)
        self.dockerfile += "WORKDIR /opt/dataiku\n"

        if self.opts.http_proxy:
            self.dockerfile += 'ENV http_proxy "%s"\n' % self.opts.http_proxy
        if self.opts.no_proxy:
            self.dockerfile += 'ENV no_proxy "%s"\n' % self.opts.no_proxy

        if self.opts.dockerfile_prepend:
            self.append_to_dockerfile(self.opts.dockerfile_prepend)


    DEFAULT_CENTOS7_SYSPACKAGES = [
        "curl", "procps", "bzip2", "python-devel",
        "python3", "python3-devel",
        "nginx", "expat", "zip", "unzip",
        "freetype", "libgfortran", "libgomp",
        "libicu-devel", "libcurl-devel", "openssl-devel", "libxml2-devel"
    ]

    def add_syspackages(self, additional=None):
        """
        Installs the core set of system packages + builder-specific ones + user-specified ones
        """

        if additional is None:
            additional = []
        if self.opts.system_packages is None:
            self.opts.system_packages =""
        user_packages = self.opts.system_packages.split(",")

        
        # add repo of nginx to get a version >=1.17 (because EPEL is stuck at 1.16)
        self.dockerfile += """
RUN echo $'[nginx-stable]\\n\\
name=nginx stable repo\\n\\
baseurl=http://nginx.org/packages/centos/$releasever/$basearch/\\n\\
gpgcheck=1\\n\\
enabled=1\\n\\
gpgkey=https://nginx.org/keys/nginx_signing.key\\n\\
module_hotfixes=true' > /etc/yum.repos.d/nginx.repo
"""

        self.dockerfile += """
RUN yum -y install epel-release && yum -y install %s %s %s \\
    && yum -y groupinstall "Development tools" && yum -y autoremove \\
    && yum clean all
""" % (" ".join(self.__class__.DEFAULT_CENTOS7_SYSPACKAGES)," ".join(additional), " ".join(user_packages))

    def add_python37(self):
        """Installs Python 3.7 in /usr/local"""
        if not opts.py37:
            return
        self.copy_to_buildenv(osp.join(DKUINSTALLDIR, "resources/container-exec/build-python37.sh"))
        self.dockerfile += """
COPY build-python37.sh build/
RUN build/build-python37.sh >/tmp/build-python.log && rm -f /tmp/build-python.log
"""

    def add_r_base(self):
        """Adds R system packages and installs (as root) the needed R packages"""
        self.dockerfile += """
RUN yum -y install R-core-devel && yum clean all
RUN echo 'install.packages(c( \\
    "httr", \\
    "RJSONIO", \\
    "dplyr", \\
    "curl", \\
    "IRkernel", \\
    "sparklyr", \\
    "ggplot2", \\
    "gtools", \\
    "tidyr", \\
    "rmarkdown", \\
    "base64enc", \\
    "filelock", \\
    "shiny" ), Ncpus=4, repos="%s")' | R --slave --no-restore
""" % (self.opts.cran_mirror)


    def add_cuda(self):
        """Adds CUDA to the image and displays the CUDA license banner"""
        if not self.opts.cuda:
            return
        if self.opts.cuda_version not in ["9.0", "10.0", "10.1", "10.2", "11.0"]:
            raise Exception("Invalid CUDA version %s" % self.cuda_version)
        
        cudnn_version_from_cuda_version = {"9.0": "7.6", "10.0": "7.6", "10.1": "7.6", "10.2": "8.0", "11.0": "8.0"}
        cuda_version = self.opts.cuda_version
        cudnn_version = cudnn_version_from_cuda_version[cuda_version]
        cuda_folder = osp.join(MYDIR, "../cuda")
        distrib_folder = "%s/distributions/centos7/%s" % (cuda_folder, cuda_version)

        with open(osp.join(cuda_folder, "terms-and-conditions-banner.txt")) as f:
            logging.info("\n%s" % f.read())

        self.copy_to_buildenv(osp.join(cuda_folder, "cuda.repo"))
        self.append_to_dockerfile(osp.join(distrib_folder, "Dockerfile-fragment-cuda-%s"% (cuda_version)))
        self.append_to_dockerfile(osp.join(distrib_folder, "Dockerfile-fragment-cuDNN-%s-cuda-%s"% (cudnn_version, cuda_version)))


class NonAPIExecImageBuilder(CompleteImageBuilder):
    """Common builder between container-exec and spark-exec"""

    def add_python(self):
        """
        Installs base virtualenv and installs Dataiku Python modules
        This part is run at the end of the dockerfile because the copied files change frequently (and invalidate the docker build cache on jenkins)
        """

        self.dockerfile += """
COPY virtualenv.pyz install-python-packages.sh build/
COPY dataiku python/dataiku
COPY dataikuapi python/dataikuapi
RUN python%s build/virtualenv.pyz pyenv && \\
    build/install-python-packages.sh pyenv/bin/pip && \\
    mkdir -p bin && \\
    echo -e '#!/bin/bash -e\\nexec /opt/dataiku/pyenv/bin/python "$@"' >bin/python && \\
    chmod a+x bin/python && \\
    bin/python -m compileall -q python && \\
    rm -rf ~/.cache/pip
ENV PYTHONPATH=/opt/dataiku/python
""" % PYTHONVERSION
        if DEV_MODE:
            self.copy_to_buildenv(osp.join(DKUINSTALLDIR, "src/main/python/dataiku"), "dataiku")
            self.copy_to_buildenv(osp.join(DKUINSTALLDIR, "../dataiku-api-client-python/dataikuapi"), "dataikuapi")
            self.copy_to_buildenv(osp.join(DKUINSTALLDIR, "dev/virtualenv.pyz"))
            self.copy_to_buildenv(osp.join(DKUINSTALLDIR, "packagers/studio/scripts/install/install-python-packages.sh"))
        else:
            self.copy_to_buildenv(osp.join(DKUINSTALLDIR, "python/dataiku"), "dataiku")
            self.copy_to_buildenv(osp.join(DKUINSTALLDIR, "python/dataikuapi"), "dataikuapi")
            self.copy_to_buildenv(osp.join(DKUINSTALLDIR, "scripts/virtualenv.pyz"))
            self.copy_to_buildenv(osp.join(DKUINSTALLDIR, "scripts/install/install-python-packages.sh"))

    def add_r(self):
        if not opts.r:
            return

        self.add_r_base()

        # And container-exec-specific R support
        self.dockerfile += """
# Copy R build capabilities
COPY install-packages-if-needed.sh build/
COPY minimal-packages-noconda.txt build/
COPY irkernel-packages-noconda.txt build/

# Install the equivalent of the base R packages of DSS globally
RUN mkdir R R/bin R/R.lib \
    && ln -s /usr/bin/R R/bin/R \
    && ln -s /usr/bin/Rscript R/bin/Rscript
ENV R_LIBS_USER=/opt/dataiku/R/R.lib
RUN build/install-packages-if-needed.sh R false build/minimal-packages-noconda.txt %s
COPY R-exec-wrapper.R R/
COPY R R/R.lib/
""" % (self.opts.cran_mirror)

        # Add R support files to build env
        self.copy_to_buildenv(osp.join(DKUINSTALLDIR, "dist/R" if DEV_MODE else "R"), "R")
        self.copy_to_buildenv(osp.join(DKUINSTALLDIR, "resources/code-envs/r/install-packages-if-needed.sh"))
        self.copy_to_buildenv(osp.join(DKUINSTALLDIR, "resources/code-envs/r/minimal-packages-noconda.txt"))
        self.copy_to_buildenv(osp.join(DKUINSTALLDIR, "resources/code-envs/r/irkernel-packages-noconda.txt"))
        self.copy_to_buildenv(osp.join(DKUINSTALLDIR, "resources/R/R-exec-wrapper.R"))


class ContainerExecImageBuilder(NonAPIExecImageBuilder):
    """Builds container-exec kind of image"""

    def build(self):
        self.initialize_dockerfile()
        self.add_syspackages()
        self.add_python37()
        self.add_r()
        self.add_cuda()
        self.add_python()
        self.add_webapp_support()
        self.add_nlp_resources()

        if self.opts.r:
            self.dockerfile += """
ENV DKU_SOURCE_LIB_R_PATH=/home/dataiku/lib/instance
"""
        self.copy_to_buildenv(osp.join(DKUINSTALLDIR, "dss-version.json"))

        # Final setup
        self.dockerfile += """
WORKDIR /home/dataiku

COPY dss-version.json /opt/dataiku/

# Fake DIP_HOME with tmp folder for R recipes
ENV DIP_HOME=/home/dataiku/fake_dip_home

RUN groupadd -r dataiku \
    && useradd -r -g dataiku -d /home/dataiku dataiku \
    && mkdir fake_dip_home fake_dip_home/tmp lib lib/project lib/instance plugin \
    && chown -Rh dataiku:dataiku /home/dataiku

# OpenShift compatibility:
# OpenShift runs containers with an arbitrary uid as an additional security measure
# Thus, we are not "dataiku" and cannot write inside /home/dataiku
# However, we are always gid=0, so we give /home/dataiku to gid 0 and make sure group can
# write into it.
# This is the official recommendation:
# https://docs.openshift.com/container-platform/4.3/openshift_images/create-images.html#images-create-guide-openshift_create-images
#  "Support arbitrary user ids"
#
# More details:
# This is enforced through a Security Context Constraint - see
# https://docs.openshift.com/container-platform/4.3/authentication/managing-security-context-constraints.html
# One of the SCC says
#  Run As User Strategy: MustRunAsRange
#    UID:                    <none>
#    UID Range Min:              <none>
#    UID Range Max:              <none>
# with the range given by an annotation on the project: openshift.io/sa.scc.uid-range=1000540000/10000
#
RUN chgrp -R 0 /home/dataiku && chmod -R 775 /home/dataiku

USER dataiku
ENTRYPOINT ["/opt/dataiku/bin/python", "-m", "dataiku.container.runner"]
"""
        if self.opts.dockerfile_append:
            self.append_to_dockerfile(self.opts.dockerfile_append)


    def add_webapp_support(self):
        os.makedirs(osp.join(self.build_env_path, "web"))
        webapp_static_files_base = "src/main/platypus" if DEV_MODE else "frontend"
        self.copy_to_buildenv(osp.join(DKUINSTALLDIR, webapp_static_files_base, "webapp-error-401.html"), "web")
        self.copy_to_buildenv(osp.join(DKUINSTALLDIR, webapp_static_files_base, "webapp-error-403.html"), "web")
        self.copy_to_buildenv(osp.join(DKUINSTALLDIR, webapp_static_files_base, "webapp-error-502.html"), "web")
        self.dockerfile += "COPY web/ /opt/dataiku/web/\n"

    def add_nlp_resources(self):
        os.makedirs(osp.join(self.build_env_path, "resources"))
        self.copy_to_buildenv(osp.join(DKUINSTALLDIR, "resources", "nlp"), "resources/nlp")
        self.dockerfile += "COPY resources/nlp /opt/dataiku/resources/nlp/\n"


class SparkExecImageBuilder(NonAPIExecImageBuilder):
    """Builder for Spark image"""

    def build(self):
        if not "DKU_SPARK_HOME" in os.environ:
            raise ValueError("Spark integration does not seem to be setup in DSS yet")
        if self.opts.cuda:
            raise ValueError("CUDA support is not available for Spark images")

        self.initialize_dockerfile()
        self.add_syspackages()
        self.add_python37()
        self.add_r()
        # No CUDA here ... at least for the moment
        self.add_python()
        self.add_spark()

        # Final setup
        self.dockerfile += """
RUN groupadd -r dataiku \
    && useradd -r -g dataiku -d /home/dataiku dataiku \
    && mkdir -p /home/dataiku && chown dataiku:dataiku /home/dataiku

WORKDIR /home/dataiku

# OpenShift compatibility - See container-exec for details
# This is normally not strictly required for Spark since we're not supposed
# to write in /home/dataiku but better be safe
RUN chgrp -R 0 /home/dataiku && chmod -R 775 /home/dataiku

USER dataiku
ENTRYPOINT ["/opt/spark/entrypoint.sh"]
"""
        if self.opts.dockerfile_append:
            self.append_to_dockerfile(self.opts.dockerfile_append)

    def add_spark(self):
        """Copies Spark from DKU_SPARK_HOME to the image"""
        SPARK_HOME = os.environ["DKU_SPARK_HOME"]

        # Copy Spark stuff to the build env
        os.makedirs(osp.join(self.build_env_path, "spark_home"))
        self.copy_to_buildenv(osp.join(SPARK_HOME, "jars"), "spark_home/jars/")
        self.copy_to_buildenv(osp.join(SPARK_HOME, "bin"), "spark_home/bin/")
        self.copy_to_buildenv(osp.join(SPARK_HOME, "sbin"), "spark_home/sbin/")
        self.copy_to_buildenv(osp.join(SPARK_HOME, "python"), "spark_home/python/")
        self.copy_to_buildenv(osp.join(SPARK_HOME, "R"), "spark_home/R/")
        # self.copy_to_buildenv(osp.join(SPARK_HOME, "kubernetes/dockerfiles/spark/entrypoint.sh"), "spark_home/entrypoint.sh.base")

        with open(osp.join(self.build_env_path, "env-site.sh"), "w") as f:
            f.write('export PYTHONPATH=${CODE_ENV_PYTHONPATH:-/opt/dataiku/python}:/opt/spark/python/lib/pyspark.zip:/opt/spark/python/lib/py4j-*.zip\n')

        # tweak the entrypoint.sh to :
        # - set the PYTHONPATH to override the override from CodeEnv.dockerfile (which doesn't put py4j.zip on the PYTHONPATH)
        # - read a env-site.sh to make it easier to override stuff in the entrypoint.sh (starting with PYTHONPATH)
        # - ditch the use of 'tini' (not available on centos unless you want to fight for it)
        with open(osp.join(SPARK_HOME, "kubernetes/dockerfiles/spark/entrypoint.sh")) as f:
            entrypoint = f.read()
        entrypoint = re.sub(".*\\/tini .*-- (.*)", "\\1", entrypoint)
        entrypoint = re.sub("(#!.*)", "\\1\nsource /opt/dataiku/env-site.sh", entrypoint)
        # print("ep:\n%s\n" % entrypoint)
        with open(osp.join(self.build_env_path, "spark_home/entrypoint.sh"), "w") as f:
            f.write(entrypoint)

        self.dockerfile += """
# spark specificity w.r.t. python
ENV PYTHONPATH=/opt/dataiku/python:/opt/spark/python/lib/pyspark.zip:/opt/spark/python/lib/py4j-*.zip

RUN yum install -y \
       java-1.8.0-openjdk \ 
       java-1.8.0-openjdk-devel \ 
    && echo "securerandom.source=file:/dev/urandom" >> /usr/lib/jvm/jre/lib/security/java.security \
    && yum clean all

# Copy stuff from SPARK_HOME
COPY spark_home/ /opt/spark/
COPY env-site.sh /opt/dataiku/env-site.sh
RUN chmod 755 /opt/spark/entrypoint.sh

ENV SPARK_HOME /opt/spark
ENV LD_LIBRARY_PATH /lib64
"""


class APIImageBuilder(CompleteImageBuilder):
    """
    Builds images for API deployer. Works pretty differently from the
    others as it installs a full DSS in the container
    """

    # Comes in addition to DEFAULT_CENTOS7_SYSPACKAGES
    APINODE_CENTOS7_SYSPACKAGES = [
        "git", "acl", "java-1.8.0-openjdk"
    ]

    def build(self):
        self.initialize_dockerfile()
        self.add_syspackages(additional=APIImageBuilder.APINODE_CENTOS7_SYSPACKAGES)
        self.add_python37()
        if self.opts.r:
            self.add_r_base()
        self.add_cuda()

        self.dockerfile += """
MAINTAINER Dataiku <dss@dataiku.com>
ENV SHELL "/bin/bash"
ENV TERM 1
ENV LANG en_us.utf8
RUN groupadd -r dataiku \
    && useradd -r -g dataiku -d /home/dataiku dataiku \
    && mkdir /home/dataiku \
    && chown -Rh dataiku:dataiku /home/dataiku
"""

        self.copy_and_install_apinode()
        if self.opts.dockerfile_append:
            self.append_to_dockerfile(self.opts.dockerfile_append)

    def copy_and_install_apinode(self):
        self.dockerfile += "ENV BUILD_TIMESTAMP=$(date)\n"
        if PYTHONVERSION == "2.7":
            PYTHON_PACKAGES = "python.packages"
        elif PYTHONVERSION == "3.6":
            PYTHON_PACKAGES = "python36.packages"
        elif PYTHONVERSION == "3.7":
            PYTHON_PACKAGES = "python37.packages"
        else:
            raise ValueError("Python version not supported: %s" % PYTHONVERSION)

        if DEV_MODE:
            self.dockerfile += """
COPY "dataiku-dss.tar.gz" /tmp/dataiku-dss.tar.gz

RUN /bin/su - dataiku -c "mkdir -p /home/dataiku/installdir && /bin/tar xzf /tmp/dataiku-dss.tar.gz -C /home/dataiku/installdir --strip-components=1" \
 && /bin/rm /tmp/dataiku-dss.tar.gz \
 && /bin/su - dataiku -c "/home/dataiku/installdir/installer.sh -t api -d /home/dataiku/data -p 12000 -P python%s"
""" % PYTHONVERSION
            logging.info("Building DSS kit")
            subprocess.Popen("""
cd %s/../../

#make backend.nospark
cd packagers/studio
#rm -rf devkit-form4
#NOPLUGINS=1 NOGEO=1 NOTUTORIALS=1 NOGEOIP=1 ./make-studio-package.sh devkit-form4 devkit-form4
cp devkit-form4/dataiku-dss-devkit-form4.tar.gz %s

cd %s""" % (MYDIR, MYDIR, MYDIR), shell=True).wait()

            self.copy_to_buildenv(osp.join(MYDIR, "dataiku-dss-devkit-form4.tar.gz"), "dataiku-dss.tar.gz")

        else:
            for item in ["dist", "dku-jupyter", "dss-version.json", "installer.sh",
                         "lib", "python", PYTHON_PACKAGES, "R", "resources", "scripts", "conda.packages"]:
                self.dockerfile += 'COPY "%s" /home/dataiku/installdir/%s\n' % (item, item)
                self.copy_to_buildenv(osp.join(DKUINSTALLDIR, item), item)

            self.dockerfile += """
RUN /bin/su - dataiku -c "/home/dataiku/installdir/installer.sh -t api -d /home/dataiku/data -p 12000 -P python%s"
""" % PYTHONVERSION
        if self.opts.r:
            self.dockerfile += 'RUN /bin/su - dataiku -c "/home/dataiku/data/bin/dssadmin install-R-integration"'



def run_wait_check(cmd, shell=False):
    """Runs a process, don't capture output"""
    logging.info("Running command: %s" % (cmd))
    retcode = subprocess.Popen(cmd, shell=shell).wait()
    if retcode != 0:
        raise Exception("Command failed: %s - code %s" % (cmd, retcode))


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(prog='build-images.py', description="Build container images")
    parser.add_argument('--type', required=True, choices=["container-exec", "api-deployer", "spark"], help="Type of image to build")
    parser.add_argument('--mode', default="build", choices=["build", "download", "use", "build-push"], help="What to do")

    # Only if mode == "use" or mode == "download"
    parser.add_argument('--source-image', help="[mode=download or mode=use] Source image to use")

    # Only if mode == "download"
    parser.add_argument('--source-registry', help="[mode=download] Source registry base URL")

    # Only if mode == "build" or mode == "build-push"
    parser.add_argument('--build-from-image', type=str, default='centos:7', help="[mode=build only] Base image to use when building from scratch")
    parser.add_argument('--system-packages', type=str, help="[mode=build only] Comma-separated list of additional system packages")
    parser.add_argument('--http-proxy', type=str, help="[mode=build only] http_proxy string for buildilng")
    parser.add_argument('--no-proxy', type=str, help="[mode=build only] no_proxy string for building")
    parser.add_argument('--dockerfile-prepend', help="[mode=build only] File to prepend to the Dockerfile")
    parser.add_argument('--cran-mirror', default="https://cloud.r-project.org", help="[mode=build only] CRAN mirror to use to download packages")
    parser.add_argument('--docker-build-opt', help="Add a docker build option", action="append")

    # Only if mode == "build-push"
    parser.add_argument('--target-registry')

    # Whatever the mode
    parser.add_argument('--tag', help="Output image tag")
    parser.add_argument('--without-r',action="store_false", dest="r", help="Disable R (default: enabled)")
    parser.add_argument('--with-r',action="store_true", dest="r", help="Enable R (default: enabled)")
    parser.add_argument('--without-py37',action="store_false", dest="py37", help="Disable Python 3.7 (default: enabled)")
    parser.add_argument('--with-py37',action="store_true", dest="py37", help="Enable Python 3.7 (default: enabled)")
    parser.add_argument('--with-cuda', action="store_true", dest="cuda", help="Enable CUDA (default: disabled")
    parser.add_argument('--without-cuda',action="store_false", dest="cuda", help="Disable CUDA (default: disabled)")
    parser.add_argument('--cuda-version', type=str, default="10.0", help="Cuda version")
    parser.add_argument('--dockerfile-append', help="Appended to the Dockerfile")
    parser.add_argument('--copy-to-buildenv', help="Copy to the buildenv. SOURCE DEST", nargs=2, action="append")


    opts = parser.parse_args(sys.argv[1:])

    logging.info("Building image with options: %s" % (opts))

    if opts.tag is None:
        tag = compute_default_tag(opts.type)
    else:
        tag = opts.tag

    if opts.mode == "download" or opts.mode == "use":
        if opts.source_image is None:
            source_image = compute_source_image(opts.type, opts.r, opts.cuda, opts.cuda_version)
        else:
            source_image = opts.source_image
        if opts.source_registry is not None:
            source_image = "%s/%s" % (opts.source_registry, source_image)

    if opts.mode == "download":
        logging.info("Pulling %s" % source_image)
        run_wait_check(["docker", "pull", source_image])

    if opts.mode == "use" or opts.mode == "download":
        logging.info("Building final image from %s" % source_image)
        # TODO: If there is nothing to add, we should not do a build but a simple
        # retagging?
        builder = FinalizeOnlyImageBuilder(opts, source_image)

    elif opts.mode == "build" or opts.mode == "build-push":
        if opts.type == "container-exec":
            builder = ContainerExecImageBuilder(opts)
        elif opts.type == "spark":
            builder = SparkExecImageBuilder(opts)
        elif opts.type == "api-deployer":
            builder = APIImageBuilder(opts)

    logging.info("Preparing build env and Dockerfile")
    builder.build()

    if opts.copy_to_buildenv is not None:
        for copy in opts.copy_to_buildenv:
            logging.info("Copying to buildenv: %s -> %s" % (copy[0], copy[1]))
            builder.copy_to_buildenv(copy[0], copy[1])
            
    # make sure all the build dir contents bear the right permissions, ie copy the read and execute
    # from the owner to group and other => otherwise in the container the files might end up
    # owned by root and inaccessible to the user set as the run user (permissions copied from install dir)
    def copy_rx_from_owner(p):
        try:
            s = os.stat(p).st_mode
            ns = s
            # copy the read permission if needed
            if bool(s & stat.S_IRUSR):
                ns |= stat.S_IRGRP
                ns |= stat.S_IROTH
            # copy the execute/traversal permission if needed
            if bool(s & stat.S_IXUSR):
                ns |= stat.S_IXGRP
                ns |= stat.S_IXOTH
            if s != ns:
                logging.info("Fixup permission on %s : %s -> %s" % (p, oct(s), oct(ns)))
                os.chmod(p, ns)
        except Exception as e:
            logger.warning("Failed to fixup build file permissions : %s" % str(e))
            
    for root, dirs, files in os.walk(builder.build_env_path, followlinks=False):  
        for d in dirs:
            p = os.path.join(root, d)
            copy_rx_from_owner(p)
        for f in files:
            p = os.path.join(root, f)
            copy_rx_from_owner(p)

    logging.info("Docker build env and Dockerfile ready, building it")
    logging.info("Build env path:%s" % builder.build_env_path)
    logging.info("Dockerfile content:\n%s" % builder.dockerfile)

    with open(osp.join(builder.build_env_path, "Dockerfile"), "w") as f:
        f.write(builder.dockerfile)

    docker_cmd = ["docker", "build", "-t", tag]
    if opts.docker_build_opt is not None:
        for opt in opts.docker_build_opt:
            docker_cmd.append(opt.strip())
    docker_cmd.append(builder.build_env_path)

    run_wait_check(docker_cmd)

    if opts.mode == "build-push":
        target_image_tag = compute_source_image(opts.type, opts.r, opts.cuda, opts.cuda_version)
        if opts.target_registry is None:
            raise Exception("At least a target registry prefix must be given")
        target_image_tag = "%s/%s" % (opts.target_registry, target_image_tag)
        run_wait_check(["docker", "tag", tag, target_image_tag])
        run_wait_check(["docker", "push", target_image_tag])

    logging.info("Done, cleaning up")
    # TODO

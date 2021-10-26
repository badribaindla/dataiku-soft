# Setting Java processes options
from __future__ import print_function
import re, subprocess, logging

def get_jvm(javabin):
    """Gets JVM type and version, as a tuple (jvm_kind, major_version)"""
    process = subprocess.Popen([javabin, "-version"], stderr=subprocess.PIPE)
    out, err = process.communicate()
    retcode = process.poll()
    if retcode:
        print(err, file=sys.stderr) # NOSONAR
        raise subprocess.CalledProcessError(retcode, javabin)
    # Lookup known versions
    if b"\nJava HotSpot" in err:
        if b"java version \"11." in err:
            return ("hotspot", 11)
        elif b"java version \"10." in err:
            return ("hotspot", 10)
        elif b"java version \"9." in err:
            return ("hotspot", 9)
        else:
            hotspot_version_major_re = re.compile(b"^java version \"1\\.([0-9]).*", re.MULTILINE)
            match = hotspot_version_major_re.match(err)
            if match:
                return ("hotspot", int(match.group(1)))
            else:
                return ("hotspot", 7)

    elif b"\nOpenJDK " in err:
        if b"openjdk version \"11." in err:
            return ("openjdk", 11)
        elif b"openjdk version \"10." in err:
            return ("openjdk", 10)
        elif b"openjdk version \"9." in err:
            return ("openjdk", 9)
        else:
            openjdk_version_major_re = re.compile(b"^openjdk version \"1\\.([0-9]).*", re.MULTILINE)
            match = openjdk_version_major_re.match(err)
            if match:
                return ("openjdk", int(match.group(1)))
            else:
                return ("openjdk", 7)

    elif b"\nIBM J9 VM " in err:
        j9_version_major_re = re.compile(b"^java version \"1\\.([0-9]).*", re.MULTILINE)
        match = j9_version_major_re.match(err)
        if match:
            return ("j9", int(match.group(1)))
        else:
            return ("j9", 7)

    else:
        return ("unknown", 7)


def get_common_java_opts(jvm):
    """Gets Java options that are common to all processes
    (ie added to the common DKU_JAVA_OPTS variable rather than to the per-process DKU_XXX_JAVA_OPTS)"""

    ret = "-ea -Dfile.encoding=utf8 -Djava.awt.headless=true -Djava.security.egd=file:/dev/./urandom -Djava.io.tmpdir=$DIP_HOME/tmp"

    # Java 9 compatibility fixes
    if jvm[0] in ["hotspot", "openjdk"] and jvm[1] >= 9:
        # Avoid CGLIB warning (see SPR-15859)
        ret += " --add-opens java.base/java.lang=ALL-UNNAMED"

    return ret
    
def get_perprocess_java_opts(installConfig, jvm, prefix, permgenDefault="256m", xmxDefault="2g", gcDefault="auto_lowpause", addGCLogging=True):
    ret = ""
    
    # Memory
    xmx = installConfig.getPrefixedOption("javaopts", prefix, "xmx", xmxDefault)

    if jvm[0] in [ "hotspot", "openjdk" ]:
        if jvm[1] >= 8:
            ret += "-Xmx%s" % (xmx)
        else:
            permgen = installConfig.getPrefixedOption("javaopts", prefix, "permgen", permgenDefault)
            ret += "-Xmx%s -XX:MaxPermSize=%s" % (xmx, permgen)
    else:
        ret += "-Xmx%s" % (xmx)

    # GC
    if gcDefault == "auto_lowpause":
        # For "latency-first processes" (the backend), use G1 preferably
        if jvm[0] in [ "hotspot", "openjdk" ] and jvm[1] >= 8:
            gcDefault = "g1"
        else:
            gcDefault = "parallel"

    gc = installConfig.getPrefixedOption("javaopts", prefix, "gc", gcDefault)

    if gc == "custom":
        # Don't add any GC option
        pass
    else:
        if gc == "parallel":
            ret += " -XX:+UseParallelGC"
        elif gc == "concmarksweep":
            ret += " -XX:+UseConcMarkSweepGC"
        elif gc == "g1":
            ret += " -XX:+UseG1GC"
        else:
            logging.warn("Unknown GC: " + gc)

        if addGCLogging and jvm[0] in [ "hotspot", "openjdk" ]:
            if jvm[1] >= 9:
                ret += " -Xlog:gc,gc+cpu=info:stderr:t,um,l,ti,tg"
            elif gc == "g1":
                # G1 on Java 8 is very very verbose, so don't print GC details
                ret += " -Xloggc:/dev/stderr -XX:+PrintGCTimeStamps"
            else:
                ret += " -Xloggc:/dev/stderr -XX:+PrintGCDetails -XX:+PrintGCTimeStamps"

    # Other
    additionalOpts = installConfig.getPrefixedOption("javaopts", prefix, "additional.opts", "")
    ret += " %s" % additionalOpts

    return ret
    
def get_perprocess_java_library_path(installConfig, jvm, prefix):
    return installConfig.getPrefixedOption("javaopts", prefix, "library.path", '')

if __name__ == "__main__":
    print(get_jvm("java"))

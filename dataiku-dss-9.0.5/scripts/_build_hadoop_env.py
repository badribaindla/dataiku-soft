#! /usr/bin/env python

from __future__ import print_function
import sys, os, re, json, glob, shutil
import functools
import subprocess
import requests
from packaging import version

# Decode the output of a shell command as a native string
def toStr(s):
    if s is None or sys.version_info[0] == 2:
        return s
    else:
        return s.decode('utf-8')

class HadoopVersion(object):
    """
    Helper to parse 'hadoop version' output 
    and maintain the flavor information
    """
    def __init__(self, hadoop_version_str):
        self.hadoop_version_str = hadoop_version_str
        self.hdp_version = None
        self.cdh_version = None
        
        if "-cdh5" in hadoop_version_str:
            self.flavor = "cdh5"
        elif "-cdh6" in hadoop_version_str:
            self.flavor = "cdh6"
            m = re.search('cdh([0-9]+\.[0-9]+)\.', hadoop_version_str)
            try:
                self.cdh_version = m.group(1)
            except:
                print("Could not get CDH's major.minor")
        elif ".cdh7" in hadoop_version_str:
            self.flavor = "cdh7"
            m = re.search('cdh([0-9]+\.[0-9]+)\.', hadoop_version_str)
            try:
                self.cdh_version = m.group(1)
            except:
                print("Could not get CDH's major.minor")
        elif "http://mapr.com" in hadoop_version_str or "-mapr-" in hadoop_version_str:
            self.flavor="mapr"
            # TODO: distinguish between mapr versions. How ?
        elif "hortonworks" in hadoop_version_str:
            self.flavor = "hdp"
            self.hdp_version = self.get_hdp_version()
            #if self.hdp_version is not None:
            #    output_file.write('export DKU_JAVA_OPTS="$DKU_JAVA_OPTS -Dhdp.version=%s"\n' % self.hdp_version)

        elif re.search("https://bigdataoss-internal.googlesource.com/third_party/apache/bigtop", hadoop_version_str) is not None:
            self.flavor = "dataproc"

        else:
            self.flavor = "generic"

    def get_flavor2(self):
        flavor2 = {
            "flavor" : self.flavor
        }
        if self.hdp_version is not None:
            flavor2["hdpMajor"] = int(self.hdp_version[0])
        if self.cdh_version is not None:
            flavor2["cdhMajorMinor"] = float(self.cdh_version)

        flavor2["hive3"] = self.is_hdp3() or self.is_emr6() or self.is_cdh7()
        flavor2["hiveSupportsMREngine"] = not self.is_hdp3() and not self.is_cdh7()

        return json.dumps(flavor2)

    def is_hdp(self):
        return self.flavor == "hdp"

    def is_hdp3(self):
        return self.flavor == "hdp" and self.hdp_version is not None and self.hdp_version.startswith("3.")

    def is_cdh6(self):
        return self.flavor == "cdh6"

    def is_cdh7(self):
        return self.flavor == "cdh7"

    def is_dataproc(self):
        return self.flavor == "dataproc"

    def is_emr(self):
        return "-amzn-" in self.hadoop_version_str.split('\n')[0]

    def is_emr6(self):
        first_line = self.hadoop_version_str.split('\n')[0]
        return "-amzn-" in first_line and "hadoop 3" in first_line.lower()

    def get_hdp_version(self):
        # Starting with HDP 2.2 we need to add a Java property hdp.version to be able to read Hadoop config files
        try:
            hdp_select = toStr(subprocess.check_output(["hdp-select", "status", "hadoop-client"]))
            m = re.search("^hadoop-client\\s+-\\s+([\\w%s]*)$" % re.escape('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'), hdp_select)
            if m is not None and m.group(1).lower() != 'none':
                hdp_version = m.group(1);
                print("Using HDP version %s" % hdp_version)
                return hdp_version
            else:
                print("Could not find HDP version using hdp-select")
        except:
            print("hdp-select not found: will not set hdp.version")
        return None


def build_base_hadoop_env(hadoop_version, output_file):
    output_file.write('export DKU_HADOOP_ENABLED=true\n')
    output_file.write('export DKU_HADOOP_VERSION_STRING="%s"\n' % hadoop_version.replace('\\', '\\\\').replace('"', '\\"'))

    hv = HadoopVersion(hadoop_version)

    output_file.write("export DKU_HADOOP_FLAVOR=%s\n" % hv.flavor)

    if hv.flavor == "hdp" and hv.hdp_version is not None:
        output_file.write('export DKU_JAVA_OPTS="$DKU_JAVA_OPTS -Dhdp.version=%s"\n' % hv.hdp_version)
        
    hadoop_cp = toStr(subprocess.check_output(["hadoop", "classpath"]))
    hadoop_cp = hadoop_cp.strip()
    # yes, *hive*-shims. So that DSS can read ORC with dates
    if hv.is_hdp3() or hv.is_emr6() or hv.is_cdh7():
        hadoop_cp = hadoop_cp + ":" + ("%s/lib/shims/hive3-shims.jar" % os.environ['DKUINSTALLDIR'])
    
    output_file.write('export DKU_HADOOP_CP="%s"\n' % hadoop_cp)

    hadoop_native_path = toStr(subprocess.check_output(["hadoop", "jar", "%s/dist/dataiku-dip.jar" % os.environ['DKUINSTALLDIR'], "com.dataiku.dip.cli.internalcmd.DumpJavaLibraryPath"]))
    output_file.write('export DKU_HADOOP_JAVA_LIBRARY_PATH="%s"\n' % hadoop_native_path.strip())
        
    return hv


    
def get_potential_hive_homes(hive_variables):
    hive_homes = []

    # Take the env var
    if len(os.environ.get("HIVE_HOME", '')) > 0:
        hive_homes.append(os.environ["HIVE_HOME"])

    # Take the (symlink-resolved) location of "hive"
    try:
        hive_bin_loc = toStr(subprocess.check_output(["which", "hive"]))
        print("Hive binary is: %s" % hive_bin_loc.strip())
        if hive_bin_loc is not None and len(hive_bin_loc.strip()) > 0:
            print("Resolve -%s-" % hive_bin_loc.strip())
            r = os.path.realpath(hive_bin_loc.strip())
            print ("Resolved: -%s-" % r)
            hive_bin_loc = r
            print("Hive binary FOR REAL is: %s" % hive_bin_loc)
            hive_folder_loc = os.path.dirname(os.path.dirname(hive_bin_loc))
            hive_homes.append(hive_folder_loc)
            cdh_hive_folder_loc = os.path.join(hive_folder_loc, 'lib', 'hive')
            hive_homes.append(cdh_hive_folder_loc)
    except Exception as e:
        print("No hive command in path %s")

    # Take the env var as given by "hive -e SET"
    if hive_variables is not None and len(hive_variables) > 0:
        for line in hive_variables.split("\n"):
            m = re.search("env:HIVE_HOME=([^\\s]+)", line)
            if m is not None:
                hive_homes.append(m.group(1))


    # Only keep hive homes that contain a lib/hive-exec.jar 
    def is_valid_hive_home(p):
        lib_path = os.path.join(p, 'lib')
        if os.path.isdir(lib_path):
            for n in os.listdir(lib_path):
                if n.startswith('hive-exec') and n.endswith('.jar'):
                    return True
        return False

    print("Hive home candidates: %s" % hive_homes)

    verified_hive_homes = []
    for hive_home in hive_homes:
        if os.path.isdir(hive_home) and is_valid_hive_home(hive_home):
            verified_hive_homes.append(hive_home)
    return verified_hive_homes
    
def get_hive_variables():
    try:
        hive_variables = toStr(subprocess.check_output(["hive", "-S", "--hiveconf", "hive.execution.engine=mr", "-e", "set -v"]))
        if hive_variables is not None:
            return hive_variables
    except:
        print("Hive CLI doesn't appear to be functional")
    return ''
        
def set_hive_settings(hive_settings):
    general_settings_file = os.path.join(os.environ["DIP_HOME"], 'config', 'general-settings.json')
    with open(general_settings_file, 'r') as f:
        general_settings = json.load(f)

    if 'hiveSettings' not in general_settings:
        general_settings['hiveSettings'] = hive_settings
    else:
        general_settings['hiveSettings'].update(hive_settings)
    
    with open(general_settings_file, 'w') as f:
        general_settings = json.dump(general_settings, f, indent=2)

def cleanup_jasper_jars(list):
    # we don't need the jars from jasper in the backend or the hproxy, so we can
    # simply ignore them all the time. On cdh6.0.1 they are causing issues with
    # jetty because the jasper jar in the CDH install is too old
    clean_list = []
    for f in list:
        m = re.search('jasper.*.jar', f)
        if m is not None:
            print("Ignore jasper jar %s" % f);
        else:
            clean_list.append(f);
    return clean_list
   
def cleanup_validation_jars(list):
    # the validation-api jar breaks DSS because Spring decides to activate bean validation in
    # its presence, and there is no validator
    clean_list = []
    for f in list:
        m = re.search('validation-api.*.jar', f)
        if m is not None:
            print("Ignore validation jar %s" % f);
        else:
            clean_list.append(f);
    return clean_list
   
def cleanup_conflicting_derby_versions(list):
    # special for emr: since there are 2 versions of derby in the classpath, you can end up having the wrong version 
    # of the jdbc driver registered (where wrong means it's referencing classes it doesn't find)
    derby_jar_versions = {}
    for f in list:
        m = re.search('derby[^\\-]*-([0-9\\.]+)\\.jar', f)
        if m is not None:
            version = m.group(1)
            if version not in derby_jar_versions:
                derby_jar_versions[version] = []
            derby_jar_versions[version].append(f)

    if len(derby_jar_versions) > 1:
        print("Found several versions of derby jars : ")
        versions = []
        for version in derby_jar_versions:
            print("  %s : %s" % (version, ', '.join(derby_jar_versions[version])))
            versions.append(version)
        versions = sorted(versions)
        
        if versions[0].startswith("10.10") and versions[-1].startswith("10.11"):
            # EMR 5.8 to 5.10 (at least) => keep last
            clean_list = []
            for f in list:
                m = re.search('derby[^\\-]*-([0-9\\.]+)\\.jar', f)
                if m is not None:
                    if m.group(1).startswith("10.10"):
                        clean_list.append(f);
                    else:
                        print("Ignore derby jar %s" % f);
                else:
                    clean_list.append(f);
            list = clean_list;
    return list
            
def get_extra_parquet_jars(hadoop_version, hive_jars):
    """
    Gets the list of JARs to add to the DKU_HIVE_CP for support of Parquet 1.6
    for distributions that don't have it anymore.

    Note: this function also does a side effect to detect EMR flavor
    """
    add_dss_parquet_jars = False
    # HDP 2.5+ does not provide parquet 1.5/1.6
    if hadoop_version.is_hdp3() or hadoop_version.is_hdp() and re.search("^2\\.[56].*$",hadoop_version.hdp_version) is not None:
        print("HDP 2.5+ detected, adding parquet 1.6 to Hive classpath")
        add_dss_parquet_jars = True
        
    if hadoop_version.is_cdh6() or hadoop_version.is_cdh7():
        print("CDH 6+ detected, adding parquet 1.6 to Hive classpath")
        add_dss_parquet_jars = True
    
    for jar in hive_jars:
        # Nor Hive 2.x on EMR 5.x.
        if re.search("hive\\-exec\\-2\\.[0-9]\\.[0-9]\\-amzn\\-", jar) is not None:
            print("EMR 5.x detected, adding parquet 1.6 to Hive classpath")
            add_dss_parquet_jars = True
            hv.flavor = "emr"
        # Nor Hive 3.x on EMR 6.x.
        if re.search("hive\\-exec\\-3\\.[0-9]\\.[0-9]\\-amzn\\-", jar) is not None:
            print("EMR 6.x detected, adding parquet 1.6 to Hive classpath")
            add_dss_parquet_jars = True
            hv.flavor = "emr"
        # Nor Hive 2.x on MapR 5.2 / MEP3.
        if re.search("hive\\-exec\\-2\\.[0-9]\\.[0-9]\\-mapr\\-", jar) is not None:
            print("Hive2 on MapR detected, adding parquet 1.6 to Hive classpath")
            add_dss_parquet_jars = True
    
    # Nor Google Cloud Dataproc
    if hadoop_version.is_dataproc():
        print("Google Cloud Dataproc detected, adding parquet 1.6 to Hive classpath")
        add_dss_parquet_jars = True

    if add_dss_parquet_jars:
        parquet_run_folder = "%s/lib/ivy/parquet-run/" % os.environ["DKUINSTALLDIR"]
        parquet_jars = []
        for f in os.listdir(parquet_run_folder):
            if f.endswith(".jar"):
                parquet_jars.append("%s%s" % (parquet_run_folder, f))
        return parquet_jars
    else:
        return []


def build_hive_env(output_file, hadoop_version):

    if hadoop_version.is_hdp3():
        # On HDP 3, the Hive CLI doesn't work anymore (it's actually beeline)
        # Thus, we can't get the local variables via "hive -e SET"
        # 
        # Thus, we won't have detection of hive-on-spark to fixup the hproxy
        # nor of Atlas, but since we don't do execution in HVK, it should not be an
        # issue
        hive_homes = get_potential_hive_homes(None)
        hive_variables = ""
    else:
        hive_variables = get_hive_variables()
        hive_homes = get_potential_hive_homes(hive_variables)

    hive_settings = {}
    if len(hive_homes) == 0:
        print("No valid Hive found, disabling Hive support")
        output_file.write('export DKU_HIVE_ENABLED=false\n')
        hive_settings['enabled'] = False
    else:
        output_file.write('export DKU_HIVE_ENABLED=true\n')
        hive_settings['enabled'] = True
        hive_home = hive_homes[0]
        list = []
        for n in os.listdir(os.path.join(hive_home, 'lib')):
            if n.endswith('.jar'):
                list.append(os.path.join(hive_home, 'lib', n))
        # hdp3 has non-readable files in the conf folder
        # but we don't need these files anyway
        if not hadoop_version.is_hdp3():
            conf_dir = os.path.join(hive_home, 'conf')
            if os.path.isdir(conf_dir):
                list.append(conf_dir)
            
        list = list + get_extra_parquet_jars(hadoop_version, list)
            
        if hadoop_version.is_cdh6() or hadoop_version.is_cdh7() or hadoop_version.is_emr():
            list = cleanup_jasper_jars(list)
        list = cleanup_validation_jars(list)
        hive_cp = cleanup_conflicting_derby_versions(list)
        
        output_file.write('export DKU_HIVE_CP="%s"\n' % ':'.join(hive_cp))
        
        # look for env:ATLAS_HOME=$DIR  for HDP installs where the atlas hook jars are set directly by the bin/hive script
        aux_jars = []
        for line in hive_variables.split('\n'):
            atlas_matcher = re.search("env:ATLAS_HOME=([^\\s]+)", line);
            if atlas_matcher is not None:
                atlas_home = atlas_matcher.group(1)
                hook_hive_folder = os.path.join(atlas_home, "hook", "hive")
                if os.path.isdir(hook_hive_folder):
                    for n in os.listdir(hook_hive_folder):
                        if n.endswith(".jar"):
                            aux_jars.append(os.path.join(hook_hive_folder, n))
                else:                            
                    print("No hooks found in ATLAS_HOME.")

            spark_matcher = re.search("env:CLASSPATH=.*:([^:]+spark-assembly[^:]+)[:\\s]", line)
            if spark_matcher is not None:
                print("Hive-on-spark support detected in Hive")
                aux_jars.append(spark_matcher.group(1))
        
        hive_settings['hiveAdditionalJars'] = ':'.join(aux_jars)
        
        spark_home = ''
        for line in hive_variables.split('\n'):
            spark_matcher = re.search("env:SPARK_HOME=([^\\s]+)", line)
            if spark_matcher is not None:
                spark_home = spark_matcher.group(1)

        hive_settings['hiveSparkHome'] = spark_home

        if hadoop_version.is_hdp3():
            hive_settings["engineCreationSettings"] = {
                "executionEngine": "HIVESERVER2"
            }
        
    set_hive_settings(hive_settings)
        

def is_pig_without_hadoop_jar(f):
    return f.startswith('pig') and (f.endswith("-withouthadoop.jar") or f.endswith("-core-h2.jar") or f.endswith("-core-h3.jar") or f.endswith("-withouthadoop-h1.jar"))

def get_potential_pig_homes(pig_cmd_debug):
    pig_homes = []
    if len(os.environ.get("PIG_HOME", '')) > 0:
        pig_homes.append(os.environ["PIG_HOME"])
    try:
        pig_bin_loc = toStr(subprocess.check_output(["which", "pig"]))
        if pig_bin_loc is not None and len(pig_bin_loc.strip()) > 0:
            pig_bin_loc = os.path.realpath(pig_bin_loc)
            pig_folder_loc = os.path.dirname(os.path.dirname(pig_bin_loc))
            pig_homes.append(pig_folder_loc)
            cdh_pig_folder_loc = os.path.join(pig_folder_loc, 'lib', 'pig')
            pig_homes.append(cdh_pig_folder_loc)
            
    except:
        print("No pig command in path")
    if pig_cmd_debug is not None and len(pig_cmd_debug) > 0:
        for line in pig_cmd_debug.split("\n"):
            m = re.search("-Dpig.home.dir=([^ ]+)", line)
            if m is not None:
                pig_homes.append(m.group(1))

    verified_pig_homes = []

    def is_valid_pig_home(p):
        lib_path = os.path.join(p, 'lib')
        has_lib = False
        has_wh_jar = False
        if os.path.isdir(lib_path):
            for n in os.listdir(lib_path):
                if n.endswith('.jar'):
                    has_lib = True
        for f in os.listdir(p):
            if f.startswith('pig') and os.path.isfile(os.path.join(p, f)) and is_pig_without_hadoop_jar(f):
                has_wh_jar = True
                    
        return has_wh_jar and has_lib

    for pig_home in pig_homes:
        if os.path.isdir(pig_home) and is_valid_pig_home(pig_home):
            verified_pig_homes.append(pig_home)
    return verified_pig_homes
    
def get_pig_cmd_debug():
    try:
        pig_cmd_debug = toStr(subprocess.check_output(["pig", "-printCmdDebug"]))
        if pig_cmd_debug is not None:
            return pig_cmd_debug
    except:
        print("Pig CLI doesn't appear to be functional")
    return ''
            
def build_pig_env(output_file, hadoop_version):
    pig_cmd_debug = get_pig_cmd_debug()
    pig_homes = get_potential_pig_homes(pig_cmd_debug)
    if len(pig_homes) == 0:
        output_file.write('export DKU_PIG_ENABLED=false\n')
    else:
        output_file.write('export DKU_PIG_ENABLED=true\n')
        pig_home = pig_homes[0]
        list = []
        for n in os.listdir(os.path.join(pig_home, 'lib')):
            if n.endswith('.jar'):
                list.append(os.path.join(pig_home, 'lib', n))
        if os.path.isdir(os.path.join(pig_home, 'lib', 'h2')):
            for n in os.listdir(os.path.join(pig_home, 'lib', 'h2')):
                if n.endswith('.jar'):
                    list.append(os.path.join(pig_home, 'lib', 'h2', n))
        has_hw_jar = False
        for f in os.listdir(pig_home):
            if os.path.isfile(os.path.join(pig_home, f)) and is_pig_without_hadoop_jar(f) and not has_hw_jar:
                has_hw_jar = True
                list.append(os.path.join(pig_home, f))
            if os.path.isfile(os.path.join(pig_home, f)) and f == "piggybank.jar":
                list.append(os.path.join(pig_home, f))

        list = list + get_extra_parquet_jars(hadoop_version, list)

        output_file.write('export DKU_PIG_CP="%s"\n' % ':'.join(list))
        
                
if __name__ == "__main__":
    with open(sys.argv[2], 'w') as output_file:
        hadoop_version_str = sys.argv[1]
        print("Building settings for Hadoop/Hive/Pig")
        hv = build_base_hadoop_env(hadoop_version_str, output_file)
        build_hive_env(output_file, hv)
        build_pig_env(output_file, hv)

        output_file.write("export DKU_HADOOP_FLAVOR2=\'%s\'\n" % hv.get_flavor2())
        
    if hv.is_hdp() and version.parse(hv.get_hdp_version()) >= version.parse("3.1.4"):
        # guava is >= 0.28 in the hadoop libs and those libs depend on stuff in guava that ours doesn't provide
        # so we copy this guava instead of ours
        print("HDP version is >= 3.1.4, swapping guava jar to fix conflicts")
        hadoop_cp = toStr(subprocess.check_output(["hadoop", "classpath"]))
        hadoop_cp = hadoop_cp.strip()
        guava_jar_path = None
        for path in hadoop_cp.split(':'):
            for file_path in glob.glob(path):
                if os.path.basename(file_path).startswith('guava') and file_path.endswith('.jar'):
                    guava_jar_path = file_path
                    break
        if guava_jar_path is None:
            print("Unable to find the guava jar")
        else:
            guavas_to_remove = glob.glob('%s/lib/ivy/*-run/guava-*' % os.environ['DKUINSTALLDIR'])
            print("Removing (potentially incompatible) versions of guava : %s" % json.dumps(guavas_to_remove)) 
            for guava_to_remove in guavas_to_remove:
                os.remove(guava_to_remove)
            print("Copying hadoop's guava jar instead")
            for guava_to_remove in guavas_to_remove:
                dir_name = os.path.dirname(guava_to_remove)
                shutil.copyfile(guava_jar_path, os.path.join(dir_name, os.path.basename(guava_jar_path)))
                    
    if os.environ.get('DKU_NOGIT', '0') != '1':
        # commit changes to general-settings.json
        config_folder = os.path.join(os.environ['DIP_HOME'], 'config')
        os.environ['GIT_AUTHOR_NAME'] = "DSS CLI"
        os.environ['GIT_AUTHOR_EMAIL'] = "cli@dss"
        os.environ['GIT_COMMITTER_NAME'] = "DSS CLI"
        os.environ['GIT_COMMITTER_EMAIL'] = "cli@dss"
        process = subprocess.Popen(["git", "add", "-f", "./general-settings.json"], stderr=subprocess.PIPE, stdout=subprocess.PIPE, cwd=config_folder)
        out, err = process.communicate()
        retcode = process.poll()
        if retcode:
            print(err, file=sys.stderr)
            raise subprocess.CalledProcessError(retcode, "git")
        process = subprocess.Popen(["git", "commit", "--allow-empty", "-m", "CLI: Enabled Hadoop (from command-line)"], stderr=subprocess.PIPE, stdout=subprocess.PIPE, cwd=config_folder)
        out, err = process.communicate()
        retcode = process.poll()
        if retcode:
            print(err, file=sys.stderr)
            raise subprocess.CalledProcessError(retcode, "git")
        

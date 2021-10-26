import json, os, shutil, sys, tempfile, subprocess as sp, os.path as osp
from jupyter_client.kernelspecapp import KernelSpecApp

rBin = sys.argv[1]
kernel_name = sys.argv[2]
kernel_display_name = sys.argv[3]

tmpDir = tempfile.mkdtemp()
dstDir = osp.join(tmpDir, 'ir')

process = sp.Popen("""
%s --slave --no-restore -e 'cat(system.file("kernelspec", package="IRkernel"))'""" % rBin, shell=True, stdout=sp.PIPE)

kernelspec_location = process.communicate()[0]

if sys.version_info > (3,0):
    kernelspec_location = kernelspec_location.decode("utf8")

print('got kernelspec_location at "%s"' % kernelspec_location)

# Copy IRkernel kernelspec to tmp dir and patch DKURBIN into command line
shutil.copytree(kernelspec_location, dstDir)
kernFile = os.path.join(dstDir, 'kernel.json')
with open(kernFile) as f:
	kernelDef = json.load(f)
kernelDef['argv'][0] = rBin
kernelDef["display_name"] = kernel_display_name
with open(kernFile, 'w') as f:
	json.dump(kernelDef, f, indent=2)

# Install kernel spec into Jupyter
# jupyter kernelspec install --user --replace --name ir DIR
sys.argv = [ '-', 'install', '--user', '--replace', '--name', kernel_name, dstDir ]
sys.exit(KernelSpecApp.launch_instance())
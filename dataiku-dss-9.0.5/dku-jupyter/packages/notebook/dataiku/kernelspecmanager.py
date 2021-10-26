from jupyter_client.kernelspec import KernelSpecManager
from traitlets import List

class DataikuKernelSpecManager(KernelSpecManager):
	 kernel_dirs = List(
	 	config=True
    )
# coding: utf-8
from __future__ import unicode_literals

import base64
import io

import matplotlib.image
import numpy as np

"""
    This module provides a mechanism to efficiently embed ND arrays in JSON

    - Values are stored in image
        - Easy to deserialize everywhere (Python/Java/browser/...)
        - Efficient compression comes for free

    - The compaction process is lossy
        - Even with PNG values are quantized

    - Image data are base64 encoded to avoid any potential encoding issues
"""


def compact_array(array):
    # Make sure this is a numpy array
    array = np.array(array, dtype=np.float64)

    if np.any(~np.isfinite(array)):
        raise ValueError("Cannot compact array containing NaN/Inf/-Inf")

    image_dims = list(array.shape[:2])
    extra_dims = list(array.shape[2:])

    # Transform into 2D array (regardless of initial shape)
    if len(image_dims) == 1:
        image_dims += [1]
    image_dims[1] *= int(np.product(extra_dims))
    matrix = np.reshape(array, image_dims)

    # Rescale to [0,2^24-1] to fit in a uint24
    vmin, vmax = np.min(matrix), np.max(matrix)
    if vmin == vmax:
        vmax = vmin + 1  # Avoid division by zero
    matrix = (matrix - vmin) * ((2 ** 24 - 1) / (vmax - vmin))

    # Unpack uint24 -> 3 x uint8
    #
    # Note 1: we don't use the alpha channel on purpose
    #           => Firefox PNG decoder slightly approximates pixel values when alpha is present
    # Note 2: this is not correct on big endian platform
    #           => Don't care since DSS only targets x86-64 which is little endian
    matrix = np.ascontiguousarray(matrix, dtype=np.uint32).view(np.uint8).reshape(image_dims + [4])[:, :, :3]

    # Compress the image
    #
    # Note: since compaction is lossy anyway, JPEG would be a (much) better choice
    #        => Unfortunately it requires adding new Python dependencies
    data = io.BytesIO()
    matplotlib.image.imsave(data, matrix, origin='upper', format='png')

    # Base64 encode
    data.seek(0)
    base64_image_data = base64.b64encode(data.read(-1))

    return {
        "data": base64_image_data.decode('utf8'),
        "shape": list(array.shape),
        "vmin": vmin,
        "vmax": vmax
    }


def decompact_array(compacted_array):
    image_data = base64.b64decode(compacted_array["data"])
    image_buffer = io.BytesIO(image_data)

    image = matplotlib.image.imread(image_buffer, format='png')

    # Convert NxMx4 float in [0,1] -> NxMx4 unit8 in [0, 255]
    matrix = (image * 255).astype(np.uint8)

    # Pack the 3 x uint8 into uint24 and discard the (un-used) alpha channel
    matrix = matrix.reshape([image.shape[0], image.shape[1] * image.shape[2]]).view(np.uint32) & 0x00FFFFFF

    # Rescale values to original range
    vmin = np.float(compacted_array["vmin"])
    vmax = np.float(compacted_array["vmax"])
    matrix = matrix * (vmax - vmin) / (2. ** 24 - 1) + vmin

    # Reshape matrix to original shape
    return matrix.reshape(compacted_array["shape"])

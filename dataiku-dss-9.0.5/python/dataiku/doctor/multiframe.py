from scipy import sparse
import scipy
import numpy as np
import logging
import pandas as pd
import sys
from collections import OrderedDict
from six.moves import xrange

from dataiku.base.utils import safe_exception, safe_unicode_str
from dataiku.doctor import utils

logger = logging.getLogger(__name__)

def delete_rows_csr(mat, indices):
    """
    Remove the rows denoted by ``indices`` form the CSR sparse matrix ``mat``.
    Taken from http://stackoverflow.com/questions/13077527
    """
    if not isinstance(mat, scipy.sparse.csr_matrix):
        raise ValueError("works only for CSR format -- use .tocsr() first")

    mask = np.ones(mat.shape[0], dtype=bool)
    mask[indices] = False
    return mat[mask]


class NamedNPArray(object):
    def __init__(self, array, names):
        self.array = array
        self.names = names

    @property
    def shape(self):
        return self.array.shape

    def __repr__(self):
        return "NamedNPArray(%s,%s)" % (self.array.shape[0], self.array.shape[1])  # self.names, self.array)


class SparseMatrixWithNames(object):
    def __init__(self, matrix, names):
        if names is not None and len(names) != matrix.shape[1]:
            raise Exception("Invalid matrix: %s names and %s columns" % (len(names), matrix.shape[1]))
        self.matrix = matrix
        self.names = names

    @property
    def shape(self):
        return self.matrix.shape

    def __repr__(self):
        return "NamedSM(%s,%s)" % (self.matrix.shape[0], self.matrix.shape[1])

        # , self.names, self.matrix)


class DataFrameWrapper(object):
    def __init__(self, df):
        self.df = df

    @property
    def shape(self):
        return self.df.shape

    def __repr__(self):
        return "DF(%s,%s)" % (self.df.shape[0], self.df.shape[1])


class MultiFrame(object):
    """
    The multiframe agglomerates horizontally several blocks of columns. All blocks
    must have the same number of rows. Each block is named.

    Blocks can be:

    * Pandas DataFrames
    * Numpy arrays
    * Scipy sparse matrices

    The MultiFrame also gives a *single* dataframe builder that allows you to build a dataframe from several
    series.

    The only point of reference for the index in the MultiFrame is its own index. More specifically, all of the
    DataFrames blocks in a MultiFrame have a reset index, independently of the original input DataFrames.
    """

    def __init__(self):
        self.block_orders = []
        self.blocks = {}
        self.dataframes = {}
        self.arrays = {}
        self.sparses = {}
        self.keep = {}
        self.df_builders = {}
        self.index = None

    def __repr__(self):
        s = "MultiFrame (%d blocks):\n" % (len(self.blocks))
        for block_name in self.block_orders:
            block = self.blocks[block_name]
            s += "Block %s (%s)\n" % (block_name, block.__class__)
            s += "----------------------\n"
            s += "%s\n" % block
        return s

    def stats(self):
        s = "MultiFrame (%d blocks):\n" % (len(self.blocks))
        for block_name in self.block_orders:
            block = self.blocks[block_name]
            shape = block.shape
            s += "Block %s (%s) -> (%s,%s)" % (block_name, block.__class__, shape[0], shape[1])
            s += "\n"
        return s

    def set_index_from_df(self, df):
        assert self.index is None
        # use index from dataframe to stay in sync with the target/weight series in case
        # a pipeline is used on a dataframe that already went through a pipeline (for ex
        # in case of scoring recipe or ensembles) 
        self.index = df.index.copy()
        logger.info("Set MF index len %s" % len(self.index))

    def drop_rows(self, deletion_mask):
        rows_to_delete = utils.series_nonzero(deletion_mask)

        if self.index is None:
            logger.warning("No index in multiframe, aborting drop")
            return

        logger.info("MultiFrame, dropping rows: %s" % rows_to_delete)
        self.index = pd.Series(self.index).drop(rows_to_delete[0]).values

        for name in self.block_orders:
            blk = self.blocks[name]
            if isinstance(blk, NamedNPArray):
                blk.array = np.delete(blk.array, rows_to_delete, axis=0)
            elif isinstance(blk, SparseMatrixWithNames):
                blk.matrix = delete_rows_csr(blk.matrix, rows_to_delete)
            elif isinstance(blk, DataFrameWrapper):
                blk.df = blk.df.drop(blk.df.index[rows_to_delete])
                blk.df.reset_index(drop=True, inplace=True)
            else:
                raise Exception("Unknown block")

    def append_df(self, name, df, keep=True, copy=False):
        """
        Append a Pandas DataFrame to the MultiFrame. The resulting DataFrame block will
        have a reset index (since the only point of reference for the index in the
        MultiFrame is its own index).

        :param str name: Block name
        :param pd.DataFrame df: DataFrame to append to the MultiFrame
        :param bool keep: Keep the resulting block when iterating/exporting the MultiFrame
                          (default: True)
        :param bool copy: Append a copy of the dataframe (default: False)
        """
        self._check_not_in_blocks(name)
        if self.index is None:
            # use index from dataframe to stay in sync with the target/weight series in case
            # a pipeline is used on a dataframe that already went through a pipeline (for ex
            # in case of scoring recipe or ensembles) 
            self.index = df.index.copy()
        if len(self.index) != df.shape[0]:
            raise Exception("Unexpected number of rows, index has %s, df has %s" % (len(self.index), df.shape[0]))

        if copy:
            # Append a copy of the dataframe with a reset index
            dfw = DataFrameWrapper(df.reset_index(drop=True))
        else:
            # Reset the index in place
            df.reset_index(drop=True, inplace=True)
            dfw = DataFrameWrapper(df)
        self.dataframes[name] = dfw
        self.blocks[name] = dfw
        self.keep[name] = keep
        self.block_orders.append(name)

    def append_np_block(self, name, array, col_names):
        self._check_not_in_blocks(name)
        if self.index is None:
            self.index = np.array([x for x in xrange(0, array.shape[0])])
        if len(self.index) != array.shape[0]:
            raise Exception("Unexpected number of rows, index has %s, arra has %s" % (len(self.index), array.shape[0]))

        block = NamedNPArray(array, col_names)
        self.arrays[name] = block
        self.blocks[name] = block
        self.block_orders.append(name)

    def append_sparse(self, name, matrix):
        self._check_not_in_blocks(name)
        if self.index is None:
            self.index = np.array([x for x in xrange(0, matrix.shape[0])])
        if len(self.index) != matrix.shape[0]:
            raise Exception(
                "Unexpected number of rows, index has %s, matrix has %s" % (len(self.index), matrix.shape[0]))

        self.sparses[name] = matrix
        self.blocks[name] = matrix
        self.block_orders.append(name)

    def _check_not_in_blocks(self, name):
        if name in self.blocks:
            raise safe_exception(Exception, u"Block {} already exists in multiframe".format(safe_unicode_str(name)))

    def get_block(self, name):
        return self.blocks[name]

    def iter_blocks(self, with_keep_info=False):
        for block_name in self.block_orders:
            block = self.blocks[block_name]
            if with_keep_info:
                yield block_name, block, self.keep.get(block_name, True)
            else:
                yield block_name, block

    def iter_dataframes(self):
        for key, value in self.dataframes.items():
            yield key, value

    def iter_columns(self):
        for block_name, blk in self.iter_blocks():
            # This block is not kept, so don't iterate on it
            if block_name in self.keep and not self.keep[block_name]:
                continue
            if isinstance(blk, NamedNPArray):
                val = blk.array
                names = blk.names
                for i in xrange(len(names)):
                    yield names[i], val[:, i]
            elif isinstance(blk, SparseMatrixWithNames):
                val = blk.matrix
                names = blk.names
                for i in xrange(len(names)):
                    yield names[i], val[:, i]
            elif isinstance(blk, DataFrameWrapper):
                df = blk.df
                for col in df.columns:
                    yield col, df[col]
            else:
                raise Exception("Unknown block type %s" % blk.__class__)

    def col_as_series(self, block, col_name):
        blk = self.blocks[block]
        # logger.info("Return column from block:%s / %s -> %s" % (block, col_name, blk.__class__))

        if isinstance(blk, NamedNPArray) and blk.names is not None:
            col_idx = blk.names.index(col_name)
            return blk.array[:, col_idx]
        elif isinstance(blk, SparseMatrixWithNames) and blk.names is not None:
            col_idx = blk.names.index(col_name)
            return blk.array[:, col_idx]
        elif isinstance(blk, DataFrameWrapper):
            return blk.df[col_name]

    def as_csr_matrix(self):
        # logger.info("********** START AS CSR")
        blockvals = []
        for name in self.block_orders:
            blk = self.blocks[name]
            if isinstance(blk, NamedNPArray):
                val = blk.array
            elif isinstance(blk, SparseMatrixWithNames):
                # logger.info("Add SPARSE block %s, names %s " % (val, val.names))
                val = blk.matrix
            elif isinstance(blk, DataFrameWrapper):
                val = blk.df
            else:
                raise Exception("Unknown block type %s" % blk.__class__)
            if not name in self.keep or self.keep[name]:
                logger.info("APPEND BLOCK %s shape=%s" % (name, val.shape))
                if val.shape[1] != 0:
                    blockvals.append(val)
        # logger.info("********** DONE AS CSR")
        # we have to do this check because of a bug in scipy...
        if len(blockvals) == 1:
            return scipy.sparse.csr_matrix(blockvals[0])
        else:
            return scipy.sparse.hstack(blockvals).tocsr()

    def as_np_array(self):
        blockvals = []
        for name in self.block_orders:
            blk = self.blocks[name]
            val = MultiFrame.block_as_np_array(blk)
            if not name in self.keep or self.keep[name]:
                blockvals.append(val)
        return np.hstack(blockvals)

    @staticmethod
    def block_as_np_array(blk):
        if isinstance(blk, NamedNPArray):
            val = blk.array
        elif isinstance(blk, SparseMatrixWithNames):
            val = blk.matrix.toarray()
        elif isinstance(blk, DataFrameWrapper):
            val = blk.df
        else:
            raise Exception("Unknown block type %s" % blk.__class__)
        return val

    def as_dataframe(self):
        df = pd.DataFrame()
        blockvals = []
        for name in self.block_orders:
            if name in self.keep and not self.keep[name]:
                continue
            blk = self.blocks[name]
            if isinstance(blk, NamedNPArray):
                blkdf = pd.DataFrame(blk.array, columns=blk.names)
            elif isinstance(blk, SparseMatrixWithNames):
                blkdf = pd.DataFrame(blk.matrix.toarray(), columns=blk.names)
            elif isinstance(blk, DataFrameWrapper):
                blkdf = blk.df
            else:
                raise Exception("Unknown block type %s" % blk.__class__)
            blockvals.append(blkdf)
        return pd.concat(blockvals, axis=1)

    def columns(self):
        colnames = []
        # logger.info("****** Get names")
        for blkname in self.block_orders:
            if blkname in self.keep and not self.keep[blkname]:
                continue
            blk = self.blocks[blkname]
            if isinstance(blk, NamedNPArray):
                colnames.extend(blk.names)
            elif isinstance(blk, SparseMatrixWithNames):
                if blk.names is None:
                    blk.names = ["%s:%s" % (blkname, x) for x in xrange(0, blk.matrix.shape[1])]
                colnames.extend(blk.names)
            elif isinstance(blk, DataFrameWrapper):
                colnames.extend(blk.df.columns)
            else:
                raise Exception("Unknown block type %s" % blk.__class__)
        return colnames

    def nnz(self):
        nnz = 0
        for blkname in self.block_orders:
            if blkname in self.keep and not self.keep[blkname]:
                continue
            blk = self.blocks[blkname]
            if isinstance(blk, NamedNPArray):
                nnz += blk.array.shape[0] * blk.array.shape[1]
            elif isinstance(blk, SparseMatrixWithNames):
                nnz += blk.matrix.nnz
            elif isinstance(blk, DataFrameWrapper):
                nnz += blk.df.shape[0] * blk.df.shape[1]
        return nnz

    def shape(self):
        ncols = 0
        nrows = 0
        for blkname in self.block_orders:
            if blkname in self.keep and not self.keep[blkname]:
                continue
            blk = self.blocks[blkname]
            if isinstance(blk, NamedNPArray):
                nrows = blk.array.shape[0]
                ncols += blk.array.shape[1]
            elif isinstance(blk, SparseMatrixWithNames):
                nrows = blk.matrix.shape[0]
                ncols += blk.matrix.shape[1]
            elif isinstance(blk, DataFrameWrapper):
                nrows = blk.df.shape[0]
                ncols += blk.df.shape[1]
        return nrows, ncols

    def select_columns(self, names):
        names = set(names)
        for blkname in self.block_orders:
            blk = self.blocks[blkname]

            if isinstance(blk, NamedNPArray):
                newnames = [name for idx, name in enumerate(blk.names) if name in names]
                colmask = [idx for idx, name in enumerate(blk.names) if name in names]
                blk.names = newnames
                blk.array = blk.array[:, colmask]

            elif isinstance(blk, SparseMatrixWithNames):
                if blk.names is None:
                    blk.names = ["%s:%s" % (blkname, x) for x in xrange(0, blk.matrix.shape[1])]

                newnames = [name for idx, name in enumerate(blk.names) if name in names]
                colmask = [idx for idx, name in enumerate(blk.names) if name in names]

                blk.names = newnames
                blk.matrix = blk.matrix[:, colmask]

            elif isinstance(blk, DataFrameWrapper):
                cols_in_df = set(blk.df.columns)
                cols_kept = cols_in_df & names

                cols_kept_list = list(cols_kept)

                # We observe that `set` does not ensure a deterministic order when converted into a list in py3.
                # Therefore we ensure that this method produces dataframes with the same column order at each run
                # by ordering them lexicographically
                # We do it only for py3 in order not to modify the behaviour of existing and working py2 models.
                if sys.version_info > (3, 0):
                    cols_kept_list = sorted(cols_kept_list)

                blk.df = blk.df[cols_kept_list]

            else:
                raise Exception("Unknown block type %s" % blk.__class__)

    def get_df_builder(self, name):
        """Helper for building a dataframe from series"""
        if not name in self.df_builders:
            self.df_builders[name] = DataFrameBuilder(name)
        return self.df_builders[name]

    def has_df_builder(self, name):
        return name in self.df_builders

    def flush_df_builder(self, name):
        self.append_df(name, self.df_builders[name].to_dataframe())
        del self.df_builders[name]


def is_series_like(series):
    return isinstance(series, pd.Series) or isinstance(series, np.ndarray) or isinstance(series,
                                                                                         scipy.sparse.csr.csr_matrix)


class DataFrameBuilder(object):
    """ A dataframe builder just receives columns
    to ultimately create a dataframe, respecting the
    insertion order.
    """

    __slots__ = ('prefix', 'columns',)

    def __init__(self, prefix=""):
        """ constructor

        prefix -- Prefixes the name of the column of
                  the resulting dataframe.
        """
        # TODO put the prefix in to_dataframe
        self.columns = OrderedDict()
        self.prefix = prefix

    def add_column(self, column_name, column_values):
        assert column_name not in self.columns
        assert is_series_like(column_values)
        # logger.info("ADD COLUMN %s = %s"% (column_name, column_values))
        self.columns[column_name] = column_values

    def to_dataframe(self, ):
        df = pd.DataFrame(self.columns)
        df.columns = [
            self.prefix + ":" + col if col is not None else self.prefix
            for col in df.columns
            ]
        return df

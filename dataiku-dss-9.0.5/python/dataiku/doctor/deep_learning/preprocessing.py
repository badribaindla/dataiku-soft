import re
import sys
import dataiku
import base64

from dataiku.base.utils import RaiseWithTraceback

if sys.version_info > (3, 0):
    from io import BytesIO as streamIO  # => expects bytes
else:
    from StringIO import StringIO as streamIO  # => expects str


class DummyFileReader(object):

    # For the time being, on the api node, this will only work with base64 files, because
    # it is currently not possible to retrieve the managed folder from the api node (missing
    # project_key and managed folder not shipped)
    # To make it work on api node with base64 strings, we retrieve the manage folder only after
    # testing that the input is not base64
    def __init__(self, managed_folder_id):
        self.managed_folder_id = managed_folder_id
        self.managed_folder = None

    def read(self, file_id):
        if DummyFileReader._is_base64_file(file_id):
            img_file = streamIO()
            decoded = base64.b64decode(file_id)  # is 'str' for py2, 'bytes' for py3
            img_file.write(decoded)
            img_file.seek(0)
            return img_file
        else:
            with RaiseWithTraceback("If on apinode, only base64 representation of images are allowed"):
                # Aug 2020 - It is currently not possible to retrieve the managed folder from the api node (missing
                # project_key and managed folder not shipped)
                folder = self._get_managed_folder()
            return folder.get_download_stream(file_id)

    def _get_managed_folder(self):

        if self.managed_folder is None:
            # Hack to access managed folder containing files without declaring it as input of recipe
            # when used in the context of a recipe (Scoring, Evaluation)
            self.managed_folder = dataiku.Folder(self.managed_folder_id, ignore_flow=True)

        return self.managed_folder


    @staticmethod
    def _is_base64_file(file_id):
        base64_regexp = re.compile("^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{4}|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)$")
        min_authorized_length = 200

        return (len(file_id) > min_authorized_length) and base64_regexp.match(file_id)


class TokenizerProcessor(object):

    def __init__(self, num_words, max_len):
        from keras.preprocessing import text
        self.num_words = num_words
        self.max_len = max_len
        self.tokenizer = text.Tokenizer(num_words=num_words)

    def fit(self, series):
        self.tokenizer.fit_on_texts(series.astype(str))

    def transform(self, series):
        from keras.preprocessing.sequence import pad_sequences
        return pad_sequences(self.tokenizer.texts_to_sequences(series.astype(str)), maxlen=self.max_len)

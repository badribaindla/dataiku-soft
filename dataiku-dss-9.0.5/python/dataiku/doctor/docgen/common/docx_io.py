from io import BytesIO
from docx import Document

class DocxIO(object):

    def load(self, file):
        with open(file, "rb") as stream:
            contents = BytesIO(stream.read())
        document = Document(contents)
        contents.close()
        return document

    def to_folder_file(self, document, filename):
        document.save(filename)
        return filename

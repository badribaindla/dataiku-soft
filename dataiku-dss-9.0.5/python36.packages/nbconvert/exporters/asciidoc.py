"""ASCIIDoc Exporter class"""

# Copyright (c) Jupyter Development Team.
# Distributed under the terms of the Modified BSD License.

from traitlets import default
from traitlets.config import Config

from .templateexporter import TemplateExporter


class ASCIIDocExporter(TemplateExporter):
    """
    Exports to an ASCIIDoc document (.asciidoc)
    """

    @default('file_extension')
    def _file_extension_default(self):
        return '.asciidoc'

    @default('template_file')
    def _template_file_default(self):
        return 'asciidoc'

    output_mimetype = 'text/asciidoc'

    @default('raw_mimetypes')
    def _raw_mimetypes_default(self):
        return ['text/asciidoc/', 'text/markdown', 'text/html', '']

    @property
    def default_config(self):
        c = Config({
            'NbConvertBase': {
                'display_data_priority': ['text/html',
                                          'text/markdown',
                                          'image/svg+xml',
                                          'image/png',
                                          'image/jpeg',
                                          'text/plain',
                                          'text/latex'
                                          ]
            },
            'ExtractOutputPreprocessor': {'enabled': True},
            'HighlightMagicsPreprocessor': {
                'enabled':True
                },
        })
        c.merge(super(ASCIIDocExporter, self).default_config)
        return c

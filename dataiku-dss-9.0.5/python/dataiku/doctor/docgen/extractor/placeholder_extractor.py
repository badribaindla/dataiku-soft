# -*- coding: utf-8 -*-
from dataiku.doctor.docgen.extractor.docx_parser import DocxParser
import logging


class PlaceholderExtractor(object):

    def __init__(self):
        self.docx_parser = DocxParser()

    def extract_conditional_placeholders_from_docx(self, doc):
        self.docx_parser.debug(doc)
        placeholders_names = []
        # get basic placeholders and filter to retrieve only the conditional ones.
        for placeholder in self.docx_parser.parse_text(doc):
            if placeholder.is_conditional:
                placeholders_names.append(placeholder.extract_name())

        # placeholders inside tables
        for table_placeholder in self.docx_parser.parse_table(doc):
            # each table placeholder can contains multiple placeholders
            for placeholder in table_placeholder.placeholders:
                if placeholder.is_conditional:
                    placeholders_names.append(placeholder.extract_name())

        logging.info("Conditional placeholders to be resolved from the template %s" % placeholders_names)
        return list(set(placeholders_names))

    def extract_regular_placeholders_from_docx(self, doc):
        self.docx_parser.debug(doc)
        # basic placeholders
        placeholders_names = set([p.extract_name() for p in self.docx_parser.parse_text(doc)])
        # placeholders inside tables
        for table_placeholder in self.docx_parser.parse_table(doc):
            # each table placeholder can contains multiple placeholders
            placeholders_names = placeholders_names.union(set(table_placeholder.get_placeholder_names()))
        # placeholders inside headers
        placeholders_names = placeholders_names.union(set([p.tagname for p in self.docx_parser.parse_headers(doc)]))
        # placeholders inside footers
        placeholders_names = placeholders_names.union(set([p.tagname for p in self.docx_parser.parse_footers(doc)]))

        logging.info("Placeholders to be resolved from the template %s" % placeholders_names)
        return list(set(placeholders_names))

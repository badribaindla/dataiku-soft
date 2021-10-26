# -*- coding: utf-8 -*-
from dataiku.doctor.docgen.renderer.document_handler import DocumentHandler
from dataiku.doctor.docgen.extractor.docx_parser import DocxParser
from dataiku.doctor.docgen.renderer.widget import Table, Text, PuppeteerContent
import logging


class Renderer(object):

    def __init__(self):
        self.docx_parser = DocxParser()

    def __duplicates_before_run__(self, input_runs, output_paragraph, until_run, until_char):
        """
        Copy any run located before the run number "until_run" and the character number "until_char"
        from the input_paragraph to the output_paragraph.placeholders
        :param Paragraph input_runs: runs of the input paragraph containing data to copy
        :param Paragraph output_paragraph: the output paragraph when copied data will be transferred
        :param int until_run: the run index where we need to stop copying data
        :param int until_char: the character index inside the run where we need to stop copying data
        """
        if until_run == 0:
            if until_char != 0:
                # We are on the first run, but there is stuff before the current placeholder,
                # extract data on their own run.
                logging.debug("> Adding first part run before: data='%s' cutted='%s'" %
                              (input_runs[0].text[0:until_char], input_runs[0].text[until_char:]))
                run = output_paragraph.add_run(input_runs[0].text[0:until_char], input_runs[0].style)
                DocumentHandler.copy_font(input_runs[0], run)
        else:
            # The placeholder is not present on the first run, duplicate the runs.
            if len(input_runs) > 0:
                for i in range(0, until_run):
                    logging.debug("> Adding full run %d before: data='%s'" % (i, input_runs[i].text))
                    run = output_paragraph.add_run(input_runs[i].text, input_runs[i].style)
                    DocumentHandler.copy_font(input_runs[i], run)
            # And we reach the run with the placeholder
            if until_char != 0:
                logging.debug("> Adding part run before: data='%s' cutted='%s'" %
                              (input_runs[until_run].text[0:until_char], input_runs[until_run].text[until_char:]))
                run = output_paragraph.add_run(input_runs[until_run].text[0:until_char], input_runs[until_run].style)
                DocumentHandler.copy_font(input_runs[until_run], run)

    def __duplicates_after_run__(self, input_runs, output_paragraph, after_run, after_char):
        """
        Copy any run located after the run number "after_run" and the character number "after_char" from the
        input_paragraph to the output_paragraph.
        :param Paragraph input_runs: runs of the input paragraph containing data to copy
        :param Paragraph output_paragraph: the output paragraph when copied data will be transferred
        :param int after_run: the run index where we need to start copying data
        :param int after_char: the character index inside the run where we need to start copying data
        """
        if len(input_runs) == 0:
            return

        input_run = input_runs[after_run]
        # after_char is the position of the last "}" so we want to start the completion from the next character
        first_char_to_add = after_char + 1

        # Finish the current run in a separate run
        if first_char_to_add < len(input_run.text):
            logging.debug("< Adding part run after: data='%s'" % (input_run.text[first_char_to_add:]))
            output_run = output_paragraph.add_run(input_run.text[first_char_to_add:], input_run.style)
            DocumentHandler.copy_font(input_run, output_run)

        # Add the runs left in the paragraph
        for i in range(after_run + 1, len(input_runs)):
            logging.debug("< Adding full run %d after: data='%s'" % (i, input_runs[i].text))
            output_run = output_paragraph.add_run(input_runs[i].text, input_runs[i].style)
            DocumentHandler.copy_font(input_runs[i], output_run)

    def __transform_placeholder__(self, document, placeholder, widget, font_reference, table_style = None):
        """
        Locate and replace the Paragraph with the placeholder inside the document by a new paragraph where the
        placeholder is replaced by its data.
        :param Union[Document, _Cell] document: the current document (or sub-document) that contains paragraph with placeholders
        :param Placeholder placeholder: data representing the location of a placeholder
        :param Union[Text, Table, PuppeteerContent] widget: the data associated to the placeholder
        :param Document font_reference: the input docx it will be use as a reference for font and table insertion
        """

        # "start_run_index" is the index of the run containing the first character of the placeholder opening delimiter
        # "start" is the index in the run of the first character of the placeholder opening delimiter
        (start_run_index, start) = placeholder.start
        # "end_run_index" is the index of the run containing the last character of the placeholder closing delimiter
        # "end" is the index in the run of the last character of the placeholder closing delimiter
        (end_run_index, end) = placeholder.end

        # The next variable is the paragraph where the placeholder is located.
        # We want to extract everything from the paragraph except the placeholder
        input_paragraph = DocumentHandler.get_paragraph(document, placeholder.paragraph._p)

        # Check if the paragraph was not deleted previously by a conditional placeholder
        if input_paragraph:
            # the output paragraph will change as soon as you insert a table
            output_paragraph = input_paragraph

            # copy the runs from the input paragraph and purge it
            input_runs = DocxParser.get_safe_runs(input_paragraph)
            input_paragraph.clear()

            # extract data inside the paragraph before the placeholder
            self.__duplicates_before_run__(input_runs, output_paragraph, start_run_index, start)

            # Apply the data from the widget on the new run
            # If we are on a table widget, a new output paragraph will be created
            output_paragraph = widget.apply(output_paragraph, font_reference, input_runs[start_run_index], table_style)

            # extract data inside the paragraph after the placeholder
            self.__duplicates_after_run__(input_runs, output_paragraph, end_run_index, end)

    def __replace_simple_placeholders__(self, document, placeholders, context, font_reference):
        """
        Replace placeholders inside the document by their content defined in the variable placeholders
        :param Union[Document, _Cell] document: the current document (or sub-document) that contains paragraph with placeholders
        :param Placeholder placeholders: data representing the location of a placeholder
        :param Dict[Any, Union[Table, Text, PuppeteerContent]] context: location and initial data of a placeholder
        :param str font_reference: the input docx it will be use as a reference for font
        """
        # keep the reference to a paragraph when it was sliced
        for ph in placeholders:
            if ph.tagname in context:
                widget = context[ph.tagname]
                self.__transform_placeholder__(document, ph, widget, font_reference)
            else:
                logging.warn("No corresponding value found for %s", ph.tagname)

    def __replace_placeholders_in_table__(self, document, context):
        """
        Replace placeholders inside the tables present in a document by their content
        :param Document document: the current document that contains tables which will contains paragraph with placeholders
        :param Dict[Any, Union[Table, Text, PuppeteerContent]] context: location and initial data of a placeholder
        """
        for table_placeholder in self.docx_parser.parse_table(document):
            cell = table_placeholder.table.cell(table_placeholder.row_idx, table_placeholder.col_idx)
            (blocks, singles) = self.docx_parser.extract_blocks(table_placeholder.placeholders)
            self.__replace_simple_placeholders__(cell, list(reversed(singles)), context, document)
            self.__replace_block_placeholders__(cell, blocks, context)

    def __replace_placeholders_in_header__(self, document,  context):
        """
        Replace placeholders inside the header of the different sections by their content
        :param Document document: the current document that contains tables which will contains paragraph with placeholders
        :param Dict[Any, Union[Table, Text, PuppeteerContent]] context: location and initial data of a placeholder
        """
        header_placeholder = self.docx_parser.parse_headers(document)
        for i in range(len(document.sections)):
            header_placeholder_filtered = [p for p in header_placeholder if p.section_number == i]
            self.__replace_simple_placeholders__(document.sections[i].header,
                                                 list(reversed(header_placeholder_filtered)), context, document)

    def __replace_placeholders_in_footer__(self, document, context):
        """
        Replace placeholders inside the footer of the different sections by their content
        :param Document document: the current document that contains tables which will contains paragraph with placeholders
        :param Dict[Any, Union[Table, Text, PuppeteerContent]] context: location and initial data of a placeholder
        """
        footer_placeholder = self.docx_parser.parse_footers(document)
        for i in range(len(document.sections)):
            footer_placeholder_filtered = [p for p in footer_placeholder if p.section_number == i]
            self.__replace_simple_placeholders__(document.sections[i].footer,
                                                 list(reversed(footer_placeholder_filtered)), context, document)

    def __replace_block_placeholders__(self, document, blocks, context):
        """
        Replace pair of placeholders inside the document by their content
        :param Document document: the current document that contains tables which will contains paragraph with placeholders
        :param [BlockPlaceholder] blocks: a list of BlockPlaceholder
        :param Dict[Any, Union[Table, Text, PuppeteerContent]] context: location and initial data of a placeholder
        """
        for block in blocks:
            if block.extract_name() in context:
                widget = context[block.extract_name()]
                # Extracted contains everything between the blocks placeholders
                extracted = DocumentHandler.between(document, block)
                if isinstance(widget, Table) or isinstance(widget, PuppeteerContent):
                    filtered = [e for e in extracted if e.__class__.__name__ == "Table"]
                    logging.debug("Filtered Table %s", filtered)
                    if len(filtered) > 0:
                        self.__transform_placeholder__(document, block.start, widget, document, filtered[0])
                    else:
                        # Not a table, run a basic transformation on the starting placeholder
                        self.__transform_placeholder__(document, block.start, widget, document)
                    # Delete data between the placeholders
                    for e in extracted:
                        DocumentHandler.delete_element(e)
                else:
                    # Not a table, run a basic transformation on the starting placeholder
                    self.__transform_placeholder__(document, block.start, widget, document)
                    # Delete data between the placeholders
                    for e in extracted:
                        DocumentHandler.delete_element(e)
                # in any cases,  delete the ending placeholder
                if block.end.paragraph and block.end.paragraph._element.getparent():
                    DocumentHandler.delete_paragraph(block.end.paragraph)

    @staticmethod
    def __is_valid_condition__(condition, widget_value):
        if "==" in condition:
            expected_value = condition.split('==')[-1].strip()
            return widget_value == expected_value
        else: # !=
            expected_value = condition.split('!=')[-1].strip()
            return widget_value != expected_value

    def __replace_conditional_placeholders__(self, document, placeholders, context):
        """
        Replace pair of placeholders inside the document by their content
        :param Document document: the current document that contains tables which will contains paragraph with placeholders
        :param [BlockPlaceholder] placeholders: a list of Conditional placeholders
        """
        for placeholder in placeholders:
            tagname = placeholder.start.extract_name()
            if tagname in context:
                widget = context[tagname]
            else:
                widget = None
            if widget is None or not isinstance(widget, Text) or \
                    not self.__is_valid_condition__(placeholder.start.tagname, widget.inner_text):
                # Not a valid condition, remove everything
                for e in DocumentHandler.between(document, placeholder):
                    DocumentHandler.delete_element(e)
            # Valid or not, we delete the start and the end paragraph, they contain only the placeholder.
            if placeholder.start.paragraph and placeholder.start.paragraph._element.getparent():
                DocumentHandler.delete_paragraph(placeholder.start.paragraph)
            if placeholder.end.paragraph and placeholder.end.paragraph._element.getparent():
                DocumentHandler.delete_paragraph(placeholder.end.paragraph)

    def render(self, puppeteer_extractor, document, resolved_placeholders):
        self.docx_parser.debug(document)

        if resolved_placeholders.get("exportId"):
            puppeteer_extractor.set_export_id(resolved_placeholders["exportId"])
        placeholder_context = self.__get_placeholder_context__(resolved_placeholders, puppeteer_extractor)

        # parse updated document to locate the remaining placeholders
        placeholders = self.docx_parser.parse_text(document)
        (blocks, singles) = self.docx_parser.extract_blocks(placeholders)
        logging.debug("BLOCKS:")
        for b in blocks:
            logging.debug("\t%s", b)
        logging.debug("SINGLES:")
        for s in singles:
            logging.debug("\t%s", s)

        # reverse the order of the singles list, in order to always reach the expecting element,
        # even if a previous element remove some characters of the document
        self.__replace_simple_placeholders__(document, list(reversed(singles)), placeholder_context, document)
        self.__replace_block_placeholders__(document, blocks, placeholder_context)

        self.__replace_placeholders_in_table__(document, placeholder_context)
        self.__replace_placeholders_in_header__(document, placeholder_context)
        self.__replace_placeholders_in_footer__(document, placeholder_context)

    def resolve_conditional_placeholder(self, document, resolved_placeholders):
        """
        Resolve any conditional placeholder. If the conditional placeholder is valid, keep its content, otherwise remove everything.
        :param Document document: the input document
        :param resolved_placeholders: the value of the different conditional placeholders
        :return: the input document with the text updated to remove conditional placeholder
        """
        self.docx_parser.debug(document)

        placeholder_context = self.__get_placeholder_context__(resolved_placeholders)

        # parse raw document and remove conditional placeholders
        placeholders = self.docx_parser.parse_text(document)
        conditionals = self.docx_parser.extract_conditionals_placeholders(placeholders)
        logging.debug("CONDITIONALS:")
        for c in conditionals:
            logging.debug("\t%s", c)
        self.__replace_conditional_placeholders__(document, conditionals, placeholder_context)


        for table_placeholder in self.docx_parser.parse_table(document):
            cell = table_placeholder.table.cell(table_placeholder.row_idx, table_placeholder.col_idx)
            table_conditionals = self.docx_parser.extract_conditionals_placeholders(table_placeholder.placeholders)
            self.__replace_conditional_placeholders__(cell, table_conditionals, placeholder_context)
        return document

    @staticmethod
    def __get_placeholder_context__(resolved_placeholders, puppeteer_extractor = None):
        placeholder_context = {}
        for resolved_placeholder in resolved_placeholders["resolved"]:
            placeholder_id = resolved_placeholder["name"]
            placeholder_type = resolved_placeholder["type"]
            value = resolved_placeholder["value"]

            if placeholder_type == "JSON_TABLE":
                placeholder_context[placeholder_id] = Table(value)
            elif placeholder_type == "JSON_TEXT":
                placeholder_context[placeholder_id] = Text(value)
            elif placeholder_type == "PUPPETEER":
                steps = value["stepList"]
                puppeteer_config_name = value["puppeteerConfigName"]

                for step in steps:
                    step_type = step["type"]
                    if step_type == "TEXT_EXTRACTION" or step_type == "SCREENSHOT" or step_type == "JSON_EXTRACTION":
                        placeholder_context[placeholder_id] = PuppeteerContent(puppeteer_extractor, puppeteer_config_name)
            else:
                logging.warn("Unsupported resolved placeholder type: %s for %s" % (placeholder_type, placeholder_id))

        logging.debug("Placeholder names: %s", placeholder_context.keys())
        return placeholder_context

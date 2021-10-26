import logging

class PlaceholderParser(object):
    """Find the location of the placeholders inside a docx and transform them as Placeholder"""

    @staticmethod
    def __format_output__(placeholder_text, open_indexes, close_indexes):
        if placeholder_text.startswith('if '):
            # stripping to avoid pattern like "{{if   my.placeholder == something   }}"
            return placeholder_text[2:].strip(), True, False, open_indexes, close_indexes
        elif placeholder_text.startswith('endif '):
            # stripping to avoid pattern like "{{endif   my.placeholder   }}"
            return placeholder_text[5:].strip(), True, True, open_indexes, close_indexes
        elif placeholder_text.startswith('/'):
            # stripping to avoid pattern like "{{/   my.placeholder  }}"
            return placeholder_text[1:].strip(), False, True, open_indexes, close_indexes
        else:
            return placeholder_text, False, False, open_indexes, close_indexes


    @staticmethod
    def get_position_in_runs_from_global_index(runs, global_index):
        """
        Given the index of a character in the paragraph (what we call here the global_index),
        return the index of the corresponding run together with the index of the character in that run
        :rtype: (int, int)
        """
        run_index = 0
        index_in_run = 0
        current_global_index = 0

        for run in runs:
            # If the searched index is in the current run
            if current_global_index + len(run.text) > global_index:
                index_in_run = global_index - current_global_index
                break
            current_global_index += len(run.text)  # Equals the first character index of the next run
            run_index += 1

        return run_index, index_in_run

    @staticmethod
    def parse(runs):
        """
        Given a sequence of runs, parse them and returns the position of the placeholders
        Return a sequence of tuple with each tuple containing
        (placeholder, is_closing, (start_run_index, start), (end_run_index, end))
        where (start_run_index, start) is the position of the first character of the opening delimiter
        and (end_run_index, end) is the position of the last character of the closing delimiter
        :rtype: (string, boolean, (int, int), (int, int), dict)
        """

        full_text = ""
        for run in runs:
            full_text += run.text

        opening_delimiter = "{{"
        opening_delimiter_len = len(opening_delimiter)
        closing_delimiter = "}}"
        closing_delimiter_len = len(closing_delimiter)
        start_placeholder_search_at = 0
        placeholders = []

        while start_placeholder_search_at < len(full_text):

            opening_delimiter_index = PlaceholderParser.smart_find(full_text, opening_delimiter, closing_delimiter,
                                                                   start_placeholder_search_at)

            if opening_delimiter_index == -1:
                #No more placeholder to find in this paragraph.
                break

            closing_delimiter_index = full_text.find(closing_delimiter, opening_delimiter_index + opening_delimiter_len)

            if closing_delimiter_index == -1:
                logging.warning("Placeholder was opened but not closed.")
                break

            open_index = PlaceholderParser.get_position_in_runs_from_global_index(runs, opening_delimiter_index)
            close_index = PlaceholderParser.get_position_in_runs_from_global_index(runs, closing_delimiter_index + closing_delimiter_len - 1)
            # Stripping text to avoid pattern like "{{ my.placeholder }}"
            placeholder_text = full_text[opening_delimiter_index + opening_delimiter_len: closing_delimiter_index].strip()
            placeholders.append(PlaceholderParser.__format_output__(placeholder_text, open_index, close_index))
            start_placeholder_search_at = closing_delimiter_index + closing_delimiter_len
            logging.debug("Added placeholder " + placeholder_text)
        return placeholders

    @staticmethod
    def smart_find(text, opening_delimiter, closing_delimiter, search_from_index):
        """
        When a string contains "{{{" and you search for "{{", by default the built-in find method returns the index of
        the first occurrence of "{{", let's do a bit better than that
        This method returns the index of the last occurrence of the placeholder opening delimiter before the first
        occurrence of the placeholder closing delimiter
        It allows text like "{{{placeholder_key}}" to be detected (and replaced by "{placeholder_value") instead of
        throwing an error
        """
        smart_index = text.find(opening_delimiter, search_from_index)
        if smart_index == -1:
            return -1

        start_delimiter_len = len(opening_delimiter)
        search_to_index = text.find(closing_delimiter, smart_index + start_delimiter_len)

        while smart_index + start_delimiter_len < search_to_index:
            temp_index = text.find(opening_delimiter, smart_index + 1, search_to_index)
            if temp_index == -1:
                break
            smart_index = temp_index

        return smart_index
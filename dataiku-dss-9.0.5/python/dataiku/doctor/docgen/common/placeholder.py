class Placeholder(object):
    def __init__(self, tagname, is_conditional, is_closing, paragraph, start, end):
        self.tagname = tagname
        self.is_conditional = is_conditional
        self.is_closing = is_closing
        self.paragraph = paragraph
        self.start = start
        self.end = end

    def extract_name(self):
        """
        Extract the name of the placeholder.
        For a basic placeholder, this is just the tagname.
        For conditional placeholder, we extract the part before the equal/not equal sign.
        :return: the name of the placeholder
        """
        if self.is_conditional and not self.is_closing:
            if "==" in self.tagname:
                return self.tagname.split('==')[0].strip()
            else:
                return self.tagname.split('!=')[0].strip()
        else:
            return self.tagname


class HeaderPlaceholder(Placeholder):
    """
    Placeholders with their location in the header
    """
    def __init__(self, tagname, is_conditional, is_closing, paragraph, start, end, section_number):
        Placeholder.__init__(self, tagname, is_conditional, is_closing, paragraph, start, end)
        self.section_number = section_number

class FooterPlaceholder(Placeholder):
    """
    Placeholders with their location in the footer
    """
    def __init__(self, tagname, is_conditional, is_closing, paragraph, start, end, section_number):
        Placeholder.__init__(self, tagname, is_conditional, is_closing, paragraph, start, end)
        self.section_number = section_number


class TablePlaceholder(object):
    """Placeholders that are contains inside a single Cell in a table."""

    def __init__(self, table, row_idx, col_idx, placeholders):
        self.table = table
        self.row_idx = row_idx
        self.col_idx = col_idx
        self.placeholders = placeholders

    def __repr__(self):
        return "Table placeholder in [" + str(self.row_idx) + ", " + str(self.col_idx) + "] => " + self.placeholders

    def get_placeholder_names(self):
        return [placeholder.extract_name() for placeholder in self.placeholders]

class BlockPlaceholder(object):
    """
    Block of two placeholders:
    {my.placeholder}
    format information
    {/my.placeholder}
    """

    def __init__(self, start, end):
        self.start = start
        self.end = end

    def extract_name(self):
        return self.start.extract_name()

    def __repr__(self):
        return str(self.start) + " - " + str(self.end)

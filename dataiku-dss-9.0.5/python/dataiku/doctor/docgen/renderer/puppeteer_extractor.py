from dataiku.core.export_model_charts_and_templates import ExportModelChartsAndTemplates
import zipfile
import io
import logging

class PuppeteerExtractor(object):
    """
    Extract Puppeteer data from the zip file and keep them with a cache mechanism.
    """

    def __init__(self, project_key):
        self.project_key = project_key

        # Received from Puppeteer
        self.extracted_contents = None
        self.export_id = None


    def set_export_id(self, export_id):
        self.export_id = export_id

    def get_contents(self, puppeteer_config_name):
        logging.info("get_image of %s", puppeteer_config_name)
        if self.extracted_contents is None:
            self.extract_contents()
        if self.extracted_contents is None:
            logging.error("Unable to generate content (image and templated texts)")
            return None
        if puppeteer_config_name in self.extracted_contents:
            return self.extracted_contents[puppeteer_config_name]
        else:
            logging.error("Unable to get content for %s.", puppeteer_config_name)

    def extract_contents(self):
        logging.info("Downloading charts and templates")
        emc = ExportModelChartsAndTemplates(self.project_key, self.export_id)

        (content_type, contents) = emc.download()
        self.extracted_contents = self.unzip(contents)

        logging.info("extracted_contents: %s", len(self.extracted_contents))

    @staticmethod
    def unzip(contents):
        logging.info("Unzipping puppeteer zip result file.")
        f = io.BytesIO(contents)
        zfile = zipfile.ZipFile(f, "r")
        extracted_contents = {}

        for filename in zfile.namelist():
            logging.debug("File name: %s", filename)
            data = zfile.read(filename)
            (config_name, element_index, section_index, extension) = tuple(filename.split("."))
            logging.debug("configName= %s | element index= %s | image index= %s | extension= %s",
                         config_name, element_index, section_index, extension)
            element_index = int(element_index)
            section_index = int(section_index)
            if extension == "png":
                if config_name not in extracted_contents:
                    extracted_contents[config_name] = {}
                # Some content are a set of images
                if element_index not in extracted_contents[config_name]:
                    extracted_contents[config_name][element_index] = {}
                extracted_contents[config_name][element_index][section_index] = {"type": extension, "data": data}
            elif extension == "txt" or extension == "json":
                if config_name not in extracted_contents:
                    extracted_contents[config_name] = {}
                # Some content are a set of images
                if element_index not in extracted_contents[config_name]:
                    extracted_contents[config_name][element_index] = {}
                extracted_contents[config_name][element_index][section_index] = {"type": extension, "data": data}

        return extracted_contents

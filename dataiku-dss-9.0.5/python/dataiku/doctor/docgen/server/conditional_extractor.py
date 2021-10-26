import logging
import sys
import traceback

from dataiku.base.socket_block_link import JavaLink
from dataiku.base.utils import watch_stdin, get_json_friendly_error
from dataiku.doctor.docgen.extractor.placeholder_extractor import PlaceholderExtractor
from dataiku.doctor.docgen.common.docx_io import DocxIO


# socket-based connection to backend
# The goal of this server is to extract the conditional placeholders
# and provide them back to the java backend
def serve(port, secret):
    link = JavaLink(port, secret)
    # initiate connection
    link.connect()
    # get work to do
    command = link.read_json()
    try:
        task = command.get("task", "")
        template_path = command.get("templatePath", "")

        print("Extract received from DSS ", task, template_path)

        docx_io = DocxIO()
        document = docx_io.load(template_path)

        placeholders_names = PlaceholderExtractor().extract_conditional_placeholders_from_docx(document)

        # send ack
        link.send_json({'placeholders': list(placeholders_names)})
    except:
        link.send_string('')  # mark failure
        traceback.print_exc()
        link.send_json(get_json_friendly_error())
    finally:
        # done
        link.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.DEBUG, format='%(asctime)s %(levelname)s %(message)s')
    watch_stdin()
    serve(int(sys.argv[1]), sys.argv[2])

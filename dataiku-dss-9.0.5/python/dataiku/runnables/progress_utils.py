import sys
import json
import traceback

from dataiku.base.utils import get_json_friendly_error

def noop_progress_report(current):
    print ('Progress : %s' % current)
    
def progress_report(current, link):
    link.send_json({'type':'PROGRESS_CHANGE'})
    link.send_json({'current':current})

def get_progress_callback(get_progress_info, link):        
    report_progress = noop_progress_report
    progress_info = get_progress_info()
    if progress_info is not None:
        target = progress_info[0] if len(progress_info) >= 1 else -1
        unit = progress_info[1] if len(progress_info) >= 2 else 'NONE'
        link.send_json({'type':'PROGRESS_INFO'})
        link.send_json({'target':target,'unit':unit})
        
        report_progress = lambda x:progress_report(x, link)
    return report_progress
    
def send_result_string(result, link):
    link.send_json({'type':'RESULT'})
    if result is not None:
        link.send_string(result)

def send_result_json(result, link):
    link.send_json({'type':'RESULT'})
    link.send_json(result)

def send_error(link):
    link.send_json({'type':'ERROR'})
    link.send_json(get_json_friendly_error())

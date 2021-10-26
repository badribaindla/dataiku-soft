import os, shutil

def clean_folder_recursively(folder, perform_deletion):
    deleted = 0
    errors = []
    for root, dirs, files in os.walk(folder, topdown=False, followlinks=False):
        for name in files:
            path = os.path.join(root, name)
            try:
                deleted += os.stat(path).st_size
                if perform_deletion:
                    os.remove(path)
            except Exception as e:
                errors.append(str(e))
        for name in dirs:
            path = os.path.join(root, name)
            try:
                if perform_deletion:
                    os.rmdir(path)
            except Exception as e:
                errors.append(str(e))
    try:
        if perform_deletion:
            os.rmdir(folder)
    except Exception as e:
        errors.append(str(e))
    return deleted, errors
    
def format_size(size):
    if size < 1024:
        return '%iB' % size
    elif size < 1024*1024:
        return '%iKB' % int(size/1024)
    elif size < 1024*1024*1024:
        return '%iMB' % int(size/(1024*1024))
    else:
        return '%iGB' % int(size/(1024*1024*1024))
        
def delete_and_report(to_delete, base_folder, progress_callback, perform_deletion, object_type_name, headers_base):
    headers = headers_base + ['Size',  ('Status' if perform_deletion else '')]
    report_rows = ['<tr>%s</tr>' % ''.join(['<th>%s</th>' % header for header in headers])]
    deleted_total = 0
    done = 0
    for deletion in to_delete:
        deletion_folder = os.path.join(base_folder, *deletion)
        deleted, errors = clean_folder_recursively(deletion_folder, perform_deletion)
        deleted_total += deleted
        deletion_status = ('Success' if perform_deletion else '') if len(errors) == 0 else '/'.join(errors)
        cells = deletion + [format_size(deleted), deletion_status]
        report_rows.append('<tr>%s</tr>' % ''.join(['<td>%s</td>' % cell for cell in cells]))
        
        done += 1
        progress_callback((done * 100) / len(to_delete))

    if perform_deletion:
        html = '<div><div>Deleted logs from %i %s (reclaimed %s).</div>'  % (len(to_delete), object_type_name, format_size(deleted_total))
    else:
        html = '<div><div>Will delete logs from %i %s to reclaim %s.</div>'  % (len(to_delete), object_type_name, format_size(deleted_total))
    
    if len(to_delete) > 0:
        html += '<table class="table table-striped">%s</table>' % (''.join(report_rows))

    html += "</div>"
    return html

    
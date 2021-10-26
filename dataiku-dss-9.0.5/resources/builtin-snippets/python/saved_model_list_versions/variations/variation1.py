import dataiku

model = dataiku.Model('model_name_or_id', 'project')

for version in model.list_versions():
    print('Algorithm ' + version['snippet']['algorithm'] + (' (active)' if version['active'] else ''))

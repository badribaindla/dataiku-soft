import dataiku

model = dataiku.Model('model_name_or_id', 'project')

# get the id of the version with the best MSE metric
versions = model.list_versions()
best_mse = min([version['snippet']['mse'] for version in versions])
version_id = [version['versionId'] for version in versions if version['snippet']['mse'] == best_mse][0]

# activate it
model.activate_version(version_id)

    
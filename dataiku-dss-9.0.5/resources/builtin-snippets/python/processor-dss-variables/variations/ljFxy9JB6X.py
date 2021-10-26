# Modify the process function to fit your needs

def process(row):
    # the dss_variables object is a dictionary
    # it contains global and project variables
    # such as "dip.home" and "projectKey"
    # it is automatically loaded 
    # in the custom Python function environment
    return dss_variables
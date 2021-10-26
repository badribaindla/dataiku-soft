from dataiku.scenario import Scenario

scenario = Scenario()

update_code = """
def get_variables():
    return {"var1" : "value1", "var2" : "value2"}
"""

# Note that you must be admin to update global variables
scenario.run_global_variables_update(update_code)

from dataiku.scenario import Scenario

scenario = Scenario()

# Note that you must be admin to update global variables
scenario.set_project_variables(var1="val1", var2=3)

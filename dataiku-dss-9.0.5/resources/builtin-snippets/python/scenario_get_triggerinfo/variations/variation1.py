from dataiku.scenario import Scenario

scenario = Scenario()

trigger_type = scenario.get_trigger_type()

trigger_name = scenario.get_trigger_name()

# depending on the trigger type, different metadata can be available
trigger_params = scenario.get_trigger_params()

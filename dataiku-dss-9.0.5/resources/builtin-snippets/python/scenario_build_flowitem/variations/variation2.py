from dataiku.scenario import Scenario

scenario = Scenario()

# Partitions are specified using the partitions spec syntax
scenario.build_dataset("mydataset", partitions="partition1|partition2")

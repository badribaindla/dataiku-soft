from dataiku.scenario import Scenario
import time

scenario = Scenario()

step1 = scenario.build_dataset("mydataset1", async=True)
step2 = scenario.build_dataset("mydataset2", async=True)

while not step1.is_done() or not step2.is_done():
    # do something while waiting
    time.sleep(1)

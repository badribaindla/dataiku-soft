from dataiku.scenario import Scenario

scenario = Scenario()

scenario.execute_sql("connection", "UPDATE TABLE t SET ...")

from dataiku.scenario import Scenario

scenario = Scenario()

if scenario.get_trigger_type() == 'exec_sql':
    trigger_params = scenario.get_trigger_params()

    # the list of the columns in the query output
    columns = trigger_params['result']['rows']
    # columns contain name and type
    print("\t".join([column['name'] for column in columns]))
    print("\t".join([column['type'] for column in columns]))

    # the rows in the result, as an array of array of strings
    rows = trigger_params['result']['rows']
    for row in rows:
        print("\t".join(row))

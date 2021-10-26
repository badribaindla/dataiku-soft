from .utils import p_format_arr, add_formatting_args, timestamp_to_date
import json
from dataikuapi.utils import DataikuException
from dataikuapi.dss.scenario import DSSScenarioRunWaiter

def scenarios_list(cmdargs, apiclient):
	scenarios = apiclient.get_project(cmdargs.project_key).list_scenarios()
	ret = []
	for scenario in scenarios:
		project_key = scenario["projectKey"]
		scenario_id = scenario["id"]
		name = scenario["name"]
		triggers_enabled = scenario["active"]
		triggers = scenario["triggerDigestItems"]
		next_run = scenario["nextRun"]
		if len(triggers) == 0:
			auto_triggers = "No auto-trigger"
		else:
			auto_triggers = ', '.join(
				[(t.get("name", False) or t.get("description", "")) + (" (Disabled)" if not t["active"] else "")for t in triggers])
		if next_run > 0:
			next_run_formatted = timestamp_to_date(next_run)
		else:
			next_run_formatted = None
		ret.append([project_key, scenario_id, name, triggers_enabled, auto_triggers, next_run_formatted])
	retrieved_cols = ["projectKey", "id", "name", "triggersEnabled", "autoTriggers", "nextRun"]
	header_cols = ["Project key", "Id", "Name", "Triggers enabled", "Auto-triggers", "Next run"]
	p_format_arr(ret, retrieved_cols, header_cols, cmdargs)

def declare_scenarios_list(subparsers, apiclient):
	p = subparsers.add_parser("scenarios-list", help="List scenarios")
	add_formatting_args(p)
	p.add_argument("project_key", help="Project key for which to list scenarios")
	p.set_defaults(func=scenarios_list, apiclient=apiclient)

def scenario_runs_list(cmdargs, apiclient):
	scenario = apiclient.get_project(cmdargs.project_key).get_scenario(cmdargs.scenario_id)
	runs = scenario.get_last_runs(int(cmdargs.limit), cmdargs.only_finished_runs)
	ret = []
	for run in runs:
		run_id = run.run["runId"]
		trigger = run.run["trigger"]["trigger"]
		triggered_by = trigger.get("name", "n/a (%s)" % trigger.get('id', ''))
		start = timestamp_to_date(run.run["start"])
		duration = None
		outcome = None
		if "result" in run.run.keys():
			result = run.run["result"]
			duration = int((result["end"] - run.run["start"]) / 1000)
			outcome = result["outcome"]
		ret.append([run_id, triggered_by, start, duration, outcome])

	retrieved_cols = ["runId", "triggeredBy", "start", "duration", "outcome"]
	header_cols = ["Run id", "Triggered by", "Start", "Duration (s)", "Outcome"]
	p_format_arr(ret, retrieved_cols, header_cols, cmdargs)


def declare_scenario_runs_list(subparsers, apiclient):
	p = subparsers.add_parser("scenario-runs-list", help="List runs of a scenario")
	add_formatting_args(p)
	p.add_argument("project_key", help="Project key for which to list scenario runs")
	p.add_argument("scenario_id", help="Id of the scenario")
	p.add_argument("--limit", dest="limit", help="Limit number of returned runs (default 10)", default="10")
	p.add_argument("--only-finished-runs", dest="only_finished_runs", action="store_true", help="Return only finished runs")
	p.set_defaults(func=scenario_runs_list, apiclient=apiclient)

def scenario_run(cmdargs, apiclient):
	scenario = apiclient.get_project(cmdargs.project_key).get_scenario(cmdargs.scenario_id)

	params = None
	if cmdargs.run_params is not None:
		if cmdargs.run_params == '-':
			path = "/dev/stdin"
		else:
			path = cmdargs.run_params

		with open(path) as f:
			params = json.load(f)

	if not cmdargs.wait:
		trigger_fire = scenario.run(params)
		retrieved_cols = ["projectKey", "scenarioId", "runId", "cancelled"]
		header_cols = ["Project key", "Scenario id", "Run id", "Cancelled"]
		ret = [[trigger_fire.trigger_fire[col] for col in retrieved_cols]]
		ret[0].append(trigger_fire.trigger_fire["trigger"]["id"])
		retrieved_cols.append("triggerId")
		header_cols.append("Trigger id")
		p_format_arr(ret, retrieved_cols, header_cols, cmdargs)
	else:
		trigger_fire = scenario.run(params)
		scenario_run = trigger_fire.wait_for_scenario_run(cmdargs.no_fail)

		retrieved_cols = ["runId", "start"]
		header_cols = ["Run id", "Start"]
		run_id = scenario_run.run["runId"]
		start = timestamp_to_date(scenario_run.run["start"])
		ret = [[run_id, start]]
		p_format_arr(ret, retrieved_cols, header_cols, cmdargs)

		print("Running scenario...")
		waiter = DSSScenarioRunWaiter(scenario_run, trigger_fire)
		scenario_run = waiter.wait(cmdargs.no_fail)

		start = timestamp_to_date(scenario_run.run["start"])
		duration = None
		outcome = None
		if "result" in scenario_run.run.keys():
			result = scenario_run.run["result"]
			duration = int((result["end"] - scenario_run.run["start"]) / 1000)
			outcome = result["outcome"]
		ret = [[run_id, start, duration, outcome]]
		retrieved_cols = ["runId", "start", "duration", "outcome"]
		header_cols = ["Run id", "Start", "Duration (s)", "Outcome"]
		p_format_arr(ret, retrieved_cols, header_cols, cmdargs)

def declare_scenario_run(subparsers, apiclient):
	p = subparsers.add_parser("scenario-run", help="Run a scenario")
	add_formatting_args(p)
	p.add_argument("project_key", help="Project key of the scenario")
	p.add_argument("scenario_id", help="Id of the scenario")
	p.add_argument("--wait", action="store_true", dest="wait", help="Wait the end of the run to complete")
	p.add_argument("--no-fail", action="store_true", dest="no_fail", help="Command doesn't fail if scenario run fails or is aborted")
	p.add_argument("--params", dest="run_params", help="File containing run parameters as a JSON dict. Use '-' for stdin")
	p.set_defaults(func=scenario_run, apiclient=apiclient)

def scenario_abort(cmdargs, apiclient):
	scenario = apiclient.get_project(cmdargs.project_key).get_scenario(cmdargs.scenario_id)
	scenario.abort()

def declare_scenario_abort(subparsers, apiclient):
	p = subparsers.add_parser("scenario-abort", help="Abort a scenario")
	p.add_argument("project_key", help="Project key of the scenario")
	p.add_argument("scenario_id", help="Id of the scenario")
	p.set_defaults(func=scenario_abort, apiclient=apiclient)
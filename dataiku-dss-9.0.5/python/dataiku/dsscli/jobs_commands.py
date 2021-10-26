from .utils import p_format_arr, add_formatting_args
from dataikuapi.utils import DataikuException
from dataikuapi.dss.job import DSSJobWaiter

def jobs_list(cmdargs, apiclient):
    jobs = apiclient.get_project(cmdargs.project_key).list_jobs()
    for job in jobs:
        job["from_scenario"] = None
        if "scenarioRunId" in job:
            job["from_scenario"] = job["scenarioId"]
    ret = [ [s["def"]["id"], s.get("state", "No Stable State"), s["from_scenario"]] for s in jobs ]
    retrieved_cols = ["jobId",  "state", "scenarioId"]
    header_cols = ["Job id",  "State", "From scenario"]
    p_format_arr(ret, retrieved_cols, header_cols, cmdargs)

def declare_jobs_list(subparsers, apiclient):
    p = subparsers.add_parser("jobs-list", help="List running and past jobs")
    p.add_argument("project_key", help="Project key for which to list jobs")
    add_formatting_args(p)
    p.set_defaults(func=jobs_list, apiclient=apiclient)

def job_status(cmdargs, apiclient):
    job = apiclient.get_project(cmdargs.project_key).get_job(cmdargs.job_id).get_status()
    base_status = job["baseStatus"]
    ret = [[base_status["def"]["projectKey"], base_status["def"]["id"], base_status["state"]]]
    retrieved_cols = ["projectKey", "job id", "state"]
    p_format_arr(ret, retrieved_cols, retrieved_cols, cmdargs)

def declare_job_status(subparsers, apiclient):
    p = subparsers.add_parser("job-status", help="Get status of job")
    add_formatting_args(p)
    p.add_argument("project_key", help="Project key of job")
    p.add_argument("job_id", help="Id of Job")
    p.set_defaults(func=job_status, apiclient=apiclient)

def build(cmdargs, apiclient):
    def get_loc(project_key, lookup):
        pos = lookup.find('.')
        if pos >= 0:
            return (lookup[:pos], lookup[pos+1:])
        else:
            return (project_key, lookup)
            
    project_key = cmdargs.project_key
    outputs = []
    for dataset in cmdargs.dataset:
        if len(dataset) == 0:
            print("Incorrect dataset specification")
            return
        lookup = dataset[0]
        loc = get_loc(project_key, lookup)
        if len(dataset) > 2:
            print("Too many partition specifications for dataset %s.%s" % loc)        
        partition = dataset[1] if len(dataset) == 2 else 'NP'
        outputs.append({'projectKey':loc[0], 'id':loc[1], 'type':'DATASET','partition':partition})

    for lookup in cmdargs.folder:
        loc = get_loc(project_key, lookup)
        outputs.append({'projectKey':loc[0], 'id':loc[1], 'type':'MANAGED_FOLDER','partition':None})

    for lookup in cmdargs.model:
        loc = get_loc(project_key, lookup)
        outputs.append({'projectKey':loc[0], 'id':loc[1], 'type':'SAVED_MODEL','partition':None})

    for lookup in cmdargs.streaming_endpoint:
        loc = get_loc(project_key, lookup)
        outputs.append({'projectKey':loc[0], 'id':loc[1], 'type':'STREAMING_ENDPOINT','partition':None})
        
    if cmdargs.mode is not None and cmdargs.mode not in ['NON_RECURSIVE_FORCED_BUILD', 'RECURSIVE_BUILD', 'RECURSIVE_FORCED_BUILD', 'RECURSIVE_MISSING_ONLY_BUILD']:
        raise Exception("Invalid mode %s" % cmdargs.mode)
    job_def = {'type':cmdargs.mode, 'refreshHiveMetastore':True, 'outputs':outputs}
    job = apiclient.get_project(project_key).start_job(job_def)
    retrieve_cols = ["projectKey", "type", "id"]
    job_status_def = job.get_status()["baseStatus"]["def"]
    ret = [[job_status_def[col] for col in retrieve_cols]]
    p_format_arr(ret, retrieve_cols, retrieve_cols, cmdargs)
    if cmdargs.wait:
        waiter = DSSJobWaiter(job)
        waiter.wait()
        print("Build completed")


def declare_build(subparsers, apiclient):
    p = subparsers.add_parser("build", help="Build datasets or folders or models in a project")
    add_formatting_args(p)
    p.add_argument("project_key", help="Project key where the build takes place")
    p.add_argument("--wait", action="store_true", dest="wait", help="Wait the end of the run to complete")
    p.add_argument("--mode", required=False, help="Type of build: RECURSIVE_BUILD, NON_RECURSIVE_FORCED_BUILD, RECURSIVE_FORCED_BUILD, RECURSIVE_MISSING_ONLY_BUILD")
    p.add_argument("--dataset", help="Dataset to build. Optionally followed by a space and a partition identifier", action='append', nargs='+')
    p.add_argument("--folder", help="Folder to build (use the unique identifier of the folder)", action='append')
    p.add_argument("--model", help="Model to build (use the unique identifier of the model)", action='append')
    p.add_argument("--streaming-endpoint", help="Streaming endpoint to build", action='append')
    p.set_defaults(func=build, apiclient=apiclient, mode='NON_RECURSIVE_FORCED_BUILD', dataset=[], folder=[], model=[], streaming_endpoint=[])

def job_abort(cmdargs, apiclient):
    job = apiclient.get_project(cmdargs.project_key).get_job(cmdargs.job_id)
    job.abort()

def declare_job_abort(subparsers, apiclient):
    p = subparsers.add_parser("job-abort", help="Abort a job")
    p.add_argument("project_key", help="Project key where job is run")
    p.add_argument("job_id", help="Id of job to abort")
    p.set_defaults(func=job_abort, apiclient=apiclient)



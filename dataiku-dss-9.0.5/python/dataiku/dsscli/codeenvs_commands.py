from dataiku.dsscli.utils import add_formatting_args, p_format_arr
import logging, traceback, sys

def codeenvs_list(cmdargs, apiclient):
    codeenvs = apiclient.list_code_envs()
    if codeenvs and len(codeenvs) > 0:
        retrieved_cols = ["envName", "envLang", "deploymentMode"]
        header_cols = ["Name", "Language", "Type"]
        ret = [[codeenv[col] for col in retrieved_cols] for codeenv in codeenvs]
        p_format_arr(ret, retrieved_cols, header_cols, cmdargs)

def declare_codeenvs_list(subparsers, apiclient):
    p = subparsers.add_parser("code-envs-list", help="List code envs")
    add_formatting_args(p)
    p.set_defaults(func=codeenvs_list, apiclient=apiclient)

def codeenv_update(cmdargs, apiclient):
    codeenv = apiclient.get_code_env(cmdargs.lang.lower(), cmdargs.name)
    codeenv.update_packages(cmdargs.force_rebuild_env)

def declare_codeenv_update(subparsers, apiclient):
    p = subparsers.add_parser("code-env-update", help="Update a code env and its container images")
    p.add_argument("lang", help="Language of code env to update")
    p.add_argument("name", help="Name of code env to update")
    p.add_argument("--force-rebuild-env", action="store_true", dest="force_rebuild_env",
                   help="Force rebuilding of the code env", default=False)
    p.set_defaults(func=codeenv_update, apiclient=apiclient)

def codeenv_rebuild_images(cmdargs, apiclient):
    logging.basicConfig(level=logging.INFO, format='[%(asctime)s] [%(levelname)s] %(message)s')

    # fetch all code env usages in one call
    all_usages = apiclient.list_code_env_usages()
    # list what needs rebuilding
    updatable = []
    for code_env_def in apiclient.list_code_envs():
        env_lang = code_env_def['envLang']
        env_name = code_env_def['envName']
        code_env_usages = [u for u in all_usages if u['envLang'] == env_lang and u.get('envName') == env_name] # u.get('envName') can be None, which means it's the builtin
        logging.info("%s code env %s has %s uses" % (env_lang, env_name, len(code_env_usages)))
        t = code_env_def['deploymentMode']
        if t == 'AUTOMATION_VERSIONED':
            # special (w.r.t. to other types): the docker building is at the version level
            project_keys = [u.get('projectKey') for u in code_env_usages if u.get('projectKey') is not None]
            code_env = apiclient.get_code_env(env_lang, env_name)
            if cmdargs.force_rebuild_all:
                versions = [v['versionId'] for v in code_env.get_definition().get('versions', [])]
            else:
                versions = set()
                for project_key in project_keys:
                    versions.add(code_env.get_version_for_project(project_key)['version'])
            logging.info("  found %s versions to rebuild" % (len(versions)))
            for version in versions:
                code_env_def_copy = dict(code_env_def)
                code_env_def_copy['envVersion'] = version
                updatable.append(code_env_def_copy)
        elif t in ['PLUGIN_MANAGED', 'DESIGN_MANAGED', 'AUTOMATION_SINGLE']:
            if cmdargs.force_rebuild_all or len(code_env_usages) > 0:
                updatable.append(code_env_def)
    
    if cmdargs.dry_run:
        #dump what has been found
        retrieved_cols = ["envName", "envLang", "deploymentMode", "envVersion"]
        header_cols = ["Name", "Language", "Type", "Version"]
        ret = [[u.get(col) for col in retrieved_cols] for u in updatable]
        p_format_arr(ret, retrieved_cols, header_cols, cmdargs)
    else:
        logging.info("Rebuilbing %s images" % len(updatable))
        for code_env_def in updatable:
            env_lang = code_env_def['envLang']
            env_name = code_env_def['envName']
            env_type = code_env_def['deploymentMode']
            env_version = code_env_def.get('envVersion')
            logging.info("Rebuild image for %s code env %s (%s version=%s)" % (env_lang, env_name, env_type, env_version))
            code_env = apiclient.get_code_env(env_lang, env_name)
            try:
                result = code_env.update_images(env_version=env_version)
                logging.info("Build done")
                for m in result.get('messages', {}).get('messages', []):
                    s = m.get('severity', 'INFO')
                    if s == 'INFO':
                        logging.info(m.get('message')) 
                    elif s == 'WARNING':
                        logging.warning(m.get('message')) 
                    else:
                        logging.error(m.get('message'))
                if cmdargs.with_logs:
                    log_name = result.get('logFileName')
                    if log_name is not None and len(log_name) > 0:
                        try:
                            log = code_env.get_log(log_name)
                            logging.info("")
                            sys.stdout.write(log)
                            sys.stdout.flush()
                            logging.info("")
                        except:
                            logging.exception('Failed to get log %s' % log_name)
                    else:
                        logging.warn("Unable to get build log")
            except:
                logging.exception("Failed to rebuild image")

def declare_codeenv_rebuild_images(subparsers, apiclient):
    p = subparsers.add_parser("code-env-rebuild-images", help="Rebuild container images of code env")
    add_formatting_args(p)
    p.add_argument("--dry-run", action="store_true", dest="dry_run", help="Dry run. Only lists code environments whose images will be rebuilt.", default=False)
    p.add_argument("--all", action="store_true", dest="force_rebuild_all", help="Build for all code environments, even those not currently in use.", default=False)
    p.add_argument("--with-logs", action="store_true", dest="with_logs", help="Fetch log of image build when a build fails.", default=False)
    p.set_defaults(func=codeenv_rebuild_images, apiclient=apiclient)
    

from .utils import p_format_arr, add_formatting_args
import json

def projects_list(cmdargs, apiclient):
	projects = apiclient.list_projects()
	retrieved_cols = ["projectKey", "name"]
	header_cols = ["Project key", "Name"]
	ret = [[project[col] for col in retrieved_cols] for project in projects]
	p_format_arr(ret, retrieved_cols, header_cols, cmdargs)

def declare_projects_list(subparsers, apiclient):
	p = subparsers.add_parser("projects-list", help="List projects")
	add_formatting_args(p)
	p.set_defaults(func=projects_list, apiclient=apiclient)

def project_delete(cmdargs, apiclient):
	project = apiclient.get_project(cmdargs.project_key)
	project.delete()

def declare_project_delete(subparsers, apiclient):
	p = subparsers.add_parser("project-delete", help="Delete a project")
	p.add_argument("project_key", help="Project key of project to delete")
	p.set_defaults(func=project_delete, apiclient=apiclient)

##################################
# Regular import/export
##################################

def project_export(cmdargs, apiclient):
	options = {
		"exportUploads" : cmdargs.uploads,
		"exportManagedFS" : cmdargs.managed_fs,
		"exportAnalysisModels": cmdargs.analysis_models,
		"exportSavedModels" : cmdargs.saved_models,
		"exportManagedFolders":  cmdargs.managed_folders,
		"exportAllInputDatasets" : cmdargs.input_datasets,
		"exportAllDatasets":  cmdargs.all_datasets,
		"exportAllInputManagedFolders" : cmdargs.input_managed_folders
	}
	print ("Exporting with options: %s " % json.dumps(options))
	apiclient.get_project(cmdargs.project_key).export_to_file(cmdargs.path, options = options)

def declare_project_export(subparsers, apiclient):
	p = subparsers.add_parser("project-export", help="Export a project")
	p.add_argument("project_key", help="Project key to export")
	p.add_argument("path", help="Target archive path")

	p.add_argument("--uploads", action="store_true", default=True, help="Export uploaded datasets")
	p.add_argument("--no-uploads", action="store_false", dest="uploads", help="Don't export uploaded datasets")

	p.add_argument("--managed-fs", action="store_true", default=False, help="Export managed filesystem datasets")
	p.add_argument("--no-managed-fs", action="store_false", dest="managed_fs", help="Don't export managed filesystem datasets")

	p.add_argument("--managed-folders", action="store_true", default=False, help="Export all managed folders data")
	p.add_argument("--no-managed-folders", action="store_false", dest="managed_folders", help="Don't export all managed folders data")

	p.add_argument("--input-managed-folders", action="store_true", default=False, help="Export input managed folders data")
	p.add_argument("--no-input-managed-folders", action="store_false", dest="input_managed_folders", help="Don't export input managed folders data")

	p.add_argument("--input-datasets", action="store_true", default=False, help="Export all input datasets data")
	p.add_argument("--no-input-datasets", action="store_false", dest="input_datasets", help="Don't export input datasets data")

	p.add_argument("--all-datasets", action="store_true", default=False, help="Export all datasets data")
	p.add_argument("--no-all-datasets", action="store_false", dest="all_datasets", help="Don't export all datasets data")

	p.add_argument("--analysis-models", action="store_true", default=True, help="Export analysis models")
	p.add_argument("--no-analysis-models", action="store_false", dest="analysis_models", help="Don't export analysis models")

	p.add_argument("--saved-models", action="store_true", default=True, help="Export flow saved models data")
	p.add_argument("--no-saved-models", action="store_false", dest="saved_models", help="Don't flow saved models data")


	p.set_defaults(func=project_export, apiclient=apiclient)

def project_import(cmdargs, apiclient):
	settings = {}
	if cmdargs.project_key:
		settings["targetProjectKey"] = cmdargs.project_key

	if cmdargs.remap_connection and len(cmdargs.remap_connection):
		settings["remapping"] = {
			"connections" : []
		}
		for conn in cmdargs.remap_connection:
			(src, tgt) = conn.split('=')
			settings["remapping"]["connections"].append({
				"source" : src,
				"target" : tgt
			})

	#print ("Settings: %s" % json.dumps(settings, indent=2))
	with open(cmdargs.path, "rb") as f:
		print("Uploading archive ...")
		r1 = apiclient.prepare_project_import(f)
		print("Importing ...")
		ret = r1.execute(settings = settings)
		if ret.get("success", False) == False:
			print("Import failed")
			print(json.dumps(ret, indent=2))
			raise Exception("Import failed")
		if ret.get("messages"):
			for message in ret.get("messages"):
				print("[{severity}][{errcode}] {message}".format(severity=message.get('severity'), errcode=message.get('code'), message=message.get("message")))
		print("Import successful")

def declare_project_import(subparsers, apiclient):
	p = subparsers.add_parser("project-import", help="Import a project archive")
	p.add_argument("path", help="Source archive path")
	p.add_argument("--project-key", help="Override project key")
	p.add_argument("--remap-connection", metavar="OLD_CONNECTION=NEW_CONNECTION",
				   help="Remap a connection", action="append")
	p.set_defaults(func=project_import, apiclient=apiclient)

##################################
# Bundles / Export
##################################

def bundles_list_exported(cmdargs, apiclient):
	bundles = apiclient.get_project(cmdargs.project_key).list_exported_bundles()
	p_format_bundles(bundles, cmdargs)

def declare_bundles_list_exported(subparsers, apiclient):
	p = subparsers.add_parser("bundles-list-exported", help="List exported bundles")
	add_formatting_args(p)
	p.add_argument("--with-data", action="store_true", dest="with_data", help="Retrieve full information for each bundle")
	p.add_argument("project_key", help="Project key for which to list bundles")
	p.set_defaults(func=bundles_list_exported, apiclient=apiclient)


def bundle_export(cmdargs, apiclient):
	print ("Start exporting bundle %s ..." % cmdargs.bundle_id)
	apiclient.get_project(cmdargs.project_key).export_bundle(cmdargs.bundle_id)
	print ("Export completed")

def declare_bundle_export(subparsers, apiclient):
	p = subparsers.add_parser("bundle-export", help="Export a bundle")
	p.add_argument("--no-header", action="store_false", dest="header", help="Don't display column headers")
	p.add_argument("project_key", help="Project key for which to export a bundle")
	p.add_argument("bundle_id", help="Identifier of the bundle to create")
	p.set_defaults(func=bundle_export, apiclient=apiclient)


def bundle_download_archive(cmdargs, apiclient):
	apiclient.get_project(cmdargs.project_key).download_exported_bundle_archive_to_file(cmdargs.bundle_id, cmdargs.path)

def declare_bundle_download_archive(subparsers, apiclient):
	p = subparsers.add_parser("bundle-download-archive", help="Download a bundle archive")
	p.add_argument("project_key", help="Project key for which to export a bundle")
	p.add_argument("bundle_id", help="Identifier of the bundle to create")
	p.add_argument("path", help="Target file (- for stdout)")
	p.set_defaults(func=bundle_download_archive, apiclient=apiclient)

##################################
# Bundles / Import
##################################


def project_create_from_bundle(cmdargs, apiclient):
	project_key = apiclient.create_project_from_bundle_local_archive(cmdargs.archive_path)
	ret = [[project_key["projectKey"]]]
	retrieved_cols = ["projectKey"]
	header_cols = ["Project key"]
	p_format_arr(ret, retrieved_cols, header_cols, cmdargs)

def declare_project_create_from_bundle(subparsers, apiclient):
	p = subparsers.add_parser("project-create-from-bundle", help="Create a project from a bundle archive")
	add_formatting_args(p)
	p.add_argument("archive_path", help="Archive path")
	p.set_defaults(func=project_create_from_bundle, apiclient=apiclient)


def bundles_list_imported(cmdargs, apiclient):
	bundles = apiclient.get_project(cmdargs.project_key).list_imported_bundles()
	p_format_bundles(bundles, cmdargs)


def declare_bundles_list_imported(subparsers, apiclient):
	p = subparsers.add_parser("bundles-list-imported", help="List imported bundles")
	add_formatting_args(p)
	p.add_argument("--with-data", action="store_true", dest="with_data", help="Retrieve full information for each bundle")
	p.add_argument("project_key", help="Project key for which to list bundles")
	p.set_defaults(func=bundles_list_imported, apiclient=apiclient)


def bundle_import(cmdargs, apiclient):
	bundle = apiclient.get_project(cmdargs.project_key).import_bundle_from_archive(cmdargs.archive_path)
	retrieved_cols = ["projectKey", "bundleId"]
	header_cols = ["Project key", "Bundle id"]
	ret = [[bundle[col] for col in retrieved_cols]]
	p_format_arr(ret, retrieved_cols, header_cols, cmdargs)

def declare_bundle_import(subparsers, apiclient):
	p = subparsers.add_parser("bundle-import", help="Import a bundle from an archive file")
	add_formatting_args(p)
	p.add_argument("project_key", help="Project key for which to import a bundle")
	p.add_argument("archive_path", help="Archive path")
	p.set_defaults(func=bundle_import, apiclient=apiclient)

def bundle_activate(cmdargs, apiclient):
	report = apiclient.get_project(cmdargs.project_key).activate_bundle(cmdargs.bundle_id)
	print (json.dumps(report, indent=2))

def declare_bundle_activate(subparsers, apiclient):
	p = subparsers.add_parser("bundle-activate", help="Activate a previously-imported bundle")
	p.add_argument("project_key", help="Project key for which to activate a bundle")
	p.add_argument("bundle_id", help="Identifier of the bundle to activate")
	p.set_defaults(func=bundle_activate, apiclient=apiclient)

##################################
# Utils
##################################

def p_format_bundles(bundles, cmdargs):
	if cmdargs.with_data:
		print(json.dumps(bundles["bundles"]))
	else:
		ret = [[p["bundleId"]] for p in bundles["bundles"]]
		retrieved_cols = ["bundleId"]
		header_cols = ["Bundle id"]
		p_format_arr(ret, retrieved_cols, header_cols, cmdargs)
from .utils import p_format_arr, add_formatting_args

def datasets_list(cmdargs, apiclient):
    datasets = apiclient.get_project(cmdargs.project_key).list_datasets()
    retrieved_cols = ["projectKey", "name", "type"]
    header_cols = ["Project key", "Name", "Type"]
    ret = [ [d[col] for col in retrieved_cols] for d in datasets ]
    p_format_arr(ret, retrieved_cols, header_cols, cmdargs)

def declare_datasets_list(subparsers, apiclient):
    p = subparsers.add_parser("datasets-list", help="List datasets")
    add_formatting_args(p)
    p.add_argument("project_key", help="Project key for which to list datasets")
    p.set_defaults(func=datasets_list, apiclient=apiclient)


def dataset_schema_dump(cmdargs, apiclient):
    dataset = apiclient.get_project(cmdargs.project_key).get_dataset(cmdargs.name)
    schema = dataset.get_schema()
    
    ret = [ [c["name"], c["type"], c.get("meaning", ""), c.get("maxLength", "")] for c in schema["columns"] ]
    retrieved_cols = ["name", "type", "meaning", "maxLength"]
    header_cols = ["Name", "Type", "Meaning", "Max. length"]
    p_format_arr(ret, retrieved_cols, header_cols, cmdargs)

def declare_dataset_schema_dump(subparsers, apiclient):
    p = subparsers.add_parser("dataset-schema-dump", help="Dump a dataset schema")
    add_formatting_args(p)
    p.add_argument("project_key", help="Project key of the dataset")
    p.add_argument("name", help="Dataset for which to dump the schema")
    p.set_defaults(func=dataset_schema_dump, apiclient=apiclient)

def dataset_list_partitions(cmdargs, apiclient):
    dataset = apiclient.get_project(cmdargs.project_key).get_dataset(cmdargs.name)
    partitioning = dataset.get_definition().get("partitioning", {})
    partitions = dataset.list_partitions()
    ret = [ partition_id.split('|') for partition_id in partitions]
    retrieved_cols = [dimension["name"] for dimension in partitioning.get("dimensions", [])]
    p_format_arr(ret, retrieved_cols, retrieved_cols, cmdargs)
    
def declare_dataset_list_partitions(subparsers, apiclient):
    p = subparsers.add_parser("dataset-list-partitions", help="List partitions of dataset")
    add_formatting_args(p)
    p.add_argument("project_key", help="Project key of the dataset")
    p.add_argument("name", help="Dataset for which to list partitions")
    p.set_defaults(func=dataset_list_partitions, apiclient=apiclient)

def dataset_clear(cmdargs, apiclient):
    dataset = apiclient.get_project(cmdargs.project_key).get_dataset(cmdargs.name)
    dataset.clear(cmdargs.partitions)

def declare_dataset_clear(subparsers, apiclient):
    p = subparsers.add_parser("dataset-clear", help="Clear a dataset")
    p.add_argument("project_key", help="Project key of the dataset")
    p.add_argument("name", help="Dataset to clear")
    p.add_argument("--partitions", dest="partitions", help="List of partitions to clear", default="")
    p.set_defaults(func=dataset_clear, apiclient=apiclient)

def dataset_delete(cmdargs, apiclient):
    dataset = apiclient.get_project(cmdargs.project_key).get_dataset(cmdargs.name)
    dataset.delete()

def declare_dataset_delete(subparsers, apiclient):
    p = subparsers.add_parser("dataset-delete", help="Delete a dataset")
    p.add_argument("project_key", help="Project key of the dataset")
    p.add_argument("name", help="Dataset to delete")
    p.set_defaults(func=dataset_delete, apiclient=apiclient)

# encoding: utf-8
"""
notebook_builder.py
Base classes for creating IPython notebooks
"""

from datetime import datetime
import jinja2
import re, logging
from collections import defaultdict

ENVIRONMENT = jinja2.Environment(loader=jinja2.PackageLoader('dataiku.doctor', 'templates'))
SPLIT_PATTERN = re.compile(r"((?:##[^\n]*\n)+)")
STARTING_SHARP = re.compile(r"^#+")
UNCOMMENT_PATTERN = re.compile(r"^#+\s*")


def extract_input_columns(preprocessing_params, with_target=False, with_profiling=True):
    """
    Returns the names of the input columns

    :param dict preprocessing_params: Dictionary parameters
    :param bool with_target: add the target column to the list
    :param bool with_profiling: add the profiling column to the list
    :returns: names of the columns
    :rtype: list of str
    """
    role_filter = {"INPUT"}
    if with_profiling:
        role_filter.add("PROFILING")
    if with_target:
        role_filter.add("TARGET")
    return [
        column_name
        for column_name, column_params in preprocessing_params["per_feature"].items()
        if column_params["role"] in role_filter
    ]


def header_cell(msg=None, level=1):
    return {
        'cell_type': 'markdown',
        'metadata': {},
        'source': [] if msg is None else ['#' * level + ' ' + msg]
    }


def comment_cell(comment):
    return {
        'cell_type': 'markdown',
        'metadata': {},
        'source': [comment]
    }


def code_cell(code):
    return {
        'cell_type': 'code',
        'execution_count': 0,
        'metadata': {'collapsed': False},
        'outputs': [],
        'source': [code]
    }


def parse_cells_from_render(content):
    cell_contents = SPLIT_PATTERN.split(content)
    for cell_info in cell_contents:
        cell_info = cell_info.strip()
        if len(cell_info) > 0:
            m = STARTING_SHARP.search(cell_info)
            nb_sharps = 0 if m is None else len(m.group(0))
            if nb_sharps <= 1:
                yield code_cell(cell_info)
            else:
                lines = [
                    UNCOMMENT_PATTERN.sub("", line)
                    for line in cell_info.split("\n")
                ]
                msg = "\n".join(lines)
                if nb_sharps == 2:
                    yield comment_cell(comment=msg)
                else:
                    yield header_cell(msg=msg, level=nb_sharps - 2)


class NotebookBuilder(object):
    def __init__(self):
        pass

    def is_supervized(self,):
        raise NotImplementedError()

    def title(self,):
        raise NotImplementedError()

    def template_name(self,):
        raise NotImplementedError()

    def template(self,):
        return ENVIRONMENT.get_template(self.template_name())

    def rescale_context(self,):
        logging.info(self.preprocessing_params["per_feature"].items())
        return {
            feature_name: feature_params["rescaling"]
            for (feature_name, feature_params) in self.preprocessing_params["per_feature"].items()
            if feature_params["type"] == "NUMERIC" and \
                (feature_params["role"] == "INPUT" or feature_params["role"] == "PROFILING") \
                and feature_params["rescaling"] and feature_params["rescaling"] != "NONE"
        }

    def categorical_preprocessing_context(self,):
        methods = defaultdict(list)
        for fname in self.preprocessing_params["per_feature"].keys():
            fparams = self.preprocessing_params["per_feature"][fname]
            if fparams["role"] == "REJECT" or fparams["role"] == "TARGET":
                continue
            if fparams["type"] != "CATEGORY":
                continue

            method = fparams["category_handling"]
            methods[method].append(fname)
        return methods

    def text_preprocessing_context(self,):
        methods = defaultdict(list)
        for fname in self.preprocessing_params["per_feature"].keys():
            fparams = self.preprocessing_params["per_feature"][fname]
            if fparams["role"] == "REJECT" or fparams["role"] == "TARGET":
                continue
            if fparams["type"] != "TEXT":
                continue

            method = fparams["text_handling"]
            methods[method].append(fname)
        return methods

    def handle_missing_context(self,):
        drop_rows_when_missing = []
        flag_when_missing = []
        impute_when_missing = []
        for (feature_name, feature_params) in self.preprocessing_params["per_feature"].items():
            if feature_params["role"] == "REJECT" or feature_params["role"] == "TARGET" or feature_params["type"] == "TEXT":
                continue
            method = feature_params["missing_handling"]
            if method == "DROP_ROW":
                drop_rows_when_missing.append(feature_name)
            elif method == "IMPUTE":
                impute = {"feature": feature_name, "impute_with": feature_params["missing_impute_with"]}
                if feature_params["missing_impute_with"] == "CONSTANT":
                    impute["value"] = feature_params["impute_constant_value"]
                impute_when_missing.append(impute)
        return {
            "drop_rows_when_missing": drop_rows_when_missing,
            "impute_when_missing": impute_when_missing,
        }

    @property
    def algorithm(self,):
        return self.pre_train['algorithm']

    def context(self,):
        categorical_features = []
        numerical_features = []
        text_features = []
        for feature_name in self.preprocessing_params['per_feature']:
            feature_params = self.preprocessing_params['per_feature'][feature_name]
            if feature_params['role'] not in {'REJECT', 'TARGET'}:
                if feature_params['type'] == 'NUMERIC':
                    numerical_features.append(feature_name)
                elif feature_params['type'] == 'CATEGORY':
                    categorical_features.append(feature_name)
                elif feature_params['type'] == 'TEXT':
                    text_features.append(feature_name)
        algorithm = self.algorithm
        if algorithm not in {'RANDOM_FOREST_CLASSIFICATION',
                             'GBT_CLASSIFICATION',
                             'GBT_REGRESSION',
                             'DECISION_TREE_CLASSIFICATION',
                             'DECISION_TREE_REGRESSION',
                             'EXTRA_TREES',
                             'KNN',
                             'NEURAL_NETWORK',
                             'SCIKIT_MODEL',
                             'LOGISTIC_REGRESSION',
                             'SVC_CLASSIFICATION',
                             'SVM_REGRESSION',
                             'SGD_CLASSIFICATION',
                             'SGD_REGRESSION',
                             'KMEANS',
                             'MiniBatchKMeans',
                             'SPECTRAL',
                             'WARD',
                             'DBSCAN',
                             'LEASTSQUARE_REGRESSION',
                             'RANDOM_FOREST_REGRESSION',
                             'RIDGE_REGRESSION',
                             'LASSO_REGRESSION',
                             'XGBOOST_REGRESSION',
                             'XGBOOST_CLASSIFICATION',
                             'LARS'}:
            raise ValueError("Algorithm %s is unsupported." % algorithm)
        return {
            "title": self.title(),
            "model_name": self.model_name,
            "model_date": self.model_date,

            # Input
            "dataset": self.dataset_smartname,
            "script_steps" : self.script_steps,
            "preparation_output_schema" : self.preparation_output_schema,

            # Split / Crossval
            "split_stuff" : self.split_stuff,

            # Modeling
            "algorithm": algorithm,
            "enable_feature_selection": algorithm in {"RANDOM_FOREST_CLASSIFICATION", "RANDOM_FOREST_REGRESSION"},
            "now": datetime.utcnow(),

            # Preprocessing
            "categorical_features": categorical_features,
            "numerical_features": numerical_features,
            "text_features": text_features,
            "input_columns": extract_input_columns(self.preprocessing_params, with_target=True),
            "handle_missing": self.handle_missing_context(),
            "categorical_processing": self.categorical_preprocessing_context(),
            "rescale_features": self.rescale_context(),
            "pre_train": self.pre_train,
            "post_train": self.post_train,
            "reduce": self.preprocessing_params["reduce"],
            "is_supervized": self.is_supervized(),
        }

    # @property
    # def dataset_fullname(self,):
    #     raise "NotImplementedException"
    #     print("###################")
    #     print(self.core_params)
    #     project_key = self.core_params["input"]["datasetProjectKey"]
    #     dataset_shortname = self.core_params["input"]["dataset"]
    #     return ".".join((project_key, dataset_shortname))

    def create_notebook(self,):
        context = self.context()
        content = self.template().render(context)
        cells = list(parse_cells_from_render(content))
        return {
            'metadata': {
                'kernelspec': {
                    'display_name': 'Python 2',
                    'language': 'python',
                    'name': 'python2'
                },
                'language_info': {
                    'codemirror_mode': {
                        'name': 'ipython',
                        'version': 2
                    },
                    'file_extension': '.py',
                    'mimetype': 'text/x-python',
                    'name': 'python',
                    'nbconvert_exporter': 'python'
                },
                'name': self.title()
            },
            'nbformat': 4,
            'nbformat_minor': 0,
            'cells': cells
        }


class ClusteringNotebookBuilder(NotebookBuilder):
    def __init__(self,         model_name, model_date, dataset_smartname,
                               script_steps, preparation_output_schema,
                               split_stuff,
                               preprocessing_params,
                               pre_train, post_train):
        self.model_name = model_name
        self.model_date = datetime.fromtimestamp(model_date)
        self.dataset_smartname = dataset_smartname
        self.script_steps = script_steps
        self.preparation_output_schema = preparation_output_schema
        self.split_stuff = split_stuff
        self.preprocessing_params = preprocessing_params
        self.pre_train = pre_train
        self.post_train = post_train

    def title(self):
        return 'Clustering %s' % self.dataset_smartname

    def template_name(self,):
        return "clustering.tmpl"

    def is_supervized(self,):
        return False

    def context(self,):
        context = NotebookBuilder.context(self,)
        context.update({
            "title": self.title(),
            "outliers": self.preprocessing_params['outliers'],
            "is_kmean_like": self.algorithm in ("KMEANS", "MiniBatchKMeans"),
        })
        return context


class PredictionNotebookBuilder(NotebookBuilder):
    def __init__(self,         model_name, model_date, dataset_smartname,
                               script_steps, preparation_output_schema,
                               split_stuff,
                               core_params,
                               preprocessing_params,
                               pre_train, post_train):
        self.model_name = model_name
        self.model_date = datetime.fromtimestamp(model_date)
        self.dataset_smartname = dataset_smartname
        self.script_steps = script_steps
        self.preparation_output_schema = preparation_output_schema
        self.core_params = core_params
        self.split_stuff = split_stuff
        self.preprocessing_params = preprocessing_params
        self.pre_train = pre_train
        self.post_train = post_train

    def title(self):
        return 'Predicting %s in %s' % (self.target_variable, self.dataset_smartname)

    @property
    def target_variable(self,):
        return self.core_params["target_variable"]

    @property
    def prediction_type(self,):
        return self.core_params["prediction_type"]

    def is_supervized(self,):
        return True

    def template_name(self,):
        if self.prediction_type == "REGRESSION":
            return "regression.tmpl"
        else:
            return "classification.tmpl"

    def get_sample_weight_column(self):
        """
        Returns the name of the column that contains sample weight

        :returns: name of the column or None if there is no weight column
        :rtype: str or None
        """
        for column_name, column_params in self.preprocessing_params["per_feature"].items():
            if column_params["role"] == "WEIGHT":
                return column_name

    def handle_missing_context(self,):
        added_properties = super(PredictionNotebookBuilder, self).handle_missing_context()
        weight_column = self.get_sample_weight_column()
        if weight_column is not None:
            # when using sample_weight, DSS drops the rows with missing sample weight value
            # so, we add the sample weight column to the list
            added_properties["drop_rows_when_missing"].append(weight_column)
        return added_properties

    def context(self,):
        target_map = {}
        if "target_remapping" in self.preprocessing_params:
            target_map = {}
            for tv in self.preprocessing_params["target_remapping"]:
                target_map[tv["sourceValue"]] = tv["mappedValue"]
        context = NotebookBuilder.context(self,)
        # calibration method is in lowercase to be used as a valid argument for CalibratedClassifierCV
        calibration_method = self.core_params.get("calibration", {}).get("calibrationMethod", "").lower()
        weight_method = self.core_params.get("weight", {}).get("weightMethod", "")
        if weight_method in {"SAMPLE_WEIGHT", "CLASS_AND_SAMPLE_WEIGHT"}:
            weight_column = self.get_sample_weight_column()
            context.update({
                "input_columns": context.get("input_columns", []) + [weight_column],
                "weight_column": weight_column
            })
        context.update({
            "prediction_type": self.prediction_type,
            "target": self.target_variable,
            "target_map": target_map,
            "split": self.split_stuff,
            "calibration_method": calibration_method,
            "weight_method": weight_method
        })
        return context

    def categorical_preprocessing_context(self,):
        if self.prediction_type == 'REGRESSION':
            impact_method = 'continuous'
        else:
            impact_method = 'multiple'
        context = NotebookBuilder.categorical_preprocessing_context(self,)
        context.update({"impact_method": impact_method})
        return context

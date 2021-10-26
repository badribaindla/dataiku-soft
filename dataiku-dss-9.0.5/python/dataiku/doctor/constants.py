from enum import Enum


class ProcessingStep(Enum):
    # Preprocessing steps
    STEP_LOADING_SRC = "Loading source dataset"
    STEP_LOADING_TRAIN = "Loading train set"
    STEP_LOADING_TEST = "Loading test set"
    STEP_COLLECTING = "Collecting statistics"
    STEP_COLLECTING_PREPROCESSING_DATA = "Collecting preprocessing data"
    STEP_PREPROCESS_TRAIN = "Preprocessing train set"
    STEP_PREPROCESS_TEST = "Preprocessing test set"
    STEP_PREPROCESS_FULL = "Preprocessing full set"
    STEP_PREPROCESS_SRC = "Preprocessing data"
    STEP_HYPERPARAMETER_SEARCHING = "Hyperparameter searching"
    STEP_FITTING = "Fitting model"
    STEP_SAVING = "Saving model"
    STEP_SCORING = "Scoring model"
    STEP_ENSEMBLING = "Creating ensemble"

    KFOLD_STEP_PREPROCESS_GLOBAL = "Preprocessing input"
    KFOLD_STEP_FITTING_GLOBAL = "Fitting global model"
    KFOLD_STEP_SAVING_GLOBAL = "Saving global model"  # Unused
    KFOLD_STEP_SCORING_GLOBAL = "Computing global stats"
    KFOLD_STEP_PROCESSING_FOLD = "Fitting folds"

    KERAS_STEP_FIT_NORMAL_PREPROCESSING = "Fitting preprocessors"
    KERAS_STEP_FIT_CUSTOM_PREPROCESSING = "Fitting custom preprocessors"  # Unused

PRED_REGULAR_PREPROCESSING_STEPS = [
    ProcessingStep.STEP_LOADING_TRAIN,
    ProcessingStep.STEP_LOADING_TEST,
    ProcessingStep.STEP_COLLECTING,
    ProcessingStep.STEP_PREPROCESS_TRAIN,
    ProcessingStep.STEP_PREPROCESS_TEST
]

PRED_REGULAR_TRAIN_STEPS = [
    ProcessingStep.STEP_FITTING,
    ProcessingStep.STEP_SAVING,
    ProcessingStep.STEP_SCORING
]

PRED_KFOLD_PREPROCESSING_STEPS = [
    ProcessingStep.STEP_LOADING_SRC,
    ProcessingStep.STEP_COLLECTING,
    ProcessingStep.KFOLD_STEP_PREPROCESS_GLOBAL,
]

PRED_KFOLD_TRAIN_STEPS = [
    ProcessingStep.KFOLD_STEP_FITTING_GLOBAL,
    ProcessingStep.STEP_SAVING,
    ProcessingStep.KFOLD_STEP_SCORING_GLOBAL,
    ProcessingStep.KFOLD_STEP_PROCESSING_FOLD
]

PRED_KERAS_PREPROCESSING_STEPS = [
    ProcessingStep.STEP_LOADING_TRAIN,
    ProcessingStep.STEP_LOADING_TEST,
    ProcessingStep.STEP_COLLECTING,
    ProcessingStep.STEP_PREPROCESS_TRAIN,
    ProcessingStep.STEP_PREPROCESS_TEST,
    ProcessingStep.KERAS_STEP_FIT_NORMAL_PREPROCESSING
    # KERAS_STEP_FIT_CUSTOM_PREPROCESSING
]
PRED_KERAS_TRAIN_STEPS = [
    ProcessingStep.STEP_FITTING,
    ProcessingStep.STEP_SAVING,
    ProcessingStep.STEP_SCORING
]


CLUSTERING_REGULAR_PREPROCESSING_STEPS = [
    ProcessingStep.STEP_LOADING_SRC,
    ProcessingStep.STEP_COLLECTING,
    ProcessingStep.STEP_PREPROCESS_SRC
]

ALL_CLUSTERING_TRAIN_STEPS = [
    ProcessingStep.STEP_FITTING,
    ProcessingStep.STEP_SAVING,
    ProcessingStep.STEP_SCORING
]

ENSEMBLE_STEPS = [
    ProcessingStep.STEP_ENSEMBLING,
    ProcessingStep.STEP_SAVING,
    ProcessingStep.STEP_SCORING
]

CLUSTER_OUTLIERS = 'cluster_outliers'

PREPROCESSING_LOGGER_NAME = "dku.ml.preprocessing"

# Variable types
CATEGORY = "CATEGORY"
NUMERIC = "NUMERIC"
TEXT = "TEXT"
VECTOR = "VECTOR"
IMAGE = "IMAGE"

# Prediction types
MULTICLASS = "MULTICLASS"
REGRESSION = "REGRESSION"
BINARY_CLASSIFICATION = "BINARY_CLASSIFICATION"
CLUSTERING = "CLUSTERING"

NONE = "NONE"
IMPUTE = "IMPUTE"
DROP_ROW = "DROP_ROW"

DUMMIFY = "DUMMIFY"
UNFOLD = "UNFOLD"
IMPACT = "IMPACT"
TERM_HASH = "TERM_HASH"
CATEGORY_HANDLING = "category_handling"
NUMERICAL_HANDLING = "numerical_handling"
TEXT_HANDLING = "text_handling"
TARGET_VARIABLE = "target_variable"
PREDICTION_TYPE = "prediction_type"
PREDICTION_VARIABLE = "prediction_variable"
PROBA_COLUMNS = "proba_cols"
CATEGORY_POSSIBLE_VALUES = "category_possible_values"
CATEGORY_POSSIBLE_COUNTS = "category_possible_counts"
CATEGORY_NEED_OTHERS = "category_need_others"

GENERATE_DERIVATIVE = "generate_derivative"
RESCALING = "rescaling"
RESCALING_METHOD = "rescaling_method"
TERM_HASH_SIZE = "term_hash_size"
MINMAX = "MINMAX"
AVGSTD = "AVGSTD"
MISSING_HANDLING = "missing_handling"
PER_FEATURE = "per_feature"
STATS = "stats"

# Keras
KERAS_MODEL_FILENAME = "keras_model.h5"

DKU_CURRENT_ANALYSIS_ID = "DKU_CURRENT_ANALYSIS_ID"
DKU_CURRENT_MLTASK_ID = "DKU_CURRENT_MLTASK_ID"

FILL_NA_VALUE = "__DKU_N/A__"

# Reasons for no preprocessing result
PREPROC_FAIL = "FAIL"
PREPROC_DROPPED = "DROPPED"
PREPROC_NOTARGET = "NOTARGET"
PREPROC_ONECLASS = "ONECLASS"

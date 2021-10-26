# coding: utf-8
from __future__ import unicode_literals

import json
import logging
import sys
import traceback

from dataiku.base.socket_block_link import JavaLink
from dataiku.base.utils import get_json_friendly_error
from dataiku.base.utils import watch_stdin
from dataiku.core import debugging
from dataiku.core.dkujson import DKUJSONEncoder
from dataiku.core.saved_model import build_predictor
from dataiku.doctor.utils import add_missing_columns
from dataiku.doctor.utils import dataframe_from_dict_with_dtypes
from dataiku.doctor.utils import ml_dtypes_from_dss_schema

logger = logging.getLogger(__name__)


class InteractiveModelProtocol(object):
    def __init__(self, link):
        self.link = link

    def _handle_compute_score(self, interactive_scorer, scoring_params):
        pred_df = interactive_scorer.score(scoring_params)
        index_before_pp = range(len(scoring_params["features"]))
        prediction_list = dataframe_to_list(pred_df, index_before_pp)

        self.link.send_json({"payload": {"scores": prediction_list}}, cls=DKUJSONEncoder)

    def _handle_compute_explanation(self, interactive_scorer, scoring_params):
        prediction_df, explanations_df = interactive_scorer.explain(scoring_params)
        index_before_pp = range(len(scoring_params["features"]))
        prediction_list = dataframe_to_list(prediction_df, index_before_pp)
        explanations_list = dataframe_to_list(explanations_df, index_before_pp, dropna=True)

        self.link.send_json({"payload": {"explanations": explanations_list, "scores": prediction_list}})

    def start(self):
        interactive_scorer = None
        while True:
            try:
                command = self.link.read_json()
                params = json.loads(command["params"])

                if interactive_scorer is None:
                    interactive_scorer = InteractiveScorer(params)

                if command["type"] == "SCORE":
                    self._handle_compute_score(interactive_scorer, params["scoring_parameters"])
                elif command["type"] == "EXPLANATION":
                    self._handle_compute_explanation(interactive_scorer, params["scoring_parameters"])
                else:
                    logging.info("Interactive Scoring - Command %s not recognized" % command["type"])
            except Exception as e:
                traceback.print_exc()
                traceback.print_stack()
                logger.error(e)
                error = get_json_friendly_error()
                self.link.send_json({'error': error})


def dataframe_to_list(df, original_index, dropna=False):
    """ Convert dataframe to list of dict or None.
    The returned list contains, for each row:
    - None if an index is in original_index but not in df
    - the dict of the dataframe's row otherwise.
    If dropna, the nan values are remove from the row before converting it to a dict
    :rtype: list
    """
    lst = []
    for idx in original_index:
        if idx not in df.index:
            lst.append(None)
        else:
            if dropna:
                lst.append(df.loc[idx].dropna().to_dict())
            else:
                lst.append(df.loc[idx].to_dict())
    return lst


class InteractiveScorer:
    def __init__(self, params):
        self.predictor = build_predictor("PREDICTION", params["model_folder"], params["preprocessing_folder"], [],
                                         params["core_params"], params["split_desc"])

        self.per_feature = self.predictor.params.preprocessing_params['per_feature']
        self.dtypes = ml_dtypes_from_dss_schema(params["split_desc"]["schema"], self.per_feature,
                                                prediction_type=params["core_params"]["prediction_type"])

    def score(self, scoring_params):
        df = self._get_dataframe(scoring_params["features"])
        pred_df = self.predictor.predict(df)
        return pred_df

    def explain(self, scoring_params):
        prediction_df = self.predictor.predict(self._get_dataframe(scoring_params["features"]),
                                               with_probas=True,
                                               with_explanations=True,
                                               n_explanations=scoring_params["n_explanations"],
                                               explanation_method=scoring_params["explanation_method"])
        # Extract explanations
        explanations_prefix = "explanations_"
        explanations_col = [col for col in prediction_df.columns if col.startswith(explanations_prefix)]
        explanations_df = prediction_df[explanations_col]

        prediction_df = prediction_df.drop(explanations_col, axis=1)

        new_col_names = map(lambda col: col.replace(explanations_prefix, ""), explanations_col)
        explanations_df.columns = new_col_names
        return prediction_df, explanations_df

    def _get_dataframe(self, records):
        # format records as {"feature1": array, "feature2: array} like in API Node python server
        all_features = {k for d in records for k in d.keys()}
        records_as_dict = {feature: [record[feature] if feature in record else None for record in records]
                           for feature in all_features}

        df = dataframe_from_dict_with_dtypes(records_as_dict, self.dtypes)
        df = add_missing_columns(df, self.dtypes, self.per_feature)

        return df


def serve(port, secret):
    link = JavaLink(port, secret)
    link.connect()

    interactive_model = InteractiveModelProtocol(link)
    interactive_model.start()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO,
                        format='[%(asctime)s] [%(process)s/%(threadName)s] [%(levelname)s] [%(name)s] %(message)s')
    debugging.install_handler()

    watch_stdin()
    serve(int(sys.argv[1]), sys.argv[2])

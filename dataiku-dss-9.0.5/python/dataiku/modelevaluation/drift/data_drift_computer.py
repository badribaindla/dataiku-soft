import logging

from dataiku.modelevaluation.drift.drift_model import DriftModel
from dataiku.modelevaluation.drift.drift_preparator import DriftPreparator
from dataiku.modelevaluation.drift.drift_univariate import DriftUnivariate
from dataiku.modelevaluation.drift.surrogate_model import SurrogateModel

logger = logging.getLogger(__name__)


class DataDriftComputer(object):
    def __init__(self, me1, me2, data_drift_params):
        self.ref_me = me1
        """:type : dataiku.modelevaluation.server.ModelLikeInfo"""
        self.cur_me = me2
        """:type : dataiku.modelevaluation.server.ModelLikeInfo"""
        self.data_drift_params = data_drift_params
        """:type : dataiku.modelevaluation.data_types.DataDriftParams"""

    def compute(self):
        column_importance = self._get_or_compute_column_importance()

        # Preparation ensures the compared dataframe have exactly the same schema
        preparator = DriftPreparator(self.ref_me, self.cur_me, self.data_drift_params)
        ref_df_prepared, cur_df_prepared, per_column_report = preparator.prepare()

        univariate_drift = DriftUnivariate(
            ref_df_prepared, cur_df_prepared,
            self.data_drift_params.nb_bins,
            self.data_drift_params.compute_histograms
        ).compute_drift()

        if len(ref_df_prepared.columns) > 0:
            drift_model = DriftModel(ref_df_prepared, cur_df_prepared, column_importance,
                                     self.data_drift_params.confidence_level).compute_drift()
        else:
            logger.error("Cannot train a drift model (no data or no column importance)")
            drift_model = None

        return {
            "univariateDriftResult": univariate_drift,
            "driftModelResult": drift_model,
            "perColumnReport": per_column_report,
            "referenceSampleSize": len(self.ref_me.sample_df),
            "currentSampleSize": len(self.cur_me.sample_df)
        }

    def _get_or_compute_column_importance(self):
        if self.ref_me.column_importance is not None:
            # Use already known column importance
            logger.info("Re-using pre-computed column importance for {}".format(self.ref_me.ref))
            return dict(zip(
                self.ref_me.column_importance["columns"],
                self.ref_me.column_importance["importances"]
            ))

        elif self.ref_me.prediction_df is not None:
            # Fallback on using a surrogate model to approximate them if predictions are not available
            logger.info("Estimating column importance with a surrogate model for {}".format(self.ref_me.ref))

            surrogate_model = SurrogateModel(self.ref_me.sample_df, self.ref_me.prediction_df,
                                             self.ref_me.prediction_type, self.ref_me.preprocessing_params)
            return surrogate_model.compute_column_importance()
        else:
            # Column importances and predictions are not available
            # There is no way to compute column importance
            logger.error("Cannot obtain column importance for {}".format(self.ref_me.ref))
            return None

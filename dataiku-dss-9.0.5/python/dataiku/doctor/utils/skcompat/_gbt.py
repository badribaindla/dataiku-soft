import numpy as np
import sklearn

from dataiku.base.utils import package_is_at_least


def get_gbt_regression_baseline(gbt):
    if package_is_at_least(sklearn, "0.21"):
        # In newer versions of sklearn, we can use DummyRegressor's constant_`
        # attribute that will automatically contain `mean` or `quantile`
        # depending on the chosen strategy.
        return float(gbt.init_.constant_)
    else:
        # In previous versions of sklearn, depending on the type of the init_
        # regressor, we must use either the `mean` or the `quantile` attribute.
        return gbt.init_.mean if "mean" in dir(gbt.init_) else gbt.init_.quantile


def get_gbt_classification_baseline(gbt, binary_classif):
    if package_is_at_least(sklearn, "0.21"):
        if binary_classif:
            # The initial default prediction for binary classification is:
            #   - log odds ratio, if the loss is "deviance"
            #   -  0.5 * log odds ratio, if the loss is "exponential"
            # Since sklearn 0.21, to compute the log odds ratio, we need to use
            # the class_prior_ attribute that gives the class distribution.
            log_odds_ratio = _get_log_odds_ratio(gbt.init_.class_prior_)
            if gbt.loss == "exponential":
                # The minimizer of the exponential loss is .5 * log odds ratio.
                return [log_odds_ratio * .5]
            # The minimizer of the binomial deviance loss is log odds ratio.
            return [log_odds_ratio]
        else:
            # Since sklearn 0.21, the initial default prediction for multiclass
            # classification is the log of the weighted priors.
            return list(np.log(gbt.init_.class_prior_))

    if binary_classif:
        # In sklearn < 0.21, the initial default prediction for binary
        # classification can be retrieved directly thanks to the `prior`
        # attribute. `prior` will return:
        #   - log odds ratio, if the loss is "deviance"
        #   - 0.5 * log odds ratio, if the loss is "exponential"
        return [gbt.init_.prior]
    else:
        # In sklearn < 0.21, the initial default prediction for multiclass
        # classification is simply the weighted priors.
        return list(gbt.init_.priors)


def _get_log_odds_ratio(priors):
    # To compute the log odds ratio, we need to use the weighted class
    # distribution. ie. the weighted prior probabilities to find each class.
    # Formula: The log odds ratio is defined as: log(p / (1-p))
    #          With:   p = prior probability for the class to be 1
    #          =>      p = gbt.init_.class_prior_[1]
    #          and (1-p) = gbt.init_.class_prior_[0]
    return np.log(priors[1] / priors[0])

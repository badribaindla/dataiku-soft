from six.moves import xrange
from sklearn.ensemble import RandomForestRegressor
from sklearn.ensemble import RandomForestClassifier
from sklearn import model_selection
from sklearn.metrics import f1_score
from dataiku.doctor.utils import unix_time_millis
import pandas as pd
import multiprocessing
import logging

nb_trees_per_steps = 12
min_steps = 4
# Stop when the cumulative improvement over the buffer is below the min_improvement
improvement_buffer_size = 4
min_improvement_over_buffer = 1.02
#no_improvement_steps_threshold = 5
#step_improvement_min = 1.01

logger = logging.getLogger(__name__)

class IML(object):
    def model(self, params):
        return None

    def merge(self, clf2):
        return None

    def should_continue(self, Ytest, Y1, Y2):
        return False

    def __init__(self, **params):
        logger.info("BUILD IML WITH %s" % params)
        self.scorer = params["scorer"]
        self.params = params
        self.clf = self.model(self.params)

    def get_params(self, **kwargs):
        ret = self.clf.get_params(**kwargs)
        ret["scorer"] = self.scorer
        ret["n_estimators"] = len(self.clf.estimators_)
        ret["random_state"] = 1337
        logger.info("****** Get params : %s" % ret)
        return ret

    def set_params(self, **params):
        logger.info("SET PARAMS %s" % params)
        import copy
        p2 = copy.deepcopy(params)
        #del p2["scorer"]
        self.clf.set_params(**p2)
        return self

    def fit(self, X, Y, sample_weight=None):
        if sample_weight is not None:
            Xt, Xtest, Yt, Ytest, sample_weightt, sample_weightest = model_selection.train_test_split(X, Y, sample_weight, test_size=0.1, random_state=0)
        else:
            Xt, Xtest, Yt, Ytest  = model_selection.train_test_split(X, Y, test_size=0.2, random_state=0)
            sample_weightt = None
            sample_weighttest = None

        self.clf.fit(Xt, Yt, sample_weightt)
        #Y1 = self.clf.predict(Xtest)
        logger.info("Doing scoring Xtest=%s Ytest=%s" % (str(Xtest.shape), str(Ytest.shape)))
        score1 = self.scorer(self.clf, Xtest, Ytest)
        should_stop_count = 0

        improvement_buffer = [];

        for i in xrange(0,1000):
            logger.info("IML training iteration %d (should_stop=%d)" % (i, should_stop_count))
            t1 = unix_time_millis()
            clf2 = self.model(self.params)
            t2 = unix_time_millis()
            clf2.fit(Xt, Yt, sample_weightt)
            t3 = unix_time_millis()
            self.merge(clf2)
            t4 = unix_time_millis()
            #Y2 = self.clf.predict(Xtest)
            score2 = self.scorer(self.clf, Xtest, Ytest)
            t5 = unix_time_millis()
            self.last_increase = score2/score1

            if len(improvement_buffer) < improvement_buffer_size:
                improvement_buffer.append(self.last_increase)
            else:
                improvement_buffer = improvement_buffer[1:]
                improvement_buffer.append(self.last_increase)

            cum_improvement = reduce (lambda cum, x : cum * x, improvement_buffer)

            logger.info("IML run done, score: %f -> %f last_inc=%.3f imp_buf=%s cum_imp=%.3f" % (score1, score2, self.last_increase, improvement_buffer, cum_improvement))
            logger.info(" IML run timing : create=%f fit=%f merge=%f score=%f total=%f" % (t2-t1, t3-t2, t4-t3, t5-t4, t5-t1))

            #if not self.last_increase > step_improvement_min:
            #    should_stop_count = should_stop_count + 1
            #else:
            #    should_stop_count = 0
            #if i > nb_trees_per_steps and should_stop_count >= no_improvement_steps_threshold:
            #    break
            if i > min_steps and cum_improvement <= min_improvement_over_buffer:
                break
            #Y1 = Y2
            score1 = score2

    def predict(self, X):
        return self.clf.predict(X)

    def predict_proba(self, X):
        return self.clf.predict_proba(X)

    #def score(self, X, Y, sample_weight=None):
    #    return self.clf.score(X, Y) ## Sample Weight in 0.15

    @property
    def estimators_(self):
        return self.clf.estimators_

    @property
    def classes_(self):
        return self.clf.classes_

    @property
    def feature_importances_(self):
        return self.clf.feature_importances_

    # def should_continue(self, Ytest, Y1, Y2):
    #     logger.info("CALL SCORER %s" % self.scorer)
    #     s1 = self.scorer(self.clf, Ytest, Y1)
    #     s2 = self.scorer(self.clf, Ytest, Y2)
    #     self.last_increase = s2/s1
    #     logger.info("IML run done, score: %f -> %f improved by %.3f" % (s1, s2, self.last_increase))
    #     return self.last_increase > 1.01


class RegressionIML(IML):
    pass
    # def should_continue(self, Ytest, Y1, Y2):
    #     df = pd.DataFrame({"Ytest": Ytest, "Y1": Y1, "Y2": Y2})
    #     s1 = df[['Ytest', 'Y1']].corr()['Ytest'][1]
    #     s2 = df[['Ytest', 'Y2']].corr()['Ytest'][1]
    #     t =  (s2 / s1) > 1.01
    #     self.last_increase = (s2/s1)
    #     logger.info("IML run done, improved by %f", self.last_increase)
    #     return (s2 / s1) > 1.01


class ClassificationIML(IML):
    pass
    # def should_continue(self, Ytest, Y1, Y2):
    #     s1 = f1_score(Ytest, Y1, average='weighted')
    #     s2 = f1_score(Ytest, Y2, average='weighted')
    #     self.last_increase = s2/s1
    #     logger.info("IML run done, improved by %f", self.last_increase)
    #     return self.last_increase > 1.01


class RandomForestRegressorIML(RegressionIML):
    """Random Forest with autostop of growing the forest"""
    i = 0

    def model(self, params):
        import copy
        rfc_params = copy.deepcopy(params)
        del rfc_params["scorer"]
        self.i += 1
        return RandomForestRegressor(**dict(rfc_params, random_state=params.get('random_state', 1234) + self.i, n_estimators=nb_trees_per_steps))

    def merge(self, clf2):
        for e in clf2.estimators_:
            self.clf.estimators_.append(e)
            self.clf.n_estimators += 1
        logger.info("Merge done, now have %d trees in forest", self.clf.n_estimators)


class RandomForestClassifierIML(ClassificationIML):
    """Random Forest with autostop of growing the forest"""
    i = 0

    def model(self, params):
        import copy
        rfc_params = copy.deepcopy(params)
        del rfc_params["scorer"]
        self.i += 1
        return RandomForestClassifier(**dict(rfc_params, random_state=params.get('random_state', 1234) + self.i, n_estimators=nb_trees_per_steps))

    def merge(self, clf2):
        for e in clf2.estimators_:
            self.clf.estimators_.append(e)
            self.clf.n_estimators += 1
        logger.info("Merge done, now have %d trees in forest", self.clf.n_estimators)


if __name__ == "__main__":
    import sklearn.datasets
    clf = RandomForestRegressorIML()
    for d in [sklearn.datasets.load_boston(), sklearn.datasets.load_diabetes()]:
        clf.fit(d.data, d.target)
        #print ("Auto score", clf.score(d.data, d.target))
        print ("Last increase", clf.last_increase)
        print (len(clf.estimators_))
    clf = RandomForestClassifierIML()
    for d in [sklearn.datasets.load_digits(9), sklearn.datasets.load_iris()]:
        clf.fit(d.data, d.target)
        #print ("Auto score", clf.score(d.data, d.target))
        print ("Last increase", clf.last_increase)
        print (len(clf.estimators_))


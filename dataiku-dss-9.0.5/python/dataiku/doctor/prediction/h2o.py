
import pandas as pd

from dataiku.base.utils import safe_unicode_str

try:
    import cStringIO as StringIO
except:
    from io import StringIO
import os
import sys
import getpass
import time
import inspect
import requests
import random
import datetime, logging

logger = logging.getLogger(__name__)

def log(s, comment=None):
    print(s)
def log_rest(s, comment=None):
    pass

def verboseprint(*args):
    pass

def dump_json(obj):
    return str(obj)

class H2O(object):   
    def __url(self, loc):
        # always use the new api port
        if loc.startswith('/'):
            delim = ''
        else:
            delim = '/'
        u = '%s%s%s' % (self.base_url, delim, loc)
        print (u)
        return u

    def do_csv_request(self, req, params, timeout=10):
        url = self.__url(req)
        try:
            r = requests.get(url, timeout=timeout, params=params)
        except Exception as e:
            exc_info = sys.exc_info()
            log_rest("EXCEPTION CAUGHT DOING REQUEST: " + safe_unicode_str(e))
            if sys.version_info() > (3, 0):
                exec("raise e.with_traceback(exc_info[2])")
            else:
                exec("raise exc_info[1], None, exc_info[2]")
        return r.content

    def do_json_request(self, jsonRequest=None, fullUrl=None, timeout=10, params=None, returnFast=False,
                          cmd='get', extraComment=None, ignoreH2oError=False, noExtraErrorCheck=False, **kwargs):
    # if url param is used, use it as full url. otherwise crate from the jsonRequest
        if fullUrl:
            url = fullUrl
        else:
            url = self.__url(jsonRequest)

        # remove any params that are 'None'
        # need to copy dictionary, since can't delete while iterating
        # if params is not None:
        #     params2 = params.copy()
        #     for k in params2:
        #         if params2[k] is None:
        #             del params[k]
        #     paramsStr = '?' + '&'.join(['%s=%s' % (k, v) for (k, v) in params.items()])
        # else:
        #     paramsStr = ''
        #
        # if extraComment:
        #     log('Start ' + url + paramsStr, comment=extraComment)
        # else:
        #     log('Start ' + url + paramsStr)
        #
        # log_rest("")
        # log_rest("----------------------------------------------------------------------\n")
        # if extraComment:
        #     log_rest("# Extra comment info about this request: " + extraComment)
        # if cmd == 'get':
        #     log_rest("GET")
        # else:
        #     log_rest("POST")
        # log_rest(url + paramsStr)

        # file get passed thru kwargs here
        try:
            if cmd == 'post':
                r = requests.post(url, timeout=timeout, params=params, **kwargs)
            else:
                r = requests.get(url, timeout=timeout, params=params, **kwargs)

        except Exception as e:
            # rethrow the exception after we've checked for stack trace from h2o
            # out of memory errors maybe don't show up right away? so we should wait for h2o
            # to get it out to h2o stdout. We don't want to rely on cloud teardown to check
            # because there's no delay, and we don't want to delay all cloud teardowns by waiting.
            # (this is new/experimental)
            exc_info = sys.exc_info()
            # use this to ignore the initial connection errors during build cloud when h2o is coming up
            if not noExtraErrorCheck: 
                pass
                #print("ERROR: got exception on %s to h2o. \nGoing to check sandbox, then rethrow.." % (url + paramsStr))
                #time.sleep(2)
                #check_sandbox_for_errors(python_test_name=python_test_name)
            log_rest("")
            log_rest("EXCEPTION CAUGHT DOING REQUEST: " + safe_unicode_str(e))
            raise

        log_rest("")
        try:
            if r is None:
                log_rest("r is None")
            else:
                log_rest("HTTP status code: " + str(r.status_code))
                if hasattr(r, 'text'):
                    if r.text is None:
                        log_rest("r.text is None")
                    else:
                        log_rest(r.text)
                else:
                    log_rest("r does not have attr text")
        except Exception as e:
            # Paranoid exception catch.  
            # Ignore logging exceptions in the case that the above error checking isn't sufficient.
            pass

 
        # this is used to open a browser on results, or to redo the operation in the browser
        # we don't' have that may urls flying around, so let's keep them all
        #json_url_history.append(r.url)
        rjson = None
        if returnFast:
            return
        try:
            rjson = r.json()
        except:
            print (dump_json(r.text))
            if not isinstance(r, (list, dict)):
                raise Exception("h2o json responses should always be lists or dicts, see previous for text")

            raise Exception(
                "Could not decode any json from the request. Do you have beta features turned on?")

        # TODO: we should really only look in the response object.  This check
        # prevents us from having a field called "error" (e.g., for a scoring result).
        for e in ['error', 'Error', 'errors', 'Errors']:
            # error can be null (python None). This happens in exec2
            if e in rjson and rjson[e]:
                print ("rjson:", rjson)
                emsg = 'rjson %s in %s: %s' % (e, inspect.stack()[1][3], rjson[e])
                if ignoreH2oError:
                    # well, we print it..so not totally ignore. test can look at rjson returned
                    print (emsg)
                else:
                    print (emsg)
                    raise Exception(emsg)

        for w in ['warning', 'Warning', 'warnings', 'Warnings']:
            # warning can be null (python None).
            if w in rjson and rjson[w]:
                verboseprint(dump_json(rjson))
                print ('rjson %s in %s: %s' % (w, inspect.stack()[1][3], rjson[w]))

        return rjson
    def __init__(self, base_url='http://localhost:54321'):
        self.base_url = base_url
        if self.base_url.endswith('/'):
            self.base_url = self.base_url[:-1]

    # no noise if None
    def poll_url(self, response,
                 timeoutSecs=30, retryDelaySecs=0.5, initialDelaySecs=0, pollTimeoutSecs=180,
                noPoll=False, reuseFirstPollUrl=False):
        verboseprint('poll_url input: response:', dump_json(response))

        def get_redirect_url(response):
            url = None
            params = None
            # StoreView has old style, while beta_features
            if 'response_info' in response: # trigger v2 for GBM always?
                response_info = response['response_info']

                if 'redirect_url' not in response_info:
                    raise Exception("Response during polling must have 'redirect_url'\n%s" % dump_json(response))

                if response_info['status'] != 'done':
                    redirect_url = response_info['redirect_url']
                    if redirect_url:
                        url = self.__url(redirect_url)
                        params = None
                    else:
                        if response_info['status'] != 'done':
                            raise Exception(
                                "'redirect_url' during polling is null but status!='done': \n%s" % dump_json(response))
            else:
                if 'response' not in response:
                    raise Exception("'response' not in response.\n%s" % dump_json(response))

                if response['response']['status'] != 'done':
                    if 'redirect_request' not in response['response']:
                        raise Exception("'redirect_request' not in response. \n%s" % dump_json(response))

                    url = self.__url(response['response']['redirect_request'])
                    params = response['response']['redirect_request_args']

            return (url, params)

        # if we never poll
        msgUsed = None

        if 'response_info' in response: # trigger v2 for GBM always?
            status = response['response_info']['status']
            progress = response.get('progress', "")
        else:
            r = response['response']
            status = r['status']
            progress = r.get('progress', "")

        doFirstPoll = status != 'done'
        (url, params) = get_redirect_url(response)
        # no need to recreate the string for messaging, in the loop..
        if params:
            paramsStr = '&'.join(['%s=%s' % (k, v) for (k, v) in params.items()])
        else:
            paramsStr = ''

        start = time.time()
        count = 0
        if initialDelaySecs:
            time.sleep(initialDelaySecs)

        # can end with status = 'redirect' or 'done'
        # Update: on DRF2, the first RF redirects to progress. So we should follow that, and follow any redirect to view?
        # so for v2, we'll always follow redirects?

        # Don't follow the Parse redirect to Inspect, because we want parseResult['destination_key'] to be the end.
        # note this doesn't affect polling with Inspect? (since it doesn't redirect ?
        while status == 'poll' or doFirstPoll or (status == 'redirect' and 'Inspect' not in url):
            count += 1
            if ((time.time() - start) > timeoutSecs):
                # show what we're polling with
                emsg = "Exceeded timeoutSecs: %d secs while polling." % timeoutSecs + \
                       "status: %s, url: %s?%s" % (status, urlUsed, paramsUsedStr)
                raise Exception(emsg)

            urlUsed = url
            paramsUsed = params
            paramsUsedStr = paramsStr
            msgUsed = "\nPolling with"

            print (status, progress, urlUsed)
            time.sleep(retryDelaySecs)

            response = self.do_json_request(fullUrl=urlUsed, timeout=pollTimeoutSecs, params=paramsUsed)
            verboseprint(msgUsed, urlUsed, paramsUsedStr, "Response:", dump_json(response))

            doFirstPoll = False
            status = response['response_info']['status']
            progress = response.get('progress', "")

            # get the redirect url
            if not reuseFirstPollUrl: # reuse url for all v1 stuff
                (url, params) = get_redirect_url(response)

            if noPoll:
                return response

        # won't print if we didn't poll
        if msgUsed:
            verboseprint(msgUsed, urlUsed, paramsUsedStr, "Response:", dump_json(response))
        return response


class H2OModel(object):
    def __init__(self, algo, is_classification, fit_params, base_url='http://localhost:54321'):
        ## Create a new H2O model, with a unique name 
        self.base_path = os.path.join(os.getenv('DIP_HOME'), 'h2o_tmp')
        if not os.path.exists(self.base_path):
            os.makedirs(self.base_path)
        self.algo = algo
        self.is_classification = is_classification
        self.fit_params = fit_params
        self.name = "dku_" + algo + (datetime.datetime.now().strftime('%Y%m%d_%H%M%S')) + '_' + str(random.randint(1,1000))
        self.filename = self.name + "__train_raw"
        self.loadedname = self.name +  "__train_parsed"
        self.model = self.name + "__model"
        self.h = H2O(base_url=base_url)
        self.predict_count = 0


    def load_dataframe(self, df, raw_key, parsed_key):
        buffer = StringIO.StringIO()
        df.to_csv(buffer, index=False, header=False, encoding='utf-8')
        buffer.seek(0)
        resp = self.h.do_json_request('2/PostFile.json', cmd='post', timeout=180, params={'key':raw_key}, files={"files":buffer}, extraComment=raw_key)
        rk = raw_key
        #### VARIANT USING IMPORT FILE
        #postfile = os.path.join(self.base_path, raw_key)
        #df.to_csv(postfile, index=False, header=False, encoding='utf-8')
        #resp = self.h.do_json_request('2/ImportFiles2.json', params={"path":postfile})
        #rk = resp['keys'][0]
        resp2 = self.h.do_json_request('2/Parse2.json', params={'source_key':rk, 'destination_key':parsed_key})
        self.h.poll_url(resp2)
        print (resp2)
   
    def fit(self, X, Y):
        logger.info("H2O FIT %s %s %s %s" % (str(X.shape),str(Y.shape), X.__class__.__name__, Y.__class__.__name__))
        df = pd.concat([pd.DataFrame(X), pd.DataFrame(Y)], axis=1)
        lenx = X.shape[1]
        self.load_dataframe(df, self.filename, self.loadedname)
        self.fit_(self.loadedname, lenx, self.model)

    def predict_(self, X):
        n = self.name + '_predictions_' + str(self.predict_count)
        self.predict_count  = self.predict_count + 1 # lock 
        rk = n + '__test_raw'
        pk = n + '__test_parsed'
        tk = n + '__test_result'
        df = pd.DataFrame(X)
        self.load_dataframe(df, rk, pk)
        resp4 = self.h.do_json_request('2/Predict.json', params={'data':pk, 'model':self.model, 'prediction':tk})
        print (resp4)
        #### Variant using ExportFiles
        # ###p = os.path.join(self.base_path, tk)
        ##resp5 = self.h.do_json_request('2/ExportFiles.json', params={'src_key':tk, 'path':p, 'force':1})
        ##print(resp5)
        ###f = open(p, 'rb')
        content = self.h.do_csv_request('2/DownloadDataset', params={'src_key':tk})
        f = StringIO.StringIO(content)
        df = pd.read_csv(f)
        f.close()
        return df

    def predict(self, X):  
        df = self.predict_(X)
        return df.predict.values

    def predict_proba(self, X):
        df = self.predict_(X)
        return df.drop(['predict'], axis=1).values

    def fit_(self, loadename, target_index, model): 
        params =  {
                'source':loadename, 
                'response':target_index,
                'destination_key':model,
        }
        if not (self.algo  == 'GLM2'): 
            params['classification'] = 1 if self.is_classification else 0

        for k in self.fit_params:
            params[k] =  self.fit_params[k]
        resp3 = self.h.do_json_request('2/' + self.algo + '.json',
            params=params)
        resp4 = self.h.poll_url(resp3, timeoutSecs=600, retryDelaySecs=1, initialDelaySecs=5, pollTimeoutSecs=30)
        print (resp4)
        # Locate the classes in the domain objet from the response
        for k in resp4:
            if type(resp4[k]) == dict and "_domains" in resp4[k]:
                domains = resp4[k]["_domains"]
                self.classes_ = domains[-1]

## Self Test

def train_dataframe(df, target):
    h2o.clean_sandbox()
    h = h2o.H2O('localhost')
    buffer = StringIO.StringIO()
    df.to_csv(buffer, index=False, encoding='utf-8')
    buffer.seek(0)
    name = 'doctor.file'
    dest = 'doctor.key'
    model = 'doctor.model'
    resp = h._H2O__do_json_request(
            'PostFile.json',
            cmd='post',
            timeout=180,
            params={"key": name},
            files={"file": buffer},
            extraComment=name)
    print (resp)
    resp2 = h.parse(key=name, key2=dest, header=1)
    print (resp2 )
    resp3 = h.deep_learning(data_key=dest, response=target, destination_key=model)
    print (resp3)


def test_h2o():
    d = pd.DataFrame(data=[[0,1,2],[4,5,6],[4,6,8]], columns=["x", "y", "z"])
    train_dataframe(d, 'z')


if __name__ == "__main__": 
    #test_h2o()  
    from sklearn.metrics import *
    clf = H2OModel(algo='DRF', is_classification=True, fit_params={'ntrees':100})
    #X = pd.DataFrame(data=[[0,1],[4,5]], columns=["x", "y"])
    #Y = pd.Series(data=[4,6], name='z')
    df = pd.read_csv('/data/train.csv')
    df = df.dropna()
    X = df.drop(['C37'], axis=1)
    Y = df.C37
    clf.fit(X, Y)
    P = clf.predict(X)
    print (P)
    print (clf.predict_proba(X))
    print (f1_score(Y, P))
    from sklearn.ensemble import RandomForestClassifier
    clf2 = RandomForestClassifier()
    clf2.fit(X, Y)
    print (clf2.predict(X))
    print (clf2.predict_proba(X))
    print (f1_score(Y, clf2.predict(X)))


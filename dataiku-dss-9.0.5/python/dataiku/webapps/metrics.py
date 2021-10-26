import os, sys, json, re, traceback, logging, time, fcntl, glob, threading, math

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

call_metrics = {'lock':threading.Lock(), 'rate':0, 'last':time.time(), 'usage':0, 'users':{}}

# metrics reporting
decay_rate = 0.138629436111989 # halved every 5s
def calc_decay(duration):
    return math.exp(-decay_rate * duration)

def apply_decay(values, duration, now):
    decay = calc_decay(duration)
    for n in ['rate', 'usage']:
        values[n] = values.get(n, 0) * decay
    users = values.get('users', {})
    to_del = []
    for k in users:
        if now - users[k] > 300: # expire after 5min
            to_del.append(k)
    for k in to_del:
        del users[k]
    
def write_out_metrics(call_metrics_copy):
    global call_metrics

    metrics_file_path = './.metrics/calls-%s' % os.getpid()
    metrics_folder = os.path.dirname(metrics_file_path)
    if not os.path.exists(metrics_folder):
        os.mkdir(metrics_folder)
    with open(metrics_file_path, 'w') as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            json.dump(call_metrics_copy, f)
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)

def report_call(started, session_id):
    global call_metrics
    call_metrics_lock = call_metrics['lock']
    ended = time.time()
    call_metrics_lock.acquire()
    try:
        # increase timer
        now = time.time()
        previous = call_metrics['last']
        # compute new amortized values
        apply_decay(call_metrics, now - previous, now)
        call_metrics['rate'] = call_metrics['rate'] + 1
        call_metrics['usage'] = call_metrics['usage'] + (math.exp(-decay_rate * (now-ended)) - math.exp(-decay_rate * (now-started))) / decay_rate
        call_metrics['last'] = now
        if session_id is not None:
            call_metrics['users'][session_id] = started
        call_metrics_copy = {'rate':call_metrics['rate'], 'usage':call_metrics['usage'], 'last':call_metrics['last'], 'users':dict(call_metrics['users'])}
    finally:
        call_metrics_lock.release()

    # write out values        
    write_out_metrics(call_metrics_copy)
    
class DkuCallTimer(object):
     """
     Use in a `with DkuCallTimer(session_id):` to record time spent in a handler
     """
     def __init__(self, session_id=None):
         self.session_id = session_id
         self.started = None

     def __enter__(self):
         self.started = time.time()

     def __exit__(self, exception_type, exception_value, traceback):
         report_call(self.started, self.session_id)

def decay_metrics():
    global call_metrics
    call_metrics_lock = call_metrics['lock']
    call_metrics_lock.acquire()
    try:
        # increase timer
        now = time.time()
        previous = call_metrics['last']
        # compute new amortized values
        apply_decay(call_metrics, now - previous, now)
        call_metrics['last'] = now
        call_metrics_copy = {'rate':call_metrics['rate'], 'usage':call_metrics['usage'], 'last':call_metrics['last'], 'users':dict(call_metrics['users'])}
    finally:
        call_metrics_lock.release()

    # write out values        
    write_out_metrics(call_metrics_copy)

def decay_metrics_loop():
    while True:
        time.sleep(5)
        decay_metrics()
        
decay_metrics_thread = threading.Thread(name="metrics-decayer", target=decay_metrics_loop)
decay_metrics_thread.daemon = True
decay_metrics_thread.start()

# the metrics grabbing
def get_metrics():
    call_metrics_list = []
    for metrics_file_path in glob.glob('./.metrics/calls-*'):
        with open(metrics_file_path, 'r') as f:
            fcntl.flock(f, fcntl.LOCK_EX)
            try:
                call_metrics_list.append(json.load(f))
            finally:
                fcntl.flock(f, fcntl.LOCK_UN)
    rate_sum = 0
    usage_sum = 0
    user_count_sum = 0
    now = time.time()
    for call_metrics_copy in call_metrics_list:
        # amortize across files
        apply_decay(call_metrics_copy, now - call_metrics_copy.get('last', 0), now)
        # accumulate
        rate_sum += call_metrics_copy.get('rate', 0)
        usage_sum += call_metrics_copy.get('usage', 0)
        for k, v in call_metrics_copy.get('users', {}).items():
            user_count_sum += math.exp(-decay_rate * (now - v) / 10) # slower decay
        
    return {"call_rate":rate_sum, "usage_rate":usage_sum, "user_count":user_count_sum}

def serve():
    # Run a flask app to serve metrics
    from flask import Flask
    app = Flask(__name__)
    
    @app.route('/metrics-json')
    def get_metrics_json():
        return json.dumps(get_metrics())
    
    @app.route('/metrics-prometheus')
    def get_metrics_prometheus():
        text = ''
        ts = int(time.time()) * 1000
        for k, v in get_metrics().items():
            text = text + "# TYPE %s gauge\n%s %s %s\n" % (k, k, v, ts)
        return text
    
    # Start the server
    from werkzeug.serving import make_server
    srv = make_server("0.0.0.0", 9000, app, threaded=True)
    logging.info("Started metrics server on port %s" % srv.server_port)
    srv.serve_forever()

if __name__ == "__main__":
    serve()

from .. import DoctorException
import json

cached_frames = {}


def hashablify(c):
    return json.dumps(c, sort_keys=True)

def clear_cache():
    cached_frames.clear()

def get_dataframe(dataset, *args, **kwargs):
    cache_key = hashablify((dataset.full_name, args, kwargs))
    if cache_key not in cached_frames:
        schema = dataset.read_schema(raise_if_empty=False)
        if len(schema) == 0:
            raise DoctorException("No column in schema of %s."
                                  " Have you set up the schema for this dataset?" % dataset.full_name)
        else:
            df = dataset.get_dataframe(*args, **kwargs)
            df.values.flags.writeable = False
            cached_frames[cache_key] = df
    return cached_frames[cache_key]

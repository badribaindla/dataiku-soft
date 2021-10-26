import dataikuapi, os

def get_self_client():
    """
    Gets an API client that is preconfigured to talk to other endpoints in the same service,
    using the API key that was called in the 'current' request
    """
    api_key = os.environ.get("DKU_CURRENT_REQUEST_USED_API_KEY", None)
    return dataikuapi.APINodeClient("http://127.0.0.1:" + os.environ["DKU_APIMAIN_PORT"], 
        os.environ["DKU_CURRENT_APISERVICE"], api_key)
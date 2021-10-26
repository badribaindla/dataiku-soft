class DoctorException(Exception):
    
    def __init__(self, message='',code=400, errorType='ExpectedException'):
        self.value = message
        self.code = code
        self.errorType = errorType
        self.message = message
        
    def __str__(self):
        return repr(self.value)
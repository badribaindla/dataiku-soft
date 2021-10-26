from dataiku.core.intercom import backend_json_call


class PercentageProgress:

    def __init__(self, future_id):
        self.future_id = future_id

    def set_percentage(self, percentage, no_fail=True):
        try:
            backend_json_call("futures/posttrain-set-percentage", data={
                "futureId": self.future_id,
                "percentage": percentage
            })
            return True
        except Exception as e:
            if no_fail:
                return False
            else:
                raise e




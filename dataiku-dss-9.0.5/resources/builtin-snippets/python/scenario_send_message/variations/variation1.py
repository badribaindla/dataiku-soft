from dataiku.scenario import Scenario

scenario = Scenario

# The messaging channel must already be defined
message_sender = scenario.get_message_sender('channel_id')

# You can then call send() with message params.
# params are specific to each message channel types

# SMTP mail
message_sender.send(sender="", recipient="", subject="", message="")

# Twilio SMS alert
message_sender.send(fromNumber="", toNumber="", message="")

# etc...
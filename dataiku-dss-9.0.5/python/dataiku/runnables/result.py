import json

class ResultTable(object):


	def __init__(self):
		self.records = []
		self.columns = []
		self.header = ""
		self.name = ""
		pass

	def add_column(self, name, display_name, type="STRING"):
		self.columns.append({
			"name": name,
			"displayName" : display_name,
			"type" : type
		})

	def add_record(self, record):
		self.records.append(record)

	def set_header(self, header):
		self.header = header

	def set_name(self, name):
		self.name = name

	def to_json(self):
		ret = {
			"header" : self.header,
			"columns" : self.columns,
			"records":  self.records,
			"name": self.name
		}
		return json.dumps(ret)


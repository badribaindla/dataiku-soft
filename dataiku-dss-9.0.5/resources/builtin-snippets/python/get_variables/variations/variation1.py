import dataiku
print "I am working for dimension value %s" % (dataiku.get_custom_variables()["DKU_DST_dimensionName"])

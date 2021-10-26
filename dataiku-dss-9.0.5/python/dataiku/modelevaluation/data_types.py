class DataDriftParams(object):
    def __init__(self, columns, nb_bins, compute_histograms, confidence_level):
        self.columns = columns
        self.nb_bins = nb_bins
        self.compute_histograms = compute_histograms
        self.confidence_level = confidence_level

    @staticmethod
    def build(params):
        return DataDriftParams(params["columns"], params["nbBins"],
                               params["computeHistograms"], params["confidenceLevel"])

def set_column_labels(estimator, column_labels):
    """
    Feed the column labels to the custom model if it implements
    the method `set_column_labels(self, labels)` thoroughly
    """
    # check if the model implements a function "set_column_labels"
    if hasattr(estimator, "set_column_labels") and callable(estimator.set_column_labels):
        estimator.set_column_labels([c for c in column_labels])

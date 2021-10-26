from keras.callbacks import EarlyStopping
from dataiku.doctor.deep_learning.shared_variables import get_variable

def fit_model(model, train_sequence, validation_sequence, base_callbacks):
    epochs = 10

    # We monitor the same metric that is used to optimize the model
    metric_to_monitor = get_variable("DKU_MODEL_METRIC")
    greater_is_better = get_variable("DKU_MODEL_METRIC_GREATER_IS_BETTER")

    early_stopping_callback = EarlyStopping(monitor=metric_to_monitor,
                                            mode=("max" if greater_is_better else "min"),
                                            min_delta=0, 
                                            patience=2)

    base_callbacks.append(early_stopping_callback)

    model.fit_generator(train_sequence,
                        epochs=epochs,
                        callbacks=base_callbacks,
                        shuffle=True)
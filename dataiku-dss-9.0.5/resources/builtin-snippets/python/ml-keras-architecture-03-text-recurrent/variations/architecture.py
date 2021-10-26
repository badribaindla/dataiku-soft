from keras.layers import Embedding, LSTM
from keras.layers import Dense, Input, Flatten
from keras.models import Model

def build_model(input_shapes, n_classes=None):

    #### DEFINING THE INPUT
    # You need to modify the name and length of the "text_input" 
    # according to the preprocessing and name of your 
    # initial feature.
    # This feature should to be preprocessed as a "Text", with a 
    # custom preprocessing using the "TokenizerProcessor" class
    text_length = 500
    vocabulary_size = 10000
    text_input_name = "name_of_your_text_input_preprocessed"

    text_input = Input(shape=(text_length,), name=text_input_name)

    #### DEFINING THE ARCHITECTURE
    emb = Embedding(output_dim=512, input_dim=vocabulary_size, input_length=text_length)(text_input)
    lstm_out = LSTM(128)(emb)
    
    x = Dense(128, activation='relu')(lstm_out)
    x = Dense(64, activation='relu')(x)
    predictions = Dense(n_classes, activation='softmax')(x)

    model = Model(inputs=text_input, outputs=predictions)

    return model

def compile_model(model):
    model.compile(
        optimizer="rmsprop",
        loss="categorical_crossentropy"
    )
    return model
from keras.layers import Conv2D, MaxPooling2D, Input
from keras.layers import Dense, BatchNormalization, Activation
from keras.layers import Flatten, Dropout
from keras.models import Model
from keras.optimizers import Adam

def build_model(input_shapes, n_classes=None):

    #### DEFINING INPUT AND BASE ARCHITECTURE
    # You need to modify the name and shape of the "image_input" 
    # according to the preprocessing and name of your 
    # initial feature.
    # This feature should to be preprocessed as an "Image", with a 
    # custom preprocessing.
    image_shape = (197, 197, 3)
    image_input_name = "name_of_your_image_input_preprocessed"

    image_input = Input(shape=image_shape, name=image_input_name)

    #### DEFINING THE ARCHITECTURE
    x = Conv2D(64, kernel_size=(11, 11), padding='same')(image_input)
    x = BatchNormalization()(x)
    x = Activation('relu')(x)
    x = MaxPooling2D(pool_size=(3, 3))(x)

    x = Conv2D(128, kernel_size=(7, 7), padding='same')(x)
    x = BatchNormalization()(x)
    x = Activation('relu')(x)
    x = MaxPooling2D(pool_size=(3, 3))(x)

    x = Conv2D(192, kernel_size=(3, 3), padding='same')(x)
    x = BatchNormalization()(x)
    x = Activation('relu')(x)
    x = MaxPooling2D(pool_size=(3, 3))(x)

    x = Conv2D(256, kernel_size=(3, 3), padding='same')(x)
    x = BatchNormalization()(x)
    x = Activation('relu')(x)
    x = MaxPooling2D(pool_size=(3, 3))(x)

    x = Flatten()(x)
    x = Dense(4096)(x)
    x = BatchNormalization()(x)
    x = Activation('relu')(x)
    x = Dropout(0.2)(x)
    x = Dense(4096)(x)
    x = BatchNormalization()(x)
    x = Activation('relu')(x)
    x = Dropout(0.2)(x)
    x = Dense(n_classes)(x)
    x = BatchNormalization()(x)
    x = Activation('softmax')(x)

    model = Model(inputs=image_input, outputs=x)

    return model

def compile_model(model):
    model.compile(
        optimizer="adam",
        loss="categorical_crossentropy"
    )
    return model
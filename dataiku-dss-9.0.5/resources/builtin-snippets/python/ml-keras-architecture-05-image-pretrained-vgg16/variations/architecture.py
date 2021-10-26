from keras.layers import Input, Dense, Flatten
from keras.models import Model
from keras.applications import VGG16
import os
import dataiku

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

    base_model = VGG16(include_top=False, weights=None, input_tensor=image_input)

    #### LOADING WEIGHTS OF PRE TRAINED MODEL
    # To leverage this architecture, it is better to use weights
    # computed on a previous training on a large dataset (Imagenet).
    # To do so, you need to download the file containing the weights
    # and load them into your model.
    # You can do it by using the macro "Download pre-trained model"
    # of the "Deep Learning image" plugin (CPU or GPU version depending
    # on your setup) available in the plugin store. For this architecture,
    # you need to select:
    #    "VGG16 trained on Imagenet"
    # This will download the weights and put them into a managed folder
    folder = dataiku.Folder("name_of_folder_containing_vgg16_weights")
    weights_path = "vgg16_imagenet_weights_notop.h5"

    base_model.load_weights(os.path.join(folder.get_path(), weights_path),
                       by_name=True, skip_mismatch=True)

    #### ADDING FULLY CONNECTED CLASSIFICATION LAYER
    x = base_model.layers[-1].output
    x = Flatten()(x)
    predictions = Dense(n_classes, activation="softmax")(x)

    model = Model(input=base_model.input, output=predictions)
    return model

def compile_model(model):
    model.compile(
        optimizer="adam",
        loss="categorical_crossentropy"
    )
    return model
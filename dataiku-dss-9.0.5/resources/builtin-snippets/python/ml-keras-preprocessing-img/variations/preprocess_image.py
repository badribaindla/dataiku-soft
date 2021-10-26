from keras.preprocessing.image import img_to_array, load_img
from keras.applications.imagenet_utils import preprocess_input

def preprocess_image(image_file):
    # You need to modify the shape of your images
    # depending of the original shape of your images
    input_shape = (197, 197, 3)
    
    img = load_img(image_file,target_size=input_shape)
    array = img_to_array(img)
    array = preprocess_input(array, mode="tf")
    return array

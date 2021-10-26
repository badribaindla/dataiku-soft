from dataiku.doctor.deep_learning.sequences import DataAugmentationSequence
from keras.preprocessing.image import ImageDataGenerator

def build_sequences(build_train_sequence_with_batch_size, build_validation_sequence_with_batch_size):

    # The actual batch size of the train sequence will be (batch_size * n_augmentation)
    batch_size = 8
    n_augmentation = 4
    
    train_sequence = build_train_sequence_with_batch_size(batch_size)
    validation_sequence = build_validation_sequence_with_batch_size(batch_size)
    
    augmentator = ImageDataGenerator(
        zoom_range=0.2,
        shear_range=0.5,
        rotation_range=20,
        width_shift_range=0.2,
        height_shift_range=0.2,
        horizontal_flip=True
    )
    augmented_sequence = DataAugmentationSequence(train_sequence, "name_of_your_image_input_preprocessed", augmentator, n_augmentation)
    
    return augmented_sequence, validation_sequence
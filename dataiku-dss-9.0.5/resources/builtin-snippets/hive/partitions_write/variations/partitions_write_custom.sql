INSERT OVERWRITE TABLE output_dataset_name
        PARTITION (dimension=‘value’, dimension2=‘value2’)
        SELECT your_select_query
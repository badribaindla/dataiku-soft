dataiku.fetch('dataset_name',
    function(dataFrame) {
    column_values = dataFrame.getColumnValues("column_name");
    }
);
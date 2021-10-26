dataiku.fetch('dataset_name',
    {
      'columns' : ["col0", "col1"]
    },
    function(dataFrame) {
        column_values = dataFrame.getColumnValues("col0");
    }
);
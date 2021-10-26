dataiku.fetch('dataset_name',
    {
       partitions : ["2014-01-02", "2014-02-04"]
    },
    function(dataFrame) {
        console.log("data from partitions load succeed"
    }
);
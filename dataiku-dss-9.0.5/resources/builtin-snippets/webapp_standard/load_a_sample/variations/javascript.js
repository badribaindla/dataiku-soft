dataiku.fetch('dataset_name',
    {
        sampling : 'head',
        limit : 15000
    },
    function(dataFrame) {
         console.log("dataset load succeed");
    }
);

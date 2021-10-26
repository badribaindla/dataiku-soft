dataiku.fetch('dataset_name',
    function(dataFrame) {
         console.log("dataset load succeed");
         // action on load success
         console.log(dataFrame);
    }
);

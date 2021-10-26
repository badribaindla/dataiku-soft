dataiku.fetch('dataset_name',
    {
        filter : "col0 == 'value' && col1 > 10"
    },
    function(dataFrame) {
        console.log("rows matching condition load success");
    }
);
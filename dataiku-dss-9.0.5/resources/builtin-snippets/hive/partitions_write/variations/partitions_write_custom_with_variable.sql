-- Supposing that the ‘customers’ dataset is partitioned by ‘date’ and ‘country’
INSERT OVERWRITE TABLE customers
        PARTITION (date=‘$DKU_DST_date’, country=‘$DKU_DST_country’)
        SELECT your_select_query
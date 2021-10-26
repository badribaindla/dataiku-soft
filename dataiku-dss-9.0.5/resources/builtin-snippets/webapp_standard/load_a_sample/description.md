Default sampling is `head(20000)`.

Other choices are:

    {sampling : 'head', limit: 10000}  // first 10000
    {sampling : 'random', ratio: 0.1}  // randomly 10% 
    {sampling : 'random', limit: 10000}  // randomly 10000
    {sampling : 'random-column', sampling_column : 'user_id', limit : 15000}    // 15000 rows, randomly sampled among the values of column 'user_id'
    {sampling : 'full'}    // no sampling